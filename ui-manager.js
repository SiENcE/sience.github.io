// Manages UI components, event listeners and display logic

import { linkify, extractUrls, buildLinkPreview } from './link-preview.js';
import { fingerprint, handleFor, CryptoIdentity } from './crypto-identity.js';

export class UIManager {
  constructor(userManager, peerManager, tweetManager, storageManager, mediaManager, circleManager) {
    this.userManager = userManager;
    this.peerManager = peerManager;
    this.tweetManager = tweetManager;
    this.storageManager = storageManager;
	this.mediaManager = mediaManager;
	this.circleManager = circleManager;

    // Currently selected circle for the feed view ('all' = everything)
    this.activeCircleId = 'all';

    // A `?connect=<peerId>` deep link — set when this page was opened by scanning
    // another user's QR code. We stash it now and act on it once the app UI is
    // shown (after login), then strip it from the URL so a refresh doesn't repeat.
    this.pendingConnectId = new URLSearchParams(location.search).get('connect');
    if (this.pendingConnectId) {
      history.replaceState(null, '', location.origin + location.pathname);
    }

    // ---- Feed pagination / windowing state ----
    // The full message history lives in memory (loaded from IndexedDB, capped at
    // 1000). We never render all of it at once: we keep a bounded window of DOM
    // nodes so the feed cannot grow without limit as the user scrolls. This is
    // the same idea Twitter/X uses — a virtualized timeline where off-screen
    // rows above are removed (and replaced by a "show newer" affordance) while
    // older rows are appended below, so the live DOM size stays roughly constant
    // no matter how far you scroll.
    this.FEED_INITIAL = 20;   // rows shown on first paint (>= the requested 10)
    this.FEED_STEP = 20;      // rows revealed per "Load more" / auto-load
    this.FEED_MAX_DOM = 120;  // hard cap on rows kept in the DOM at once
    this.feedRevealed = this.FEED_INITIAL; // how many newest rows are revealed
    this.feedObserver = null; // IntersectionObserver driving auto "load more"

    // DOM elements
    this.elements = {
      // Elements for media handling
      mediaUploadButton: null,
      mediaInput: null,
      mediaPreviewContainer: null,
      tweetMediaContainer: null,

      // Containers
      introContainer: document.getElementById('intro-container'),
      setupContainer: document.getElementById('setup-container'),
      loginContainer: document.getElementById('login-container'),
      appContainer: document.getElementById('app-container'),
      feedContainer: document.getElementById('feed-container'),
      peersContainer: document.getElementById('peers-container'),
      profileContainer: document.getElementById('profile-container'),

      // Content areas
      credentialsArea: document.getElementById('credentials'),
      tweetsContainer: document.getElementById('tweets-container'),
      peersList: document.getElementById('peers-list'),

      // Navigation
      feedTab: document.getElementById('feed-tab'),
      peersTab: document.getElementById('peers-tab'),
      circlesTab: document.getElementById('circles-tab'),
      profileTab: document.getElementById('profile-tab'),

      // Circles
      circlesContainer: document.getElementById('circles-container'),
      circlesSidebarList: document.getElementById('circles-sidebar-list'),
      circlesManageList: document.getElementById('circles-manage-list'),
      newCircleName: document.getElementById('new-circle-name'),
      createCircleButton: document.getElementById('create-circle-button'),
      castTarget: document.getElementById('cast-target'),
      feedHeading: document.getElementById('feed-heading'),

      // Buttons
      createButton: document.getElementById('create-button'),
      loginButton: document.getElementById('login-button'),
      generateButton: document.getElementById('generate-button'),
      continueButton: document.getElementById('continue-button'),
      loginContinueButton: document.getElementById('login-continue-button'),
      tweetButton: document.getElementById('tweet-button'),
      connectButton: document.getElementById('connect-button'),
      deleteCredentialsButton: document.getElementById('delete-credentials-button'),
      deleteAllMessagesButton: document.getElementById('delete-all-messages-button'),
      cleanupStorageButton: document.getElementById('cleanup-storage-button'),
      exportIdentityButton: document.getElementById('export-identity-button'),
      showBackupQrButton: document.getElementById('show-backup-qr-button'),
      importIdentityButton: document.getElementById('import-identity-button'),
      importIdentityFile: document.getElementById('import-identity-file'),
      scanBackupQrButton: document.getElementById('scan-backup-qr-button'),

      // Inputs
      usernameInput: document.getElementById('username'),
      loginUsernameInput: document.getElementById('login-username'),
      loginPeerIdInput: document.getElementById('login-peerid'),
      tweetContentInput: document.getElementById('tweet-content'),
      connectIdInput: document.getElementById('connect-id'),
      scanQrButton: document.getElementById('scan-qr-button'),
      shareInviteButton: document.getElementById('share-invite-button'),
      copyInviteButton: document.getElementById('copy-invite-button'),

      // Information displays
      peerIdDisplay: document.getElementById('peer-id'),
      statusElement: document.getElementById('status'),
      currentUserElement: document.getElementById('current-user'),
      profileUsername: document.getElementById('profile-username'),
      profilePeerId: document.getElementById('profile-peerid'),

      // Visual elements
      qrcode: document.getElementById('qrcode'),
      profileQrcode: document.getElementById('profile-qrcode'),
      connectionQualityIndicator: document.getElementById('connection-quality')
    };

    // Media state tracking
    this.pendingMediaFile = null;

    // Bind methods to maintain 'this' context
    this.setupEventListeners = this.setupEventListeners.bind(this);
    this.renderTweets = this.renderTweets.bind(this);
    this.updatePeersList = this.updatePeersList.bind(this);
    this.updateConnectionStatus = this.updateConnectionStatus.bind(this);
    this.showIntroScreen = this.showIntroScreen.bind(this);
    this.connectToPeer = this.connectToPeer.bind(this);
    this.handleStatusUpdate = this.handleStatusUpdate.bind(this);
    this.handleConnectionQualityUpdate = this.handleConnectionQualityUpdate.bind(this);
    this.formatTimestamp = this.formatTimestamp.bind(this);

    // Bind media-related methods
    this.handleMediaUpload = this.handleMediaUpload.bind(this);
    this.clearMediaPreview = this.clearMediaPreview.bind(this);
    this.createTweetWithMedia = this.createTweetWithMedia.bind(this);
    this.displayMediaPreview = this.displayMediaPreview.bind(this);
    this.renderMediaInTweet = this.renderMediaInTweet.bind(this);

    // Bind circle-related methods
    this.renderCirclesSidebar = this.renderCirclesSidebar.bind(this);
    this.renderCirclesManage = this.renderCirclesManage.bind(this);
    this.updateCastTarget = this.updateCastTarget.bind(this);
    this.onCirclesChanged = this.onCirclesChanged.bind(this);
    this.selectCircle = this.selectCircle.bind(this);
  }

