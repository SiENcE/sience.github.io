// Manages user information and authentication

import { CryptoIdentity } from './crypto-identity.js';

export class UserManager {
  constructor(storageManager) {
    this.storageManager = storageManager;

    // User state
    this.username = '';
    this.peerId = '';

    // Cryptographic signing identity (the real, unforgeable identity).
    this.identity = new CryptoIdentity(null, null);

    // Bind methods
    this.checkSavedCredentials = this.checkSavedCredentials.bind(this);
    this.saveCredentials = this.saveCredentials.bind(this);
    this.loginWithCredentials = this.loginWithCredentials.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
    this.reset = this.reset.bind(this);
    this.ensureIdentity = this.ensureIdentity.bind(this);
  }

  /** Persist the current identity (both keypairs) to storage. */
  async persistIdentity() {
    if (!this.identity || !this.identity.available) return;
    await this.storageManager.saveIdentity({
      privateKey: this.identity.privateKey,
      publicKeyB64: this.identity.publicKeyB64,
      encPrivateKey: this.identity.encPrivateKey || null,
      encPublicKeyB64: this.identity.encPublicKeyB64 || null
    });
  }

  /** The user's signing public key (base64), or null if WebCrypto is unavailable. */
  get publicKey() {
    return this.identity ? this.identity.publicKeyB64 : null;
  }

  /** The user's encryption (ECDH) public key (base64), for sealed circle posts. */
  get encPublicKey() {
    return this.identity ? this.identity.encPublicKeyB64 : null;
  }

  /**
   * Load the signing keypair from storage, or generate + persist a fresh one.
   * Existing (pre-P0) accounts have no key, so this transparently mints one the
   * first time they run an upgraded build. Idempotent.
   * @returns {Promise<CryptoIdentity>}
   */
  async ensureIdentity() {
    if (this.identity && this.identity.available) return this.identity;

    const stored = await this.storageManager.loadIdentity();
    if (stored && stored.privateKey && stored.publicKeyB64) {
      this.identity = new CryptoIdentity(
        stored.privateKey, stored.publicKeyB64,
        stored.encPrivateKey || null, stored.encPublicKeyB64 || null
      );
      // Legacy identities (pre-P3) have no encryption key — mint one so the user
      // can receive sealed circle posts, and persist it alongside the rest.
      if (!this.identity.canDecrypt) {
        const fresh = await CryptoIdentity.generate();
        if (fresh.canDecrypt) {
          this.identity.encPrivateKey = fresh.encPrivateKey;
          this.identity.encPublicKeyB64 = fresh.encPublicKeyB64;
          await this.persistIdentity();
        }
      }
      return this.identity;
    }

    const fresh = await CryptoIdentity.generate();
    this.identity = fresh;
    if (fresh.available) {
      await this.persistIdentity();
    } else {
      console.warn('WebCrypto unavailable — messages will be sent unsigned (use HTTPS or localhost).');
    }
    return this.identity;
  }

	// In checkSavedCredentials()
	async checkSavedCredentials() {
	  const credentials = await this.storageManager.loadUserCredentials();
	  
	  if (credentials.username && credentials.peerId) {
		this.username = credentials.username;
		this.peerId = credentials.peerId;
		return true;
	  }
	  
	  return false;
	}

	// In saveCredentials()
	async saveCredentials(username, peerId) {
	  this.username = username;
	  this.peerId = peerId;
	  await this.storageManager.saveUserCredentials(username, peerId);
	}

	// In loginWithCredentials()
	async loginWithCredentials(username, peerId) {
	  if (!username || !peerId) {
		throw new Error('Username and peer ID are required');
	  }
	  
	  this.username = username;
	  this.peerId = peerId;
	  await this.storageManager.saveUserCredentials(username, peerId);
	}

	// In deleteAccount()
	async deleteAccount(onComplete) {
	  this.reset();
	  await this.storageManager.clearAllData();
	  
	  if (typeof onComplete === 'function') {
		onComplete();
	  }
	}

  /**
   * Reset user state
   */
  reset() {
    this.username = '';
    this.peerId = '';
    this.identity = new CryptoIdentity(null, null);
  }

  /**
   * Check if user is logged in
   * @returns {boolean} Whether user is logged in
   */
  isLoggedIn() {
    return !!(this.username && this.peerId);
  }

  /**
   * Get user information
   * @returns {Object} User information
   */
  getUserInfo() {
    return {
      username: this.username,
      peerId: this.peerId
    };
  }
}
