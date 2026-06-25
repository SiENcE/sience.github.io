// Cryptographic identity for SpellCast (P0).
//
// Identity is a keypair, not a name. The *public key* is the unforgeable
// identity; the username is just a self-asserted label pinned to a key on first
// sight (TOFU — see TweetManager's name registry). Every outgoing message is
// signed with the private key, and receivers verify the signature before
// accepting/relaying — so a peer can type any username but cannot forge another
// identity's messages.
//
// We use ECDSA P-256 + SHA-256 because it is supported in every current browser
// WebCrypto implementation (Ed25519 support is still uneven). The private key is
// generated non-extractable and stored as a structured-cloned CryptoKey in
// IndexedDB, so it can sign but can never be read out of the key store by script
// (e.g. via XSS). That also means it cannot be exported for backup — credentials
// portability (a passphrase-encrypted export / mnemonic) is the separate P1
// task on the roadmap.

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' };
const ECDH_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
const SIGNED_PREFIX = 'spellcast-tweet-v1';
const PBKDF2_ITERATIONS = 250000;

/** Derive an AES-GCM key from a passphrase via PBKDF2-SHA-256. */
async function deriveAesKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const s = subtle();
  const baseKey = await s.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function subtle() {
  return (globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto.subtle : null;
}

/** Whether WebCrypto is usable (needs a secure context: https or localhost). */
export function cryptoAvailable() {
  return !!subtle();
}

/**
 * A random alphanumeric token from a CSPRNG (falls back to Math.random only if
 * getRandomValues is somehow unavailable). Used for local de-dup ids (peer/media/
 * circle) where Math.random previously risked predictable/colliding ids.
 * @param {number} nChars
 * @returns {string}
 */
export function randomToken(nChars = 16) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const n = Math.max(1, nChars);
  let bytes;
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    bytes = globalThis.crypto.getRandomValues(new Uint8Array(n));
  } else {
    bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// ---- base64 <-> ArrayBuffer helpers ----
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Canonical byte representation of the *signed* fields of a message. Both the
 * signer and the verifier MUST build this identically, so it is a fixed-order
 * array (no object key-order ambiguity) and absent fields normalise to '' / 0.
 * The username is signed too, so a relay cannot swap the name on a signed post.
 * Note: media thumbnail/full image bytes are NOT signed (only the mediaId is);
 * relay-time image substitution is a lesser, separately-tracked concern.
 */
function canonicalBytes(fields) {
  const canonical = JSON.stringify([
    SIGNED_PREFIX,
    fields.authorKey || '',
    fields.username || '',
    fields.content || '',
    fields.timestamp || 0,
    fields.id || '',
    fields.mediaId || '',
    fields.circle || ''
  ]);
  return new TextEncoder().encode(canonical);
}

/**
 * Short, key-derived fingerprint (4 hex chars) used to build the human handle
 * `username#fingerprint`. It visually disambiguates two users sharing a name;
 * it is NOT the security boundary (that is the signature + full-key TOFU pin),
 * so a fast synchronous string hash of the public key is sufficient and keeps
 * rendering synchronous.
 */
export function fingerprint(publicKeyB64) {
  if (!publicKeyB64) return '----';
  let hash = 0;
  for (let i = 0; i < publicKeyB64.length; i++) {
    hash = ((hash << 5) - hash + publicKeyB64.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 4);
}

/** Build the display handle `username#fingerprint`. */
export function handleFor(username, publicKeyB64) {
  if (!publicKeyB64) return username || 'unknown';
  return `${username}#${fingerprint(publicKeyB64)}`;
}

// ---- Reactions ("Spark") — signed so counts can't be forged ----
const REACTION_PREFIX = 'spellcast-reaction-v1';

function reactionBytes(f) {
  return new TextEncoder().encode(JSON.stringify([
    REACTION_PREFIX, f.reactorKey || '', f.tweetId || '', f.active ? 1 : 0, f.timestamp || 0
  ]));
}

/** Verify a reaction signature against the reactor's public key. */
export async function verifyReaction(reactorKeyB64, signatureB64, fields) {
  const s = subtle();
  if (!s || !reactorKeyB64 || !signatureB64) return false;
  try {
    const pub = await s.importKey('raw', b64ToBuf(reactorKeyB64), ALGO, true, ['verify']);
    return await s.verify(SIGN_ALGO, pub, b64ToBuf(signatureB64), reactionBytes(fields));
  } catch (err) {
    return false;
  }
}

/** Verify a signature (base64) over a message's signed fields. */
export async function verifySignature(publicKeyB64, signatureB64, fields) {
  const s = subtle();
  if (!s || !publicKeyB64 || !signatureB64) return false;
  try {
    const pubKey = await s.importKey('raw', b64ToBuf(publicKeyB64), ALGO, true, ['verify']);
    return await s.verify(SIGN_ALGO, pubKey, b64ToBuf(signatureB64), canonicalBytes(fields));
  } catch (err) {
    console.warn('Signature verification error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message confidentiality for circle (narrow-cast) posts (P3).
//
// Circle posts are encrypted to each recipient's *encryption* public key (an
// ECDH P-256 key, separate from the ECDSA signing key) using a multi-recipient
// sealed box: one random AES-GCM content key encrypts the payload once, and that
// content key is wrapped per recipient via ephemeral-static ECDH (ECIES). An
// ephemeral sender key per message gives forward secrecy. Because each message
// is sealed to the *current* member set, there is no long-lived group key to
// rotate — removing a member simply excludes them from future messages.
// ---------------------------------------------------------------------------

/** Derive an AES-GCM key from an ECDH shared secret (SHA-256 as a simple KDF). */
async function deriveSharedAesKey(privKey, peerEcdhPubB64) {
  const s = subtle();
  const peerPub = await s.importKey('raw', b64ToBuf(peerEcdhPubB64), ECDH_ALGO, false, []);
  const bits = await s.deriveBits({ name: 'ECDH', public: peerPub }, privKey, 256);
  const keyBytes = await s.digest('SHA-256', bits);
  return s.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Stable short id of a recipient's enc public key, used to index wrapped keys. */
async function recipientKeyId(encPubB64) {
  const s = subtle();
  const h = await s.digest('SHA-256', new TextEncoder().encode('spellcast-rcpt|' + encPubB64));
  const bytes = new Uint8Array(h).slice(0, 8);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Seal a plaintext string for a set of recipient ECDH public keys.
 * @param {string} plaintext
 * @param {string[]} recipientEncPubB64s
 * @returns {Promise<Object|null>} envelope { v, epk, iv, ct, keys } or null
 */
export async function sealForRecipients(plaintext, recipientEncPubB64s) {
  const s = subtle();
  if (!s) return null;
  const recipients = (recipientEncPubB64s || []).filter(Boolean);
  if (recipients.length === 0) return null;

  // Ephemeral sender keypair (forward secrecy) + random content key.
  const eph = await s.generateKey(ECDH_ALGO, true, ['deriveBits']);
  const epkB64 = bufToB64(await s.exportKey('raw', eph.publicKey));
  const cekRaw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const cek = await s.importKey('raw', cekRaw, { name: 'AES-GCM' }, false, ['encrypt']);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await s.encrypt({ name: 'AES-GCM', iv }, cek, new TextEncoder().encode(plaintext));

  const keys = {};
  for (const rpub of recipients) {
    try {
      const wrapKey = await deriveSharedAesKey(eph.privateKey, rpub);
      const wiv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const wct = await s.encrypt({ name: 'AES-GCM', iv: wiv }, wrapKey, cekRaw);
      keys[await recipientKeyId(rpub)] = { iv: bufToB64(wiv), ct: bufToB64(wct) };
    } catch (err) {
      console.warn('seal: skipping a recipient (bad enc key?)', err);
    }
  }
  if (Object.keys(keys).length === 0) return null;
  return { v: 1, epk: epkB64, iv: bufToB64(iv), ct: bufToB64(ct), keys };
}

/**
 * A user's own identity: an ECDSA signing keypair (the identity used everywhere)
 * plus an ECDH encryption keypair (for receiving sealed circle posts). Private
 * keys are CryptoKeys held in IndexedDB; public keys are base64 raw exports.
 */
export class CryptoIdentity {
  constructor(privateKey, publicKeyB64, encPrivateKey = null, encPublicKeyB64 = null) {
    this.privateKey = privateKey;         // ECDSA signing private CryptoKey, or null
    this.publicKeyB64 = publicKeyB64;     // base64 raw ECDSA public key, or null
    this.encPrivateKey = encPrivateKey;   // ECDH private CryptoKey (decryption), or null
    this.encPublicKeyB64 = encPublicKeyB64; // base64 raw ECDH public key, or null
  }

  get available() {
    return !!(this.privateKey && this.publicKeyB64);
  }

  /** Whether this identity can receive encrypted (sealed) circle posts. */
  get canDecrypt() {
    return !!(this.encPrivateKey && this.encPublicKeyB64);
  }

  /**
   * Generate a fresh identity: an ECDSA signing keypair *and* an ECDH encryption
   * keypair. Both private keys are generated **extractable** so they can go into
   * a passphrase-encrypted backup file (credentials portability). The residual
   * risk — XSS could in principle export them — is accepted in exchange for
   * recoverable credentials; the backup file itself is always encrypted (see
   * exportEncrypted).
   */
  static async generate() {
    const s = subtle();
    if (!s) return new CryptoIdentity(null, null);
    const pair = await s.generateKey(ALGO, true, ['sign', 'verify']);
    const encPair = await s.generateKey(ECDH_ALGO, true, ['deriveBits']);
    const publicKeyB64 = bufToB64(await s.exportKey('raw', pair.publicKey));
    const encPublicKeyB64 = bufToB64(await s.exportKey('raw', encPair.publicKey));
    return new CryptoIdentity(pair.privateKey, publicKeyB64, encPair.privateKey, encPublicKeyB64);
  }

  /** Decrypt a sealed circle-post envelope addressed to us; null if not for us. */
  async openSealed(envelope) {
    const s = subtle();
    if (!s || !this.encPrivateKey || !envelope || !envelope.keys) return null;
    try {
      const id = await recipientKeyId(this.encPublicKeyB64);
      const entry = envelope.keys[id];
      if (!entry) return null; // we are not a recipient
      const wrapKey = await deriveSharedAesKey(this.encPrivateKey, envelope.epk);
      const cekRaw = await s.decrypt({ name: 'AES-GCM', iv: b64ToBuf(entry.iv) }, wrapKey, b64ToBuf(entry.ct));
      const cek = await s.importKey('raw', cekRaw, { name: 'AES-GCM' }, false, ['decrypt']);
      const plain = await s.decrypt({ name: 'AES-GCM', iv: b64ToBuf(envelope.iv) }, cek, b64ToBuf(envelope.ct));
      return new TextDecoder().decode(plain);
    } catch (err) {
      console.warn('Failed to open sealed circle post:', err);
      return null;
    }
  }

  /**
   * Produce an encrypted backup of this identity as a JSON-serialisable object.
   * The private key (JWK) + identifying metadata are encrypted with a key
   * derived from the user's passphrase (PBKDF2-SHA-256 → AES-GCM), so the file
   * is useless without the passphrase.
   * @param {string} passphrase
   * @param {{username?: string, peerId?: string}} meta
   * @returns {Promise<Object>} backup envelope (safe to write to a file)
   */
  async exportEncrypted(passphrase, meta = {}) {
    const s = subtle();
    if (!s) throw new Error('WebCrypto unavailable (need HTTPS or localhost).');
    if (!this.privateKey) throw new Error('No credentials to export.');
    if (!passphrase) throw new Error('A passphrase is required.');

    let jwk, encJwk = null;
    try {
      jwk = await s.exportKey('jwk', this.privateKey);
      if (this.encPrivateKey) encJwk = await s.exportKey('jwk', this.encPrivateKey);
    } catch (err) {
      throw new Error('These credentials predate backup support and cannot be exported. '
        + '(They were created with a non-extractable key.)');
    }

    const payload = new TextEncoder().encode(JSON.stringify({
      username: meta.username || '',
      peerId: meta.peerId || '',
      publicKeyB64: this.publicKeyB64,
      privateKeyJwk: jwk,
      encPublicKeyB64: this.encPublicKeyB64 || null,
      encPrivateKeyJwk: encJwk
    }));

    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await deriveAesKey(passphrase, salt);
    const cipher = await s.encrypt({ name: 'AES-GCM', iv }, aesKey, payload);

    return {
      type: 'spellcast-identity-backup',
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: bufToB64(salt),
      iv: bufToB64(iv),
      data: bufToB64(cipher),
      // Cleartext hint only (not trusted on import — the encrypted blob wins):
      hint: { username: meta.username || '', fingerprint: fingerprint(this.publicKeyB64) }
    };
  }

  /**
   * Decrypt a backup envelope and reconstruct the identity (private key imported
   * extractable so it can be re-exported later).
   * @param {Object} envelope - parsed backup file
   * @param {string} passphrase
   * @returns {Promise<{identity: CryptoIdentity, username: string, peerId: string}>}
   */
  static async importEncrypted(envelope, passphrase) {
    const s = subtle();
    if (!s) throw new Error('WebCrypto unavailable (need HTTPS or localhost).');
    if (!envelope || envelope.type !== 'spellcast-identity-backup') {
      throw new Error('Not a SpellCast credential backup file.');
    }
    if (!passphrase) throw new Error('A passphrase is required.');

    const salt = new Uint8Array(b64ToBuf(envelope.salt));
    const iv = new Uint8Array(b64ToBuf(envelope.iv));
    const aesKey = await deriveAesKey(passphrase, salt, envelope.iterations || PBKDF2_ITERATIONS);

    let plainBuf;
    try {
      plainBuf = await s.decrypt({ name: 'AES-GCM', iv }, aesKey, b64ToBuf(envelope.data));
    } catch (err) {
      throw new Error('Wrong passphrase or corrupted backup file.');
    }

    const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
    const privateKey = await s.importKey('jwk', parsed.privateKeyJwk, ALGO, true, ['sign']);
    let encPrivateKey = null;
    if (parsed.encPrivateKeyJwk) {
      encPrivateKey = await s.importKey('jwk', parsed.encPrivateKeyJwk, ECDH_ALGO, true, ['deriveBits']);
    }
    const identity = new CryptoIdentity(privateKey, parsed.publicKeyB64, encPrivateKey, parsed.encPublicKeyB64 || null);
    return { identity, username: parsed.username || '', peerId: parsed.peerId || '' };
  }

  /** Sign a reaction; returns a base64 signature (or null). */
  async signReaction(fields) {
    const s = subtle();
    if (!s || !this.privateKey) return null;
    try {
      return bufToB64(await s.sign(SIGN_ALGO, this.privateKey, reactionBytes(fields)));
    } catch (err) {
      console.warn('Reaction signing error:', err);
      return null;
    }
  }

  /** Sign a message's signed fields; returns a base64 signature (or null). */
  async sign(fields) {
    const s = subtle();
    if (!s || !this.privateKey) return null;
    try {
      const sig = await s.sign(SIGN_ALGO, this.privateKey, canonicalBytes(fields));
      return bufToB64(sig);
    } catch (err) {
      console.warn('Signing error:', err);
      return null;
    }
  }

  handle(username) {
    return handleFor(username, this.publicKeyB64);
  }
}
