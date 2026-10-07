// Manages peer connections and communication

import { StorageManager } from './storage-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { randomToken, verifyEncKeyBinding, handleFor } from './crypto-identity.js';

// ---------------------------------------------------------------------------
// Optional self-hosted broker / TURN configuration (P2 — broker privacy).
//
// By default SpellCast uses the PeerJS *public cloud broker*, which can see
// every peer id and who connects to whom (only message *payloads* are private).
// To run your own broker (`npm i -g peer && peerjs --port 9000 --key mykey`) and
// keep that metadata off third-party infrastructure, fill in CUSTOM_PEER_SERVER
// below. Leave it null to use the public cloud broker.
//
//   const CUSTOM_PEER_SERVER = { host: 'peer.example.com', port: 443, path: '/', key: 'mykey', secure: true };
//
// CUSTOM_TURN_SERVERS adds authenticated TURN relays so peers behind symmetric
// NAT can still connect (the app ships with STUN only). Example:
//   const CUSTOM_TURN_SERVERS = [{ urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' }];
// See docs/SELF-HOSTING.md.
const CUSTOM_PEER_SERVER = null;
const CUSTOM_TURN_SERVERS = [];

export class PeerManager {
  constructor(userManager, storageManager) {
    this.userManager = userManager;
    this.storageManager = storageManager;

    // State
    this.peer = null;
    this.connections = [];               // OPEN connections we accepted (at most one per peer)
    this.savedPeers = [];
    this.pendingConnections = new Map(); // peerId -> { conn, startedAt } for outgoing attempts not yet open
    this.connectionOpenedAt = new WeakMap(); // conn -> ms timestamp it opened (duplicate resolution)
    this.handshakeSent = new WeakSet();  // connections we've already sent our handshake on
    this.retryAttempts = {};             // peerId -> automatic retries since the last successful open
    this.peerStatus = {};                // Status of all known peers
    this.lastSeen = {};                  // When peers were last seen
    this.peerConnectionQuality = {};     // Connection quality for each peer

    // Connection state
    this.reconnectAttempts = 0;
    this.usingFallbackServer = false;
    this.pendingRetry = null;
    this.connectionQuality = 'unknown';  // Overall connection quality

    // Add rate limiter instance
    this.rateLimiter = new RateLimiter();

    // Rate limiting constants
    this.CONNECT_MAX_ATTEMPTS = 5;    // Maximum connection attempts
    this.CONNECT_TIME_WINDOW_MS = 60000; // 1 minute window

    // Connection lifecycle
    this.PENDING_TIMEOUT_MS = 30000;  // An outgoing attempt not open by then is abandoned
    this.GLARE_WINDOW_MS = 5000;      // Two links to one peer opened this close together = simultaneous connect
    this.MAX_PEER_RETRIES = 3;        // Automatic retries for an unavailable peer (10s, 20s, 40s)

    // Inbound-message abuse resistance (P2 — mesh hardening)
    this.INBOUND_MAX = 400;            // Max messages per peer per window...
    this.INBOUND_WINDOW_MS = 10000;    // ...10s (generous; normal sync bursts are fine)
    this.MAX_STRIKES = 10;             // Bad (invalid/forged/oversized) messages...
    this.STRIKE_WINDOW_MS = 60000;     // ...within 60s before a peer is blocklisted
    this.BLOCK_DURATION_MS = 5 * 60000; // Blocklist a misbehaving peer for 5 minutes
    this.blockedPeers = {};            // peerId -> timestamp (ms) the block expires (abuse, auto-expiring)

    // User-initiated removals. Unlike blockedPeers (temporary, abuse-driven), this
    // is a PERSISTENT blocklist: a peer the user explicitly removed must never be
    // reconnected to, accepted from, or sent to again — until the user deliberately
    // connects to them anew. Loaded from / saved to storage so removal survives login.
    this.removedPeers = new Set();

    // TOFU pins: peerId -> the first signing key seen at that address. A peer id
    // is only a routing address anyone can claim while its owner is offline, so a
    // later handshake from that id with a DIFFERENT key is flagged (keyMismatch)
    // and never trusted with circle posts. Persisted with the peers.
    this.peerKeyPins = {};

    // Message handlers
    this.messageHandlers = {};

    // Connection event callbacks
    this.onConnectionCallbacks = [];
    this.onDisconnectionCallbacks = [];

    // Register default message handlers
    this.registerMessageHandler('handshake', this.handleHandshakeMessage.bind(this));
    this.registerMessageHandler('ping', this.handlePingMessage.bind(this));
    this.registerMessageHandler('ping_reply', this.handlePingReplyMessage.bind(this));

    // Bind methods
    this.initializePeer = this.initializePeer.bind(this);
    this.loginToPeer = this.loginToPeer.bind(this);
    this.connectToPeer = this.connectToPeer.bind(this);
    this.handleConnection = this.handleConnection.bind(this);
    this.disconnectPeer = this.disconnectPeer.bind(this);
    this.loadPeers = this.loadPeers.bind(this);
    this.savePeers = this.savePeers.bind(this);
    this.enhanceConnectivity = this.enhanceConnectivity.bind(this);
  }

  /**
   * Create a PeerJS peer and install it as `this.peer`, destroying any previous
   * one first. Every peer the app creates goes through here so that:
   *  - exactly one peer is ever live (a superseded peer's late events are ignored);
   *  - errors BEFORE 'open' go to `onInitError`, where the caller picks a single
   *    fallback, while errors AFTER 'open' go to handlePeerError — a late network
   *    error must not re-run the sign-up chain (which minted a new random id);
   *  - connection / disconnected / close handlers are attached on every path,
   *    including the auto-login one.
   * @param {string|null} id - peer id to claim, or null for a broker-assigned one
   * @param {Object|undefined} options - PeerJS options
   * @param {(id: string) => void} onOpen
   * @param {(err: Error) => void} onInitError
   * @returns {Object} the new peer
   */
  createPeer(id, options, onOpen, onInitError) {
    this.destroyPeer();

    const peer = new Peer(id || undefined, options);
    this.peer = peer;
    let opened = false;

    peer.on('open', (openedId) => {
      if (peer !== this.peer) return;
      opened = true;
      onOpen(openedId);
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      console.error('Peer error:', err);
      if (opened) {
        this.handlePeerError(err);
      } else {
        onInitError(err);
      }
    });
    peer.on('connection', (conn) => {
      if (peer === this.peer) this.handleConnection(conn);
    });
    peer.on('disconnected', () => {
      if (peer === this.peer) this.handlePeerDisconnected();
    });
    peer.on('close', () => {
      if (peer === this.peer) this.handlePeerClosed();
    });
    return peer;
  }

