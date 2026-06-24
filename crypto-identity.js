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
// (e.g. via XSS). That also means it cannot be exported for backup — account
// portability (a passphrase-encrypted export / mnemonic) is the separate P1
// task on the roadmap.

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' };
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

/**
 * A user's own signing identity. Holds the non-extractable private CryptoKey
 * plus the exported public key (base64) used as the identity everywhere.
 */
export class CryptoIdentity {
  constructor(privateKey, publicKeyB64) {
    this.privateKey = privateKey;     // non-extractable CryptoKey, or null
    this.publicKeyB64 = publicKeyB64; // base64 of the raw public key, or null
  }

  get available() {
    return !!(this.privateKey && this.publicKeyB64);
  }

  /**
   * Generate a fresh keypair. The private key is generated **extractable** so it
   * can be exported into a passphrase-encrypted backup file (account
   * portability). The residual risk — XSS could in principle export it — is
   * accepted in exchange for the user being able to recover/move their account;
   * the backup file itself is always encrypted (see exportEncrypted).
   */
  static async generate() {
    const s = subtle();
    if (!s) return new CryptoIdentity(null, null);
    const pair = await s.generateKey(ALGO, true, ['sign', 'verify']);
    const publicKeyB64 = bufToB64(await s.exportKey('raw', pair.publicKey));
    return new CryptoIdentity(pair.privateKey, publicKeyB64);
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
    if (!this.privateKey) throw new Error('No identity to export.');
    if (!passphrase) throw new Error('A passphrase is required.');

    let jwk;
    try {
      jwk = await s.exportKey('jwk', this.privateKey);
    } catch (err) {
      throw new Error('This identity predates backup support and cannot be exported. '
        + '(It was created with a non-extractable key.)');
    }

    const payload = new TextEncoder().encode(JSON.stringify({
      username: meta.username || '',
      peerId: meta.peerId || '',
      publicKeyB64: this.publicKeyB64,
      privateKeyJwk: jwk
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
      throw new Error('Not a SpellCast identity backup file.');
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
    const identity = new CryptoIdentity(privateKey, parsed.publicKeyB64);
    return { identity, username: parsed.username || '', peerId: parsed.peerId || '' };
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
