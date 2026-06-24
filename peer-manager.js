// Manages peer connections and communication

import { StorageManager } from './storage-manager.js';
import { RateLimiter } from './rate-limiter.js';

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
        this.peer = new Peer(peerConfig);

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

        this.peer = new Peer(fallbackConfig);

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

          this.peer = new Peer(randomId, directConfig);

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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'user-';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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

        // Create new peer with saved ID
        this.peer = new Peer(peerId);

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
    this.peer = new Peer(peerId, fallbackConfig);

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
          publicKey: this.userManager.publicKey
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
      console.log('Received data:', data);

      // Route the message to the appropriate handler
      if (data.type && this.messageHandlers[data.type]) {
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
	  const peers = await this.storageManager.loadFromStorage(StorageManager.KEYS.PEERS);
	  
	  if (peers) {
		this.savedPeers = peers;
		
		// Restore peer status information
		peers.forEach(peer => {
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
		// Extract peer info including status
		const peersToSave = Object.keys(this.peerStatus).map(peerId => {
		  const connection = this.connections.find(conn => conn.peer === peerId);
		  return {
			peerId: peerId,
			username: connection?.metadata?.username ||
			  this.savedPeers.find(p => p.peerId === peerId)?.username ||
			  'Unknown user',
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
    // Remove from saved peers
    this.savedPeers = this.savedPeers.filter(peer => peer.peerId !== peerId);

    // Remove from status tracking
    delete this.peerStatus[peerId];
    delete this.lastSeen[peerId];
    delete this.peerConnectionQuality[peerId];

    // Save updated peers list
    this.savePeers();

    this.updateStatus(`Removed peer ${peerId} from saved peers`);
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
        publicKey: data.publicKey || null
      };
      this.savePeers();
    }

    // Only send a handshake back if we haven't completed the handshake already
    if (!this.handshakeCompleted.has(conn.peer)) {
      conn.send({
        type: 'handshake',
        username: this.userManager.username,
        publicKey: this.userManager.publicKey
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