  /** Destroy the current peer (if any) without letting its teardown events fire into our handlers. */
  destroyPeer() {
    if (!this.peer) return;
    const old = this.peer;
    this.peer = null;
    try { old.removeAllListeners(); } catch (_) {}
    try { old.destroy(); } catch (_) {}
    this.pendingConnections.clear();
  }

  /**
   * Initialize a new peer connection
   * @returns {Promise} Promise that resolves when peer is connected
   */
  initializePeer() {
    return new Promise((resolve, reject) => {
      try {
        // Use PeerJS public server with fallback options
        const peerConfig = {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ],
            iceCandidatePoolSize: 10
          },
          debug: 1,
          // Remove server-specific configuration to use PeerJS's free public server
        };

        // Create a new peer with a random ID
        console.log('Attempting to create new peer with random ID...');
        this.createPeer(null, this.applyCustomServer(peerConfig), (id) => {
          console.log('Peer connection established with ID:', id);
          this.userManager.saveCredentials(this.userManager.username, id);
          this.updateStatus(`Connected with ID: ${id}`);
          resolve(id);
        }, (err) => {
          if (err.type === 'server-error' || err.type === 'network') {
            // Try to use fallback server
            this.updateStatus('Connection error. Trying alternative server...');
            this.initializeWithFallbackServer().then(resolve).catch(reject);
          } else {
            this.handlePeerError(err);
            reject(err);
          }
        });
      } catch (error) {
        console.error('Error initializing peer:', error);
        reject(error);
      }
    });
  }

  /**
   * Use a fallback server when main server fails
   * @returns {Promise} Promise that resolves when peer is connected
   */
  initializeWithFallbackServer() {
    return new Promise((resolve, reject) => {
      try {
        console.log('Attempting to connect using fallback configuration...');

        // Fallback retries the default PeerJS cloud server with an alternate
        // ICE/STUN configuration. (The previously hard-coded Heroku host has
        // been retired, so we no longer point at dead infrastructure.)
        const fallbackConfig = {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
          }
        };

        this.createPeer(null, this.applyCustomServer(fallbackConfig), (id) => {
          console.log('Fallback connection established with ID:', id);
          this.userManager.saveCredentials(this.userManager.username, id);
          this.updateStatus(`Connected with ID: ${id} (fallback server)`);
          this.usingFallbackServer = true;
          resolve(id);
        }, (err) => {
          // Try one last option - direct mode. (Not handlePeerError: that would
          // start switchToFallbackServer in parallel and leave two live peers.)
          if (err.type === 'server-error' || err.type === 'network') {
            this.updateStatus('Trying direct connection mode...');
            this.initializeDirectMode().then(resolve).catch(reject);
          } else {
            this.handlePeerError(err);
            reject(err);
          }
        });
      } catch (error) {
        console.error('Error in fallback connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Initialize in direct mode with custom generated ID
   * @returns {Promise} Promise that resolves when peer is initialized
   */
  initializeDirectMode() {
    return new Promise((resolve, reject) => {
      try {
        // Add reconnection attempt tracking for direct mode
        this.directModeAttempts = 0;
        const MAX_DIRECT_MODE_ATTEMPTS = 3;

        const attemptDirectConnection = () => {
          // Check if we've exceeded the max attempts
          if (this.directModeAttempts >= MAX_DIRECT_MODE_ATTEMPTS) {
            reject(new Error(`Failed to connect after ${MAX_DIRECT_MODE_ATTEMPTS} attempts in direct mode`));
            return;
          }

          this.directModeAttempts++;
          console.log(`Direct mode connection attempt ${this.directModeAttempts}/${MAX_DIRECT_MODE_ATTEMPTS}`);

          // Generate a random ID locally
          const randomId = this.generateLocalPeerId();
          console.log('Attempting direct mode with generated ID:', randomId);

          // Use minimal configuration
          const directConfig = {
            config: {
              iceServers: [
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
              ]
            }
          };

          this.createPeer(randomId, this.applyCustomServer(directConfig), (id) => {
            console.log('Direct mode connection initialized with ID:', id);
            this.userManager.saveCredentials(this.userManager.username, id);
            this.updateStatus(`Connected with ID: ${id} (direct mode)`);
            resolve(id);
          }, (err) => {
            console.error(`Direct mode error (attempt ${this.directModeAttempts}/${MAX_DIRECT_MODE_ATTEMPTS}):`, err);

            // Try again with exponential backoff if we haven't exceeded max attempts
            // (createPeer destroys this failed peer before the next one is made).
            if (this.directModeAttempts < MAX_DIRECT_MODE_ATTEMPTS) {
              const backoffTime = Math.pow(2, this.directModeAttempts) * 1000;
              console.log(`Retrying direct mode in ${backoffTime / 1000} seconds...`);
              this.updateStatus(`Connection failed. Retrying in ${backoffTime / 1000} seconds...`);

              setTimeout(attemptDirectConnection, backoffTime);
            } else {
              // Out of options: report it, but don't hand a network error to
              // handlePeerError (it would start yet another fallback peer).
              this.updateStatus(`Connection error: ${err.message}`);
              reject(err);
            }
          });
        };

        // Start the first attempt
        attemptDirectConnection();

      } catch (error) {
        console.error('Error in direct mode:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate a random peer ID for direct mode
   * @returns {string} Random ID
   */
  generateLocalPeerId() {
    return 'user-' + randomToken(16); // CSPRNG-backed
  }

  /**
   * Merge the optional self-hosted broker / TURN configuration into a PeerJS
   * options object. A no-op when CUSTOM_PEER_SERVER is null and there are no
   * custom TURN servers, so default (public-cloud) behaviour is unchanged.
   * @param {Object} options - PeerJS options (may contain config.iceServers)
   * @returns {Object} the same options object, mutated
   */
  applyCustomServer(options = {}) {
    if (CUSTOM_TURN_SERVERS.length && options.config && Array.isArray(options.config.iceServers)) {
      options.config.iceServers = options.config.iceServers.concat(CUSTOM_TURN_SERVERS);
    }
    if (CUSTOM_PEER_SERVER) {
      Object.assign(options, CUSTOM_PEER_SERVER); // host / port / path / key / secure
    }
    return options;
  }

  /** Whether a custom broker or TURN relay has been configured. */
  hasCustomServer() {
    return !!CUSTOM_PEER_SERVER || CUSTOM_TURN_SERVERS.length > 0;
  }

  // ---- Peer abuse resistance (P2 — mesh hardening) ----

  /**
   * Record a "strike" against a peer for sending an invalid / forged / oversized
   * payload. Too many strikes inside the window get the peer blocklisted and
   * disconnected. (Reuses RateLimiter: isAllowed() returns false once the strike
   * budget is exhausted.)
   * @param {string} peerId
   */
  recordPeerStrike(peerId) {
    if (!peerId) return;
    const withinBudget = this.rateLimiter.isAllowed('strike', peerId, this.MAX_STRIKES, this.STRIKE_WINDOW_MS);
    if (!withinBudget) {
      this.blocklistPeer(peerId);
    }
  }

  /** Blocklist a peer for BLOCK_DURATION_MS and tear down its connection. */
  blocklistPeer(peerId) {
    if (!peerId) return;
    this.blockedPeers[peerId] = Date.now() + this.BLOCK_DURATION_MS;
    console.warn(`Blocklisted abusive peer ${peerId} for ${this.BLOCK_DURATION_MS / 60000} min.`);
    const conn = this.connections.find(c => c.peer === peerId);
    if (conn) {
      try { this.disconnectPeer(conn); } catch (_) {}
    }
  }

  /** Whether a peer is currently blocklisted (auto-expires). */
  isPeerBlocked(peerId) {
    const until = this.blockedPeers[peerId];
    if (!until) return false;
    if (Date.now() > until) {
      delete this.blockedPeers[peerId];
      return false;
    }
    return true;
  }

  // ---- User-initiated peer removal (persistent blocklist) ----

  /** Whether the user has explicitly removed this peer (persists across logins). */
  isPeerRemoved(peerId) {
    return this.removedPeers.has(peerId);
  }

  /** Load the persistent removed-peers blocklist from storage. */
  async loadRemovedPeers() {
    try {
      const list = await this.storageManager.loadFromStorage(StorageManager.KEYS.REMOVED_PEERS);
      if (Array.isArray(list)) {
        this.removedPeers = new Set(list);
      }
    } catch (e) {
      console.error('Error loading removed peers:', e);
    }
  }

  /** Persist the removed-peers blocklist to storage. */
  async saveRemovedPeers() {
    try {
      await this.storageManager.saveToStorage(StorageManager.KEYS.REMOVED_PEERS, [...this.removedPeers]);
    } catch (e) {
      console.error('Error saving removed peers:', e);
    }
  }

  /** Load the peerId -> signing-key pins from storage. */
  async loadPeerKeyPins() {
    try {
      const pins = await this.storageManager.loadFromStorage(StorageManager.KEYS.PEER_KEY_PINS);
      if (pins && typeof pins === 'object') {
        this.peerKeyPins = pins;
      }
    } catch (e) {
      console.error('Error loading peer key pins:', e);
    }
  }

  /** Persist the peerId -> signing-key pins. */
  async savePeerKeyPins() {
    if (!this.userManager.isLoggedIn()) return;
    try {
      await this.storageManager.saveToStorage(StorageManager.KEYS.PEER_KEY_PINS, this.peerKeyPins);
    } catch (e) {
      console.error('Error saving peer key pins:', e);
    }
  }

  /**
   * Clear a peer from the removed blocklist. Called when the user deliberately
   * connects to a peer again, so an explicit re-add overrides a prior removal.
   * @param {string} peerId
   */
  unremovePeer(peerId) {
    if (this.removedPeers.delete(peerId)) {
      this.saveRemovedPeers();
    }
  }

  /**
   * Login with an existing peer ID
   * @returns {Promise} Promise that resolves when login is successful
   */
  loginToPeer() {
    return new Promise((resolve, reject) => {
      try {
        const { username, peerId } = this.userManager.getUserInfo();

        if (!username || !peerId) {
          reject(new Error('Username and peer ID are required for login'));
          return;
        }

        // Create new peer with saved ID. Pass options only when a custom broker/
        // TURN is configured, so default (public-cloud) behaviour is unchanged.
        // (createPeer also wires the disconnected/close handlers, so a logged-in
        // session recovers from a broker drop the same way a new one does.)
        const options = this.hasCustomServer()
          ? this.applyCustomServer({ debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], iceCandidatePoolSize: 10 } })
          : undefined;

        this.createPeer(peerId, options, (id) => {
          console.log('Logged in with ID:', id);

          // Connect to saved peers after login
          this.loadPeers();
          setTimeout(() => this.connectToSavedPeers(), 1000);

          resolve(id);
        }, (err) => {
          console.error('Peer login error:', err);
          if (err.type === 'unavailable-id') {
            reject(new Error('This Peer ID is unavailable. It might be in use or invalid.'));
          } else {
            reject(err);
          }
        });

      } catch (error) {
        console.error('Error in loginToPeer:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle errors from the peer connection
   * @param {Error} err - The error object
   */
  handlePeerError(err) {
    console.error('Peer error:', err);

    switch (err.type) {
      case 'peer-unavailable': {
        // Target peer not available. PeerJS does not expose which peer on the
        // error object — only in the message ("Could not connect to peer <id>").
        const match = /Could not connect to peer (\S+)/.exec(err.message || '');
        const peerId = match ? match[1] : null;
        if (!peerId) {
          this.updateStatus('A peer is not available right now.');
          break;
        }
        // The attempt is dead; drop it so a retry (or the user) can try afresh.
        this.abandonPendingConnection(peerId);
        const delayMs = this.schedulePeerRetry(peerId);
        if (delayMs) {
          this.updateStatusWithRetry(`${this.peerLabel(peerId)} is not available. Retrying in ${delayMs / 1000} seconds...`);
        } else {
          this.updateStatus(`${this.peerLabel(peerId)} is not available.`);
        }
        break;
      }

      case 'network':
      case 'server-error':
        // Network or server error, switch to fallback
        this.updateStatus('Network error. Switching to fallback mode...');
        if (!this.usingFallbackServer) {
          this.switchToFallbackServer();
        }
        break;

      case 'unavailable-id':
        this.updateStatus('This Peer ID is already in use. Please generate a new one.');
        // Allow external handling of this error
        break;

      default:
        this.updateStatus(`Connection error: ${err.message}`);
    }
  }

  /**
   * Handle disconnection from signaling server
   */
  handlePeerDisconnected() {
    console.log('Connection to signaling server lost. Attempting reconnection...');
    this.updateStatus('Connection lost. Attempting reconnection...');

    // Initialize reconnection attempts
    this.reconnectAttempts = 0;
    this.attemptReconnect();
  }

  /**
   * Handle peer connection closure
   */
  handlePeerClosed() {
    console.log('Peer connection closed.');
    this.updateStatus('Connection closed.');

    // Notify any callbacks
    this.notifyDisconnectionCallbacks();
  }

  /**
   * Attempt to reconnect to the signaling server
   */
  attemptReconnect() {
    // Max number of reconnection attempts
    const MAX_RECONNECT_ATTEMPTS = 5;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const timeout = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

      this.updateStatus(`Reconnection attempt ${this.reconnectAttempts} in ${timeout / 1000}s...`);

      setTimeout(() => {
        if (this.peer && this.peer.disconnected) {
          this.peer.reconnect();
        }

        // Check if reconnection was successful after timeout
        setTimeout(() => {
          if (this.peer && this.peer.disconnected) {
            this.attemptReconnect();
          }
        }, 5000);
      }, timeout);
    } else {
      this.updateStatus('Reconnection failed. Switching to fallback mode...');
      this.switchToFallbackServer();
    }
  }

  /**
   * Switch to fallback server
   */
  switchToFallbackServer() {
    if (this.usingFallbackServer) {
      return; // Already in fallback mode
    }

    // Create new peer with the original ID for consistent identity. Without an
    // id yet (still signing up) the init chain owns the fallback instead.
    const { peerId } = this.userManager.getUserInfo();
    if (!peerId) return;

    this.usingFallbackServer = true;
    this.updateStatus('Reconnecting with fallback configuration...');

    // Re-establish against the default PeerJS cloud server with an alternate
    // ICE/STUN configuration, keeping the original ID for a consistent identity.
    // (No custom signaling host is hard-coded here, since the previous
    // placeholder host did not exist.)
    const fallbackConfig = {
      debug: 2,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      }
    };

    // createPeer destroys the old peer first (its connections close with it).
    this.createPeer(peerId, this.applyCustomServer(fallbackConfig), () => {
      this.updateStatus('Connected to fallback server');
      // Restore connections
      this.reconnectToPeers();
    }, (err) => this.handlePeerError(err));
  }

  // ---- Connection bookkeeping ----
  // Invariant: `this.connections` holds only connections that have OPENED and
  // that we accepted — at most one per peer. Outgoing attempts that have not
  // opened yet live in `pendingConnections`. Every close/error handler acts on
  // its own connection object (never "all connections with this peer id"), so
  // a duplicate or stale link can't take the live one down with it.

  /**
   * Whether a connection can actually carry data. PeerJS's `send()` does NOT
   * throw on a dead link (it emits an 'error' event instead), so liveness must be
   * checked explicitly rather than by try/catch around a send.
   * @param {Object} conn
   * @returns {boolean}
   */
  isConnectionOpen(conn) {
    return !!(conn && conn.open && (!conn.dataChannel || conn.dataChannel.readyState === 'open'));
  }

  /** Whether we hold an open connection to this peer. */
  hasOpenConnection(peerId) {
    return this.connections.some(c => c.peer === peerId && this.isConnectionOpen(c));
  }

  /**
   * Whether an outgoing attempt to this peer is still in flight. Attempts that
   * never opened within PENDING_TIMEOUT_MS (peer offline, ICE failure) are
   * abandoned here so a fresh attempt can be made.
   */
  hasPendingConnection(peerId) {
    const pending = this.pendingConnections.get(peerId);
    if (!pending) return false;
    if (Date.now() - pending.startedAt < this.PENDING_TIMEOUT_MS) return true;
    this.abandonPendingConnection(peerId);
    return false;
  }

  /** Drop (and close) an outgoing attempt that has not opened. */
  abandonPendingConnection(peerId) {
    const pending = this.pendingConnections.get(peerId);
    if (!pending) return;
    this.pendingConnections.delete(peerId);
    try { pending.conn.removeAllListeners(); } catch (_) {}
    try { pending.conn.close(); } catch (_) {}
  }

  /** Forget a connection's pending entry once it opened / closed / failed. */
  clearPending(conn) {
    const pending = this.pendingConnections.get(conn.peer);
    if (pending && pending.conn === conn) {
      this.pendingConnections.delete(conn.peer);
    }
  }

  /**
   * Open an outgoing connection and track it as pending until it opens, so the
   * periodic reconnect can't stack duplicate attempts to the same peer.
   * @param {string} peerId
   * @param {Object} [metadata] - local-only metadata (e.g. the saved username)
   * @returns {Object|null} the connection, or null if the peer can't connect now
   */
  openConnection(peerId, metadata = null) {
    if (!this.peer) return null;
    // PeerJS returns undefined (and emits an error) while we're disconnected
    // from the broker.
    const conn = this.peer.connect(peerId, { reliable: true });
    if (!conn) return null;
    if (metadata) conn.metadata = metadata;
    this.pendingConnections.set(peerId, { conn, startedAt: Date.now() });
    this.handleConnection(conn);
    return conn;
  }

  /**
   * Detach, close, and forget a connection. Listeners are removed first, so its
   * 'close' cannot touch the peer's state — the caller decides what that is (it
   * may be a duplicate whose peer stays connected via another link).
   * @param {Object} conn
   */
  retireConnection(conn) {
    try { conn.removeAllListeners(); } catch (_) {}
    try { conn.close(); } catch (_) {}
    this.connections = this.connections.filter(c => c !== conn);
    this.clearPending(conn);
  }

  /**
   * Two open connections to the same peer: pick the one to keep. Both sides
   * must pick the SAME one, or each closes the link the other kept.
   *  - If the existing link is older than GLARE_WINDOW_MS, the newcomer wins: an
   *    old link that the peer replaced is usually half-dead (e.g. they reloaded
   *    and our side hasn't noticed yet), and only we still hold it.
   *  - Otherwise both sides connected at once ("glare"): keep the link with the
   *    smaller connectionId, which both ends share.
   * @returns {Object} the connection to keep
   */
  chooseConnection(existing, candidate) {
    if (!this.isConnectionOpen(existing)) return candidate;
    const existingAge = Date.now() - (this.connectionOpenedAt.get(existing) || 0);
    if (existingAge > this.GLARE_WINDOW_MS) return candidate;
    return existing.connectionId < candidate.connectionId ? existing : candidate;
  }

  /** Record that we no longer hold a connection to a peer, and refresh UI/storage. */
  markPeerOffline(peerId, status = 'offline', message = null) {
    this.peerStatus[peerId] = status;
    this.lastSeen[peerId] = Date.now();
    this.savePeers();
    this.updateStatus(message || `Connected to ${this.connections.length} peer(s)`);
    if (typeof this.onPeersUpdated === 'function') {
      this.onPeersUpdated();
    }
  }

  /**
   * Label for a peer in status messages: the `name#fingerprint` handle, never
   * the raw peer id (which is a routing address / login credential).
   * @param {string} peerId
   * @returns {string}
   */
  peerLabel(peerId) {
    const conn = this.connections.find(c => c.peer === peerId);
    const saved = this.savedPeers.find(p => p.peerId === peerId);
    const username = (conn && conn.metadata && conn.metadata.username) || (saved && saved.username);
    if (!username || username === 'Unknown user') return 'Peer';
    return handleFor(username, this.peerKeyPins[peerId] || (saved && saved.publicKey) || null);
  }

  /**
   * Connect to a peer by ID
   * @param {string} peerId - The ID of the peer to connect to
   * @returns {Object} The connection object
   */
  connectToPeer(peerId) {
    if (!peerId) {
      throw new Error('Peer ID is required');
    }

    if (!this.peer) {
      throw new Error('No active peer connection');
    }

    // Prevent connecting to self
    if (peerId === this.userManager.peerId) {
      throw new Error('Cannot connect to yourself');
    }

    // An explicit, user-initiated connect is a deliberate re-add: clear any prior
    // removal so the persistent blocklist doesn't immediately reject this peer.
    this.unremovePeer(peerId);

    // Check rate limiting for connection attempts
    const isAllowed = this.rateLimiter.isAllowed(
      'connect',
      this.userManager.peerId,
      this.CONNECT_MAX_ATTEMPTS,
      this.CONNECT_TIME_WINDOW_MS
    );

    if (!isAllowed) {
      const timeUntil = this.rateLimiter.getTimeUntilAllowed('connect', this.userManager.peerId);
      const secondsUntil = Math.ceil(timeUntil / 1000);

      this.updateStatus(`Too many connection attempts. Please wait ${secondsUntil} seconds.`);
      throw new Error(`Rate limit exceeded. Please wait ${secondsUntil} seconds before trying again.`);
    }

    // Check if already connected to this peer
    const existingConn = this.connections.find(conn => conn.peer === peerId);
    if (existingConn && this.isConnectionOpen(existingConn)) {
      this.updateStatus(`Already connected to ${this.peerLabel(peerId)}`);
      return existingConn;
    }
    if (existingConn) {
      console.log(`Existing connection to ${peerId} is dead; replacing it.`);
      this.retireConnection(existingConn);
    }

    // A deliberate attempt replaces any automatic one still in flight and
    // restarts the automatic retry budget.
    this.abandonPendingConnection(peerId);
    delete this.retryAttempts[peerId];

    const conn = this.openConnection(peerId);
    if (!conn) {
      throw new Error('Not connected to the signaling server right now. Please try again shortly.');
    }
    return conn;
  }

  handleConnection(conn) {
    // Refuse any connection involving a peer the user explicitly removed. This
    // covers BOTH directions: an incoming connection the removed peer opened to
    // us, and a stray outgoing attempt. Explicit re-adds clear the removal first
    // (see connectToPeer), so this only fires for genuinely-removed peers.
    if (this.isPeerRemoved(conn.peer)) {
      console.log(`Refusing connection with removed peer: ${conn.peer}`);
      this.retireConnection(conn);
      return;
    }
    // A peer blocklisted for abuse can't simply reconnect until the block expires.
    if (this.isPeerBlocked(conn.peer)) {
      console.log(`Refusing connection with blocklisted peer: ${conn.peer}`);
      this.retireConnection(conn);
      return;
    }

    // Duplicate links to the same peer are resolved once this one opens (see
    // chooseConnection) — deciding here would be premature, since an "existing"
    // link that still looks open may be dead.
    conn.on('open', () => {
      this.clearPending(conn);
      this.connectionOpenedAt.set(conn, Date.now());

      // The user may have removed this peer while the connection was opening.
      if (this.isPeerRemoved(conn.peer)) {
        this.retireConnection(conn);
        return;
      }

      // At most one connection per peer.
      const existing = this.connections.find(c => c !== conn && c.peer === conn.peer);
      if (existing) {
        if (this.chooseConnection(existing, conn) === existing) {
          console.log(`Duplicate connection to ${conn.peer}; keeping the existing one.`);
          this.retireConnection(conn);
          return;
        }
        console.log(`Replacing connection to ${conn.peer} with the newer one.`);
        this.retireConnection(existing);
      }

      console.log('Connected to peer:', conn.peer);
      this.connections.push(conn);
      delete this.retryAttempts[conn.peer];

      // Update peer status tracking
      this.peerStatus[conn.peer] = 'online';
      this.lastSeen[conn.peer] = Date.now();
      this.peerConnectionQuality[conn.peer] = 'good';

      // Handshake on every accepted connection: metadata (and the verified enc
      // key) is per connection, so a replacement link needs its own.
      this.sendHandshake(conn);

      // Update UI
      this.savePeers();
      this.updateStatus(`Connected to ${this.connections.length} peer(s)`);

      // Notify any connection callbacks
      this.notifyConnectionCallbacks(conn);

      // Notify listeners
      if (typeof this.onPeersUpdated === 'function') {
        this.onPeersUpdated();
      }
    });

    conn.on('data', (data) => {
      // Drop everything from a peer the user removed, or one we've blocklisted
      // for abuse. (handleConnection rejects removed peers up front; this guards
      // any message already in flight when the removal happened.)
      if (this.isPeerRemoved(conn.peer) || this.isPeerBlocked(conn.peer)) {
        return;
      }

      // Per-peer inbound flood protection: one peer cannot pin our handlers.
      if (!this.rateLimiter.isAllowed('inbound', conn.peer, this.INBOUND_MAX, this.INBOUND_WINDOW_MS)) {
        console.warn(`Inbound rate limit exceeded for peer ${conn.peer}; dropping message.`);
        this.recordPeerStrike(conn.peer);
        return;
      }

      // Basic shape check before dispatch.
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
        this.recordPeerStrike(conn.peer);
        return;
      }

      console.log('Received data:', data);

      // Route the message to the appropriate handler
      if (this.messageHandlers[data.type]) {
        this.messageHandlers[data.type](data, conn);
      } else {
        console.warn(`No handler for message type: ${data.type}`);
      }
    });

    // Handle connection closure
    conn.on('close', () => {
      this.clearPending(conn);
      const wasActive = this.connections.includes(conn);
      this.connections = this.connections.filter(c => c !== conn);
      // A link that never opened (or was already superseded) doesn't change the peer's state.
      if (!wasActive) return;

      console.log('Connection closed with peer:', conn.peer);
      // Update peer status to offline but keep it in the list
      this.markPeerOffline(conn.peer, 'offline');

      // Notify any disconnection callbacks
      this.notifyPeerDisconnectionCallbacks(conn.peer);
    });

    // Handle connection errors
    conn.on('error', (err) => {
      console.error(`Connection error with peer ${conn.peer}:`, err);
      // PeerJS also reports non-fatal errors on a live link (e.g. a message that
      // is too large); only a link that is actually dead is torn down.
      if (this.isConnectionOpen(conn)) return;

      this.clearPending(conn);
      const wasActive = this.connections.includes(conn);
      this.connections = this.connections.filter(c => c !== conn);
      if (!wasActive) return;

      this.markPeerOffline(conn.peer, 'error');

      // Notify any error callbacks
      this.notifyPeerErrorCallbacks(conn.peer, err);
    });
  }

  /**
   * Disconnect from a specific peer
   * @param {Object} conn - The connection to close
   */
  disconnectPeer(conn) {
    const wasActive = this.connections.includes(conn);
    const label = this.peerLabel(conn.peer);
    this.retireConnection(conn);

    if (wasActive) {
      this.markPeerOffline(conn.peer, 'offline', `Disconnected from ${label}`);

      // Notify any disconnection callbacks
      this.notifyPeerDisconnectionCallbacks(conn.peer);
    }
  }

  /**
   * Reconnect to all known peers (after switching to a new peer object, whose
   * predecessor's connections died with it).
   */
  reconnectToPeers() {
    this.connectToSavedPeers();
    this.updateStatus('Attempting to reconnect to peers...');
  }

  /**
   * Schedule an automatic retry for a peer that was unavailable, with
   * exponential backoff and a bounded number of attempts (reset when a
   * connection to the peer opens, or when the user connects deliberately).
   * @param {string} peerId - The ID of the peer to retry connecting to
   * @returns {number} the delay in ms, or 0 if no retry was scheduled
   */
  schedulePeerRetry(peerId) {
    if (!peerId || this.isPeerRemoved(peerId)) return 0;

    const attempt = (this.retryAttempts[peerId] || 0) + 1;
    if (attempt > this.MAX_PEER_RETRIES) return 0;
    this.retryAttempts[peerId] = attempt;

    const delayMs = 10000 * Math.pow(2, attempt - 1);
    this.pendingRetry = () => this.autoConnect(peerId);
    setTimeout(this.pendingRetry, delayMs);
    return delayMs;
  }

  /**
   * Automatic (not user-initiated) connection attempt, used by retries and the
   * saved-peer reconnect. Unlike connectToPeer it never clears a removal and
   * never spends the user's manual connect budget, and it skips peers we're
   * already connected or connecting to.
   * @param {string} peerId
   * @param {Object} [metadata] - local-only metadata (e.g. the saved username)
   */
  autoConnect(peerId, metadata = null) {
    if (!this.peer || this.peer.disconnected) return;
    if (!peerId || peerId === this.userManager.peerId) return; // Don't connect to self
    if (this.isPeerRemoved(peerId)) return; // Never auto-reconnect to a removed peer
    if (this.hasOpenConnection(peerId) || this.hasPendingConnection(peerId)) return;
    this.openConnection(peerId, metadata);
  }

  /**
   * Update status with a retry button
   * @param {string} message - The status message
   */
  updateStatusWithRetry(message) {
    const event = new CustomEvent('status-update', {
      detail: {
        message,
        showRetry: true,
        retryFn: this.pendingRetry
      }
    });

    window.dispatchEvent(event);
  }

  /**
   * Update status message
   * @param {string} message - The status message
   */
  updateStatus(message) {
    const event = new CustomEvent('status-update', {
      detail: {
        message,
        showRetry: false
      }
    });

    window.dispatchEvent(event);
    console.log('Status update:', message);
  }

  /**
   * Check the health of all connections
   */
  checkConnectionHealth() {
    // Check connection to signaling server
    if (!this.peer) return;

    if (this.peer.disconnected) {
      this.connectionQuality = 'offline';
      this.updateStatus('No connection to signaling server. Attempting to reconnect...');
      this.peer.reconnect();
      return;
    }

    // Check individual peer connections
    if (this.connections.length > 0) {
      // Drop links whose data channel died without a 'close' event.
      const stale = this.connections.filter(conn => !this.isConnectionOpen(conn));
      stale.forEach(conn => {
        console.log(`Detected stale connection to ${conn.peer}, removing...`);
        this.retireConnection(conn);
        this.markPeerOffline(conn.peer, 'offline');
        this.notifyPeerDisconnectionCallbacks(conn.peer);
      });

      // Ping the live ones (drives connection quality + inactivity tracking)
      this.connections.forEach(conn => {
        try {
          conn.send({
            type: 'ping',
            timestamp: Date.now()
          });
        } catch (e) {
          console.error(`Error pinging peer ${conn.peer}:`, e);
        }
      });
    }
    // If no active connections but we have saved peers, try to connect
    else if (this.savedPeers && this.savedPeers.length > 0) {
      this.updateStatus('No peers connected. Attempting to connect to saved peers...');
      this.connectToSavedPeers();
    }

    // Check for inactive peers
    this.checkInactivePeers();

    // Update connection quality indicator
    this.updateConnectionQualityIndicator();
  }

  /**
   * Check for and clean up inactive peers
   * This gets called during the regular connection health check
   */
  checkInactivePeers() {
    const now = Date.now();
    const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes of inactivity

    // A peer we haven't heard from (not even a ping) for the threshold duration
    const inactive = this.connections.filter(conn => now - (this.lastSeen[conn.peer] || 0) > INACTIVE_THRESHOLD);

    // Only touch storage / UI when something actually changed.
    inactive.forEach(conn => {
      console.log(`Peer ${conn.peer} has been inactive for ${Math.floor((now - (this.lastSeen[conn.peer] || 0)) / 60000)} minutes. Disconnecting.`);
      this.retireConnection(conn);
      this.markPeerOffline(conn.peer, 'timeout');

      // Notify any disconnection callbacks
      this.notifyPeerDisconnectionCallbacks(conn.peer);
    });
  }

  /**
   * Update the connection quality indicator
   */
  updateConnectionQualityIndicator() {
    let quality = 'unknown';

    if (!this.peer || this.peer.disconnected) {
      quality = 'offline';
    } else if (this.connections.length === 0) {
      quality = 'unknown';
    } else {
      // Determine overall quality based on peer connections
      const qualityCounts = {
        good: 0,
        medium: 0,
        poor: 0,
        error: 0
      };

      Object.values(this.peerConnectionQuality).forEach(q => {
        if (qualityCounts[q] !== undefined) {
          qualityCounts[q]++;
        }
      });

      if (qualityCounts.error > 0) {
        quality = 'error';
      } else if (qualityCounts.poor > Math.floor(this.connections.length / 2)) {
        quality = 'poor';
      } else if (qualityCounts.medium > Math.floor(this.connections.length / 2)) {
        quality = 'medium';
      } else if (qualityCounts.good > 0) {
        quality = 'good';
      }
    }

    this.connectionQuality = quality;

    // Dispatch event for UI update
    const event = new CustomEvent('connection-quality-update', {
      detail: { quality }
    });

    window.dispatchEvent(event);
  }

  /**
   * Load saved peers from storage
   */
	async loadPeers() {
	  // Always load the persistent removed-peers blocklist first, so the filter
	  // below can drop any removed peer that lingers in the saved list (e.g. from
	  // a pre-removal state) and never restore it into the active maps.
	  await this.loadRemovedPeers();
	  await this.loadPeerKeyPins();

	  const peers = await this.storageManager.loadFromStorage(StorageManager.KEYS.PEERS);

	  if (peers) {
		this.savedPeers = peers.filter(peer => !this.isPeerRemoved(peer.peerId));

		// Restore peer status information. Status is deliberately NOT restored from
		// storage: at load time we hold zero connections, so every known peer is
		// offline until one actually reconnects (which flips it to 'online'). A
		// persisted 'online' would otherwise show a phantom-online peer.
		this.savedPeers.forEach(peer => {
		  this.peerStatus[peer.peerId] = 'offline';
		  this.lastSeen[peer.peerId] = peer.lastSeen || 0;
		  this.peerConnectionQuality[peer.peerId] = peer.connectionQuality || 'unknown';
		});
	  }
	}

  /**
   * Save peers to storage
   */
	async savePeers() {
	  // Nothing to persist without an account — and this stops late async events
	  // (e.g. a connection 'close') from re-writing peers after credentials are deleted.
	  if (!this.userManager.isLoggedIn()) return;
	  try {
		// Extract peer info including status. Removed peers are excluded so a
		// transient status entry can never resurrect them in storage.
		const peersToSave = Object.keys(this.peerStatus)
		  .filter(peerId => !this.isPeerRemoved(peerId))
		  .map(peerId => {
		  const connection = this.connections.find(conn => conn.peer === peerId);
		  const saved = this.savedPeers.find(p => p.peerId === peerId);
		  return {
			peerId: peerId,
			username: connection?.metadata?.username || saved?.username || 'Unknown user',
			// Persist the peer's signing key so the UI can show the verifiable
			// `name#fingerprint` handle even while they're offline, instead of
			// leaking the raw peer ID / network address. The TOFU pin wins over a
			// (possibly impostor) key claimed in the current handshake.
			publicKey: this.peerKeyPins[peerId] || connection?.metadata?.publicKey || saved?.publicKey || null,
			status: this.peerStatus[peerId] || 'unknown',
			lastSeen: this.lastSeen[peerId] || Date.now(),
			connectionQuality: this.peerConnectionQuality[peerId] || 'unknown'
		  };
		});
		
		await this.storageManager.saveToStorage(StorageManager.KEYS.PEERS, peersToSave);
		this.savedPeers = peersToSave;
	  } catch (e) {
		console.error('Error saving peers to storage:', e);
	  }
	}

  /**
   * Connect to all saved peers
   */
  connectToSavedPeers() {
    if (!this.peer || !this.savedPeers || this.savedPeers.length === 0) {
      return;
    }

    console.log('Attempting to connect to saved peers:', this.savedPeers);

    this.savedPeers.forEach(peerInfo => {
      try {
        // Skips removed peers, ourselves, and peers already connected or
        // connecting (so the 15s health check can't stack attempts).
        this.autoConnect(peerInfo.peerId, { username: peerInfo.username });
      } catch (e) {
        console.error(`Error connecting to saved peer ${peerInfo.peerId}:`, e);
      }
    });
  }

  /**
   * Get all connected peer IDs
   * @returns {Array} Array of connected peer IDs
   */
  getConnectedPeerIds() {
    return this.connections.map(conn => conn.peer);
  }

  /**
   * Get a connected peer's encryption (ECDH) public key, learned via handshake.
   * @param {string} peerId
   * @returns {string|null} base64 enc public key, or null if unknown
   */
  getPeerEncKey(peerId) {
    const conn = this.connections.find(c => c.peer === peerId);
    return (conn && conn.metadata && conn.metadata.encPublicKey) || null;
  }

  /**
   * Get all peer connections
   * @returns {Array} Array of connection objects
   */
  getAllConnections() {
    return [...this.connections];
  }

  /**
   * Remove an offline peer from saved peers
   * @param {string} peerId - The ID of the peer to remove
   */
  removeOfflinePeer(peerId) {
    if (!peerId) return;

    // Record the removal permanently FIRST, so the persistent blocklist is in
    // place before we tear anything down — this is what stops the peer from
    // reconnecting (to us, or us to them) and re-appearing after the next login.
    this.removedPeers.add(peerId);
    this.saveRemovedPeers();

    // Close any live connection to this peer (handles the case where the peer
    // came back online and reconnected before removal).
    this.connections.filter(c => c.peer === peerId).forEach(c => this.retireConnection(c));
    this.abandonPendingConnection(peerId);
    delete this.retryAttempts[peerId];

    // Forget the pinned key too: deliberately re-adding the peer later re-pins
    // whatever key they present (the escape hatch for a genuine identity reset).
    if (this.peerKeyPins[peerId]) {
      delete this.peerKeyPins[peerId];
      this.savePeerKeyPins();
    }

    // Remove from saved peers and all in-memory tracking.
    this.savedPeers = this.savedPeers.filter(peer => peer.peerId !== peerId);
    delete this.peerStatus[peerId];
    delete this.lastSeen[peerId];
    delete this.peerConnectionQuality[peerId];

    // Save updated peers list
    this.savePeers();

    // Refresh the peer list / status UI.
    this.notifyPeerDisconnectionCallbacks(peerId);
    if (typeof this.onPeersUpdated === 'function') {
      this.onPeersUpdated();
    }

    this.updateStatus('Peer removed');
  }

  /**
   * Register a message handler
   * @param {string} type - Message type
   * @param {function} handler - Handler function
   */
  registerMessageHandler(type, handler) {
    this.messageHandlers[type] = handler;
  }

  /**
   * Handle handshake message from peer
   * @param {Object} data - Message data
   * @param {Object} conn - Connection object
   */
  async handleHandshakeMessage(data, conn) {
    // Every accepted connection sends its own handshake on open; reply here only
    // if this link somehow hasn't (sendHandshake marks it synchronously).
    if (!this.handshakeSent.has(conn)) {
      this.sendHandshake(conn);
    }

    const asKey = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 256) ? v : null;
    const username = (typeof data.username === 'string' && data.username.length <= 64) ? data.username : 'Unknown user';
    const claimedKey = asKey(data.publicKey);
    const claimedEncKey = asKey(data.encPublicKey);

    // A different key at a pinned address means someone else holds this peer id
    // (e.g. registered it while the owner was offline).
    const pinnedKey = this.peerKeyPins[conn.peer] || null;
    const keyMismatch = !!(pinnedKey && claimedKey !== pinnedKey);
    if (!pinnedKey && claimedKey) {
      this.peerKeyPins[conn.peer] = claimedKey;
      this.savePeerKeyPins();
    }

    // Accept the encryption key only if the (pinned) signing key vouches for it,
    // so circle posts are sealed to the identity — not to whoever has the peer id.
    let encPublicKey = null;
    if (!keyMismatch && claimedKey && claimedEncKey &&
        await verifyEncKeyBinding(claimedKey, claimedEncKey, data.encKeySig)) {
      encPublicKey = claimedEncKey;
    }
    if (keyMismatch) {
      console.warn(`Peer ${conn.peer} presented a different signing key than the one pinned for it.`);
    }

    // Metadata belongs to THIS link only (never copied onto another connection
    // to the same peer id), and only while it's still the accepted one.
    if (this.connections.includes(conn)) {
      // Note: handshake username/publicKey are self-asserted and used only for
      // display. Authorship is trusted only via per-message signatures.
      conn.metadata = {
        username,
        publicKey: claimedKey,
        encPublicKey,
        keyMismatch
      };
      this.savePeers();
      if (typeof this.onPeersUpdated === 'function') {
        this.onPeersUpdated();
      }
    }
  }

  /**
   * Build our handshake: display name, signing key, and the encryption key plus
   * a signature binding it to the signing key (cached per enc key).
   * @returns {Promise<Object>}
   */
  async buildHandshake() {
    const identity = this.userManager.identity;
    const encPublicKey = this.userManager.encPublicKey;
    if (this._encKeySigFor !== encPublicKey) {
      this._encKeySig = (identity && encPublicKey) ? await identity.signEncKeyBinding() : null;
      this._encKeySigFor = encPublicKey;
    }
    return {
      type: 'handshake',
      username: this.userManager.username,
      publicKey: this.userManager.publicKey,
      encPublicKey,
      encKeySig: this._encKeySig || null
    };
  }

  /**
   * Send our handshake to a peer.
   * @param {Object} conn - Connection object
   */
  async sendHandshake(conn) {
    this.handshakeSent.add(conn);
    try {
      conn.send(await this.buildHandshake());
    } catch (err) {
      console.error(`Failed to send handshake to ${conn.peer}:`, err);
    }
  }

  /**
   * Tear down all networking and forget in-memory peer state (used when the
   * user deletes their credentials). Listeners are detached before closing so
   * late async close/error events cannot touch state after the wipe.
   */
  shutdown() {
    [...this.connections].forEach(conn => this.retireConnection(conn));
    this.destroyPeer(); // also drops pending outgoing attempts

    this.connections = [];
    this.savedPeers = [];
    this.retryAttempts = {};
    this.peerStatus = {};
    this.lastSeen = {};
    this.peerConnectionQuality = {};
    this.blockedPeers = {};
    this.removedPeers = new Set();
    this.peerKeyPins = {};
    this.rateLimiter = new RateLimiter();
    this.usingFallbackServer = false;
    this.reconnectAttempts = 0;

    if (typeof this.onPeersUpdated === 'function') {
      this.onPeersUpdated();
    }
  }

  /**
   * Handle ping message from peer
   * @param {Object} data - Message data
   * @param {Object} conn - Connection object
   */
  handlePingMessage(data, conn) {
    // Track last seen and update connection quality
    this.lastSeen[conn.peer] = Date.now();
    this.peerConnectionQuality[conn.peer] = 'good';

    // Send ping reply
    if (data.timestamp) {
      conn.send({
        type: 'ping_reply',
        originalTimestamp: data.timestamp
      });
    }
  }

  /**
   * Handle ping reply message from peer
   * @param {Object} data - Message data
   * @param {Object} conn - Connection object
   */
  handlePingReplyMessage(data, conn) {
    // Calculate ping time
    if (data.originalTimestamp) {
      const pingTime = Date.now() - data.originalTimestamp;

      // Update last response time
      if (!this.lastResponseTime) this.lastResponseTime = {};
      this.lastResponseTime[conn.peer] = Date.now();

      // Update connection quality based on ping time
      if (pingTime < 300) {
        this.peerConnectionQuality[conn.peer] = 'good';
      } else if (pingTime < 1000) {
        this.peerConnectionQuality[conn.peer] = 'medium';
      } else {
        this.peerConnectionQuality[conn.peer] = 'poor';
      }

      // Save updated quality information
      this.savePeers();
    }
  }

  /**
   * Register callback for peer connection
   * @param {function} callback - Callback function
   */
  onPeerConnected(callback) {
    if (typeof callback === 'function') {
      this.onConnectionCallbacks.push(callback);
    }
  }

  /**
   * Register callback for peer disconnection
   * @param {function} callback - Callback function
   */
  onPeerDisconnected(callback) {
    if (typeof callback === 'function') {
      this.onDisconnectionCallbacks.push(callback);
    }
  }

  /**
   * Notify all connection callbacks
   * @param {Object} conn - Connection object
   */
  notifyConnectionCallbacks(conn) {
    this.onConnectionCallbacks.forEach(callback => {
      try {
        callback(conn);
      } catch (e) {
        console.error('Error in connection callback:', e);
      }
    });
  }

  /**
   * Notify all disconnection callbacks
   */
  notifyDisconnectionCallbacks() {
    this.onDisconnectionCallbacks.forEach(callback => {
      try {
        callback();
      } catch (e) {
        console.error('Error in disconnection callback:', e);
      }
    });
  }

  /**
   * Notify peer disconnection callbacks
   * @param {string} peerId - ID of disconnected peer
   */
  notifyPeerDisconnectionCallbacks(peerId) {
    this.onDisconnectionCallbacks.forEach(callback => {
      try {
        callback(peerId);
      } catch (e) {
        console.error('Error in peer disconnection callback:', e);
      }
    });
  }

  /**
   * Notify peer error callbacks
   * @param {string} peerId - ID of peer with error
   * @param {Error} err - Error object
   */
  notifyPeerErrorCallbacks(peerId, err) {
    this.onDisconnectionCallbacks.forEach(callback => {
      try {
        callback(peerId, err);
      } catch (e) {
        console.error('Error in peer error callback:', e);
      }
    });
  }

  enhanceConnectivity() {
    // Set up network status monitoring
    window.addEventListener('online', () => {
      this.updateStatus('Internet connection restored. Establishing connection...');
      if (this.peer && this.peer.disconnected) {
        this.peer.reconnect();
      }
    });

    window.addEventListener('offline', () => {
      this.updateStatus('Internet connection lost. Waiting for reconnection...');
    });

    // Set up periodic connection health checks (every 15 seconds)
    setInterval(() => this.checkConnectionHealth(), 15000);
  }
}
