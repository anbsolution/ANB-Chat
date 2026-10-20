import sodium from 'libsodium-wrappers';

export type IdentityBundle = { publicKey: string; privateKey: string };
type Envelope = { v:number; nonce:string; cipher:string; senderCipher:string; senderPublicKey:string; recipientPublicKey:string };
const KEY_PREFIX = 'anbchat.identity.v1';
const MAX_ENVELOPE_CHARS = 3_000_000;
const MAX_PLAINTEXT_CHARS = 500_000;

function decodeKey(value:string, expectedBytes:number, label:string):Uint8Array {
  if (typeof value !== 'string' || value.length > 256) throw new Error(`Invalid ${label}`);
  let bytes:Uint8Array;
  try { bytes=sodium.from_base64(value); } catch { throw new Error(`Invalid ${label}`); }
  if (bytes.length !== expectedBytes) throw new Error(`Invalid ${label}`);
  return bytes;
}

/** Experimental MVP identity. Production builds must use OS-backed secure storage and key recovery. */
export async function createIdentity(): Promise<IdentityBundle> {
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  return { publicKey:sodium.to_base64(pair.publicKey), privateKey:sodium.to_base64(pair.privateKey) };
}
export function saveIdentity(email:string, bundle:IdentityBundle) {
  // Warning: localStorage is not a secure vault. Replace with Keychain/Android Keystore integration before production.
  localStorage.setItem(`${KEY_PREFIX}:${email.toLowerCase()}`, JSON.stringify(bundle));
}
/** Stable BLAKE2b fingerprint for comparing a contact key out-of-band. A fingerprint is not proof unless users compare it through a trusted channel. */
export async function keyFingerprint(publicKey:string):Promise<string> {
  await sodium.ready;
  let bytes: Uint8Array;
  try { bytes=sodium.from_base64(publicKey); } catch { throw new Error('Invalid public key encoding'); }
  if(bytes.length!==sodium.crypto_box_PUBLICKEYBYTES) throw new Error('Invalid public key length');
  const digest=sodium.crypto_hash(bytes);
  return sodium.to_hex(digest).toUpperCase().match(/.{1,4}/g)!.join(' ');
}

export function loadIdentity(email:string):IdentityBundle|null {
  try {
    const raw=localStorage.getItem(`${KEY_PREFIX}:${email.toLowerCase()}`);
    if (!raw || raw.length > 1024) return null;
    const value=JSON.parse(raw) as Partial<IdentityBundle>;
    if (typeof value.publicKey !== 'string' || typeof value.privateKey !== 'string') return null;
    // Structural validation only; OS-backed secure storage is still required for production.
    if (value.publicKey.length > 256 || value.privateKey.length > 256) return null;
    return { publicKey:value.publicKey, privateKey:value.privateKey };
  } catch { return null; }
}

/** Encrypts separate copies for the recipient and sender so the sender can see their own sent history. */
export async function encryptForRecipient(plaintext:string, recipientPublicKey:string, senderPrivateKey:string, senderPublicKey:string):Promise<string> {
  await sodium.ready;
  if (typeof plaintext !== 'string' || plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT_CHARS) throw new Error('Message is empty or exceeds the supported size');
  const recipientPub=decodeKey(recipientPublicKey,sodium.crypto_box_PUBLICKEYBYTES,'recipient public key');
  const senderPub=decodeKey(senderPublicKey,sodium.crypto_box_PUBLICKEYBYTES,'sender public key');
  const senderPriv=decodeKey(senderPrivateKey,sodium.crypto_box_SECRETKEYBYTES,'sender private key');
  if (!sodium.memcmp(sodium.crypto_scalarmult_base(senderPriv),senderPub)) throw new Error('Sender key pair does not match');
  const nonce=sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const recipientCipher=sodium.crypto_box_easy(plaintext, nonce, recipientPub, senderPriv);
  const senderCipher=sodium.crypto_box_easy(plaintext, nonce, senderPub, senderPriv);
  const envelope:Envelope={v:1,nonce:sodium.to_base64(nonce),cipher:sodium.to_base64(recipientCipher),senderCipher:sodium.to_base64(senderCipher),senderPublicKey,recipientPublicKey};
  return JSON.stringify(envelope);
}
export async function decryptFromSender(payload:string, senderPublicKey:string, recipientPrivateKey:string):Promise<string> {
  await sodium.ready;
  if (typeof payload !== 'string' || payload.length > MAX_ENVELOPE_CHARS) throw new Error('Invalid encrypted message envelope');
  let parsed: Partial<Envelope>;
  try { parsed=JSON.parse(payload) as Partial<Envelope>; }
  catch { throw new Error('Invalid encrypted message envelope'); }
  if(parsed.v!==1 || parsed.senderPublicKey!==senderPublicKey || typeof parsed.nonce!=='string' || typeof parsed.cipher!=='string' || typeof parsed.senderCipher!=='string' || typeof parsed.recipientPublicKey!=='string' || parsed.cipher.length > 2_000_000 || parsed.senderCipher.length > 2_000_000 || parsed.nonce.length > 128 || parsed.senderPublicKey.length > 256 || parsed.recipientPublicKey.length > 256) {
    throw new Error('Invalid encrypted message envelope');
  }
  let nonce: Uint8Array, recipientCipher: Uint8Array, senderCipher: Uint8Array;
  let senderPub: Uint8Array, recipientPub: Uint8Array, privateKey: Uint8Array;
  try {
    nonce=sodium.from_base64(parsed.nonce);
    recipientCipher=sodium.from_base64(parsed.cipher);
    senderCipher=sodium.from_base64(parsed.senderCipher);
    senderPub=sodium.from_base64(senderPublicKey);
    recipientPub=sodium.from_base64(parsed.recipientPublicKey);
    privateKey=sodium.from_base64(recipientPrivateKey);
  } catch { throw new Error('Invalid encrypted message encoding'); }
  if(nonce.length!==sodium.crypto_box_NONCEBYTES || recipientCipher.length<sodium.crypto_box_MACBYTES || senderCipher.length<sodium.crypto_box_MACBYTES) {
    throw new Error('Invalid encrypted message lengths');
  }
  if(senderPub.length!==sodium.crypto_box_PUBLICKEYBYTES || recipientPub.length!==sodium.crypto_box_PUBLICKEYBYTES || privateKey.length!==sodium.crypto_box_SECRETKEYBYTES) {
    throw new Error('Invalid encryption key length');
  }
  const localPublicKey=sodium.crypto_scalarmult_base(privateKey);
  // Do not fall back to the sender-copy when this key is the intended recipient's key.
  // A failed authenticated decryption must remain a failure, not trigger another path.
  if(sodium.memcmp(localPublicKey,recipientPub)) {
    try { return sodium.to_string(sodium.crypto_box_open_easy(recipientCipher,nonce,senderPub,privateKey)); }
    catch { throw new Error('Message authentication failed'); }
  }
  // The sender can decrypt their own history copy only with the matching sender keypair.
  if(!sodium.memcmp(localPublicKey,senderPub)) throw new Error('Message is not addressed to this key');
  try { return sodium.to_string(sodium.crypto_box_open_easy(senderCipher,nonce,senderPub,privateKey)); }
  catch { throw new Error('Message authentication failed'); }
}
