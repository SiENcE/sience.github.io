// Manages user information and authentication

export class UserManager {
  constructor(storageManager) {
    this.storageManager = storageManager;

    // User state
    this.username = '';
    this.peerId = '';

    // Bind methods
    this.checkSavedCredentials = this.checkSavedCredentials.bind(this);
    this.saveCredentials = this.saveCredentials.bind(this);
    this.loginWithCredentials = this.loginWithCredentials.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
    this.reset = this.reset.bind(this);
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
