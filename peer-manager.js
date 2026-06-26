// Manages peer connections and communication

import { StorageManager } from './storage-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { randomToken } from './crypto-identity.js';

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
    this.connections = [];
    this.savedPeers = [];
    this.handshakeCompleted = new Set(); // Track peers that completed handshake
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
   * Initialize a new peer connection
   * @returns {Promise} Promise that resolves when peer is connected
   */
  initializePeer() {
    return new Promise((resolve, reject) => {
      try {
        // Close any existing peer
        if (this.peer) {
          this.peer.destroy();
        }

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
        this.peer = new Peer(this.applyCustomServer(peerConfig));

        // Setup event handlers
        this.peer.on('open', (id) => {
          console.log('Peer connection established with ID:', id);
          this.userManager.saveCredentials(this.userManager.username, id);
          this.updateStatus(`Connected with ID: ${id}`);
          resolve(id);
        });

        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          if (err.type === 'server-error' || err.type === 'network') {
            // Try to use fallback server
            this.updateStatus('Connection error. Trying alternative server...');
            this.peer.destroy();
            this.initializeWithFallbackServer().then(resolve).catch(reject);
          } else {
            this.handlePeerError(err);
            reject(err);
          }
        });

        this.peer.on('connection', this.handleConnection);
        this.peer.on('disconnected', this.handlePeerDisconnected.bind(this));
        this.peer.on('close', this.handlePeerClosed.bind(this));
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

        this.peer = new Peer(this.applyCustomServer(fallbackConfig));

        this.peer.on('open', (id) => {
          console.log('Fallback connection established with ID:', id);
          this.userManager.saveCredentials(this.userManager.username, id);
          this.updateStatus(`Connected with ID: ${id} (fallback server)`);
          this.usingFallbackServer = true;
          resolve(id);
        });

        this.peer.on('error', (err) => {
          console.error('Fallback server error:', err);
          this.handlePeerError(err);

          // Try one last option - direct mode with no server
          if (err.type === 'server-error' || err.type === 'network') {
            this.updateStatus('Trying direct connection mode...');
            this.initializeDirectMode().then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });

        this.peer.on('connection', this.handleConnection);
        this.peer.on('disconnected', this.handlePeerDisconnected.bind(this));
        this.peer.on('close', this.handlePeerClosed.bind(this));
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

          this.peer = new Peer(randomId, this.applyCustomServer(directConfig));

          this.peer.on('open', (id) => {
            console.log('Direct mode connection initialized with ID:', id);
            this.userManager.saveCredentials(this.userManager.username, id);
            this.updateStatus(`Connected with ID: ${id} (direct mode)`);
            resolve(id);
          });

          this.peer.on('error', (err) => {
            console.error(`Direct mode error (attempt ${this.directModeAttempts}/${MAX_DIRECT_MODE_ATTEMPTS}):`, err);
            this.handlePeerError(err);

            // Try again with exponential backoff if we haven't exceeded max attempts
            if (this.directModeAttempts < MAX_DIRECT_MODE_ATTEMPTS) {
              const backoffTime = Math.pow(2, this.directModeAttempts) * 1000;
              console.log(`Retrying direct mode in ${backoffTime / 1000} seconds...`);
              this.updateStatus(`Connection failed. Retrying in ${backoffTime / 1000} seconds...`);

              setTimeout(attemptDirectConnection, backoffTime);
            } else {
              reject(err);
            }
          });

          this.peer.on('connection', this.handleConnection);
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

        // Close any existing peer
        if (this.peer) {
          this.peer.destroy();
        }

        // Create new peer with saved ID. Pass options only when a custom broker/
        // TURN is configured, so default (public-cloud) behaviour is unchanged.
        this.peer = this.hasCustomServer()
          ? new Peer(peerId, this.applyCustomServer({ debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], iceCandidatePoolSize: 10 } }))
          : new Peer(peerId);

        this.peer.on('open', (id) => {
          console.log('Logged in with ID:', id);

          // Set up connection handlers
          this.peer.on('connection', this.handleConnection);

          // Connect to saved peers after login
          this.loadPeers();
          setTimeout(() => this.connectToSavedPeers(), 1000);

          resolve(id);
        });

        this.peer.on('error', (err) => {
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
      case 'peer-unavailable':
        // Target peer not available
        this.updateStatusWithRetry(`Peer ${err.peer} not available. Retrying in 10 seconds...`);
        this.schedulePeerRetry(err.peer);
        break;

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

    // Close existing connection
    if (this.peer) {
      this.peer.destroy();
    }

    // Clear all handshake tracking when switching servers - add this line
    this.handshakeCompleted.clear();

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

    // Create new peer with the original ID for consistent identity
    const { peerId } = this.userManager.getUserInfo();
    this.peer = new Peer(peerId, this.applyCustomServer(fallbackConfig));

    // Reconnect event handlers
    this.peer.on('open', (id) => {
      this.updateStatus('Connected to fallback server');
      // Restore connections
      this.reconnectToPeers();
    });

    this.peer.on('error', this.handlePeerError.bind(this));
    this.peer.on('connection', this.handleConnection);
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
    const existingConnIndex = this.connections.findIndex(conn => conn.peer === peerId);

    if (existingConnIndex !== -1) {
      console.log(`Already have a connection to peer: ${peerId}, testing if active...`);
      const existingConn = this.connections[existingConnIndex];

      try {
        // Test if connection is still active
        existingConn.send({ type: 'ping' });
        this.updateStatus(`Already connected to ${peerId}`);
        return existingConn;
      } catch (e) {
        console.log(`Existing connection to ${peerId} appears inactive, removing and creating new connection`);
        // Remove the stale connection
        this.connections.splice(existingConnIndex, 1);
        this.handshakeCompleted.delete(peerId);

        // Try to close it cleanly
        try { existingConn.close(); } catch (err) { }
      }
    }

    // Create new connection
    const conn = this.peer.connect(peerId, {
      reliable: true
    });

    this.handleConnection(conn);
    return conn;
  }

  handleConnection(conn) {
    // Refuse any connection involving a peer the user explicitly removed. This
    // covers BOTH directions: an incoming connection the removed peer opened to
    // us, and a stray outgoing attempt. Explicit re-adds clear the removal first
    // (see connectToPeer), so this only fires for genuinely-removed peers.
    if (this.isPeerRemoved(conn.peer)) {
      console.log(`Refusing connection with removed peer: ${conn.peer}`);
      try { conn.close(); } catch (_) {}
      return;
    }

    // Check if already connected to this peer
    const existingConnIndex = this.connections.findIndex(existingConn => existingConn.peer === conn.peer);

    if (existingConnIndex !== -1) {
      console.log(`Found existing connection to peer: ${conn.peer}, checking if still active...`);
      const existingConn = this.connections[existingConnIndex];

      // Check if the existing connection is working
      try {
        // Test if connection is open by sending a ping
        existingConn.send({ type: 'ping' });

        // If we get here without error, existing connection is working
        console.log('Existing connection appears active, rejecting new connection');
        conn.close();
        return;
      } catch (e) {
        // Existing connection is likely broken
        console.log('Existing connection appears broken, replacing with new connection');

        // Try to close the old connection
        try { existingConn.close(); } catch (err) { }

        // Remove old connection
        this.connections.splice(existingConnIndex, 1);

        // Clear handshake state for this peer
        this.handshakeCompleted.delete(conn.peer);
      }
    }

    conn.on('open', () => {
      console.log('Connected to peer:', conn.peer);
      this.connections.push(conn);

      // Update peer status tracking
      this.peerStatus[conn.peer] = 'online';
      this.lastSeen[conn.peer] = Date.now();
      this.peerConnectionQuality[conn.peer] = 'good';

      // Send initial handshake if we haven't already
      if (!this.handshakeCompleted.has(conn.peer)) {
        conn.send({
          type: 'handshake',
          username: this.userManager.username,
          publicKey: this.userManager.publicKey,
          encPublicKey: this.userManager.encPublicKey
        });
      }

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
      console.log('Connection closed with peer:', conn.peer);
      this.connections = this.connections.filter(c => c.peer !== conn.peer);
      // Update peer status to offline but keep it in the list
      this.peerStatus[conn.peer] = 'offline';
      this.lastSeen[conn.peer] = Date.now();
      // Remove from handshake tracking
      this.handshakeCompleted.delete(conn.peer);

      // Update UI and saved state
      this.savePeers();
      this.updateStatus(`Connected to ${this.connections.length} peer(s)`);

      // Notify any disconnection callbacks
      this.notifyPeerDisconnectionCallbacks(conn.peer);

      // Notify listeners
      if (typeof this.onPeersUpdated === 'function') {
        this.onPeersUpdated();
      }
    });

    // Handle connection errors
    conn.on('error', (err) => {
      console.error(`Connection error with peer ${conn.peer}:`, err);
      // Update peer status
      this.peerStatus[conn.peer] = 'error';
      this.lastSeen[conn.peer] = Date.now();
      // Remove problematic connection
      this.connections = this.connections.filter(c => c.peer !== conn.peer);
      this.handshakeCompleted.delete(conn.peer);

      // Update UI and saved state
      this.savePeers();
      this.updateStatus(`Connected to ${this.connections.length} peer(s)`);

      // Notify any error callbacks
      this.notifyPeerErrorCallbacks(conn.peer, err);

      // Notify listeners
      if (typeof this.onPeersUpdated === 'function') {
        this.onPeersUpdated();
      }
    });
  }

  /**
   * Disconnect from a specific peer
   * @param {Object} conn - The connection to close
   */
  disconnectPeer(conn) {
    // Close the connection
    try {
      conn.close();
    } catch (e) {
      console.error('Error closing connection:', e);
    }

    // Remove from connections array
    this.connections = this.connections.filter(c => c.peer !== conn.peer);

    // Update peer status
    this.peerStatus[conn.peer] = 'offline';
    this.lastSeen[conn.peer] = Date.now();

    // Remove from handshake tracking
    this.handshakeCompleted.delete(conn.peer);

    // Update UI and saved state
    this.savePeers();
    this.updateStatus(`Disconnected from ${conn.peer}`);

    // Notify any disconnection callbacks
    this.notifyPeerDisconnectionCallbacks(conn.peer);
  }

  /**
   * Reconnect to all known peers
   */
  reconnectToPeers() {
    // Store the previous connections
    const previousConnections = [...this.connections];
    this.connections = [];

    // Reconnect to each peer
    previousConnections.forEach(prevConn => {
      if (prevConn.peer !== this.userManager.peerId) {
        console.log(`Attempting to reconnect with ${prevConn.peer}...`);

        const newConn = this.peer.connect(prevConn.peer, {
          reliable: true
        });

        // Transfer metadata if available
        if (prevConn.metadata) {
          newConn.metadata = prevConn.metadata;
        }

        this.handleConnection(newConn);
      }
    });

    // Connect to saved peers
    if (this.savedPeers && this.savedPeers.length > 0) {
      this.connectToSavedPeers();
    }

    this.updateStatus('Attempting to reconnect to peers...');
  }

  /**
   * Schedule a retry to connect to a specific peer
   * @param {string} peerId - The ID of the peer to retry connecting to
   */
  schedulePeerRetry(peerId) {
    this.pendingRetry = () => {
      console.log(`Retrying connection to ${peerId}...`);
      this.connectToPeer(peerId);
      this.updateStatus(`Reconnecting to ${peerId}...`);
    };

    setTimeout(this.pendingRetry, 10000); // Retry after 10 seconds
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
      console.log('Checking connection status of all peers...');

      // Filter to keep only active connections
      const previousLength = this.connections.length;
      this.connections = this.connections.filter(conn => {
        // Check if connection is still open
        if (conn._dc && conn._dc.readyState !== 'open') {
          console.log(`Detected stale connection to ${conn.peer}, removing...`);
          try { conn.close(); } catch (e) { console.error('Error closing connection:', e); }
          return false;
        }

        // Send ping to check connection
        try {
          conn.send({
            type: 'ping',
            timestamp: Date.now()
          });
        } catch (e) {
          console.error(`Error pinging peer ${conn.peer}:`, e);
          return false;
        }

        return true;
      });

      // If connections were removed, update state
      if (previousLength !== this.connections.length) {
        this.savePeers();
        this.updateConnectionQualityIndicator();
        // Notify listeners
        if (typeof this.onPeersUpdated === 'function') {
          this.onPeersUpdated();
        }
      }
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

    // Check each connection
    this.connections = this.connections.filter(conn => {
      const lastSeenTime = this.lastSeen[conn.peer] || 0;
      const timeSinceLastSeen = now - lastSeenTime;

      // If peer hasn't been seen for the threshold duration
      if (timeSinceLastSeen > INACTIVE_THRESHOLD) {
        console.log(`Peer ${conn.peer} has been inactive for ${Math.floor(timeSinceLastSeen / 60000)} minutes. Disconnecting.`);

        // Close connection
        try {
          conn.close();
        } catch (e) {
          console.error('Error closing inactive connection:', e);
        }

        // Update peer status
        this.peerStatus[conn.peer] = 'timeout';
        this.lastSeen[conn.peer] = now;

        // Remove from handshake tracking
        this.handshakeCompleted.delete(conn.peer);

        // Notify any disconnection callbacks
        this.notifyPeerDisconnectionCallbacks(conn.peer);

        return false; // Remove from connections array
      }

      return true; // Keep in connections array
    });

    // If connections were modified, update UI
    this.savePeers();

    // Notify listeners
    if (typeof this.onPeersUpdated === 'function') {
      this.onPeersUpdated();
    }
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

	  const peers = await this.storageManager.loadFromStorage(StorageManager.KEYS.PEERS);

	  if (peers) {
		this.savedPeers = peers.filter(peer => !this.isPeerRemoved(peer.peerId));

		// Restore peer status information
		this.savedPeers.forEach(peer => {
		  this.peerStatus[peer.peerId] = peer.status || 'offline';
		  this.lastSeen[peer.peerId] = peer.lastSeen || 0;
		  this.peerConnectionQuality[peer.peerId] = peer.connectionQuality || 'unknown';
		});
	  }
	}

  /**
   * Save peers to storage
   */
	async savePeers() {
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
			// Persist the peer's signing key (learned at handshake) so the UI can
			// show the verifiable `name#fingerprint` handle even while they're
			// offline, instead of leaking the raw peer ID / network address.
			publicKey: connection?.metadata?.publicKey || saved?.publicKey || null,
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
        // Never auto-reconnect to a peer the user removed.
        if (this.isPeerRemoved(peerInfo.peerId)) {
          return;
        }
        if (peerInfo.peerId !== this.userManager.peerId) { // Don't connect to self
          // Check if already connected
          if (this.connections.some(conn => conn.peer === peerInfo.peerId)) {
            console.log(`Already connected to saved peer: ${peerInfo.peerId}`);
            return;
          }

          const conn = this.peer.connect(peerInfo.peerId, {
            reliable: true
          });

          // Add metadata early
          conn.metadata = { username: peerInfo.username };

          this.handleConnection(conn);
        }
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
    const conn = this.connections.find(c => c.peer === peerId);
    if (conn) {
      try { conn.close(); } catch (_) {}
    }
    this.connections = this.connections.filter(c => c.peer !== peerId);

    // Remove from saved peers and all in-memory tracking.
    this.savedPeers = this.savedPeers.filter(peer => peer.peerId !== peerId);
    this.handshakeCompleted.delete(peerId);
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

    this.updateStatus(`Removed peer ${peerId}`);
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
  handleHandshakeMessage(data, conn) {
    // Update the username of this peer
    const connectionIndex = this.connections.findIndex(c => c.peer === conn.peer);
    if (connectionIndex !== -1) {
      // Note: handshake username/publicKey are self-asserted and used only for
      // display. Authorship is trusted only via per-message signatures.
      this.connections[connectionIndex].metadata = {
        username: data.username,
        publicKey: data.publicKey || null,
        encPublicKey: data.encPublicKey || null
      };
      this.savePeers();
    }

    // Only send a handshake back if we haven't completed the handshake already
    if (!this.handshakeCompleted.has(conn.peer)) {
      conn.send({
        type: 'handshake',
        username: this.userManager.username,
        publicKey: this.userManager.publicKey,
        encPublicKey: this.userManager.encPublicKey
      });
      // Mark handshake as completed for this peer
      this.handshakeCompleted.add(conn.peer);
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
