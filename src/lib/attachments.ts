import sodium from 'libsodium-wrappers';
import { supabase } from './supabase';

export const ATTACHMENT_MARKER = 'ANB_ATTACHMENT_V1:';
export const ATTACHMENT_BUCKET = 'anb-chat-attachments';
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AttachmentMetadata = {
  v: 1; path: string; name: string; mime: string; size: number; nonce: string;
  keyNonce: string; recipientKeyCipher: string; senderKeyCipher: string;
  senderPublicKey: string; recipientPublicKey: string;
};

function fromB64(value: string, max = 256) {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid attachment encryption metadata.');
  return sodium.from_base64(value);
}

/** Encrypts file bytes locally; only ciphertext is uploaded to the private Supabase bucket. */
export async function encryptAndUploadAttachment(file: File, args: {
  senderId: string; recipientId: string; senderPublicKey: string; senderPrivateKey: string; recipientPublicKey: string;
}): Promise<AttachmentMetadata> {
  await sodium.ready;
  if (!supabase) throw new Error('Configure Supabase before sharing attachments.');
  if (!UUID_RE.test(args.senderId) || !UUID_RE.test(args.recipientId) || args.senderId === args.recipientId) throw new Error('Invalid attachment participants.');
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) throw new Error('Choose a file smaller than 20 MB.');
  const allowed = file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf' || file.type.startsWith('text/') || file.type === 'application/zip' || file.type === 'application/octet-stream' || file.type.includes('officedocument') || file.type.includes('spreadsheet') || file.type.includes('presentation');
  if (!allowed) throw new Error('This file type is not supported. Choose an image, video, document, or common file.');
  const senderPub = fromB64(args.senderPublicKey);
  const senderPriv = fromB64(args.senderPrivateKey);
  const recipientPub = fromB64(args.recipientPublicKey);
  if (senderPub.length !== sodium.crypto_box_PUBLICKEYBYTES || senderPriv.length !== sodium.crypto_box_SECRETKEYBYTES || recipientPub.length !== sodium.crypto_box_PUBLICKEYBYTES) throw new Error('Invalid account encryption keys.');
  if (!sodium.memcmp(sodium.crypto_scalarmult_base(senderPriv), senderPub)) throw new Error('Sender key pair does not match.');
  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = sodium.crypto_secretbox_easy(new Uint8Array(await file.arrayBuffer()), nonce, key);
  const keyNonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const recipientKeyCipher = sodium.crypto_box_easy(key, keyNonce, recipientPub, senderPriv);
  const senderKeyCipher = sodium.crypto_box_easy(key, keyNonce, senderPub, senderPriv);
  const safeName = file.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180) || 'attachment';
  const path = `${args.senderId}/${args.recipientId}/${crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, new Blob([encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream', upsert: false });
  if (error) throw error;
  return { v: 1, path, name: safeName, mime: file.type || 'application/octet-stream', size: file.size,
    nonce: sodium.to_base64(nonce), keyNonce: sodium.to_base64(keyNonce),
    recipientKeyCipher: sodium.to_base64(recipientKeyCipher), senderKeyCipher: sodium.to_base64(senderKeyCipher),
    senderPublicKey: args.senderPublicKey, recipientPublicKey: args.recipientPublicKey };
}

/** Authenticated decryption; access is additionally restricted by private-bucket RLS policies. */
export async function downloadAndDecryptAttachment(meta: AttachmentMetadata, ownPublicKey: string, ownPrivateKey: string): Promise<Blob> {
  await sodium.ready;
  if (!supabase) throw new Error('Configure Supabase before downloading attachments.');
  if (!meta || meta.v !== 1 || typeof meta.path !== 'string' || meta.path.length > 200 ||
      typeof meta.name !== 'string' || meta.name.length > 180 || typeof meta.mime !== 'string' || meta.mime.length > 160 ||
      !Number.isInteger(meta.size) || meta.size < 1 || meta.size > MAX_ATTACHMENT_BYTES) throw new Error('Invalid attachment metadata.');
  const pathParts = meta.path.split('/');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (pathParts.length !== 3 || !uuid.test(pathParts[0]) || !uuid.test(pathParts[1]) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/i.test(pathParts[2])) throw new Error('Invalid attachment storage path.');

  // Validate all attacker-controlled metadata and the local key pair before making a storage request.
  const localPub = fromB64(ownPublicKey);
  const localPriv = fromB64(ownPrivateKey);
  const senderPub = fromB64(meta.senderPublicKey);
  const recipientPub = fromB64(meta.recipientPublicKey);
  const keyNonce = fromB64(meta.keyNonce, 128);
  const nonce = fromB64(meta.nonce, 128);
  const senderKeyCipher = fromB64(meta.senderKeyCipher, 256);
  const recipientKeyCipher = fromB64(meta.recipientKeyCipher, 256);
  if (localPub.length !== sodium.crypto_box_PUBLICKEYBYTES || localPriv.length !== sodium.crypto_box_SECRETKEYBYTES ||
      senderPub.length !== sodium.crypto_box_PUBLICKEYBYTES || recipientPub.length !== sodium.crypto_box_PUBLICKEYBYTES ||
      keyNonce.length !== sodium.crypto_box_NONCEBYTES || nonce.length !== sodium.crypto_secretbox_NONCEBYTES ||
      senderKeyCipher.length !== sodium.crypto_box_MACBYTES + sodium.crypto_secretbox_KEYBYTES ||
      recipientKeyCipher.length !== sodium.crypto_box_MACBYTES + sodium.crypto_secretbox_KEYBYTES) throw new Error('Invalid attachment encryption metadata.');
  if (!sodium.memcmp(sodium.crypto_scalarmult_base(localPriv), localPub)) throw new Error('This account encryption key pair does not match.');
  const isSender = sodium.memcmp(localPub, senderPub);
  if (!isSender && !sodium.memcmp(localPub, recipientPub)) throw new Error('This attachment is not addressed to this account.');
  const keyCipher = isSender ? senderKeyCipher : recipientKeyCipher;

  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).download(meta.path);
  if (error || !data) throw new Error(error?.message ?? 'Could not download attachment.');
  if (data.size > MAX_ATTACHMENT_BYTES + 64) throw new Error('Encrypted attachment exceeds size limit.');
  let key: Uint8Array;
  try { key = sodium.crypto_box_open_easy(keyCipher, keyNonce, senderPub, localPriv); } catch { throw new Error('Could not decrypt attachment key. Verify contact keys.'); }
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) throw new Error('Invalid attachment key.');
  // Reuse the nonce validated before the storage request; avoid redeclaring it in this scope.
  if (nonce.length !== sodium.crypto_secretbox_NONCEBYTES) throw new Error('Invalid attachment nonce.');
  let plain: Uint8Array;
  try { plain = sodium.crypto_secretbox_open_easy(new Uint8Array(await data.arrayBuffer()), nonce, key); } catch { throw new Error('Attachment authentication failed.'); }
  if (plain.length !== meta.size) throw new Error('Attachment size verification failed.');
  return new Blob([plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer], { type: meta.mime || 'application/octet-stream' });
}