  /**
   * Set up all event listeners for the UI
   */
  setupEventListeners() {
    // Navigation event listeners
    this.elements.createButton.addEventListener('click', () => {
      this.elements.introContainer.style.display = 'none';
      this.elements.setupContainer.style.display = 'block';
    });

    this.elements.loginButton.addEventListener('click', () => {
      this.elements.introContainer.style.display = 'none';
      this.elements.loginContainer.style.display = 'block';
    });

    this.elements.deleteAllMessagesButton.addEventListener('click', this.deleteAllMessages.bind(this));

    if (this.elements.cleanupStorageButton) {
      this.elements.cleanupStorageButton.addEventListener('click', this.cleanupStorage.bind(this));
    }

    this.elements.generateButton.addEventListener('click', async () => {
      const username = this.elements.usernameInput.value.trim();
      if (!username) {
        alert('Please enter a username');
        return;
      }

      // Save username in user manager
      this.userManager.username = username;

      try {
        // Initialize peer connection
        const peerId = await this.peerManager.initializePeer();

        // Mint the signing keypair for these brand-new credentials.
        await this.userManager.ensureIdentity();
        await this.tweetManager.pinOwnIdentity();

        // Display the peer ID and QR code
        this.elements.peerIdDisplay.textContent = peerId;
        this.elements.credentialsArea.style.display = 'block';

        // Generate QR code (encodes a connect deep link, not the raw id, so a
        // phone camera opens SpellCast instead of running a web search)
        new QRCode(this.elements.qrcode, {
          text: this.buildConnectUrl(peerId),
          width: 200,
          height: 200
        });
      } catch (error) {
        console.error('Error initializing peer:', error);
        alert(`Error creating peer connection: ${error.message}`);
      }
    });

    this.elements.continueButton.addEventListener('click', () => {
      this.elements.setupContainer.style.display = 'none';
      this.elements.appContainer.style.display = 'block';
      this.elements.currentUserElement.textContent = this.userManager.username;

      // Render the feed (and any already-stored history) for the new session
      this.renderTweets();
      this.updatePeersList();
      this.consumePendingConnect();
    });

    this.elements.loginContinueButton.addEventListener('click', async () => {
      const username = this.elements.loginUsernameInput.value.trim();
      const peerId = this.elements.loginPeerIdInput.value.trim();

      if (!username || !peerId) {
        alert('Please enter both username and peer ID');
        return;
      }

      try {
        // Save credentials and login
        this.userManager.loginWithCredentials(username, peerId);
        await this.userManager.ensureIdentity();
        await this.tweetManager.pinOwnIdentity();
        await this.peerManager.loginToPeer();

        // Hide login screens, show app
        this.elements.loginContainer.style.display = 'none';
        this.elements.appContainer.style.display = 'block';
        this.elements.currentUserElement.textContent = username;

        // Make sure the stored message history is loaded and rendered
        await this.tweetManager.loadTweets();
        this.renderTweets();
        this.updatePeersList();
        this.updateProfileInfo();
        this.consumePendingConnect();
      } catch (error) {
        console.error('Login error:', error);
        alert(`Error logging in: ${error.message}`);
      }
    });

    // Tab navigation
    this.elements.feedTab.addEventListener('click', () => {
      this.activateTab('feed');
    });

    this.elements.peersTab.addEventListener('click', () => {
      this.activateTab('peers');
    });

    this.elements.circlesTab.addEventListener('click', () => {
      this.activateTab('circles');
      this.renderCirclesManage();
    });

    this.elements.profileTab.addEventListener('click', () => {
      this.activateTab('profile');
      this.updateProfileInfo();
    });

    // Circle creation (from the management tab and the sidebar)
    if (this.elements.createCircleButton) {
      this.elements.createCircleButton.addEventListener('click', () => {
        this.handleCreateCircle(this.elements.newCircleName);
      });
    }

    // Re-render circle UI whenever circles change
    if (this.circleManager) {
      this.circleManager.onCirclesUpdated = this.onCirclesChanged;
    }

    this.elements.connectButton.addEventListener('click', this.connectToPeer);

    if (this.elements.scanQrButton) {
      this.elements.scanQrButton.addEventListener('click', () => this.openQrScanner());
    }
    if (this.elements.shareInviteButton) {
      this.elements.shareInviteButton.addEventListener('click', () => this.shareInvite());
    }
    if (this.elements.copyInviteButton) {
      this.elements.copyInviteButton.addEventListener('click', () => this.copyInvite());
    }

    this.elements.deleteCredentialsButton.addEventListener('click', this.deleteCredentials.bind(this));

    // Credential backup: export from the profile, import from the login screen.
    if (this.elements.exportIdentityButton) {
      this.elements.exportIdentityButton.addEventListener('click', this.exportIdentity.bind(this));
    }
    if (this.elements.importIdentityButton) {
      this.elements.importIdentityButton.addEventListener('click', this.importIdentity.bind(this));
    }
    // QR transfer of the encrypted backup: show on the profile, scan on login.
    if (this.elements.showBackupQrButton) {
      this.elements.showBackupQrButton.addEventListener('click', this.showBackupQr.bind(this));
    }
    if (this.elements.scanBackupQrButton) {
      this.elements.scanBackupQrButton.addEventListener('click', this.scanBackupQr.bind(this));
    }

    // Status and connection quality update listeners
    window.addEventListener('status-update', this.handleStatusUpdate);
    window.addEventListener('connection-quality-update', this.handleConnectionQualityUpdate);

    // Browser refresh/close events
    window.addEventListener('beforeunload', () => {
      // Ensure we're saving state appropriately
      this.tweetManager.saveTweets();
      this.peerManager.savePeers();
    });

    // Register for tweet updates from the tweet manager
    this.tweetManager.onTweetsUpdated = this.renderTweets;
    this.peerManager.onPeersUpdated = this.updatePeersList;

    // Add media upload UI elements to the tweet form
    this.setupMediaUploadUI();

    // Add the tweet button event listener here with the media-enabled function
    this.elements.tweetButton.addEventListener('click', this.createTweetWithMedia);

    // Add this call at the end of the existing setupEventListeners method
    this.setupCharacterCounter();

    // Initialize circle UI (sidebar + cast-target indicator)
    this.renderCirclesSidebar();
    this.updateCastTarget();
  }

	setupMediaUploadUI() {
	  // Get the tweet form element
	  const tweetForm = document.getElementById('tweet-form');
	  if (!tweetForm) return;
	  
	  // Create the upload button
	  const uploadButton = document.createElement('button');
	  uploadButton.type = 'button';
	  uploadButton.className = 'media-upload-button';
	  uploadButton.innerHTML = '<span class="icon">📷</span>';
	  uploadButton.title = 'Add image or GIF (large photos are optimized automatically)';
	  uploadButton.style.backgroundColor = 'var(--accent)';
	  uploadButton.style.color = 'var(--on-accent)';
	  uploadButton.style.border = 'none';
	  uploadButton.style.borderRadius = 'var(--radius-btn)'; // follow the active theme's button shape
	  uploadButton.style.width = '36px';
	  uploadButton.style.height = '36px';
	  uploadButton.style.marginRight = '10px';
	  uploadButton.style.cursor = 'pointer';
	  uploadButton.style.display = 'flex';
	  uploadButton.style.alignItems = 'center';
	  uploadButton.style.justifyContent = 'center';
	  
	  // Create hidden file input
	  const mediaInput = document.createElement('input');
	  mediaInput.type = 'file';
	  mediaInput.id = 'media-input';
	  mediaInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
	  mediaInput.style.display = 'none';
	  
	  // Create preview container
	  const previewContainer = document.createElement('div');
	  previewContainer.className = 'media-preview-container';
	  previewContainer.style.display = 'none';
	  previewContainer.style.position = 'relative';
	  previewContainer.style.width = '100px';
	  previewContainer.style.height = '100px';
	  previewContainer.style.marginRight = '10px';
	  previewContainer.style.borderRadius = '8px';
	  previewContainer.style.overflow = 'hidden';
	  
	  // Create clear button for preview
	  const clearButton = document.createElement('button');
	  clearButton.className = 'clear-media-button';
	  clearButton.innerHTML = '&times;';
	  clearButton.style.position = 'absolute';
	  clearButton.style.top = '2px';
	  clearButton.style.right = '2px';
	  clearButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
	  clearButton.style.color = 'white';
	  clearButton.style.border = 'none';
	  clearButton.style.borderRadius = '50%';
	  clearButton.style.width = '24px';
	  clearButton.style.height = '24px';
	  clearButton.style.cursor = 'pointer';
	  clearButton.style.display = 'flex';
	  clearButton.style.alignItems = 'center';
	  clearButton.style.justifyContent = 'center';
	  
	  // Create preview image
	  const previewImage = document.createElement('img');
	  previewImage.className = 'media-preview-image';
	  previewImage.style.width = '100%';
	  previewImage.style.height = '100%';
	  previewImage.style.objectFit = 'cover';
	  
	  // Assemble preview container
	  previewContainer.appendChild(previewImage);
	  previewContainer.appendChild(clearButton);

	  // The image preview sits above the compose box; the hidden file input can
	  // live anywhere in the form.
	  tweetForm.insertBefore(mediaInput, tweetForm.firstChild);
	  tweetForm.insertBefore(previewContainer, tweetForm.firstChild);

	  // Place the upload button in the action row, to the LEFT of the Cast button.
	  uploadButton.style.marginRight = '0';
	  const actionsRow = tweetForm.querySelector('.tweet-form-actions');
	  const castButton = document.getElementById('tweet-button');
	  if (actionsRow && castButton) {
		actionsRow.insertBefore(uploadButton, castButton);
	  } else {
		tweetForm.insertBefore(uploadButton, tweetForm.firstChild);
	  }
	  
	  // Store references to new elements
	  this.elements.mediaUploadButton = uploadButton;
	  this.elements.mediaInput = mediaInput;
	  this.elements.mediaPreviewContainer = previewContainer;
	  this.elements.mediaPreviewImage = previewImage;
	  this.elements.clearMediaButton = clearButton;
	  
	  // Add event listeners
	  uploadButton.addEventListener('click', () => {
		mediaInput.click();
	  });
	  
	  mediaInput.addEventListener('change', this.handleMediaUpload);
	  clearButton.addEventListener('click', this.clearMediaPreview);
	}

  handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPEG, PNG, GIF or WebP images.');
      return;
    }
    
    // Large images are accepted and optimized client-side; only reject the
    // truly huge ones that could exhaust memory while decoding.
    const maxSize = 15 * 1024 * 1024; // 15MB
    if (file.size > maxSize) {
      alert(`Image is too large. Maximum size is ${maxSize / 1024 / 1024}MB. Try a smaller photo.`);
      return;
    }
    
    // Store file for later upload with tweet
    this.pendingMediaFile = file;
    
    // Show preview
    this.displayMediaPreview(file);
  }

  displayMediaPreview(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      this.elements.mediaPreviewImage.src = e.target.result;
      this.elements.mediaPreviewContainer.style.display = 'block';
    };
    
    reader.onerror = () => {
      alert('Error reading file');
      this.clearMediaPreview();
    };
    
    reader.readAsDataURL(file);
  }

  clearMediaPreview() {
    this.pendingMediaFile = null;
    this.elements.mediaPreviewImage.src = '';
    this.elements.mediaPreviewContainer.style.display = 'none';
    this.elements.mediaInput.value = '';
  }


  /**
   * Create a new tweet
   */
  async createTweetWithMedia() {
    const content = this.elements.tweetContentInput.value.trim();
    
    // Check if we have either content or media
    if (!content && !this.pendingMediaFile) {
      alert('Please enter a message or attach an image');
      return;
    }
    
    // Cast into the circle currently selected in the sidebar ('all' = public)
    let circle = null;
    if (this.activeCircleId && this.activeCircleId !== 'all' && this.circleManager) {
      circle = this.circleManager.getCircle(this.activeCircleId);
      if (circle && circle.peerIds.length === 0) {
        if (!confirm(`The circle "${circle.name}" has no peers yet, so no one will receive this message. Post anyway?`)) {
          return;
        }
      }
    }

    try {
      // Create the tweet with optional media, targeting the selected circle
      await this.tweetManager.createTweet(content, this.pendingMediaFile, circle);

      // A little gold burst at the Cast button to make casting feel like, well, a spell.
      const castBtn = document.getElementById('tweet-button');
      if (castBtn) this.spawnSparkles(castBtn, { count: 12 });

      // Jump the feed back to the top so the user sees their own new message.
      this.resetFeedPaging();

      // Clear the inputs
      this.elements.tweetContentInput.value = '';
      this.clearMediaPreview();
    } catch (error) {
      console.error('Error creating tweet with media:', error);
      alert(`Error creating tweet: ${error.message}`);
    }
  }

  /**
   * Activate a specific tab in the UI
   * @param {string} tabName - The tab to activate ('feed', 'peers', or 'profile')
   */
  activateTab(tabName) {
    // Reset all tabs
    this.elements.feedTab.classList.remove('active');
    this.elements.peersTab.classList.remove('active');
    this.elements.circlesTab.classList.remove('active');
    this.elements.profileTab.classList.remove('active');

    this.elements.feedContainer.style.display = 'none';
    this.elements.peersContainer.style.display = 'none';
    this.elements.circlesContainer.style.display = 'none';
    this.elements.profileContainer.style.display = 'none';

    // Activate the requested tab
    switch (tabName) {
      case 'feed':
        this.elements.feedTab.classList.add('active');
        this.elements.feedContainer.style.display = 'block';
        break;
      case 'peers':
        this.elements.peersTab.classList.add('active');
        this.elements.peersContainer.style.display = 'block';
        break;
      case 'circles':
        this.elements.circlesTab.classList.add('active');
        this.elements.circlesContainer.style.display = 'block';
        break;
      case 'profile':
        this.elements.profileTab.classList.add('active');
        this.elements.profileContainer.style.display = 'block';
        break;
    }
  }

  /**
   * Show the intro screen
   */
  showIntroScreen() {
    this.elements.introContainer.style.display = 'block';
    this.elements.setupContainer.style.display = 'none';
    this.elements.loginContainer.style.display = 'none';
    this.elements.appContainer.style.display = 'none';
  }

  /**
   * Update profile information in the UI
   */
  updateProfileInfo() {
    const { username, peerId } = this.userManager.getUserInfo();
    // Show the verifiable handle `name#fingerprint` rather than the bare name.
    this.elements.profileUsername.textContent = handleFor(username, this.userManager.publicKey);
    this.elements.profilePeerId.textContent = peerId;

    // Generate QR code for profile if not already generated
    if (!this.elements.profileQrcode.querySelector("canvas")) {
      // Clear any existing children first to prevent stacking
      this.elements.profileQrcode.innerHTML = '';

      new QRCode(this.elements.profileQrcode, {
        text: this.buildConnectUrl(peerId),
        width: 200,
        height: 200
      });
    }
  }

  /**
   * Setup tweet input character counter
   */
  setupCharacterCounter() {
    if (!this.elements.tweetContentInput) return;

    // Create character counter element if it doesn't exist
    if (!this.charCountElement) {
      this.charCountElement = document.createElement('div');
      this.charCountElement.className = 'char-count';
      this.charCountElement.style.textAlign = 'right';
      this.charCountElement.style.color = 'var(--text-muted)';
      this.charCountElement.style.fontSize = '0.9em';
      this.charCountElement.style.marginTop = '5px';

      // Add it after the tweet content input
      this.elements.tweetContentInput.parentNode.insertBefore(
        this.charCountElement,
        this.elements.tweetContentInput.nextSibling
      );
    }

    // Update counter on input
    this.elements.tweetContentInput.addEventListener('input', () => {
      const content = this.elements.tweetContentInput.value;
      const maxLength = this.tweetManager.MAX_TWEET_LENGTH;
      const remaining = maxLength - content.length;

      this.charCountElement.textContent = `${content.length}/${maxLength}`;

      // Change color when approaching limit
      if (remaining < 0) {
        this.charCountElement.style.color = 'var(--danger)'; // Over limit
      } else if (remaining < 20) {
        this.charCountElement.style.color = '#ffad1f'; // Approaching limit (amber, theme-neutral)
      } else {
        this.charCountElement.style.color = 'var(--text-muted)'; // Default
      }
    });

    // Initial counter update
    this.elements.tweetContentInput.dispatchEvent(new Event('input'));
  }

  /**
   * Connect to a peer using whatever is in the connect field — a raw peer ID or
   * a pasted SpellCast invite link (we extract the id from either).
   */
  connectToPeer() {
    const peerId = this.extractPeerId(this.elements.connectIdInput.value);
    if (!peerId) {
      alert('Please enter a peer ID');
      return;
    }
    this.connectToPeerId(peerId);
    this.elements.connectIdInput.value = '';
  }

  /** Connect to a specific peer id (shared by manual connect, scan, and deep link). */
  connectToPeerId(peerId) {
    try {
      this.peerManager.connectToPeer(peerId);
    } catch (error) {
      console.error('Error connecting to peer:', error);
      alert(`Error connecting to peer: ${error.message}`);
    }
  }

  /**
   * Build a deep-link URL that encodes a peer id. Scanning the QR of this URL
   * with a phone camera opens SpellCast (which then auto-connects) instead of
   * feeding a bare id to a search engine. Self-referential: it points back to
   * wherever this app is served from.
   */
  buildConnectUrl(peerId) {
    return `${location.origin}${location.pathname}?connect=${encodeURIComponent(peerId)}`;
  }

  /** Extract a peer id from scanned/pasted text — a connect URL or a raw id. */
  extractPeerId(text) {
    if (!text) return '';
    const trimmed = String(text).trim();
    try {
      const url = new URL(trimmed);
      const c = url.searchParams.get('connect');
      if (c) return c.trim();
    } catch (_) { /* not a URL — treat the whole thing as a raw id */ }
    return trimmed;
  }

  /**
   * Act on a `?connect=<peerId>` deep link captured at startup (from a scanned
   * QR), once the user is logged in and the peer network is up.
   */
  consumePendingConnect() {
    const raw = this.pendingConnectId;
    if (!raw) return;
    this.pendingConnectId = null;

    const peerId = this.extractPeerId(raw);
    if (!peerId || peerId === this.userManager.peerId) return;

    if (confirm(`Connect to peer "${peerId}"?`)) {
      this.activateTab('peers');
      this.connectToPeerId(peerId);
    }
  }

  /** Share an invite link via the OS share sheet (mobile), falling back to copy. */
  shareInvite() {
    const url = this.buildConnectUrl(this.userManager.peerId);
    if (navigator.share) {
      navigator.share({
        title: 'Connect with me on SpellCast',
        text: 'Add me on SpellCast — open this link to connect:',
        url
      }).catch(() => { /* user cancelled / unsupported */ });
    } else {
      this.copyInvite();
    }
  }

  /** Copy the invite link to the clipboard (so it can be shared without typing). */
  copyInvite() {
    const url = this.buildConnectUrl(this.userManager.peerId);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => alert('Invite link copied to clipboard.'))
        .catch(() => window.prompt('Copy this invite link:', url));
    } else {
      window.prompt('Copy this invite link:', url);
    }
  }

  /** Lazily load the locally-vendored jsQR decoder (served from our own origin). */
  loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (this._jsQRPromise) return this._jsQRPromise;
    this._jsQRPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'jsQR.min.js'; // same-origin → allowed by `script-src 'self'`
      s.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('jsQR unavailable'));
      s.onerror = () => reject(new Error('Failed to load QR decoder'));
      document.head.appendChild(s);
    });
    return this._jsQRPromise;
  }

  /**
   * Open an in-app QR scanner: stream the (rear) camera, decode any SpellCast QR,
   * and connect to the peer it encodes. Uses the native BarcodeDetector when the
   * browser has it, otherwise the vendored jsQR decoder.
   */
  async openQrScanner() {
    await this._runQrScanner('Point your camera at a SpellCast QR code…', (value, cleanup) => {
      const peerId = this.extractPeerId(value);
      cleanup();
      if (!peerId) return true; // decoded something, but not a connect QR — stop anyway
      if (peerId === this.userManager.peerId) {
        alert("That's your own QR code.");
      } else if (confirm(`Connect to peer "${peerId}"?`)) {
        this.activateTab('peers');
        this.connectToPeerId(peerId);
      }
      return true;
    });
  }

  /**
   * Generic camera-QR loop shared by the connect scanner and the backup scanner.
   * Streams the rear camera, decodes with the native BarcodeDetector (or the
   * vendored jsQR), and calls `onValue(decodedString, cleanup)` for each decode.
   * `onValue` returns truthy to stop scanning (it must call `cleanup` itself
   * before any async work) or falsy to ignore this code and keep scanning — so a
   * scanner can wait for the *right kind* of QR and skip unrelated ones.
   * @param {string} promptText
   * @param {(value: string, cleanup: () => void) => boolean | Promise<boolean>} onValue
   */
  async _runQrScanner(promptText, onValue) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera scanning is not available in this browser. Use your phone camera to scan the QR, or use the file-based backup instead.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'qr-scanner-overlay';
    const video = document.createElement('video');
    video.className = 'qr-scanner-video';
    video.setAttribute('playsinline', '');
    video.muted = true;
    const status = document.createElement('div');
    status.className = 'qr-scanner-status';
    status.textContent = promptText;
    const cancel = document.createElement('button');
    cancel.className = 'qr-scanner-cancel';
    cancel.textContent = 'Cancel';
    overlay.appendChild(video);
    overlay.appendChild(status);
    overlay.appendChild(cancel);
    document.body.appendChild(overlay);

    let stream = null;
    let stopped = false;
    const cleanup = () => {
      stopped = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
    };
    cancel.addEventListener('click', cleanup);

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      console.error('Camera error:', err);
      status.textContent = 'Could not access the camera — check the permission and that the page is served over HTTPS.';
      setTimeout(cleanup, 3000);
      return;
    }

    // Choose a decoder: native BarcodeDetector, else the vendored jsQR.
    let detect = null;
    if ('BarcodeDetector' in window) {
      try {
        const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
        detect = async () => {
          const codes = await bd.detect(video);
          return codes && codes.length ? codes[0].rawValue : null;
        };
      } catch (_) { detect = null; }
    }
    if (!detect) {
      let jsQR;
      try {
        jsQR = await this.loadJsQR();
      } catch (e) {
        status.textContent = 'Could not load the QR decoder.';
        setTimeout(cleanup, 3000);
        return;
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        if (!video.videoWidth) return null;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQR(img.data, img.width, img.height);
        return res ? res.data : null;
      };
    }

    const tick = async () => {
      if (stopped) return;
      let value = null;
      try { value = await detect(); } catch (_) { /* keep scanning */ }
      if (value) {
        let consumed = false;
        try { consumed = await onValue(value, cleanup); } catch (_) { consumed = false; }
        if (consumed) return; // onValue handled it (and called cleanup)
      }
      setTimeout(tick, 120); // ~8 scans/sec; pauses naturally when the modal closes
    };
    setTimeout(tick, 120);
  }

  /**
   * Login-screen flow: scan a "Backup QR" shown by another device, then restore.
   * Ignores any non-backup QR (e.g. a connect URL) so the user can keep scanning.
   */
  async scanBackupQr() {
    await this._runQrScanner('Point your camera at a SpellCast Backup QR…', async (value, cleanup) => {
      let envelope;
      try { envelope = JSON.parse(value); } catch (_) { return false; }
      if (!envelope || envelope.type !== 'spellcast-identity-backup') return false;
      cleanup();
      await this.restoreFromBackupEnvelope(envelope);
      return true;
    });
  }

  /**
   * Profile flow: passphrase-encrypt the identity and show it as a QR for a
   * device-to-device move. Reuses the same encrypted backup as the file export.
   */
  async showBackupQr() {
    if (!this.userManager.publicKey) {
      alert('No exportable credentials are available. (WebCrypto needs HTTPS or localhost.)');
      return;
    }
    const passphrase = prompt('Choose a passphrase to encrypt this backup QR.\n'
      + 'You will enter this same passphrase on the other device to restore.');
    if (passphrase === null) return;
    if (passphrase.length < 6) {
      alert('Please use a passphrase of at least 6 characters.');
      return;
    }
    const confirmPass = prompt('Re-enter the passphrase to confirm:');
    if (confirmPass === null) return;
    if (confirmPass !== passphrase) {
      alert('Passphrases did not match. Nothing was shown.');
      return;
    }
    try {
      const { username, peerId } = this.userManager.getUserInfo();
      const envelope = await this.userManager.identity.exportEncrypted(passphrase, { username, peerId });
      this.renderBackupQrOverlay(JSON.stringify(envelope));
    } catch (error) {
      console.error('Backup QR creation failed:', error);
      alert(`Could not create a backup QR: ${error.message}`);
    }
  }

  /** Render an encrypted-backup string as a QR code in a dismissable overlay. */
  renderBackupQrOverlay(text) {
    const overlay = document.createElement('div');
    overlay.className = 'qr-scanner-overlay';

    const status = document.createElement('div');
    status.className = 'qr-scanner-status';
    status.textContent = 'On your other device: Login → Scan Backup QR, then enter your passphrase. '
      + 'Anyone with this QR AND the passphrase can post as you, so keep it private.';

    const codeBox = document.createElement('div');
    codeBox.className = 'qr-backup-code';

    const close = document.createElement('button');
    close.className = 'qr-scanner-cancel';
    close.textContent = 'Close';
    close.addEventListener('click', () => overlay.remove());

    overlay.appendChild(status);
    overlay.appendChild(codeBox);
    overlay.appendChild(close);
    document.body.appendChild(overlay);

    // Level M keeps capacity ample for the ~700-byte compact backup while staying
    // dense enough to scan screen-to-screen.
    new QRCode(codeBox, {
      text,
      width: 320,
      height: 320,
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  /**
   * Delete the user's credentials (identity keys + saved data) from this device.
   */
  deleteCredentials() {
    if (confirm('Are you sure you want to delete your credentials? This disconnects you from all peers and erases your saved identity, messages, and data on this device.')) {
      // Close all connections
      const connections = this.peerManager.getAllConnections();
      connections.forEach(conn => {
        this.peerManager.disconnectPeer(conn);
      });

      // Delete credentials and stored data through the user manager
      this.userManager.deleteCredentials(() => {
        // Reset UI
        this.showIntroScreen();
        alert('Your credentials have been deleted successfully.');
      });
    }
  }

  /**
   * Export the user's credentials (identity keypairs) as a passphrase-encrypted
   * backup file.
   */
  async exportIdentity() {
    if (!this.userManager.publicKey) {
      alert('No exportable credentials are available. (WebCrypto needs HTTPS or localhost.)');
      return;
    }

    const passphrase = prompt('Choose a passphrase to encrypt your credential backup.\n'
      + 'You will need this exact passphrase to restore your credentials. There is no way to recover it.');
    if (passphrase === null) return; // cancelled
    if (passphrase.length < 6) {
      alert('Please use a passphrase of at least 6 characters.');
      return;
    }
    const confirmPass = prompt('Re-enter the passphrase to confirm:');
    if (confirmPass === null) return;
    if (confirmPass !== passphrase) {
      alert('Passphrases did not match. Nothing was exported.');
      return;
    }

    try {
      const { username, peerId } = this.userManager.getUserInfo();
      const envelope = await this.userManager.identity.exportEncrypted(passphrase, { username, peerId });

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (username || 'credentials').replace(/[^a-z0-9_-]/gi, '_');
      a.href = url;
      a.download = `spellcast-credentials-${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Credential backup downloaded. Store it somewhere safe — anyone with the file AND the passphrase can post as you.');
    } catch (error) {
      console.error('Credential export failed:', error);
      alert(`Could not export credentials: ${error.message}`);
    }
  }

  /**
   * Restore credentials from a backup file on the login screen, then log in.
   */
  async importIdentity() {
    const fileInput = this.elements.importIdentityFile;
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      alert('Please choose a credential backup file first.');
      return;
    }

    let envelope;
    try {
      envelope = JSON.parse(await file.text());
    } catch (error) {
      alert('That file is not a valid credential backup (could not parse JSON).');
      return;
    }
    await this.restoreFromBackupEnvelope(envelope);
  }

  /**
   * Decrypt a credential-backup envelope (from a file or a scanned Backup QR),
   * adopt the restored credentials, and log straight in. Shared by the file
   * import and the QR scanner so both behave identically.
   * @param {Object} envelope - parsed backup envelope
   */
  async restoreFromBackupEnvelope(envelope) {
    const passphrase = prompt('Enter the passphrase for this credential backup:');
    if (passphrase === null) return;

    try {
      const { identity, username, peerId } = await CryptoIdentity.importEncrypted(envelope, passphrase);
      if (!username || !peerId) {
        throw new Error('Backup is missing the username or peer ID.');
      }

      // Adopt the restored credentials (both keypairs) and persist them.
      this.userManager.identity = identity;
      await this.userManager.persistIdentity();
      await this.userManager.loginWithCredentials(username, peerId);
      await this.tweetManager.pinOwnIdentity();

      // Connect to the peer network and show the app (mirrors the login flow).
      await this.peerManager.loginToPeer();
      this.elements.loginContainer.style.display = 'none';
      this.elements.appContainer.style.display = 'block';
      this.elements.currentUserElement.textContent = username;

      await this.tweetManager.loadTweets();
      this.renderTweets();
      this.updatePeersList();
      this.updateProfileInfo();
      this.consumePendingConnect();

      alert(`Welcome back, ${handleFor(username, identity.publicKeyB64)}. Your credentials were restored.`);
    } catch (error) {
      console.error('Credential import failed:', error);
      alert(`Could not import credentials: ${error.message}`);
    }
  }

  /**
   * Decide whether a tweet should appear in the currently-selected feed view.
   * "All Peers" shows only public posts — narrow-cast (circle) messages are
   * hidden there to avoid confusion and only appear inside their circle. A
   * selected circle shows messages authored by its members (plus your own).
   */
  tweetMatchesActiveCircle(tweet) {
    if (this.activeCircleId === 'all' || !this.circleManager) {
      // Global feed = public posts only; circle (narrow-cast) posts live in their circle.
      return !tweet.circle;
    }

    const myPeerId = this.userManager.peerId;
    if (tweet.authorId && tweet.authorId === myPeerId) return true;

    const memberIds = this.circleManager.getMemberPeerIds(this.activeCircleId);
    return !!(tweet.authorId && memberIds.includes(tweet.authorId));
  }

  /**
   * Reset the feed back to its first page (newest rows only). Call this when the
   * underlying list changes wholesale — switching circles, or after the user
   * posts their own message and should be taken to the top.
   */
  resetFeedPaging() {
    this.feedRevealed = this.FEED_INITIAL;
  }

  /**
   * Render tweets in the UI (filtered by the active circle).
   *
   * Only a bounded window of the newest `feedRevealed` rows is rendered, and at
   * most FEED_MAX_DOM rows live in the DOM at once. "Load more" reveals older
   * rows; once the window exceeds the DOM cap the oldest-on-screen newest rows
   * scroll out the top (replaced by a "show newest" control), keeping the live
   * DOM small however far you scroll.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.preserveScroll] - keep the viewport anchored on the
   *        first visible row across the re-render (used by "Load more").
   */
  renderTweets(opts = {}) {
    const tweetsContainer = this.elements.tweetsContainer;

    // Anchor the scroll position on the first on-screen row so revealing older
    // rows (and dropping rows off the top) doesn't make the feed jump.
    let anchorId = null;
    let anchorTop = 0;
    if (opts.preserveScroll) {
      for (const el of tweetsContainer.querySelectorAll('.tweet[data-id]')) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > 0) { anchorId = el.dataset.id; anchorTop = rect.top; break; }
      }
    }

    tweetsContainer.innerHTML = '';

    this.updateFeedHeading();

    // Get tweets from tweet manager (already newest-first), filtered by circle
    const tweets = this.tweetManager.getAllTweets().filter(t => this.tweetMatchesActiveCircle(t));
    const total = tweets.length;

    // Track which message ids we've already shown, so only genuinely new arrivals
    // play the "materialize" animation — not every re-render, pagination step, or
    // circle switch. Seeded from the full known history on the first render.
    if (!this.seenTweetIds) {
      this.seenTweetIds = new Set(this.tweetManager.getAllTweets().map(t => t.id));
    }

    if (total === 0) {
      this.disconnectFeedObserver();
      const noTweets = document.createElement('p');
      noTweets.textContent = this.activeCircleId === 'all'
        ? 'No spells cast yet. Be the first to cast a spell!'
        : 'No messages from peers in this circle yet.';
      tweetsContainer.appendChild(noTweets);
      return;
    }

    // Keep the reveal count at/above the initial page, then derive the
    // [start, end) window — clamped to the number of tweets we actually have so
    // we never index past the array. `start > 0` means some newest rows are
    // scrolled out the top (DOM cap reached).
    this.feedRevealed = Math.max(this.FEED_INITIAL, this.feedRevealed);
    const end = Math.min(this.feedRevealed, total);
    const start = Math.max(0, end - this.FEED_MAX_DOM);

    const { username: myName } = this.userManager.getUserInfo();

    // "Show newest" control when newest rows have scrolled off the top.
    if (start > 0) {
      const newer = document.createElement('button');
      newer.className = 'feed-more-button feed-newer-button';
      newer.textContent = `↑ Show newest (${start} newer)`;
      newer.addEventListener('click', () => {
        this.resetFeedPaging();
        this.renderTweets();
        tweetsContainer.scrollIntoView({ block: 'start' });
      });
      tweetsContainer.appendChild(newer);
    }

    for (let i = start; i < end; i++) {
      const t = tweets[i];
      const el = this.buildTweetElement(t, myName);
      if (!this.seenTweetIds.has(t.id)) {
        el.classList.add('tweet--new'); // first appearance → materialize once
        this.seenTweetIds.add(t.id);
      }
      tweetsContainer.appendChild(el);
    }

    // Footer: either "Load more" (older rows remain locally), or — when the
    // local history is exhausted — an option to pull older history from peers.
    const remaining = total - end;
    const footer = document.createElement('div');
    footer.className = 'feed-footer';

    if (remaining > 0) {
      const more = document.createElement('button');
      more.className = 'feed-more-button';
      more.textContent = `Load more (${remaining} older)`;
      more.addEventListener('click', () => this.loadMoreOlder());
      footer.appendChild(more);

      // Sentinel for auto-loading the next page as it scrolls into view.
      const sentinel = document.createElement('div');
      sentinel.className = 'feed-sentinel';
      footer.appendChild(sentinel);
      this.observeFeedSentinel(sentinel);
    } else {
      this.disconnectFeedObserver();
      const peerCount = this.peerManager.getAllConnections
        ? this.peerManager.getAllConnections().length : 0;
      if (peerCount > 0) {
        const fromPeers = document.createElement('button');
        fromPeers.className = 'feed-more-button feed-peer-button';
        fromPeers.textContent = 'Request older messages from peers';
        fromPeers.addEventListener('click', () => this.requestOlderFromPeers(fromPeers));
        footer.appendChild(fromPeers);
      } else {
        const done = document.createElement('p');
        done.className = 'feed-end-note';
        done.textContent = 'You have reached the beginning.';
        footer.appendChild(done);
      }
    }
    tweetsContainer.appendChild(footer);

    // Restore the anchored scroll position if requested.
    if (anchorId) {
      const anchorEl = tweetsContainer.querySelector(`.tweet[data-id="${CSS.escape(anchorId)}"]`);
      if (anchorEl) {
        const delta = anchorEl.getBoundingClientRect().top - anchorTop;
        if (delta) window.scrollBy(0, delta);
      }
    }
  }

  /**
   * Reveal the next page of older rows (from the in-memory history that was
   * loaded out of IndexedDB), preserving the scroll position.
   */
  loadMoreOlder() {
    const total = this.tweetManager.getAllTweets().filter(t => this.tweetMatchesActiveCircle(t)).length;
    if (this.feedRevealed >= total) return;
    this.feedRevealed = Math.min(this.feedRevealed + this.FEED_STEP, total);
    this.renderTweets({ preserveScroll: true });
  }

  /**
   * Ask every connected peer to (re)sync their history to us. New/older messages
   * arrive asynchronously and are merged + re-rendered via onTweetsUpdated.
   */
  requestOlderFromPeers(button) {
    const connections = this.peerManager.getAllConnections ? this.peerManager.getAllConnections() : [];
    if (connections.length === 0) return;
    if (button) { button.disabled = true; button.textContent = 'Requesting from peers…'; }
    connections.forEach(conn => this.tweetManager.requestSync(conn));
  }

  /**
   * Observe the bottom sentinel so scrolling near the end auto-loads the next
   * page — the "older rows blend in at the bottom" behaviour.
   */
  observeFeedSentinel(sentinel) {
    if (!('IntersectionObserver' in window)) return;
    if (!this.feedObserver) {
      this.feedObserver = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) this.loadMoreOlder();
      }, { rootMargin: '200px' });
    }
    this.feedObserver.disconnect();
    this.feedObserver.observe(sentinel);
  }

  disconnectFeedObserver() {
    if (this.feedObserver) this.feedObserver.disconnect();
  }

  /**
   * Build the DOM for a single tweet row.
   * @param {Object} tweet
   * @param {string} myName - the current user's name (to flag own messages)
   * @returns {HTMLElement}
   */
  buildTweetElement(tweet, myName) {
    const isMine = tweet.username === myName;

    const tweetElement = document.createElement('div');
    tweetElement.className = 'tweet';
    tweetElement.dataset.id = tweet.id;

    // Layout: [ avatar ] [ body ]
    const tweetMain = document.createElement('div');
    tweetMain.className = 'tweet-main';

    // Avatar shows the username's initial but its COLOR is seeded by the
    // author's KEY when we have one, so two users with the same name still look
    // different (and impersonators don't inherit a victim's avatar colour).
    const avatar = this.createAvatar(tweet.username, isMine, tweet.authorKey || tweet.username);
    tweetMain.appendChild(avatar);

    const tweetBody = document.createElement('div');
    tweetBody.className = 'tweet-body';

    const tweetHeader = document.createElement('div');
    tweetHeader.className = 'tweet-header';

    const tweetUser = document.createElement('div');
    tweetUser.className = 'tweet-user';
    tweetUser.textContent = tweet.username;
    if (tweet.authorKey) {
      // Append the short key fingerprint so the displayed handle is `name#abcd`.
      const fp = document.createElement('span');
      fp.className = 'tweet-fingerprint';
      fp.textContent = `#${fingerprint(tweet.authorKey)}`;
      tweetUser.appendChild(fp);
    }
    tweetHeader.appendChild(tweetUser);

    // Trust badge: verified ✓, impersonation ⚠, or unverified (legacy/unsigned).
    tweetHeader.appendChild(this.buildTrustBadge(tweet, isMine));

    // Show the audience badge for circle (narrow-cast) messages
    if (tweet.circle) {
      const badge = document.createElement('span');
      badge.className = 'tweet-circle-badge';
      badge.textContent = tweet.circle;
      badge.title = `Sent to circle: ${tweet.circle}`;
      tweetHeader.appendChild(badge);
    }

    const tweetTime = document.createElement('div');
    tweetTime.className = 'tweet-time';
    tweetTime.textContent = this.formatTimestamp(tweet.timestamp);
    tweetHeader.appendChild(tweetTime);

    const tweetContent = document.createElement('div');
    tweetContent.className = 'tweet-content';

    // Render text with clickable links (XSS-safe via linkify)
    if (tweet.content && tweet.content.trim()) {
      tweetContent.appendChild(linkify(tweet.content));
    }

    // Create media container
    const tweetMediaContainer = document.createElement('div');
    tweetMediaContainer.className = 'tweet-media-container';

    // Add attached image media if present
    if (tweet.mediaId) {
      this.renderMediaInTweet(tweet, tweetMediaContainer);
    }

    // Add a link preview for the first URL in the message (if any)
    this.renderLinkPreview(tweet, tweetMediaContainer);

    const tweetActions = document.createElement('div');
    tweetActions.className = 'tweet-actions';

    // ✨ Spark — cast a sparkle onto someone else's spell (a reaction). You can't
    // spark your own; on your own posts the button just shows the count.
    const myKey = this.userManager.publicKey;
    const isOwn = isMine || !!(tweet.authorKey && myKey && tweet.authorKey === myKey);
    const { count: sparkCount, mine: sparked } = this.tweetManager.getReactionState(tweet.id);

    const sparkButton = document.createElement('button');
    sparkButton.className = 'spark-button' + (sparked ? ' sparked' : '');
    sparkButton.textContent = sparkCount > 0 ? `✨ ${sparkCount}` : '✨';
    if (isOwn) {
      sparkButton.classList.add('spark-readonly');
      sparkButton.disabled = true;
      sparkButton.title = sparkCount === 1 ? '1 spark received' : `${sparkCount} sparks received`;
    } else {
      sparkButton.title = sparked ? 'Remove your spark' : 'Spark this spell';
      sparkButton.addEventListener('click', (e) => {
        if (!sparked) this.spawnSparkles(e.currentTarget, { count: 6 }); // burst only when adding
        this.tweetManager.toggleReaction(tweet.id);
      });
    }
    tweetActions.appendChild(sparkButton);

    // Only add delete button for user's own tweets
    if (isMine) {
      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-tweet-button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => this.deleteTweet(tweet.id));

      tweetActions.appendChild(deleteButton);
    }

    tweetBody.appendChild(tweetHeader);
    tweetBody.appendChild(tweetContent);
    tweetBody.appendChild(tweetMediaContainer);
    tweetBody.appendChild(tweetActions);

    tweetMain.appendChild(tweetBody);
    tweetElement.appendChild(tweetMain);

    return tweetElement;
  }

  /**
   * Build the trust badge shown next to a message author.
   *  - nameConflict → a *different* key is using a name we already pinned to
   *    someone else: a likely impersonator.
   *  - verified → the signature checked out against the author's key.
   *  - otherwise → unsigned / legacy message we cannot vouch for.
   * @param {Object} tweet
   * @param {boolean} isMine
   * @returns {HTMLElement}
   */
  buildTrustBadge(tweet, isMine) {
    const badge = document.createElement('span');
    badge.classList.add('trust-badge');

    if (tweet.nameConflict) {
      badge.classList.add('trust-conflict');
      badge.textContent = '⚠ impersonator?';
      badge.title = 'A different key has already been seen using this username. '
        + 'This message is signed by a DIFFERENT key — it may be an impersonator.';
    } else if (tweet.verified) {
      badge.classList.add('trust-verified');
      badge.textContent = isMine ? '✓ you' : '✓ verified';
      badge.title = 'Signature verified against this author\'s key.';
    } else {
      badge.classList.add('trust-unverified');
      badge.textContent = 'unverified';
      badge.title = 'This message is not signed (a legacy or un-upgraded peer); '
        + 'its author cannot be cryptographically verified.';
    }
    return badge;
  }

  /**
   * Build a circular avatar element with the user's initial.
   * @param {string} name
   * @param {boolean} isSelf - your own avatar is rendered in the brand color
   * @returns {HTMLElement}
   */
  createAvatar(name, isSelf = false, colorSeed = null) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = this.getInitial(name);
    avatar.style.backgroundColor = this.getAvatarColor(colorSeed || name, isSelf);
    return avatar;
  }

  getInitial(name) {
    const trimmed = (name || '').trim();
    return (trimmed ? trimmed[0] : '?').toUpperCase();
  }

  getAvatarColor(name, isSelf = false) {
    // Fixed brand teal (not the theme's --accent, which is too light in dark mode
    // for the tile's white letter to stay legible).
    if (isSelf) return '#0e7c86';
    // Deterministic per-identity ink colors for the letter tiles (warm jewel tones
    // that read on both light parchment and dark surfaces).
    const palette = ['#794bc4', '#c4385a', '#2f9e6f', '#d2602a', '#c79100', '#8e44ad', '#0e8f9b', '#4d5bb8'];
    let hash = 0;
    const str = name || '';
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  /**
   * Emit a short-lived burst of ✨ particles radiating from an element's center.
   * Particles are fixed-positioned on <body> (so card overflow can't clip them)
   * and self-remove when their animation ends. No-op for reduced-motion users.
   * @param {HTMLElement} el - element to burst from (e.g. the Cast / Spark button)
   * @param {{count?: number}} [opts]
   */
  spawnSparkles(el, opts = {}) {
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const count = opts.count || 6;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'sparkle-particle';
      p.textContent = '✨';
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.6 - 0.3);
      const dist = 16 + Math.random() * 22;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.fontSize = `${10 + Math.random() * 9}px`;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      p.addEventListener('animationend', () => p.remove());
      document.body.appendChild(p);
    }
  }

  /**
   * Render a preview card for the first previewable URL found in the message.
   * Skipped when the message already has an attached image, to avoid clutter.
   */
  renderLinkPreview(tweet, container) {
    if (!tweet.content || tweet.mediaId) return;

    const urls = extractUrls(tweet.content);
    if (urls.length === 0) return;

    const preview = buildLinkPreview(urls[0]);
    if (preview) {
      container.appendChild(preview);
    }
  }

  // ===================== Circles =====================

  /**
   * Called whenever circles change — refresh all circle-related UI.
   */
  onCirclesChanged() {
    // If the active circle was deleted, fall back to "all"
    if (this.activeCircleId !== 'all' && this.circleManager && !this.circleManager.getCircle(this.activeCircleId)) {
      this.activeCircleId = 'all';
    }
    this.renderCirclesSidebar();
    this.updateCastTarget();
    if (this.elements.circlesContainer && this.elements.circlesContainer.style.display !== 'none') {
      this.renderCirclesManage();
    }
    this.renderTweets();
  }

  /**
   * Create a circle from a name input element.
   */
  handleCreateCircle(inputEl) {
    if (!this.circleManager || !inputEl) return;
    const name = inputEl.value.trim();
    if (!name) {
      alert('Please enter a circle name');
      return;
    }
    try {
      this.circleManager.createCircle(name);
      inputEl.value = '';
    } catch (error) {
      alert(error.message);
    }
  }

  /**
   * Select a circle to filter the feed by, and switch to the feed.
   */
  selectCircle(circleId) {
    this.activeCircleId = circleId;
    this.resetFeedPaging(); // a different circle is a wholly different list
    this.renderCirclesSidebar();
    this.updateCastTarget();
    this.renderTweets();
    this.activateTab('feed');
  }

  updateFeedHeading() {
    const heading = this.elements.feedHeading;
    if (!heading) return;

    const circle = this.activeCircleId !== 'all' && this.circleManager
      ? this.circleManager.getCircle(this.activeCircleId)
      : null;

    if (!circle) {
      heading.textContent = '';
      heading.style.display = 'none';
      return;
    }

    heading.style.display = 'block';
    const count = circle.peerIds.length;
    heading.textContent = `Circle: ${circle.name} · ${count} peer${count === 1 ? '' : 's'}`;
  }

  /**
   * Render the left sidebar list of circles.
   */
  renderCirclesSidebar() {
    const list = this.elements.circlesSidebarList;
    if (!list || !this.circleManager) return;
    list.innerHTML = '';

    const makeItem = (id, label, count) => {
      const item = document.createElement('div');
      item.className = 'circle-item' + (this.activeCircleId === id ? ' active' : '');

      const name = document.createElement('span');
      name.className = 'circle-item-name';
      name.textContent = label;
      item.appendChild(name);

      if (count !== null) {
        const badge = document.createElement('span');
        badge.className = 'circle-item-count';
        badge.textContent = count;
        item.appendChild(badge);
      }

      item.addEventListener('click', () => this.selectCircle(id));
      return item;
    };

    list.appendChild(makeItem('all', 'All Peers', null));

    const circles = this.circleManager.getCircles();
    circles.forEach(circle => {
      list.appendChild(makeItem(circle.id, circle.name, circle.peerIds.length));
    });

    if (circles.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'sidebar-empty';
      empty.textContent = 'No circles yet';
      list.appendChild(empty);
    }
  }

  /**
   * Update the compose-box indicator showing where a Cast will go (the circle
   * currently selected in the sidebar, or "All Peers").
   */
  updateCastTarget() {
    const el = this.elements.castTarget;
    if (!el) return;

    let name = 'All Peers';
    if (this.activeCircleId !== 'all' && this.circleManager) {
      const circle = this.circleManager.getCircle(this.activeCircleId);
      if (circle) {
        name = circle.name;
      } else {
        this.activeCircleId = 'all';
      }
    }
    el.textContent = `Casting to: ${name}`;
  }

  /**
   * Render the Circles management tab (create/delete circles, add/remove peers).
   */
  renderCirclesManage() {
    const container = this.elements.circlesManageList;
    if (!container || !this.circleManager) return;
    container.innerHTML = '';

    const circles = this.circleManager.getCircles();
    if (circles.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'You have no circles yet. Create one above to group your peers.';
      container.appendChild(empty);
      return;
    }

    const knownPeers = this.getKnownPeers();

    circles.forEach(circle => {
      const card = document.createElement('div');
      card.className = 'circle-card';

      // Header with delete
      const head = document.createElement('div');
      head.className = 'circle-card-head';
      const title = document.createElement('h4');
      title.textContent = `${circle.name} (${circle.peerIds.length})`;
      const del = document.createElement('button');
      del.className = 'danger-button small-button';
      del.textContent = 'Delete Circle';
      del.addEventListener('click', () => {
        if (confirm(`Delete circle "${circle.name}"? Your peers and messages are not affected.`)) {
          this.circleManager.deleteCircle(circle.id);
        }
      });
      head.appendChild(title);
      head.appendChild(del);
      card.appendChild(head);

      // Members
      const membersWrap = document.createElement('div');
      membersWrap.className = 'circle-members';
      if (circle.peerIds.length === 0) {
        const none = document.createElement('p');
        none.className = 'hint';
        none.textContent = 'No peers in this circle yet. Add some below.';
        membersWrap.appendChild(none);
      } else {
        circle.peerIds.forEach(peerId => {
          const row = document.createElement('div');
          row.className = 'circle-member-row';
          const label = document.createElement('span');
          const peer = knownPeers.find(p => p.peerId === peerId);
          label.textContent = peer ? `${peer.username} (${peerId})` : peerId;
          const remove = document.createElement('button');
          remove.className = 'small-button danger-button';
          remove.textContent = 'Remove';
          remove.addEventListener('click', () => this.circleManager.removePeerFromCircle(circle.id, peerId));
          row.appendChild(label);
          row.appendChild(remove);
          membersWrap.appendChild(row);
        });
      }
      card.appendChild(membersWrap);

      // Add-peer control
      const addable = knownPeers.filter(p => !circle.peerIds.includes(p.peerId));
      if (addable.length > 0) {
        const addRow = document.createElement('div');
        addRow.className = 'circle-add-row';
        const select = document.createElement('select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Add a peer…';
        select.appendChild(placeholder);
        addable.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.peerId;
          opt.textContent = `${p.username} (${p.peerId})`;
          select.appendChild(opt);
        });
        select.addEventListener('change', () => {
          if (select.value) {
            this.circleManager.addPeerToCircle(circle.id, select.value);
          }
        });
        addRow.appendChild(select);
        card.appendChild(addRow);
      } else {
        const noPeers = document.createElement('p');
        noPeers.className = 'hint';
        noPeers.textContent = knownPeers.length === 0
          ? 'Connect to peers first, then add them here.'
          : 'All your known peers are already in this circle.';
        card.appendChild(noPeers);
      }

      container.appendChild(card);
    });
  }

  /**
   * Known peers = union of connected + saved peers (deduped), excluding self.
   * @returns {Array<{peerId: string, username: string}>}
   */
  getKnownPeers() {
    const map = new Map();

    this.peerManager.getAllConnections().forEach(conn => {
      map.set(conn.peer, {
        peerId: conn.peer,
        username: (conn.metadata && conn.metadata.username) || 'Unknown user'
      });
    });

    (this.peerManager.savedPeers || []).forEach(p => {
      if (!map.has(p.peerId)) {
        map.set(p.peerId, { peerId: p.peerId, username: p.username || 'Unknown user' });
      }
    });

    map.delete(this.userManager.peerId);
    return Array.from(map.values());
  }

  renderMediaInTweet(tweet, container) {
    // If we have a thumbnail, display it immediately
    if (tweet.mediaThumbnail) {
      const img = document.createElement('img');
      img.className = 'tweet-media';
      img.src = tweet.mediaThumbnail;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '300px';
      img.style.borderRadius = '8px';
      img.style.cursor = 'pointer';
      
      // Click to show full-size media
      img.addEventListener('click', async () => {
        try {
          const mediaData = await this.tweetManager.getMediaForTweet(tweet.id);
          if (mediaData && mediaData.fullImage) {
            this.showMediaModal(mediaData.fullImage);
          }
        } catch (error) {
          console.error('Error loading full image:', error);
        }
      });
      
      container.appendChild(img);
    }
    // If no thumbnail but we have mediaId, add a placeholder/loading indicator
    else if (tweet.mediaId) {
      const placeholder = document.createElement('div');
      placeholder.className = 'media-placeholder';
      placeholder.textContent = 'Loading media...';
      placeholder.style.backgroundColor = 'var(--surface-3)';
      placeholder.style.color = 'var(--text-muted)';
      placeholder.style.padding = '20px';
      placeholder.style.borderRadius = '8px';
      placeholder.style.textAlign = 'center';
      
      container.appendChild(placeholder);
      
      // Try to fetch the media
      this.tweetManager.getMediaForTweet(tweet.id)
        .then(mediaData => {
          if (mediaData && mediaData.thumbnail) {
            const img = document.createElement('img');
            img.className = 'tweet-media';
            img.src = mediaData.thumbnail;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '300px';
            img.style.borderRadius = '8px';
            img.style.cursor = 'pointer';
            
            // Replace placeholder
            container.innerHTML = '';
            container.appendChild(img);
          }
        })
        .catch(error => {
          console.error('Error fetching media:', error);
          placeholder.textContent = 'Failed to load media';
        });
    }
  }

  showMediaModal(imageSrc) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'media-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';
    
    // Create image element
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.maxWidth = '90%';
    img.style.maxHeight = '90%';
    img.style.objectFit = 'contain';
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '20px';
    closeBtn.style.right = '20px';
    closeBtn.style.fontSize = '30px';
    closeBtn.style.color = 'white';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    
    // Close on button click, overlay click, or escape key
    closeBtn.addEventListener('click', () => document.body.removeChild(modal));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    });
    
    // Add elements to modal
    modal.appendChild(img);
    modal.appendChild(closeBtn);
    
    // Add modal to document
    document.body.appendChild(modal);
    
    // Setup escape key listener
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', escHandler);
      }
    };
    
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Delete a tweet
   * @param {string} tweetId - ID of the tweet to delete
   */
  async deleteTweet(tweetId) {
    if (confirm('Are you sure you want to delete this message? It will only be removed from your local database.')) {
      // Delete through tweet manager (updated to handle media)
      const success = await this.tweetManager.deleteTweet(tweetId);

      // If deletion was successful, update the UI
      if (success) {
        this.renderTweets();
      }
    }
  }

  /**
   * Delete all messages from the local database
   */
  async deleteAllMessages() {
    if (confirm('Are you sure you want to delete all your messages? This will remove all spells from your local database but cannot remove them from other peers who have already received them.')) {
      // Delete through tweet manager (async — await the count before showing it)
      const deletedCount = await this.tweetManager.deleteAllTweets();
      alert(`Successfully deleted ${deletedCount} messages from your local database.`);
    }
  }

  /**
   * Clean up local storage: remove orphaned media (images no longer referenced
   * by any message) and prune stale message-distribution tracking data.
   * Does not delete any of the user's messages.
   */
  async cleanupStorage() {
    if (!confirm('Clean up unused images and stale connection-tracking data from local storage? Your messages will not be deleted.')) {
      return;
    }

    const button = this.elements.cleanupStorageButton;
    const originalLabel = button ? button.textContent : null;
    if (button) {
      button.disabled = true;
      button.textContent = 'Cleaning…';
    }

    try {
      // Media still referenced by a stored tweet must be kept
      const activeMediaIds = this.tweetManager.getAllTweets()
        .filter(tweet => tweet.mediaId)
        .map(tweet => tweet.mediaId);

      const removedMedia = await this.mediaManager.cleanupOrphanedMedia(activeMediaIds);
      const prunedRefs = this.tweetManager.pruneDistributionState();

      alert(
        `Cleanup complete.\n\n` +
        `• Removed ${removedMedia} unused image(s)\n` +
        `• Pruned ${prunedRefs} stale tracking reference(s)`
      );
    } catch (error) {
      console.error('Storage cleanup failed:', error);
      alert(`Storage cleanup failed: ${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }

  /**
   * Update connection status in the UI
   */
  updateConnectionStatus() {
    const connections = this.peerManager.getAllConnections();

    if (connections.length === 0) {
      this.elements.statusElement.textContent = 'Not connected to any peers';
    } else {
      this.elements.statusElement.textContent = `Connected to ${connections.length} peer(s)`;
    }

    // Update connection quality indicator
    this.handleConnectionQualityUpdate({
      detail: { quality: this.peerManager.connectionQuality || 'unknown' }
    });
  }

  /**
   * Update the peers list in the UI
   */
  updatePeersList() {
    const peersList = this.elements.peersList;
    peersList.innerHTML = '';

    // Get data from peer manager
    const connections = this.peerManager.getAllConnections();
    const savedPeers = this.peerManager.savedPeers;

    // Combine connected and saved peers
    const allPeerIds = new Set([
      ...connections.map(conn => conn.peer),
      ...savedPeers.map(peer => peer.peerId)
    ]);

    if (allPeerIds.size === 0) {
      const noPeers = document.createElement('p');
      noPeers.textContent = 'No peers connected or saved';
      peersList.appendChild(noPeers);
      return;
    }

    // Create sections for online and offline peers
    const onlineSection = document.createElement('div');
    onlineSection.innerHTML = '<h4>Online Peers</h4>';

    const offlineSection = document.createElement('div');
    offlineSection.innerHTML = '<h4>Offline Peers</h4>';

    // Track if we added any peers to each section
    let hasOnlinePeers = false;
    let hasOfflinePeers = false;

    // Process each peer
    allPeerIds.forEach(peerId => {
      // Skip own peer ID
      if (peerId === this.userManager.peerId) return;

      const isConnected = connections.some(conn => conn.peer === peerId);
      const connection = connections.find(conn => conn.peer === peerId);
      const savedPeer = savedPeers.find(peer => peer.peerId === peerId);

      // A peer is "online" only while we hold a live connection to them. A stale
      // persisted status must never render as online — otherwise the list shows
      // "Online" with Connect/Remove buttons while the header (driven by the
      // actual connection count) correctly says "Not connected to any peers".
      const peerInfo = {
        peerId: peerId,
        username: connection?.metadata?.username || savedPeer?.username || 'Unknown user',
        publicKey: connection?.metadata?.publicKey || savedPeer?.publicKey || null,
        status: isConnected ? 'online' : 'offline',
        lastSeen: this.peerManager.lastSeen[peerId] || 0,
        connectionQuality: this.peerManager.peerConnectionQuality[peerId] || 'unknown'
      };

      // Create peer element for the UI
      const peerElement = this.createPeerElement(peerInfo, connection);

      // Add to appropriate section
      if (peerInfo.status === 'online') {
        onlineSection.appendChild(peerElement);
        hasOnlinePeers = true;
      } else {
        offlineSection.appendChild(peerElement);
        hasOfflinePeers = true;
      }
    });

    // Add sections to the peer list
    if (hasOnlinePeers) {
      peersList.appendChild(onlineSection);
    } else {
      onlineSection.innerHTML += '<p>No online peers</p>';
      peersList.appendChild(onlineSection);
    }

    if (hasOfflinePeers) {
      peersList.appendChild(offlineSection);
    }

    // Update connection status
    this.updateConnectionStatus();

    // Keep the circle management view in sync with peer changes (when visible)
    if (this.elements.circlesContainer && this.elements.circlesContainer.style.display !== 'none') {
      this.renderCirclesManage();
    }
  }

  /**
   * Create a peer element for the UI
   * @param {Object} peerInfo - Information about the peer
   * @param {Object} connection - The connection object if connected
   * @returns {HTMLElement} - The peer element
   */
  createPeerElement(peerInfo, connection) {
    // Helper to format the last seen time
    const formatLastSeen = (timestamp) => {
      if (!timestamp) return 'Never';

      const now = Date.now();
      const diff = now - timestamp;

      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)} mins ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
      return new Date(timestamp).toLocaleDateString();
    };

    // Create peer element
    const peerElement = document.createElement('div');
    peerElement.className = 'peer';

    // Create status indicator
    const statusIndicator = document.createElement('span');
    statusIndicator.className = `connection-quality ${peerInfo.connectionQuality}`;

    // Create info container
    const peerInfoContainer = document.createElement('div');

    // Show the verifiable handle `name#fingerprint` (same identity shown on
    // posts and the profile) rather than the raw peer ID. The raw ID is also a
    // login credential, so we don't surface other people's IDs in the UI.
    const nameElement = document.createElement('div');
    nameElement.className = 'peer-name';
    nameElement.textContent = handleFor(peerInfo.username, peerInfo.publicKey);

    // Add last seen info for offline peers
    const lastSeenElement = document.createElement('div');
    lastSeenElement.className = 'peer-last-seen';
    lastSeenElement.style.fontSize = '0.8em';
    lastSeenElement.style.color = 'var(--text-muted)';

    if (peerInfo.status === 'online') {
      lastSeenElement.textContent = 'Currently online';
    } else {
      lastSeenElement.textContent = `Last seen: ${formatLastSeen(peerInfo.lastSeen)}`;
    }

    // Add status text
    const statusElement = document.createElement('div');
    statusElement.className = 'peer-status';
    statusElement.textContent = peerInfo.status.charAt(0).toUpperCase() + peerInfo.status.slice(1);
    statusElement.style.fontWeight = 'bold';

    if (peerInfo.status === 'online') {
      statusElement.style.color = '#2ecc71';
    } else if (peerInfo.status === 'offline') {
      statusElement.style.color = '#e74c3c';
    } else if (peerInfo.status === 'error') {
      statusElement.style.color = '#f39c12';
    }

    // Add button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'peer-actions';

    // Add appropriate buttons based on status
    if (connection) {
      // Disconnect button for connected peers
      const disconnectButton = document.createElement('button');
      disconnectButton.textContent = 'Disconnect';
      disconnectButton.className = 'danger-button';
      disconnectButton.style.marginRight = '5px';
      disconnectButton.addEventListener('click', () => {
        if (confirm(`Are you sure you want to disconnect from ${peerInfo.username || 'this peer'}?`)) {
          this.peerManager.disconnectPeer(connection);
        }
      });
      buttonContainer.appendChild(disconnectButton);
    } else {
      // Connect button for disconnected peers
      const connectButton = document.createElement('button');
      connectButton.textContent = 'Connect';
      connectButton.addEventListener('click', () => {
        this.peerManager.connectToPeer(peerInfo.peerId);
      });
      buttonContainer.appendChild(connectButton);

      // Remove button
      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.className = 'danger-button';
      removeButton.style.marginLeft = '5px';
      removeButton.addEventListener('click', () => {
        if (confirm(`Are you sure you want to remove ${peerInfo.username || 'this peer'} from your saved peers?`)) {
          this.peerManager.removeOfflinePeer(peerInfo.peerId);
          // Also drop the peer from any circles it belonged to
          if (this.circleManager) {
            this.circleManager.removePeerEverywhere(peerInfo.peerId);
          }
        }
      });
      buttonContainer.appendChild(removeButton);
    }

    // Assemble the peer element
    peerInfoContainer.appendChild(nameElement);
    peerInfoContainer.appendChild(statusElement);
    peerInfoContainer.appendChild(lastSeenElement);

    const peerLeft = document.createElement('div');
    peerLeft.className = 'peer-left';
    peerLeft.appendChild(this.createAvatar(peerInfo.username, false));
    peerLeft.appendChild(statusIndicator);
    peerLeft.appendChild(peerInfoContainer);

    peerElement.appendChild(peerLeft);
    peerElement.appendChild(buttonContainer);

    return peerElement;
  }


  /**
   * Handle a status update event
   * @param {Event} event - The status update event
   */
  handleStatusUpdate(event) {
    const { message, showRetry, retryFn } = event.detail;

    if (showRetry && retryFn) {
      // Build with DOM APIs (never innerHTML) so a status message can never be
      // interpreted as markup.
      this.elements.statusElement.textContent = message + ' ';
      const retryButton = document.createElement('button');
      retryButton.id = 'retry-now';
      retryButton.className = 'small-button';
      retryButton.textContent = 'Try Now';
      retryButton.addEventListener('click', retryFn);
      this.elements.statusElement.appendChild(retryButton);
    } else {
      this.elements.statusElement.textContent = message;
    }
  }

  /**
   * Handle a connection quality update event
   * @param {Event} event - The connection quality update event
   */
  handleConnectionQualityUpdate(event) {
    const { quality } = event.detail;
    // Use ID selector instead of class
    this.elements.connectionQualityIndicator.className = quality;
  }

  /**
   * Format a timestamp for display
   * @param {number} timestamp - The timestamp to format
   * @returns {string} - The formatted timestamp
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
}
