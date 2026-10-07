// Handles all storage operations using IndexedDB

export class StorageManager {
  // Storage keys (kept the same for compatibility)
  static KEYS = {
    USERNAME: 'p2p_username',
    PEER_ID: 'p2p_peerid',
    TWEETS: 'p2p_spellcasts',
    PEERS: 'p2p_saved_peers',
    TWEET_RECIPIENTS: 'p2p_tweet_recipients',
    UNSENT_TWEETS: 'p2p_unsent_tweets',
    CIRCLES: 'p2p_circles',
    IDENTITY: 'p2p_identity',       // signing keypair { privateKey: CryptoKey, publicKeyB64 }
    NAME_REGISTRY: 'p2p_name_pins', // TOFU pins: username -> first verified public key
    REACTIONS: 'p2p_reactions',     // tweetId -> { reactorKey -> { name, active, ts, sig } }
    REMOVED_PEERS: 'p2p_removed_peers', // peerIds the user explicitly removed (persistent blocklist)
    PEER_KEY_PINS: 'p2p_peer_key_pins', // TOFU pins: peerId -> first signing key seen at that address
    BACKUP_INFO: 'p2p_backup_info'      // { at: ms } when the identity was last backed up (export / QR)
  };

  // Database configuration
  static DB_NAME = 'spellcast_db';
  // Version 2 adds the media store (see MediaManager). The whole app shares a
  // single database connection/version to avoid concurrent open-at-two-versions
  // conflicts.
  static DB_VERSION = 2;
  static STORE_NAME = 'spellcast_store';
  static MEDIA_STORE_NAME = 'media_store';

  constructor() {
    // Initialize database
    this.dbPromise = this.initDatabase();
    
    // Cookie operations (legacy migration only — nothing is written to cookies)
    this.getCookie = this.getCookie.bind(this);
    this.expireCookie = this.expireCookie.bind(this);

    // IndexedDB operations
    this.saveToStorage = this.saveToStorage.bind(this);
    this.loadFromStorage = this.loadFromStorage.bind(this);
    this.removeFromStorage = this.removeFromStorage.bind(this);
  }

  /**
   * Initialize the IndexedDB database
   * @returns {Promise} Promise that resolves to the database
   */
  async initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(StorageManager.DB_NAME, StorageManager.DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        console.log('IndexedDB opened successfully');
        const db = event.target.result;

        // If another connection (e.g. a future version upgrade) needs to take
        // over, close this one so it doesn't block the upgrade indefinitely.
        db.onversionchange = () => {
          console.warn('IndexedDB version change requested; closing connection.');
          db.close();
        };

        resolve(db);
      };

