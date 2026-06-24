// Manages tweets and message distribution

import { StorageManager } from './storage-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { verifySignature } from './crypto-identity.js';

export class TweetManager {
	constructor(userManager, peerManager, storageManager, mediaManager) {
		this.userManager = userManager;
		this.peerManager = peerManager;
		this.storageManager = storageManager;
		this.mediaManager = mediaManager;

		// Constants for validation and limits
		this.MAX_TWEET_LENGTH = 1000; // Maximum length of tweet content in characters
		this.MAX_TWEETS_STORAGE = 1000; // Maximum number of tweets to store locally
		this.MAX_MEDIA_PER_TWEET = 1; // Start with just one attachment per message
		this.MAX_USERNAME_LENGTH = 64;   // Max length of a (peer-supplied) username
		this.MAX_CIRCLE_LENGTH = 64;     // Max length of a circle/audience name
		this.MAX_THUMBNAIL_BYTES = 64 * 1024;      // Max inline thumbnail size (~64 KB)
		this.MAX_FULLIMAGE_BYTES = 5 * 1024 * 1024; // Max full image accepted from a peer (~5 MB)
		this.MAX_BULK_TWEETS = 500;      // Cap on tweets accepted in one all_tweets message
		this.MAX_KEY_B64 = 256;          // Generous bound for a base64 public key / signature
		this.VALID_TWEET_PROPS = [
		  'id', 'username', 'content', 'timestamp', 'mediaId', 'mediaThumbnail', 'mediaType',
		  'authorId', 'circle',
		  // P0 identity fields:
		  'authorKey',    // author's public key (base64) — the real, signed identity
		  'signature',    // ECDSA signature over the canonical signed fields
		  'verified',     // LOCAL-ONLY: did this tweet's signature verify? (never from wire)
		  'nameConflict'  // LOCAL-ONLY: a different key already owns this username (TOFU)
		]; // (authorId = author's peer ID, circle = audience name)

		// Add rate limiter instance
		this.rateLimiter = new RateLimiter();

		// Rate limiting constants
		this.MESSAGE_MAX_COUNT = 10;     // Maximum messages
		this.MESSAGE_TIME_WINDOW_MS = 60000; // 1 minute window

		// State
		this.tweets = [];
		this.tweetRecipients = {}; // Maps tweet IDs to arrays of peer IDs who have received it
		this.unsentTweets = {};    // Maps peer IDs to arrays of tweet IDs that need to be sent

		// TOFU name registry: username -> the first public key we saw verified
		// using that name. A later *different* key using the same name is flagged
		// as a possible impersonator. Loaded from storage in loadNameRegistry().
		this.nameRegistry = {};

		// Add event callbacks
		this.onTweetsUpdated = null; // Add this callback for UI updates

		// Register as listener for peer events
		this.peerManager.registerMessageHandler('tweet', this.handleTweetMessage.bind(this));
		this.peerManager.registerMessageHandler('tweet_ack', this.handleTweetAckMessage.bind(this));
		this.peerManager.registerMessageHandler('all_tweets', this.handleAllTweetsMessage.bind(this));
		this.peerManager.registerMessageHandler('bulk_tweet_ack', this.handleBulkTweetAckMessage.bind(this));
		this.peerManager.registerMessageHandler('sync_request', this.handleSyncRequest.bind(this));

		// Bind methods
		this.loadTweets = this.loadTweets.bind(this);
		this.loadMessageDistributionState = this.loadMessageDistributionState.bind(this);
		this.saveTweets = this.saveTweets.bind(this);
		this.saveMessageDistributionState = this.saveMessageDistributionState.bind(this);
		this.createTweet = this.createTweet.bind(this);
		this.addTweet = this.addTweet.bind(this);
		this.deleteTweet = this.deleteTweet.bind(this);
		this.sendSelectiveTweets = this.sendSelectiveTweets.bind(this);
		this.sendTweetsToPeer = this.sendTweetsToPeer.bind(this);
		this.requestSync = this.requestSync.bind(this);
		this.handleSyncRequest = this.handleSyncRequest.bind(this);
		this.broadcastTweet = this.broadcastTweet.bind(this);
		this.validateTweet = this.validateTweet.bind(this);
		this.generateUniqueId = this.generateUniqueId.bind(this);
		this.loadNameRegistry = this.loadNameRegistry.bind(this);

		// On new peer connection, sync messages in both directions
		this.peerManager.onPeerConnected((conn) => {
			const peerId = conn.peer;

			// Create an unsent tweets entry for this peer if it doesn't exist
			if (!this.unsentTweets[peerId]) {
				this.unsentTweets[peerId] = [];
			}

			// Wait a bit for the handshake to settle, then ask this peer to send
			// us anything we're missing. The peer does the same from its side, so
			// the sync is mutual and complete — a freshly logged-in user (even one
			// who cleared local data) gets the full history + images back. Using a
			// pull avoids double-transferring images and doesn't rely on local
			// recipient tracking that may be stale across sessions.
			setTimeout(() => this.requestSync(conn), 1000);
		});
	}

	// In loadTweets()
	async loadTweets() {
	  const savedTweets = await this.storageManager.loadFromStorage(StorageManager.KEYS.TWEETS);
	  if (savedTweets) {
		// Apply size limit if needed
		if (savedTweets.length > this.MAX_TWEETS_STORAGE) {
		  console.log(`Limiting loaded tweets to ${this.MAX_TWEETS_STORAGE} (had ${savedTweets.length})`);
		  this.tweets = savedTweets.slice(0, this.MAX_TWEETS_STORAGE);
		} else {
		  this.tweets = savedTweets;
		}
		this.sortTweets();
		// Call the callback if it exists
		if (typeof this.onTweetsUpdated === 'function') {
		  this.onTweetsUpdated();
		}
	  }
	}

	// In loadMessageDistributionState()
	async loadMessageDistributionState() {
	  const savedRecipients = await this.storageManager.loadFromStorage(StorageManager.KEYS.TWEET_RECIPIENTS);
	  const savedUnsent = await this.storageManager.loadFromStorage(StorageManager.KEYS.UNSENT_TWEETS);
	  
	  if (savedRecipients) {
		this.tweetRecipients = savedRecipients;
	  }
	  
	  if (savedUnsent) {
		this.unsentTweets = savedUnsent;
	  }
	}

