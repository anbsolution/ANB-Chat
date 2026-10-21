import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const required = [
  'package.json','index.html','src/main.tsx','src/ui/App.tsx','src/lib/crypto.ts',
  'src/lib/crypto.test.ts','src/lib/calls.ts','src/lib/calls.test.ts',
  'supabase/schema.sql','.github/workflows/android-apk.yml','capacitor.config.ts'
];
let failures = 0;
let checks = 0;
for (const file of required) {
  checks++;
  const ok = existsSync(resolve(root,file));
  console.log(`${ok?'PASS':'FAIL'} required file: ${file}`);
  if (!ok) failures++;
}
try {
  const pkg = JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
  checks++;
  const ok = pkg.scripts?.build && pkg.scripts?.test && pkg.dependencies?.react && pkg.dependencies?.['@supabase/supabase-js'];
  console.log(`${ok?'PASS':'FAIL'} package manifest has build/test and core dependencies`);
  if (!ok) failures++;
} catch { checks++; console.log('FAIL package.json parses'); failures++; }
const calls = readFileSync(resolve(root,'src/lib/calls.ts'),'utf8');
for (const [label,ok] of [
  ['SDP type is matched to signal type',calls.includes('payload.type !== v.type')],
  ['ICE candidate is required',calls.includes("payload.candidate.trim().length === 0")],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }
const crypto = readFileSync(resolve(root,'src/lib/crypto.ts'),'utf8');
const bounded = crypto.includes('parsed.cipher.length > 2_000_000') && crypto.includes('payload.length > MAX_ENVELOPE_CHARS') && crypto.includes('Sender key pair does not match');
checks++;
console.log(`${bounded?'PASS':'FAIL'} encrypted envelope size and key-pair consistency are checked`); if(!bounded) failures++;
for (const [label,ok] of [
  ['Sender key pair rejects only unequal keys',crypto.includes('if (!sodium.memcmp(sodium.crypto_scalarmult_base(senderPriv),senderPub))')],
  ['Recipient key equality selects recipient ciphertext',crypto.includes('if(sodium.memcmp(localPublicKey,recipientPub))')],
  ['Sender history requires matching sender public key',crypto.includes('if(!sodium.memcmp(localPublicKey,senderPub))')],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }
const workflow = readFileSync(resolve(root,'.github/workflows/android-apk.yml'),'utf8');
for (const [label,ok] of [
  ['workflow installs dependencies',workflow.includes('npm install')],
  ['workflow builds web application',workflow.includes('npm run build')],
  ['workflow builds debug APK',workflow.includes('assembleDebug')],
  ['workflow uploads APK artifact',workflow.includes('actions/upload-artifact@v4')],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }
const chat = readFileSync(resolve(root,'src/lib/chat.ts'),'utf8');
for (const [label,ok] of [
  ['Conversation participant IDs are UUID-validated',chat.includes('assertUserId(otherUserId')],
  ['Ciphertext has a client-side maximum size',chat.includes('MAX_CIPHERTEXT_CHARS')],
  ['Call signaling payload size is bounded',chat.includes('payloadSize > 250_000')],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }
const schema = readFileSync(resolve(root,'supabase/schema.sql'),'utf8');
for (const [label,ok] of [
  ['Database limits ciphertext size',schema.includes('messages_ciphertext_size')],
  ['Database limits call payload size',schema.includes('call_signals_payload_size')],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }
const attachments = readFileSync(resolve(root,'src/lib/attachments.ts'),'utf8');
for (const [label,ok] of [
  ['Attachment sender key pair comparison uses boolean equality',attachments.includes('if (!sodium.memcmp(sodium.crypto_scalarmult_base(senderPriv), senderPub))')],
  ['Attachment key selection uses boolean equality',attachments.includes('const isSender = sodium.memcmp(localPub, senderPub)') && attachments.includes('const keyCipher = isSender ? senderKeyCipher : recipientKeyCipher')],
  ['Attachment bytes are encrypted before upload',attachments.includes('crypto_secretbox_easy') && attachments.includes("storage.from(ATTACHMENT_BUCKET).upload")],
  ['Attachment download validates size and decrypts',attachments.includes('MAX_ATTACHMENT_BYTES') && attachments.includes('crypto_secretbox_open_easy')],
  ['Attachment bucket is private with participant RLS',schema.includes("values ('anb-chat-attachments', 'anb-chat-attachments', false") && schema.includes('ANB conversation participants download attachments')],
  ['Chat UI includes attachment and location sharing',readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('shareLocation') && readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('sendAttachment')],
  ['Image and video attachments have distinct icons',readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('Image as ImageIcon') && readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('Film')],
  ['Location links open with noopener protection',readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('noopener noreferrer') && readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('maps\\.google\\.com')],
  ['Failed attachment message insert attempts object cleanup',readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('uploadedPath') && readFileSync(resolve(root,'src/ui/App.tsx'),'utf8').includes('remove([uploadedPath])')],
  ['Attachment metadata is validated before storage download',attachments.indexOf('Validate all attacker-controlled metadata') < attachments.indexOf('.download(meta.path)')],
  ['Attachment storage path requires UUID segments',attachments.includes('!uuid.test(pathParts[0])') && attachments.includes('!uuid.test(pathParts[1])')],
  ['Attachment download verifies local public/private key pair',attachments.includes('crypto_scalarmult_base(localPriv), localPub')],
  ['Attachment nonce and wrapped keys are length-checked',attachments.includes('senderKeyCipher.length !== sodium.crypto_box_MACBYTES + sodium.crypto_secretbox_KEYBYTES') && attachments.includes('nonce.length !== sodium.crypto_secretbox_NONCEBYTES')],
  ['Attachment upload validates participant UUIDs and rejects self-targeting',attachments.includes('!UUID_RE.test(args.senderId)') && attachments.includes('args.senderId === args.recipientId')],
  ['Attachment upload validates sender keypair before reading file bytes',attachments.indexOf('crypto_scalarmult_base(senderPriv), senderPub') < attachments.indexOf('file.arrayBuffer()')],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }


// Regression guard: attachment decryption must not redeclare its prevalidated nonce.
const attachmentSource = readFileSync(resolve(root,'src/lib/attachments.ts'),'utf8');
const duplicateNonceBug = /const nonce = fromB64\(meta\.nonce, 128\)[\s\S]*?const nonce = fromB64\(meta\.nonce, 128\)/.test(attachmentSource);
checks++;
console.log(`${!duplicateNonceBug?'PASS':'FAIL'} attachment nonce is not redeclared in decryption flow`);
if (duplicateNonceBug) failures++;

console.log(`\nStatic validation: ${failures===0?'PASS':'FAIL'} (${checks-failures}/${checks} checks)`);
process.exitCode = failures ? 1 : 0;

const authSource = readFileSync(resolve(root,'src/ui/App.tsx'),'utf8');
for (const [label,ok] of [
  ['Password signup/login replaces email OTP UI',!authSource.includes('signInWithOtp') && !authSource.includes('verifyOtp')],
  ['Signup UI includes name, mobile, confirm password and optional invite ID',authSource.includes('anb-name') && authSource.includes('anb-mobile') && authSource.includes('anb-confirm-password') && authSource.includes('anb-invite')],
  ['Mobile login calls server-side function',authSource.includes("functions.invoke('mobile-login'")],
  ['Mobile login Edge Function source exists',existsSync(resolve(root,'supabase/functions/mobile-login/index.ts'))],
  ['Signup profile migration exists',existsSync(resolve(root,'supabase/migrations/20261021_profile_signup_fields.sql'))],
]) { checks++; console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failures++; }
