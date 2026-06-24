// Manages tweets and message distribution

import { StorageManager } from './storage-manager.js';
import { RateLimiter } from './rate-limiter.js';

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
		this.VALID_TWEET_PROPS = [
		  'id', 'username', 'content', 'timestamp', 'mediaId', 'mediaThumbnail', 'mediaType',
		  'authorId', 'circle'
		]; // Updated valid properties (authorId = author's peer ID, circle = audience name)

		// Add rate limiter instance
		this.rateLimiter = new RateLimiter();

		// Rate limiting constants
		this.MESSAGE_MAX_COUNT = 10;     // Maximum messages
		this.MESSAGE_TIME_WINDOW_MS = 60000; // 1 minute window

		// State
		this.tweets = [];
		this.tweetRecipients = {}; // Maps tweet IDs to arrays of peer IDs who have received it
		this.unsentTweets = {};    // Maps peer IDs to arrays of tweet IDs that need to be sent

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

		// Add tweet locally (with author id and, for circle posts, the audience name)
		this.addTweet(username, content, timestamp, connectedPeerIds, tweetId, mediaId, mediaThumbnail, mediaType, peerId, circleName);

		// Send to peers (awaits loading the full image for transfer)
		await this.broadcastTweet(content, timestamp, tweetId, mediaId, mediaThumbnail, mediaType, peerId, circleName, targetPeerIds);

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
	  addTweet(username, content, timestamp, recipients = null, id = null, mediaId = null, mediaThumbnail = null, mediaType = null, authorId = null, circle = null) {
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
	  async broadcastTweet(content, timestamp, tweetId, mediaId = null, mediaThumbnail = null, mediaType = null, authorId = null, circleName = null, targetPeerIds = null) {
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

		// Check content length if present
		if (tweet.content && (tweet.content.length === 0 || tweet.content.length > this.MAX_TWEET_LENGTH)) return false;

		// Check media properties if mediaId is present
		if (tweet.mediaId) {
		  if (typeof tweet.mediaId !== 'string' ||
			  typeof tweet.mediaThumbnail !== 'string' ||
			  typeof tweet.mediaType !== 'string') {
			return false;
		  }
		}

		// Optional author id / circle audience must be strings if present
		if (tweet.authorId !== undefined && typeof tweet.authorId !== 'string') return false;
		if (tweet.circle !== undefined && typeof tweet.circle !== 'string') return false;

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
					// Attach the full image to any media tweets so the receiving
					// peer can store it in its own IndexedDB (not just the thumbnail).
					const enrichedTweets = await Promise.all(batch.map(async (tweet) => {
						if (!tweet.mediaId) return tweet;
						const fullImage = await this.getFullImageData(tweet.mediaId);
						return fullImage ? { ...tweet, fullImage } : tweet;
					}));

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

			if (!this.validateTweet(tweetData)) {
				console.error('Received invalid tweet from peer', conn.peer, data);
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
				data.circle || null
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

			// Track valid tweets and which ones are newly seen (for relay)
			const validTweetIds = [];
			const newlyAddedIds = [];

			// Process the received tweets
			for (const tweet of data.tweets) {
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

					// Validate each tweet
					if (!this.validateTweet(cleanTweet)) {
						console.error('Skipping invalid tweet in bulk message:', tweet);
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
						cleanTweet.circle || null
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
