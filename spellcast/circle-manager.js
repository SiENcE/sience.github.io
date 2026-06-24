// Manages "circles" — local, named groups of peers used to organize the feed
// and to narrow-cast messages to a subset of peers.
//
// Circles are a LOCAL construct: each client defines its own circles and
// membership. They are an organizational/audience tool, not an access-control
// or privacy boundary (a narrow-cast message can still be read by any peer it
// reaches). Feed filtering matches a message's author peer ID against a
// circle's members, which stays consistent regardless of what other clients
// name their own circles.

import { StorageManager } from './storage-manager.js';

export class CircleManager {
  constructor(storageManager) {
    this.storageManager = storageManager;

    // Array of { id, name, peerIds: [] }
    this.circles = [];

    // Listeners notified when circles change (UI hook)
    this.onCirclesUpdated = null;
  }

  /**
   * Load circles from persistent storage
   */
  async loadCircles() {
    const saved = await this.storageManager.loadFromStorage(StorageManager.KEYS.CIRCLES);
    if (Array.isArray(saved)) {
      this.circles = saved;
    }
    this.notifyUpdated();
  }

  /**
   * Persist circles to storage
   */
  async saveCircles() {
    await this.storageManager.saveToStorage(StorageManager.KEYS.CIRCLES, this.circles);
  }

  notifyUpdated() {
    if (typeof this.onCirclesUpdated === 'function') {
      this.onCirclesUpdated();
    }
  }

  /**
   * Generate a unique-ish circle id without relying on Date.now()/Math.random()
   * being globally unique (a short random suffix is plenty for local ids).
   */
  generateId() {
    const rand = Math.random().toString(36).slice(2, 8);
    return `circle_${Date.now()}_${rand}`;
  }

  getCircles() {
    return this.circles.map(c => ({ ...c, peerIds: [...c.peerIds] }));
  }

  getCircle(circleId) {
    return this.circles.find(c => c.id === circleId) || null;
  }

  /**
   * Create a new circle
   * @param {string} name
   * @returns {Object} the created circle
   */
  createCircle(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Circle name is required');
    }

    const circle = {
      id: this.generateId(),
      name: trimmed,
      peerIds: []
    };

    this.circles.push(circle);
    this.saveCircles();
    this.notifyUpdated();
    return circle;
  }

  /**
   * Rename a circle
   */
  renameCircle(circleId, newName) {
    const circle = this.getCircle(circleId);
    const trimmed = (newName || '').trim();
    if (circle && trimmed) {
      circle.name = trimmed;
      this.saveCircles();
      this.notifyUpdated();
    }
  }

  /**
   * Delete a circle
   */
  deleteCircle(circleId) {
    const before = this.circles.length;
    this.circles = this.circles.filter(c => c.id !== circleId);
    if (this.circles.length !== before) {
      this.saveCircles();
      this.notifyUpdated();
    }
  }

  /**
   * Add a peer to a circle
   */
  addPeerToCircle(circleId, peerId) {
    const circle = this.getCircle(circleId);
    if (circle && peerId && !circle.peerIds.includes(peerId)) {
      circle.peerIds.push(peerId);
      this.saveCircles();
      this.notifyUpdated();
    }
  }

  /**
   * Remove a peer from a circle
   */
  removePeerFromCircle(circleId, peerId) {
    const circle = this.getCircle(circleId);
    if (circle) {
      const before = circle.peerIds.length;
      circle.peerIds = circle.peerIds.filter(id => id !== peerId);
      if (circle.peerIds.length !== before) {
        this.saveCircles();
        this.notifyUpdated();
      }
    }
  }

  /**
   * Remove a peer from ALL circles (used when a peer is removed entirely)
   */
  removePeerEverywhere(peerId) {
    let changed = false;
    this.circles.forEach(circle => {
      const before = circle.peerIds.length;
      circle.peerIds = circle.peerIds.filter(id => id !== peerId);
      if (circle.peerIds.length !== before) changed = true;
    });
    if (changed) {
      this.saveCircles();
      this.notifyUpdated();
    }
  }

  /**
   * Member peer IDs of a circle (empty array if circle not found)
   */
  getMemberPeerIds(circleId) {
    const circle = this.getCircle(circleId);
    return circle ? [...circle.peerIds] : [];
  }

  /**
   * Whether a given peer is a member of a circle
   */
  isMember(circleId, peerId) {
    const circle = this.getCircle(circleId);
    return !!(circle && circle.peerIds.includes(peerId));
  }
}
