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

  /** Generate a fresh keypair (private key non-extractable). */
  static async generate() {
    const s = subtle();
    if (!s) return new CryptoIdentity(null, null);
    const pair = await s.generateKey(ALGO, false, ['sign', 'verify']);
    const publicKeyB64 = bufToB64(await s.exportKey('raw', pair.publicKey));
    return new CryptoIdentity(pair.privateKey, publicKeyB64);
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