      request.onblocked = () => {
        console.warn('IndexedDB open is blocked by another open connection.');
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create the main object store if it doesn't exist
        if (!db.objectStoreNames.contains(StorageManager.STORE_NAME)) {
          db.createObjectStore(StorageManager.STORE_NAME);
          console.log('Created object store:', StorageManager.STORE_NAME);
        }

        // Create the media store here as well so the whole database is managed
        // through a single version (MediaManager reuses this same connection).
        if (!db.objectStoreNames.contains(StorageManager.MEDIA_STORE_NAME)) {
          db.createObjectStore(StorageManager.MEDIA_STORE_NAME);
          console.log('Created object store:', StorageManager.MEDIA_STORE_NAME);
        }
      };
    });
  }

  /**
   * Get a transaction and store for a specific mode
   * @param {string} mode - 'readonly' or 'readwrite'
   * @returns {Promise<Object>} - Contains transaction and store
   */
  async getStore(mode) {
    const db = await this.dbPromise;
    const transaction = db.transaction(StorageManager.STORE_NAME, mode);
    const store = transaction.objectStore(StorageManager.STORE_NAME);
    
    return { transaction, store };
  }

  // Cookie operations (legacy only). Older builds kept the username + peer id in
  // cookies; cookies are sent to the web server with every request, which leaks
  // the peer id (a login credential) to whoever hosts the page. They are now
  // only read once for migration and then expired.
  getCookie(name) {
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookies = decodedCookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i].trim();
      if (cookie.indexOf(name + "=") === 0) {
        return cookie.substring(name.length + 1);
      }
    }
    return "";
  }

  /** Expire a cookie (touches nothing else). */
  expireCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  /**
   * Save data to IndexedDB
   * @param {string} key - The key to store the data under
   * @param {any} data - The data to store
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  async saveToStorage(key, data) {
    try {
      const { store, transaction } = await this.getStore('readwrite');
      
      return new Promise((resolve, reject) => {
        const request = store.put(data, key);
        
        request.onsuccess = () => {
          console.log(`Successfully saved to IndexedDB (${key})`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error(`Error saving to IndexedDB (${key}):`, event.target.error);
          reject(event.target.error);
        };
        
        transaction.oncomplete = () => {
          resolve(true);
        };
        
        transaction.onerror = (event) => {
          console.error(`Transaction error while saving (${key}):`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error accessing IndexedDB to save (${key}):`, error);
      return false;
    }
  }

  /**
   * Load data from IndexedDB
   * @param {string} key - The key to load data from
   * @returns {Promise<any>} - The loaded data
   */
  async loadFromStorage(key) {
    try {
      const { store } = await this.getStore('readonly');
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = (event) => {
          console.error(`Error loading from IndexedDB (${key}):`, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error accessing IndexedDB to load (${key}):`, error);
      return null;
    }
  }

  /**
   * Remove data from IndexedDB
   * @param {string} key - The key to remove
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  async removeFromStorage(key) {
    try {
      const { store, transaction } = await this.getStore('readwrite');
      
      return new Promise((resolve, reject) => {
        const request = store.delete(key);
        
        request.onsuccess = () => {
          console.log(`Successfully removed from IndexedDB (${key})`);
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error(`Error removing from IndexedDB (${key}):`, event.target.error);
          reject(event.target.error);
        };
        
        transaction.oncomplete = () => {
          resolve(true);
        };
      });
    } catch (error) {
      console.error(`Error accessing IndexedDB to remove (${key}):`, error);
      return false;
    }
  }

  /**
   * Migrate data from cookies and localStorage to IndexedDB (for transition)
   */
  async migrateFromLegacyStorage() {
    try {
      // Check for localStorage data to migrate
      for (const key in StorageManager.KEYS) {
        const storageKey = StorageManager.KEYS[key];
        
        // Check localStorage
        try {
          const localData = localStorage.getItem(storageKey);
          if (localData) {
            // Never overwrite newer IndexedDB data with the stale legacy copy, and
            // drop the legacy copy once handled so it is not re-imported on every
            // start (which would also resurrect data after "Delete Credentials").
            const existing = await this.loadFromStorage(storageKey);
            if (existing === undefined || existing === null) {
              await this.saveToStorage(storageKey, JSON.parse(localData));
              console.log(`Migrated ${storageKey} from localStorage to IndexedDB`);
            }
            localStorage.removeItem(storageKey);
          }
        } catch (e) {
          console.error(`Error migrating ${storageKey} from localStorage:`, e);
        }
      }
      
      // Move legacy cookie credentials into IndexedDB (without overwriting newer
      // values there), then expire the cookies so they stop being sent.
      for (const key of [StorageManager.KEYS.USERNAME, StorageManager.KEYS.PEER_ID]) {
        const value = this.getCookie(key);
        if (!value) continue;
        const existing = await this.loadFromStorage(key);
        if (!existing) {
          await this.saveToStorage(key, value);
        }
        this.expireCookie(key);
      }
      
      console.log('Migration from legacy storage completed');
    } catch (error) {
      console.error('Error during migration from legacy storage:', error);
    }
  }

  // User credentials with IndexedDB
  async saveUserCredentials(username, peerId) {
    await this.saveToStorage(StorageManager.KEYS.USERNAME, username);
    await this.saveToStorage(StorageManager.KEYS.PEER_ID, peerId);
  }

  async loadUserCredentials() {
    // (Legacy cookie credentials were already moved here by migrateFromLegacyStorage.)
    try {
      return {
        username: (await this.loadFromStorage(StorageManager.KEYS.USERNAME)) || '',
        peerId: (await this.loadFromStorage(StorageManager.KEYS.PEER_ID)) || ''
      };
    } catch (error) {
      console.error('Error loading user credentials:', error);
      return { username: '', peerId: '' };
    }
  }

  async deleteUserCredentials() {
    this.expireCookie(StorageManager.KEYS.USERNAME);
    this.expireCookie(StorageManager.KEYS.PEER_ID);

    await this.removeFromStorage(StorageManager.KEYS.USERNAME);
    await this.removeFromStorage(StorageManager.KEYS.PEER_ID);
  }

  /**
   * Ask the browser not to evict our data under storage pressure. Everything —
   * including the identity keys, which have no other copy unless the user made
   * a backup — lives in this origin's storage, which browsers may otherwise
   * clear when the disk is full.
   * @returns {Promise<boolean|null>} true if persistent, false if refused, null if unsupported
   */
  async requestPersistence() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (error) {
      console.warn('Persistent storage request failed:', error);
      return null;
    }
  }

  /** Record that the identity was just backed up (export or backup QR). */
  async markBackupDone() {
    await this.saveToStorage(StorageManager.KEYS.BACKUP_INFO, { at: Date.now() });
  }

  /** @returns {Promise<{at: number}|null>} when the identity was last backed up */
  async loadBackupInfo() {
    return (await this.loadFromStorage(StorageManager.KEYS.BACKUP_INFO)) || null;
  }

  // ---- Signing identity (keypair) ----
  // The value contains a non-extractable CryptoKey, which IndexedDB persists via
  // structured clone — the private key material never becomes script-readable.
  async saveIdentity(identityRecord) {
    await this.saveToStorage(StorageManager.KEYS.IDENTITY, identityRecord);
  }

  async loadIdentity() {
    return this.loadFromStorage(StorageManager.KEYS.IDENTITY);
  }

  // ---- TOFU name registry (username -> first verified public key) ----
  async saveNameRegistry(map) {
    await this.saveToStorage(StorageManager.KEYS.NAME_REGISTRY, map);
  }

  async loadNameRegistry() {
    return (await this.loadFromStorage(StorageManager.KEYS.NAME_REGISTRY)) || {};
  }

  // ---- Reactions (tweetId -> reactorKey -> record) ----
  async saveReactions(map) {
    await this.saveToStorage(StorageManager.KEYS.REACTIONS, map);
  }

  async loadReactions() {
    return (await this.loadFromStorage(StorageManager.KEYS.REACTIONS)) || {};
  }

  /**
   * Clear all data (for credentials deletion): cookies, every key in the main
   * store, the whole media store, and any legacy localStorage copies (which the
   * startup migration would otherwise re-import).
   */
  async clearAllData() {
    await this.deleteUserCredentials();

    const db = await this.dbPromise;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([StorageManager.STORE_NAME, StorageManager.MEDIA_STORE_NAME], 'readwrite');
      transaction.objectStore(StorageManager.STORE_NAME).clear();
      transaction.objectStore(StorageManager.MEDIA_STORE_NAME).clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = (event) => reject(event.target.error);
      transaction.onabort = (event) => reject(event.target.error);
    });

    for (const key of Object.values(StorageManager.KEYS)) {
      try { localStorage.removeItem(key); } catch (_) { /* storage unavailable */ }
    }

    console.log('All IndexedDB data cleared');
  }
  
  /**
   * Get all stored keys
   * @returns {Promise<Array>} - Array of all keys in the store
   */
  async getAllKeys() {
    try {
      const { store } = await this.getStore('readonly');
      
      return new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = (event) => {
          console.error('Error getting all keys:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('Error accessing IndexedDB to get all keys:', error);
      return [];
    }
  }
  
  /**
   * Clear the entire database
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  async clearDatabase() {
    try {
      const { store, transaction } = await this.getStore('readwrite');
      
      return new Promise((resolve, reject) => {
        const request = store.clear();
        
        request.onsuccess = () => {
          console.log('Successfully cleared IndexedDB');
          resolve(true);
        };
        
        request.onerror = (event) => {
          console.error('Error clearing IndexedDB:', event.target.error);
          reject(event.target.error);
        };
        
        transaction.oncomplete = () => {
          resolve(true);
        };
      });
    } catch (error) {
      console.error('Error accessing IndexedDB to clear database:', error);
      return false;
    }
  }
}
