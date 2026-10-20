# Changelog

## 1.1.5 — Attachment upload validation
- Validate sender and recipient IDs as UUIDs before creating an object-storage path; reject self-targeted uploads.
- Validate sender/recipient key sizes and sender keypair consistency before reading file bytes.
- Corrected the contact-key fingerprint documentation: libsodium `crypto_hash` uses BLAKE2b here, not SHA-256.
- Static checks pass; dependency installation, full compilation, unit tests, APK build, and live backend tests remain unverified.

## 1.1.4 — Attachment decryption compile fix
- Fixed a duplicate block-scoped `const nonce` declaration in attachment decryption that would prevent TypeScript compilation.
- Reuses the already-decoded and length-validated nonce after the encrypted blob is downloaded.
- Added a static regression check to detect reintroduction of the duplicate declaration.
- This release does not claim a successful production build or live Supabase integration test; dependencies and runtime tests still need verification.
