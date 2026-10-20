# ANB Chat v1.1.4 Test Report

## Changes
- Fixed duplicate `const nonce` declaration in `src/lib/attachments.ts`, which was a TypeScript compile blocker.
- Added a static regression check for the duplicate nonce declaration.

## Verified in this workspace
- Source-level regression check and static validation.
- ZIP archive integrity after packaging.

## Not verified
- `npm test`: dependencies are not installed in this workspace.
- TypeScript/Vite production build.
- Live Supabase upload/download and RLS enforcement.
- Two-account message and attachment delivery.
- Android APK build/device execution.
- Independent cryptographic/security audit.

Static checks are not a substitute for compilation, automated tests, backend integration tests, device testing, or security review.
