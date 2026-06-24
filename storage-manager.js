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
    REACTIONS: 'p2p_reactions'      // tweetId -> { reactorKey -> { name, active, ts, sig } }
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
    
    // Cookie operations (kept for transition compatibility)
    this.setCookie = this.setCookie.bind(this);
    this.getCookie = this.getCookie.bind(this);
    this.deleteCookie = this.deleteCookie.bind(this);

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

  // Cookie operations (for legacy support and transition)
  setCookie(name, value, days = 30) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
    
    // Also save to IndexedDB for syncing
    this.saveToStorage(name, value);
  }

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

  deleteCookie(name) {
    this.setCookie(name, '', -1);
    this.removeFromStorage(name);
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
            const parsedData = JSON.parse(localData);
            await this.saveToStorage(storageKey, parsedData);
            console.log(`Migrated ${storageKey} from localStorage to IndexedDB`);
          }
        } catch (e) {
          console.error(`Error migrating ${storageKey} from localStorage:`, e);
        }
      }
      
      // Check cookies for credentials
      const username = this.getCookie(StorageManager.KEYS.USERNAME);
      const peerId = this.getCookie(StorageManager.KEYS.PEER_ID);
      
      if (username) {
        await this.saveToStorage(StorageManager.KEYS.USERNAME, username);
      }
      
      if (peerId) {
        await this.saveToStorage(StorageManager.KEYS.PEER_ID, peerId);
      }
      
      console.log('Migration from legacy storage completed');
    } catch (error) {
      console.error('Error during migration from legacy storage:', error);
    }
  }

  // User credentials with IndexedDB
  async saveUserCredentials(username, peerId) {
    // Still set cookies for backward compatibility
    this.setCookie(StorageManager.KEYS.USERNAME, username);
    this.setCookie(StorageManager.KEYS.PEER_ID, peerId);
    
    // Save to IndexedDB
    await this.saveToStorage(StorageManager.KEYS.USERNAME, username);
    await this.saveToStorage(StorageManager.KEYS.PEER_ID, peerId);
  }

  async loadUserCredentials() {
    try {
      // First try to load from IndexedDB
      const username = await this.loadFromStorage(StorageManager.KEYS.USERNAME);
      const peerId = await this.loadFromStorage(StorageManager.KEYS.PEER_ID);
      
      // If not found in IndexedDB, try cookies as fallback
      return {
        username: username || this.getCookie(StorageManager.KEYS.USERNAME),
        peerId: peerId || this.getCookie(StorageManager.KEYS.PEER_ID)
      };
    } catch (error) {
      console.error('Error loading user credentials:', error);
      
      // Fallback to cookies
      return {
        username: this.getCookie(StorageManager.KEYS.USERNAME),
        peerId: this.getCookie(StorageManager.KEYS.PEER_ID)
      };
    }
  }

  async deleteUserCredentials() {
    this.deleteCookie(StorageManager.KEYS.USERNAME);
    this.deleteCookie(StorageManager.KEYS.PEER_ID);

    await this.removeFromStorage(StorageManager.KEYS.USERNAME);
    await this.removeFromStorage(StorageManager.KEYS.PEER_ID);
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

  // Clear all data (for account deletion)
  async clearAllData() {
    await this.deleteUserCredentials();
    await this.removeFromStorage(StorageManager.KEYS.TWEETS);
    await this.removeFromStorage(StorageManager.KEYS.PEERS);
    await this.removeFromStorage(StorageManager.KEYS.TWEET_RECIPIENTS);
    await this.removeFromStorage(StorageManager.KEYS.UNSENT_TWEETS);
    await this.removeFromStorage(StorageManager.KEYS.CIRCLES);
    await this.removeFromStorage(StorageManager.KEYS.IDENTITY);
    await this.removeFromStorage(StorageManager.KEYS.NAME_REGISTRY);
    await this.removeFromStorage(StorageManager.KEYS.REACTIONS);

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
