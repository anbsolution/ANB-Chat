import { describe,it,expect } from 'vitest';
import { createIdentity, encryptForRecipient, decryptFromSender, keyFingerprint } from './crypto';

describe('client-side message encryption',()=>{
  it('encrypts a message so the intended recipient can decrypt it',async()=>{
    const alice=await createIdentity(); const bob=await createIdentity();
    const envelope=await encryptForRecipient('hello ANB',bob.publicKey,alice.privateKey,alice.publicKey);
    await expect(decryptFromSender(envelope,alice.publicKey,bob.privateKey)).resolves.toBe('hello ANB');
  });
  it('allows the sender to decrypt their own sent-message copy',async()=>{
    const alice=await createIdentity(); const bob=await createIdentity();
    const envelope=await encryptForRecipient('sent history',bob.publicKey,alice.privateKey,alice.publicKey);
    await expect(decryptFromSender(envelope,alice.publicKey,alice.privateKey)).resolves.toBe('sent history');
  });
  it('rejects malformed envelopes',async()=>{
    await expect(decryptFromSender('{bad json','key','key')).rejects.toThrow('Invalid encrypted message envelope');
    await expect(decryptFromSender(JSON.stringify({v:1,senderPublicKey:'key'}),'key','key')).rejects.toThrow('Invalid encrypted message envelope');
  });
  it('creates a stable fingerprint for a public key and rejects invalid keys',async()=>{
    const alice=await createIdentity();
    const first=await keyFingerprint(alice.publicKey);
    await expect(keyFingerprint(alice.publicKey)).resolves.toBe(first);
    expect(first).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4})+$/);
    await expect(keyFingerprint('not-base64-key')).rejects.toThrow();
  });
  it('rejects oversized malformed envelopes before decryption',async()=>{
    const oversized=JSON.stringify({v:1,senderPublicKey:'a',nonce:'a',cipher:'x'.repeat(2_000_001),senderCipher:'b',recipientPublicKey:'c'});
    await expect(decryptFromSender(oversized,'a','a')).rejects.toThrow('Invalid encrypted message envelope');
  });
  it('rejects empty or oversized plaintext and mismatched sender keypairs',async()=>{
    const alice=await createIdentity(); const bob=await createIdentity();
    await expect(encryptForRecipient('',bob.publicKey,alice.privateKey,alice.publicKey)).rejects.toThrow('Message is empty');
    await expect(encryptForRecipient('x'.repeat(500001),bob.publicKey,alice.privateKey,alice.publicKey)).rejects.toThrow('Message is empty');
    await expect(encryptForRecipient('hello',bob.publicKey,alice.privateKey,bob.publicKey)).rejects.toThrow('Sender key pair does not match');
  });
  it('rejects a payload that exceeds the envelope limit before parsing',async()=>{
    await expect(decryptFromSender('x'.repeat(3_000_001),'a','a')).rejects.toThrow('Invalid encrypted message envelope');
  });
  it('rejects a mismatched sender key',async()=>{
    const alice=await createIdentity(); const bob=await createIdentity(); const eve=await createIdentity();
    const envelope=await encryptForRecipient('secret',bob.publicKey,alice.privateKey,alice.publicKey);
    await expect(decryptFromSender(envelope,eve.publicKey,bob.privateKey)).rejects.toThrow();
  });
});
