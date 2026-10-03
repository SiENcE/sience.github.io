// First, add a RateLimiter utility class to handle rate limiting functionality
// Create a new file called rate-limiter.js

export class RateLimiter {
  constructor() {
    // Map of action types to their rate limit records
    this.limits = new Map();
  }

  /**
   * Check if an action is allowed under rate limiting
   * @param {string} actionType - Type of action (e.g., 'connect', 'message')
   * @param {string} identifier - Unique identifier (e.g., peerId, userId)
   * @param {number} maxAttempts - Maximum attempts allowed in the time window
   * @param {number} timeWindowMs - Time window in milliseconds
   * @returns {boolean} - Whether the action is allowed
   */
  isAllowed(actionType, identifier, maxAttempts, timeWindowMs) {
    const key = `${actionType}:${identifier}`;

    // Initialize or get limit record
    if (!this.limits.has(key)) {
      this.limits.set(key, {
        attempts: [],
        blocked: false,
        blockedUntil: 0
      });
    }

    const record = this.limits.get(key);
    const now = Date.now();

    // Check if currently blocked
    if (record.blocked) {
      if (now < record.blockedUntil) {
        return false;
      }
      // Unblock if block period has passed
      record.blocked = false;
    }

    // Clean up old attempts outside the time window
    record.attempts = record.attempts.filter(timestamp =>
      now - timestamp < timeWindowMs
    );

    // Check if too many attempts
    if (record.attempts.length >= maxAttempts) {
      // Block for twice the time window
      record.blocked = true;
      record.blockedUntil = now + (timeWindowMs * 2);
      return false;
    }

    // Add current attempt
    record.attempts.push(now);
    return true;
  }

  /**
   * Get remaining time before an action is allowed again
   * @param {string} actionType - Type of action
   * @param {string} identifier - Unique identifier
   * @returns {number} - Milliseconds until allowed, or 0 if allowed now
   */
  getTimeUntilAllowed(actionType, identifier) {
    const key = `${actionType}:${identifier}`;

    if (!this.limits.has(key)) {
      return 0;
    }

    const record = this.limits.get(key);
    const now = Date.now();

    if (record.blocked && now < record.blockedUntil) {
      return record.blockedUntil - now;
    }

    return 0;
  }

  /**
   * Reset rate limiting for a specific action and identifier
   * @param {string} actionType - Type of action
   * @param {string} identifier - Unique identifier
   */
  reset(actionType, identifier) {
    const key = `${actionType}:${identifier}`;
    this.limits.delete(key);
  }
}