	// In saveTweets()
	async saveTweets() {
	  // Apply limit before saving to prevent storage overflow
	  if (this.tweets.length > this.MAX_TWEETS_STORAGE) {
		console.log(`Limiting tweets to ${this.MAX_TWEETS_STORAGE} before saving`);
		this.tweets = this.tweets.slice(0, this.MAX_TWEETS_STORAGE);
	  }
	  
	  await this.storageManager.saveToStorage(StorageManager.KEYS.TWEETS, this.tweets);
	  await this.saveMessageDistributionState();
	}

	// In saveMessageDistributionState()
	async saveMessageDistributionState() {
	  await this.storageManager.saveToStorage(StorageManager.KEYS.TWEET_RECIPIENTS, this.tweetRecipients);
	  await this.storageManager.saveToStorage(StorageManager.KEYS.UNSENT_TWEETS, this.unsentTweets);
	}

	/**
	 * Sort tweets by timestamp (newest first)
	 */
	sortTweets() {
		this.tweets.sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Create a new tweet
	 * @param {string} content - Tweet content
	 * @param {File} [mediaFile] - Optional image file
	 * @param {Object} [circle] - Optional target circle { id, name, peerIds } to
	 *        narrow-cast to. When omitted, the message is public (broadcast to all).
	 * @returns {string} - Tweet ID
	 */
	  async createTweet(content, mediaFile = null, circle = null) {

		if (!content && !mediaFile) {
		  throw new Error('Tweet must have content or media');
		}

		// Check content length
		if (content && content.length > this.MAX_TWEET_LENGTH) {
		  throw new Error(`Tweet content exceeds maximum length of ${this.MAX_TWEET_LENGTH} characters`);
		}

		// Process media if provided
		let mediaId = null;
		let mediaThumbnail = null;
		let mediaType = null;

		if (mediaFile) {
		  try {
			const mediaData = await this.mediaManager.processAndStoreImage(mediaFile);
			mediaId = mediaData.id;
			mediaThumbnail = mediaData.thumbnail;
			mediaType = mediaData.type;
		  } catch (error) {
			console.error('Error processing media:', error);
			throw new Error(`Failed to process media: ${error.message}`);
		  }
		}

		// Rate limiting check (existing code)
		const isAllowed = this.rateLimiter.isAllowed(
		  'message',
		  this.userManager.peerId,
		  this.MESSAGE_MAX_COUNT,
		  this.MESSAGE_TIME_WINDOW_MS
		);

		if (!isAllowed) {
		  const timeUntil = this.rateLimiter.getTimeUntilAllowed('message', this.userManager.peerId);
		  const secondsUntil = Math.ceil(timeUntil / 1000);
		  throw new Error(`Message rate limit exceeded. Please wait ${secondsUntil} seconds before sending more messages.`);
		}

		const { username, peerId } = this.userManager.getUserInfo();
		const timestamp = Date.now();
		const tweetId = this.generateUniqueId(username, content, timestamp);

		// Narrow-cast target (a circle) vs public broadcast
		const circleName = circle ? circle.name : null;
		const targetPeerIds = circle ? circle.peerIds : null;

		// Recipients we attempt to deliver to immediately
		const connectedPeerIds = targetPeerIds
			? this.peerManager.getConnectedPeerIds().filter(id => targetPeerIds.includes(id))
			: this.peerManager.getConnectedPeerIds();

		// Sign the message with our private key so peers can verify it really
		// came from this identity (and no relay tampered with it).
		const authorKey = this.userManager.publicKey;
		const signature = authorKey
			? await this.userManager.identity.sign(
				this.signedFields({ authorKey, username, content, timestamp, id: tweetId, mediaId, circle: circleName }))
			: null;

		// Add tweet locally (with author id and, for circle posts, the audience name)
		this.addTweet(username, content, timestamp, connectedPeerIds, tweetId, mediaId, mediaThumbnail, mediaType, peerId, circleName,
			{ authorKey, signature, verified: !!signature });

		// Send to peers (awaits loading the full image for transfer)
		await this.broadcastTweet(content, timestamp, tweetId, mediaId, mediaThumbnail, mediaType, peerId, circleName, targetPeerIds,
			{ authorKey, signature });

		// Notify listeners
		if (typeof this.onTweetsUpdated === 'function') {
		  this.onTweetsUpdated();
		}

		return tweetId;
	  }

	/**
	 * Add a tweet to the database
	 * @param {string} username - Author username
	 * @param {string} content - Tweet content
	 * @param {number} timestamp - Creation timestamp
	 * @param {Array} recipients - Initial recipients
	 * @param {string} [id] - Optional tweet ID, will be generated if not provided
	 * @param {string} [mediaId]
	 * @param {string} [mediaThumbnail]
	 * @param {string} [mediaType]
	 * @returns {string} - Tweet ID
	 */
	  addTweet(username, content, timestamp, recipients = null, id = null, mediaId = null, mediaThumbnail = null, mediaType = null, authorId = null, circle = null, identity = {}) {
		const tweetId = id || this.generateUniqueId(username, content, timestamp);

		// Check if we already have this tweet
		const existingTweet = this.tweets.find(t => t.id === tweetId);
		if (existingTweet) {
		  return tweetId;
		}

		// Create new tweet object with media info
		const tweet = {
		  username,
		  content,
		  timestamp,
		  id: tweetId
		};

		if (mediaId) {
		  tweet.mediaId = mediaId;
		  tweet.mediaThumbnail = mediaThumbnail;
		  tweet.mediaType = mediaType;
		}

		// Author peer ID (used for circle/feed filtering) and circle audience name
		if (authorId) {
		  tweet.authorId = authorId;
		}
		if (circle) {
		  tweet.circle = circle;
		}

		// Identity: the signed public key + signature travel with the tweet (so we
		// can relay them); verified/nameConflict are LOCAL trust flags computed by
		// the caller (never taken from the wire).
		if (identity.authorKey) tweet.authorKey = identity.authorKey;
		if (identity.signature) tweet.signature = identity.signature;
		tweet.verified = !!identity.verified;
		if (identity.nameConflict) tweet.nameConflict = true;

		// Validate tweet before adding
		if (!this.validateTweet(tweet)) {
			console.error('Invalid tweet:', tweet);
			throw new Error('Invalid tweet data');
		}

		this.tweets.push(tweet);

		// Track recipients for this tweet
		if (!this.tweetRecipients[tweetId]) {
			this.tweetRecipients[tweetId] = [];
		}

		// If specific recipients were provided, use those
		if (recipients && Array.isArray(recipients)) {
			this.tweetRecipients[tweetId] = [...recipients];
		}

		// Sort tweets by timestamp
		this.sortTweets();

		// Ensure we're not exceeding the maximum number of tweets
		if (this.tweets.length > this.MAX_TWEETS_STORAGE) {
			// Remove oldest tweets that exceed the limit
			const excess = this.tweets.length - this.MAX_TWEETS_STORAGE;
			const removedTweets = this.tweets.splice(this.MAX_TWEETS_STORAGE, excess);

			// Clean up references to removed tweets
			removedTweets.forEach(removedTweet => {
				delete this.tweetRecipients[removedTweet.id];

				// Remove from unsent tweets lists
				Object.keys(this.unsentTweets).forEach(peerId => {
					this.unsentTweets[peerId] = this.unsentTweets[peerId].filter(id => id !== removedTweet.id);
				});
			});
		}

		// Save to storage
		this.saveTweets();

		// Notify listeners
		if (typeof this.onTweetsUpdated === 'function') {
			this.onTweetsUpdated();
		}

		return tweetId;
	}

	/**
	 * Delete a tweet by ID
	 * @param {string} tweetId - Tweet ID to delete
	 * @returns {boolean} - Success
	 */
	  async deleteTweet(tweetId) {
		const initialLength = this.tweets.length;

		// Find the tweet to delete
		const tweetToDelete = this.tweets.find(tweet => tweet.id === tweetId);

		// Check if the tweet has media (only delete it if no other tweet uses it)
		if (tweetToDelete && tweetToDelete.mediaId) {
		  const stillReferenced = this.tweets.some(
			t => t.id !== tweetId && t.mediaId === tweetToDelete.mediaId
		  );
		  if (!stillReferenced) {
			try {
			  await this.mediaManager.deleteMedia(tweetToDelete.mediaId);
			} catch (error) {
			  console.error(`Error deleting media for tweet ${tweetId}:`, error);
			  // Continue with tweet deletion even if media deletion fails
			}
		  }
		}

		// Remove the tweet
		this.tweets = this.tweets.filter(tweet => tweet.id !== tweetId);

		if (this.tweets.length !== initialLength) {
		  // Clean up distribution tracking so it doesn't leak after deletion
		  delete this.tweetRecipients[tweetId];
		  Object.keys(this.unsentTweets).forEach(peerId => {
			this.unsentTweets[peerId] = this.unsentTweets[peerId].filter(id => id !== tweetId);
		  });

		  // Successfully removed a tweet
		  this.saveTweets();
		  this.saveMessageDistributionState();
		  return true;
		}

		return false;
	  }

	/**
	 * Get Media for Tweet
	 * @param {string} tweetId - Tweet ID to get Media for
	 * @returns {media} - Media File
	 */
	  async getMediaForTweet(tweetId) {
		const tweet = this.tweets.find(t => t.id === tweetId);
		if (!tweet || !tweet.mediaId) {
		  return null;
		}

		try {
		  return await this.mediaManager.getMedia(tweet.mediaId);
		} catch (error) {
		  console.error(`Error fetching media for tweet ${tweetId}:`, error);
		  return null;
		}
	  }

	/**
	 * Load the full-size image data for a media ID from local IndexedDB so it
	 * can be transmitted to peers. Returns null if unavailable.
	 * @param {string} mediaId
	 * @returns {Promise<string|null>} - Base64 data URL of the full image
	 */
	async getFullImageData(mediaId) {
		if (!mediaId) return null;
		try {
			// Absence is expected (e.g. when relaying a thumbnail-only tweet whose
			// full image we never stored), so skip the lookup rather than throwing.
			if (!(await this.mediaManager.hasMedia(mediaId))) return null;

			const media = await this.mediaManager.getMedia(mediaId, true);
			return media && media.fullImage ? media.fullImage : null;
		} catch (error) {
			console.error(`Error loading full image for transfer (${mediaId}):`, error);
			return null;
		}
	}

	/**
	 * Build the wire payload for a tweet, attaching the full image when the
	 * tweet has media so receivers can store it in their own IndexedDB.
	 * @param {Object} tweet - A stored tweet object
	 * @returns {Promise<Object>} - Payload ready to send (without a `type`)
	 */
	async buildTweetPayload(tweet) {
		const payload = {
			username: tweet.username,
			content: tweet.content,
			timestamp: tweet.timestamp,
			id: tweet.id
		};

		if (tweet.authorId) {
			payload.authorId = tweet.authorId;
		}
		if (tweet.circle) {
			payload.circle = tweet.circle;
		}

		// Relay the original author's signature untouched so downstream peers can
		// verify it against the original author's key (not ours).
		if (tweet.authorKey) payload.authorKey = tweet.authorKey;
		if (tweet.signature) payload.signature = tweet.signature;

		if (tweet.mediaId) {
			payload.mediaId = tweet.mediaId;
			payload.mediaThumbnail = tweet.mediaThumbnail;
			payload.mediaType = tweet.mediaType;

			const fullImage = await this.getFullImageData(tweet.mediaId);
			if (fullImage) {
				payload.fullImage = fullImage;
			}
		}

		return payload;
	}

	/**
	 * Persist media that arrived inside a tweet payload into local IndexedDB.
	 * @param {Object} data - Incoming tweet payload (may contain fullImage)
	 */
	async storeIncomingMedia(data) {
		if (!data || !data.mediaId || !data.fullImage) return;
		// Only persist inline image data from peers, and bound its size so a
		// malicious peer cannot fill our IndexedDB / exhaust memory.
		if (typeof data.fullImage !== 'string' ||
			!data.fullImage.startsWith('data:image/') ||
			data.fullImage.length > this.MAX_FULLIMAGE_BYTES) {
			console.warn('Rejecting incoming media: not an inline image or too large', data.mediaId);
			return;
		}
		try {
			await this.mediaManager.storeReceivedMedia(data.mediaId, {
				type: data.mediaType,
				mimeType: data.mediaMimeType || null,
				thumbnail: data.mediaThumbnail || null,
				fullImage: data.fullImage
			});
		} catch (error) {
			console.error('Error storing incoming media:', error);
		}
	}

	/**
	 * Forward a freshly received tweet to our other connected peers (multi-hop
	 * relay). Peers that already have the tweet (per recipient tracking) and the
	 * peer we received it from are skipped, which prevents loops/storms.
	 * @param {Object} tweet - The stored tweet object to relay
	 * @param {string} fromPeerId - The peer we received this tweet from
	 */
	async relayTweet(tweet, fromPeerId) {
		const tweetId = tweet.id;

		// Circle (narrow-cast) messages are delivered only to their audience and
		// are deliberately not relayed across the wider mesh.
		if (tweet.circle) {
			return;
		}

		const relayData = await this.buildTweetPayload(tweet);
		relayData.type = 'tweet';

		const connections = this.peerManager.getAllConnections();

		connections.forEach(conn => {
			// Never echo back to the sender
			if (conn.peer === fromPeerId) return;

			// Skip peers already known to have this tweet
			if (this.tweetRecipients[tweetId] && this.tweetRecipients[tweetId].includes(conn.peer)) {
				return;
			}

			try {
				conn.send(relayData);

				if (!this.tweetRecipients[tweetId]) {
					this.tweetRecipients[tweetId] = [];
				}
				if (!this.tweetRecipients[tweetId].includes(conn.peer)) {
					this.tweetRecipients[tweetId].push(conn.peer);
				}

				if (this.unsentTweets[conn.peer]) {
					this.unsentTweets[conn.peer] = this.unsentTweets[conn.peer].filter(id => id !== tweetId);
				}

				console.log(`Relayed tweet ${tweetId} to peer ${conn.peer}`);
			} catch (error) {
				console.error(`Failed to relay tweet to peer ${conn.peer}:`, error);

				if (!this.unsentTweets[conn.peer]) {
					this.unsentTweets[conn.peer] = [];
				}
				if (!this.unsentTweets[conn.peer].includes(tweetId)) {
					this.unsentTweets[conn.peer].push(tweetId);
				}
			}
		});

		this.saveMessageDistributionState();
	}

	/**
	 * Remove distribution-tracking entries that reference tweets we no longer
	 * store. Returns the number of stale references removed.
	 * @returns {number}
	 */
	pruneDistributionState() {
		const existingIds = new Set(this.tweets.map(t => t.id));
		let pruned = 0;

		// Drop recipient records for tweets that no longer exist
		Object.keys(this.tweetRecipients).forEach(tweetId => {
			if (!existingIds.has(tweetId)) {
				delete this.tweetRecipients[tweetId];
				pruned++;
			}
		});

		// Drop unsent references to tweets that no longer exist
		Object.keys(this.unsentTweets).forEach(peerId => {
			const before = this.unsentTweets[peerId].length;
			this.unsentTweets[peerId] = this.unsentTweets[peerId].filter(id => existingIds.has(id));
			pruned += before - this.unsentTweets[peerId].length;
		});

		this.saveMessageDistributionState();
		return pruned;
	}

	/**
	 * Delete all tweets from the local database
	 * @returns {number} - Number of tweets deleted
	 */
	  async deleteAllTweets() {
		// Store media IDs for cleanup
		const mediaIds = this.tweets
		  .filter(tweet => tweet.mediaId)
		  .map(tweet => tweet.mediaId);
		
		const deletedCount = this.tweets.length;
		
		// Clear the tweets array
		this.tweets = [];
		
		// Clear distribution tracking
		this.tweetRecipients = {};
		this.unsentTweets = {};
		
		// Delete associated media (resilient: one failure doesn't abort the rest)
		for (const mediaId of mediaIds) {
		  try {
			await this.mediaManager.deleteMedia(mediaId);
		  } catch (error) {
			console.error(`Error deleting media ${mediaId} during tweet purge:`, error);
			// Continue even if a single media deletion fails
		  }
		}
		
		// Save the empty state
		this.saveTweets();
		this.saveMessageDistributionState();
		
		// Notify listeners
		if (typeof this.onTweetsUpdated === 'function') {
		  this.onTweetsUpdated();
		}
		
		return deletedCount;
	  }

	/**
	 * Broadcast a tweet to all connected peers
	 * @param {string} content - Tweet content
	 * @param {number} timestamp - Creation timestamp
	 * @param {string} tweetId - Tweet ID
	 * @param {string} mediaId
	 * @param {string} mediaThumbnail
	 * @param {string} mediaType
	 */
	  async broadcastTweet(content, timestamp, tweetId, mediaId = null, mediaThumbnail = null, mediaType = null, authorId = null, circleName = null, targetPeerIds = null, identity = {}) {
		const { username } = this.userManager.getUserInfo();

		const tweetData = {
		  type: 'tweet',
		  username: username,
		  content: content,
		  timestamp: timestamp,
		  id: tweetId
		};

		if (authorId) {
		  tweetData.authorId = authorId;
		}

		// Carry the identity proof so receivers can verify authorship.
		if (identity.authorKey) tweetData.authorKey = identity.authorKey;
		if (identity.signature) tweetData.signature = identity.signature;
		// Circle posts carry the audience name and are sent only to those peers;
		// they are intentionally not multi-hop relayed or bulk-synced.
		if (circleName) {
		  tweetData.circle = circleName;
		}

		// Add media data if present, including the full image so receiving peers
		// can persist it in their own IndexedDB (not just the thumbnail).
		if (mediaId) {
		  tweetData.mediaId = mediaId;
		  tweetData.mediaThumbnail = mediaThumbnail;
		  tweetData.mediaType = mediaType;

		  const fullImage = await this.getFullImageData(mediaId);
		  if (fullImage) {
			tweetData.fullImage = fullImage;
		  }
		}

		// Send to all connected peers, or only the targeted circle members
		const allConnections = this.peerManager.getAllConnections();
		const connections = targetPeerIds
		  ? allConnections.filter(conn => targetPeerIds.includes(conn.peer))
		  : allConnections;
		connections.forEach(conn => {
			try {
				conn.send(tweetData);

				// Mark as sent to this peer
				if (this.tweetRecipients[tweetId] && !this.tweetRecipients[tweetId].includes(conn.peer)) {
					this.tweetRecipients[tweetId].push(conn.peer);

					// Remove from unsent list if present
					if (this.unsentTweets[conn.peer]) {
						this.unsentTweets[conn.peer] = this.unsentTweets[conn.peer].filter(id => id !== tweetId);
					}
				}
			} catch (error) {
				console.error(`Failed to send tweet to peer ${conn.peer}:`, error);

				// Add to unsent tweets for this peer
				if (!this.unsentTweets[conn.peer]) {
					this.unsentTweets[conn.peer] = [];
				}
				if (!this.unsentTweets[conn.peer].includes(tweetId)) {
					this.unsentTweets[conn.peer].push(tweetId);
				}
			}
		});

		// Save the updated recipient and unsent tweet information
		this.saveMessageDistributionState();
	}

	/**
	 * Validate a tweet object
	 * @param {Object} tweet - The tweet to validate
	 * @returns {boolean} - Whether the tweet is valid
	 */
	  validateTweet(tweet) {
		// Existing validation
		if (!tweet || typeof tweet !== 'object') return false;
		
		// Tweet must have content, unless it has media
		if (!tweet.content && !tweet.mediaId) return false;
		
		// Check required properties
		if (!tweet.username || !tweet.timestamp) return false;

		// Validate types
		if (typeof tweet.username !== 'string' || 
			(tweet.content && typeof tweet.content !== 'string') ||
			typeof tweet.timestamp !== 'number') return false;

		// Bound the (peer-supplied) username so a malicious peer cannot ship a
		// multi-megabyte string and exhaust memory/storage.
		if (tweet.username.length === 0 || tweet.username.length > this.MAX_USERNAME_LENGTH) return false;

		// Check content length if present
		if (tweet.content && (tweet.content.length === 0 || tweet.content.length > this.MAX_TWEET_LENGTH)) return false;

		// Check media properties if mediaId is present
		if (tweet.mediaId) {
		  if (typeof tweet.mediaId !== 'string' ||
			  typeof tweet.mediaThumbnail !== 'string' ||
			  typeof tweet.mediaType !== 'string') {
			return false;
		  }
		  // The thumbnail is rendered directly as <img src>. Only allow inline
		  // image data URIs — never a remote URL (which would let a peer beacon
		  // every viewer's IP and break the app's "no tracking" promise) — and
		  // bound its size to avoid storage/memory abuse.
		  if (!tweet.mediaThumbnail.startsWith('data:image/')) return false;
		  if (tweet.mediaThumbnail.length > this.MAX_THUMBNAIL_BYTES) return false;
		  if (tweet.mediaId.length > 128) return false;
		}

		// Optional author id / circle audience must be strings if present
		if (tweet.authorId !== undefined && typeof tweet.authorId !== 'string') return false;
		if (tweet.authorId !== undefined && tweet.authorId.length > 128) return false;
		if (tweet.circle !== undefined && typeof tweet.circle !== 'string') return false;
		if (tweet.circle !== undefined && tweet.circle.length > this.MAX_CIRCLE_LENGTH) return false;

		// Identity fields: public key + signature must be bounded strings if present
		if (tweet.authorKey !== undefined &&
			(typeof tweet.authorKey !== 'string' || tweet.authorKey.length > this.MAX_KEY_B64)) return false;
		if (tweet.signature !== undefined &&
			(typeof tweet.signature !== 'string' || tweet.signature.length > this.MAX_KEY_B64)) return false;
		// verified / nameConflict are locally-derived booleans (never trusted from wire)
		if (tweet.verified !== undefined && typeof tweet.verified !== 'boolean') return false;
		if (tweet.nameConflict !== undefined && typeof tweet.nameConflict !== 'boolean') return false;

		// Check for unexpected properties
		const tweetProps = Object.keys(tweet);
		for (const prop of tweetProps) {
		  if (!this.VALID_TWEET_PROPS.includes(prop)) return false;
		}

		// Validate timestamp is not in the future
		const now = Date.now();
		if (tweet.timestamp > now + 60000) return false; // Allow 1 minute clock skew

		return true;
	  }

	/**
	 * Extract the exact set of fields that are covered by a message signature.
	 * Signer and verifier MUST agree on this — it is delegated to
	 * crypto-identity's canonical encoder. Accepts either a stored tweet or a
	 * raw wire payload.
	 * @param {Object} t
	 * @returns {Object}
	 */
	signedFields(t) {
		return {
			authorKey: t.authorKey || '',
			username: t.username || '',
			content: t.content || '',
			timestamp: t.timestamp || 0,
			id: t.id || '',
			mediaId: t.mediaId || '',
			circle: t.circle || ''
		};
	}

	/** Load the TOFU name registry from storage (call once at startup). */
	async loadNameRegistry() {
		try {
			this.nameRegistry = await this.storageManager.loadNameRegistry();
		} catch (err) {
			console.warn('Could not load name registry:', err);
			this.nameRegistry = {};
		}
	}

	/**
	 * Trust-on-first-use binding of a username to a public key. Only called for
	 * tweets whose signature has already verified. The first verified key seen
	 * for a name "owns" it locally; a later, different key using the same name is
	 * reported as a conflict (possible impersonator).
	 * @param {string} username
	 * @param {string} authorKey - verified public key (base64)
	 * @returns {Promise<boolean>} - true if this is a name/key conflict
	 */
	async pinAndCheckName(username, authorKey) {
		if (!username || !authorKey) return false;
		const existing = this.nameRegistry[username];
		if (!existing) {
			this.nameRegistry[username] = authorKey;
			try { await this.storageManager.saveNameRegistry(this.nameRegistry); } catch (_) {}
			return false;
		}
		return existing !== authorKey;
	}

	/**
	 * Claim our own username->key binding locally (if the name is still free), so
	 * a message arriving under our name but signed by a *different* key is flagged
	 * as an impersonator rather than silently trusted.
	 */
	async pinOwnIdentity() {
		const { username } = this.userManager.getUserInfo();
		const key = this.userManager.publicKey;
		if (!username || !key) return;
		if (!this.nameRegistry[username]) {
			this.nameRegistry[username] = key;
			try { await this.storageManager.saveNameRegistry(this.nameRegistry); } catch (_) {}
		}
	}

	/**
	 * Verify a received message's signature and resolve its trust state.
	 * @param {Object} data - raw wire payload (has authorKey/signature or not)
	 * @returns {Promise<{verified: boolean, nameConflict: boolean}>}
	 */
	async resolveTrust(data) {
		if (!data.authorKey || !data.signature) {
			// Unsigned (legacy / un-upgraded peer): accepted but never "verified".
			return { verified: false, nameConflict: false };
		}
		const ok = await verifySignature(data.authorKey, data.signature, this.signedFields(data));
		if (!ok) return { verified: false, nameConflict: false };
		const nameConflict = await this.pinAndCheckName(data.username, data.authorKey);
		return { verified: true, nameConflict };
	}

	/**
	 * Generate a unique ID for a tweet.
	 * Uses a fast, non-cryptographic 32-bit string hash (djb2-style) combined
	 * with the username and timestamp. This is for de-duplication only, not
	 * security — do not treat the ID as unguessable or collision-proof.
	 * @param {string} username - Author username
	 * @param {string} content - Tweet content
	 * @param {number} timestamp - Creation timestamp
	 * @returns {string} - Unique tweet ID
	 */
	generateUniqueId(username, content, timestamp) {
		// Create a string to hash that includes all relevant data
		const dataToHash = `${username}-${timestamp}-${content}-${this.userManager.peerId}`;

		// Simple 32-bit rolling string hash (not cryptographic)
		let hash = 0;
		for (let i = 0; i < dataToHash.length; i++) {
			const char = dataToHash.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}

		// Create a hex version of the hash and use it as the ID
		const hashHex = (hash >>> 0).toString(16);
		return `${username}-${timestamp}-${hashHex}`;
	}

	/**
	 * Ask a peer to send us any messages we don't already have (pull-based sync).
	 * We tell the peer which tweet IDs we already hold; the peer replies with the
	 * rest (including images). Both peers do this on connect, so the sync is
	 * mutual and does NOT depend on (possibly stale) local recipient tracking —
	 * this is what lets a peer who cleared their data get everything back.
	 * @param {Object} conn - PeerJS connection
	 */
	requestSync(conn) {
		try {
			conn.send({
				type: 'sync_request',
				knownIds: this.tweets.map(tweet => tweet.id)
			});
			console.log(`Requested sync from peer ${conn.peer} (we know ${this.tweets.length} tweets)`);
		} catch (error) {
			console.error(`Failed to send sync_request to peer ${conn.peer}:`, error);
		}
	}

	/**
	 * Handle a sync request: send the peer every tweet it doesn't already have.
	 * @param {Object} data - { knownIds: string[] }
	 * @param {Object} conn - PeerJS connection
	 */
	handleSyncRequest(data, conn) {
		const knownIds = Array.isArray(data.knownIds) ? new Set(data.knownIds) : new Set();
		const ourIds = new Set(this.tweets.map(tweet => tweet.id));

		// The requester told us what they already have — record that (only for
		// tweets we actually hold) so we don't keep queueing those for them.
		knownIds.forEach(id => {
			if (!ourIds.has(id)) return;
			if (!this.tweetRecipients[id]) {
				this.tweetRecipients[id] = [];
			}
			if (!this.tweetRecipients[id].includes(conn.peer)) {
				this.tweetRecipients[id].push(conn.peer);
			}
			if (this.unsentTweets[conn.peer]) {
				this.unsentTweets[conn.peer] = this.unsentTweets[conn.peer].filter(tid => tid !== id);
			}
		});

		// Only public tweets are bulk-synced; circle (narrow-cast) messages stay
		// within the audience they were originally sent to.
		const tweetsToSend = this.tweets.filter(tweet => !tweet.circle && !knownIds.has(tweet.id));

		if (tweetsToSend.length === 0) {
			console.log(`Peer ${conn.peer} is already up to date (${knownIds.size} tweets)`);
			this.saveMessageDistributionState();
			return;
		}

		console.log(`Peer ${conn.peer} is missing ${tweetsToSend.length} tweets — sending them`);
		this.sendTweetsToPeer(conn, tweetsToSend);
		this.saveMessageDistributionState();
	}

	/**
	 * Send tweets that a peer hasn't received yet, based on local tracking.
	 * Kept for compatibility; the pull-based requestSync/handleSyncRequest path
	 * is the primary sync mechanism on connect.
	 * @param {Object} conn - PeerJS connection
	 */
	sendSelectiveTweets(conn) {
		const peerId = conn.peer;

		// Determine which tweets this peer hasn't received yet
		let unsentTweetIds = [];
		if (this.unsentTweets[peerId] && this.unsentTweets[peerId].length > 0) {
			unsentTweetIds = [...this.unsentTweets[peerId]];
		}
		this.tweets.forEach(tweet => {
			if (!this.tweetRecipients[tweet.id] || !this.tweetRecipients[tweet.id].includes(peerId)) {
				if (!unsentTweetIds.includes(tweet.id)) {
					unsentTweetIds.push(tweet.id);
				}
			}
		});

		if (unsentTweetIds.length === 0) {
			console.log(`No unsent tweets for peer ${peerId}`);
			return;
		}

		const tweetsToSend = this.tweets.filter(tweet => unsentTweetIds.includes(tweet.id));
		this.sendTweetsToPeer(conn, tweetsToSend);
	}

	/**
	 * Send a specific list of tweets to a peer, batched and enriched with full
	 * images so the receiver can persist them in IndexedDB.
	 * @param {Object} conn - PeerJS connection
	 * @param {Array} tweetsToSend - Tweets to transmit
	 */
	sendTweetsToPeer(conn, tweetsToSend) {
		const peerId = conn.peer;

		if (!Array.isArray(tweetsToSend) || tweetsToSend.length === 0) {
			return;
		}

		console.log(`Sending ${tweetsToSend.length} tweets to peer ${peerId}`);

		// Split into smaller batches to avoid overwhelming the connection
		const BATCH_SIZE = 20;
		const batches = [];
		for (let i = 0; i < tweetsToSend.length; i += BATCH_SIZE) {
			batches.push(tweetsToSend.slice(i, i + BATCH_SIZE));
		}

		// Send tweets in batches with small delays between batches
		batches.forEach((batch, index) => {
			setTimeout(async () => {
				try {
					// Build sanitized wire payloads (carries the signature + full
					// image; omits local-only trust flags like `verified`).
					const enrichedTweets = await Promise.all(batch.map(tweet => this.buildTweetPayload(tweet)));

					conn.send({
						type: 'all_tweets',
						tweets: enrichedTweets
					});

					// Mark these tweets as sent to this peer
					batch.forEach(tweet => {
						if (!this.tweetRecipients[tweet.id]) {
							this.tweetRecipients[tweet.id] = [];
						}
						if (!this.tweetRecipients[tweet.id].includes(peerId)) {
							this.tweetRecipients[tweet.id].push(peerId);
						}
						if (this.unsentTweets[peerId]) {
							this.unsentTweets[peerId] = this.unsentTweets[peerId].filter(id => id !== tweet.id);
						}
					});

					this.saveMessageDistributionState();
					console.log(`Sent batch ${index + 1}/${batches.length} (${batch.length} tweets) to peer ${peerId}`);
				} catch (error) {
					console.error(`Failed to send tweets batch to peer ${peerId}:`, error);

					// If sending fails, keep these tweets in the unsent list
					batch.forEach(tweet => {
						if (!this.unsentTweets[peerId]) {
							this.unsentTweets[peerId] = [];
						}
						if (!this.unsentTweets[peerId].includes(tweet.id)) {
							this.unsentTweets[peerId].push(tweet.id);
						}
					});

					this.saveMessageDistributionState();
				}
			}, index * 500); // 500ms delay between batches
		});
	}

	/**
	 * Get all tweets
	 * @returns {Array} - All tweets
	 */
	getAllTweets() {
		return [...this.tweets];
	}

	/**
	 * Handle tweet message from a peer
	 * @param {Object} data - Message data
	 * @param {Object} conn - PeerJS connection
	 */
	async handleTweetMessage(data, conn) {
		try {
			// Validate the tweet data
			const tweetData = {
				username: data.username,
				content: data.content,
				timestamp: data.timestamp,
				id: data.id
			};

			// Preserve any attached media so it propagates to this peer too
			if (data.mediaId) {
				tweetData.mediaId = data.mediaId;
				tweetData.mediaThumbnail = data.mediaThumbnail;
				tweetData.mediaType = data.mediaType;
			}
			if (data.authorId) tweetData.authorId = data.authorId;
			if (data.circle) tweetData.circle = data.circle;
			if (data.authorKey) tweetData.authorKey = data.authorKey;
			if (data.signature) tweetData.signature = data.signature;

			if (!this.validateTweet(tweetData)) {
				console.error('Received invalid tweet from peer', conn.peer, data);
				return;
			}

			// Verify the signature (if any) and resolve trust state. A *present*
			// but invalid signature means the message was forged or tampered with
			// — drop it outright rather than show a forgery.
			const trust = await this.resolveTrust(data);
			if (data.signature && !trust.verified) {
				console.warn('Dropping tweet with invalid signature from peer', conn.peer);
				return;
			}

			// If the tweet has an ID, use it, otherwise generate one
			const tweetId = data.id || this.generateUniqueId(data.username, data.content, data.timestamp);

			// Is this the first time we've seen this tweet? (drives relay)
			const isNew = !this.tweets.some(t => t.id === tweetId);

			// Persist any full image that came along, into our own IndexedDB
			await this.storeIncomingMedia(data);

			// Add tweet to our database (including media metadata if present)
			this.addTweet(
				data.username,
				data.content,
				data.timestamp,
				null,
				tweetId,
				data.mediaId || null,
				data.mediaThumbnail || null,
				data.mediaType || null,
				data.authorId || null,
				data.circle || null,
				{ authorKey: data.authorKey || null, signature: data.signature || null,
				  verified: trust.verified, nameConflict: trust.nameConflict }
			);

			// Mark as received from this peer
			if (!this.tweetRecipients[tweetId]) {
				this.tweetRecipients[tweetId] = [];
			}
			if (!this.tweetRecipients[tweetId].includes(conn.peer)) {
				this.tweetRecipients[tweetId].push(conn.peer);
			}

			// Send an acknowledgment back
			conn.send({
				type: 'tweet_ack',
				id: tweetId
			});

			this.saveMessageDistributionState();

			// Notify listeners
			if (typeof this.onTweetsUpdated === 'function') {
				this.onTweetsUpdated();
			}

			// Multi-hop relay: forward newly seen tweets to our other peers
			if (isNew) {
				const storedTweet = this.tweets.find(t => t.id === tweetId);
				if (storedTweet) {
					await this.relayTweet(storedTweet, conn.peer);
				}
			}
		} catch (error) {
			console.error('Error handling tweet message:', error);
		}
	}

	/**
	 * Handle tweet acknowledgment message from a peer
	 * @param {Object} data - Message data
	 * @param {Object} conn - PeerJS connection
	 */
	handleTweetAckMessage(data, conn) {
		// Handle tweet acknowledgment
		if (data.id && this.tweetRecipients[data.id] && !this.tweetRecipients[data.id].includes(conn.peer)) {
			this.tweetRecipients[data.id].push(conn.peer);

			// If this peer had this tweet in their unsent list, remove it
			if (this.unsentTweets[conn.peer]) {
				this.unsentTweets[conn.peer] = this.unsentTweets[conn.peer].filter(id => id !== data.id);
			}

			this.saveMessageDistributionState();
		}
	}

	/**
	 * Handle all_tweets message from a peer
	 * @param {Object} data - Message data
	 * @param {Object} conn - PeerJS connection
	 */
	async handleAllTweetsMessage(data, conn) {
		try {
			// Validate the tweets array
			if (!Array.isArray(data.tweets)) {
				console.error('Received invalid tweets array from peer', conn.peer);
				return;
			}

			// Cap how many tweets we will process from a single message so a
			// malicious peer cannot pin the main thread with a giant array.
			const incomingTweets = data.tweets.slice(0, this.MAX_BULK_TWEETS);
			if (data.tweets.length > this.MAX_BULK_TWEETS) {
				console.warn(`Truncating bulk tweets from ${data.tweets.length} to ${this.MAX_BULK_TWEETS} from peer`, conn.peer);
			}

			// Track valid tweets and which ones are newly seen (for relay)
			const validTweetIds = [];
			const newlyAddedIds = [];

			// Process the received tweets
			for (const tweet of incomingTweets) {
				try {
					// Strip the transport-only full image before validating/storing the
					// tweet object itself (validateTweet rejects unexpected properties).
					const fullImage = tweet.fullImage || null;

					const cleanTweet = {
						username: tweet.username,
						content: tweet.content,
						timestamp: tweet.timestamp,
						id: tweet.id
					};
					if (tweet.mediaId) {
						cleanTweet.mediaId = tweet.mediaId;
						cleanTweet.mediaThumbnail = tweet.mediaThumbnail;
						cleanTweet.mediaType = tweet.mediaType;
					}
					if (tweet.authorId) cleanTweet.authorId = tweet.authorId;
					if (tweet.circle) cleanTweet.circle = tweet.circle;
					if (tweet.authorKey) cleanTweet.authorKey = tweet.authorKey;
					if (tweet.signature) cleanTweet.signature = tweet.signature;

					// Validate each tweet
					if (!this.validateTweet(cleanTweet)) {
						console.error('Skipping invalid tweet in bulk message:', tweet);
						continue;
					}

					// Verify signature (if present); drop forged/tampered ones.
					const trust = await this.resolveTrust(cleanTweet);
					if (cleanTweet.signature && !trust.verified) {
						console.warn('Skipping bulk tweet with invalid signature from peer', conn.peer);
						continue;
					}

					// Use the tweet's ID if provided, otherwise generate one
					const tweetId = cleanTweet.id || this.generateUniqueId(cleanTweet.username, cleanTweet.content, cleanTweet.timestamp);

					const isNew = !this.tweets.some(t => t.id === tweetId);

					// Persist any full image that came along, into our own IndexedDB
					if (cleanTweet.mediaId && fullImage) {
						await this.storeIncomingMedia({
							mediaId: cleanTweet.mediaId,
							mediaType: cleanTweet.mediaType,
							mediaThumbnail: cleanTweet.mediaThumbnail,
							fullImage
						});
					}

					// Add the tweet (including media metadata if present)
					this.addTweet(
						cleanTweet.username,
						cleanTweet.content,
						cleanTweet.timestamp,
						null,
						tweetId,
						cleanTweet.mediaId || null,
						cleanTweet.mediaThumbnail || null,
						cleanTweet.mediaType || null,
						cleanTweet.authorId || null,
						cleanTweet.circle || null,
						{ authorKey: cleanTweet.authorKey || null, signature: cleanTweet.signature || null,
						  verified: trust.verified, nameConflict: trust.nameConflict }
					);

					// Mark as received from this peer
					if (!this.tweetRecipients[tweetId]) {
						this.tweetRecipients[tweetId] = [];
					}
					if (!this.tweetRecipients[tweetId].includes(conn.peer)) {
						this.tweetRecipients[tweetId].push(conn.peer);
					}

					validTweetIds.push(tweetId);
					if (isNew) {
						newlyAddedIds.push(tweetId);
					}
				} catch (error) {
					console.error('Error processing individual tweet in bulk message:', error);
				}
			}

			// Send acknowledgment for all valid received tweets
			if (validTweetIds.length > 0) {
				conn.send({
					type: 'bulk_tweet_ack',
					ids: validTweetIds
				});
			}

			this.saveMessageDistributionState();

			// Notify listeners
			if (typeof this.onTweetsUpdated === 'function') {
				this.onTweetsUpdated();
			}

			// Multi-hop relay: forward newly seen tweets to our other peers
			for (const tweetId of newlyAddedIds) {
				const storedTweet = this.tweets.find(t => t.id === tweetId);
				if (storedTweet) {
					await this.relayTweet(storedTweet, conn.peer);
				}
			}
		} catch (error) {
			console.error('Error handling bulk tweet message:', error);
		}
	}

	/**
	 * Handle bulk_tweet_ack message from a peer
	 * @param {Object} data - Message data
	 * @param {Object} conn - PeerJS connection
	 */
	handleBulkTweetAckMessage(data, conn) {
		// Handle bulk acknowledgment of tweets
		if (data.ids && Array.isArray(data.ids)) {
			data.ids.forEach(tweetId => {
				if (this.tweetRecipients[tweetId] && !this.tweetRecipients[tweetId].includes(conn.peer)) {
					this.tweetRecipients[tweetId].push(conn.peer);
				}

				// If this peer had this tweet in their unsent list, remove it
				if (this.unsentTweets[conn.peer]) {
					this.unsentTweets[conn.peer] = this.unsentTweets[conn.peer].filter(id => id !== tweetId);
				}
			});

			this.saveMessageDistributionState();
		}
	}
}
