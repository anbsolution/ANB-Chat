# ANB Chat — Android + Web (v1.1.5 development MVP)

ANB Chat is an email-based messaging app foundation. It uses a shared React/Vite web app, Capacitor for Android packaging, Supabase Auth/Postgres for backend services, libsodium for client-side message encryption primitives, and WebRTC foundations for audio/video calls.

## Current status — important

This is a **development MVP foundation, not a production-ready secure messenger**. The login UI and Supabase Auth flow are wired; the chat screen and call screen are currently foundations, not complete end-to-end chat/calling. The crypto module uses public-key encryption primitives but does **not** implement the Signal Protocol, forward secrecy, multi-device key management, verified identity/key-change warnings, encrypted media storage, or a professional security audit. Do not use it for sensitive conversations until these are implemented and independently reviewed. The Google STUN server alone does not guarantee reliable calls; production needs a TURN service and a signaling implementation.

## v1.1.5 attachment upload guardrails

Attachment uploads now validate participant UUIDs and reject self-targeted uploads, and verify the sender keypair before reading/encrypting file bytes. The contact-key fingerprint documentation now correctly identifies the BLAKE2b hash used. Attachment downloads retain their metadata/path checks. This is defense-in-depth, not a substitute for live RLS tests or a security audit.

## Project structure

- `src/ui/` — responsive app UI and styles
- `src/lib/crypto.ts` — client-side encryption primitives and local identity-key storage
- `src/lib/chat.ts` — encrypted-message database access foundation
- `src/lib/calls.ts` — WebRTC media permissions and ICE configuration
- `supabase/schema.sql` — database tables and baseline row-level security policies
- `.github/workflows/android-apk.yml` — GitHub Actions debug APK build
- `.env.example` — public configuration placeholders only

## Setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Authentication settings, enable Email provider and choose the email-verification policy you want.
4. Copy `.env.example` to `.env.local`; fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project settings. Never put a service-role key in the client app.
5. Install Node.js 22 and Java 21 on a development computer, then run:

   ```sh
   npm ci
   npm test
   npm run build
   ```

6. To run on web, use `npm run dev`.
7. Android is built by GitHub Actions after the project is pushed to the target repository. The workflow creates the Capacitor Android project in CI and uploads a debug APK artifact. A debug APK is for testing, not Play Store release.

## Mobile-only GitHub workflow

On your Android phone, open the existing GitHub repository in the browser. Upload the complete project once after pre-upload checks are complete, preserving the repository name. Commit all project files together. Open **Actions → ANB Chat Android APK → Run workflow** (or let the first push start it), wait for completion, and download `anb-chat-debug-apk` from the successful run. Do not claim a successful APK build until the run is green and the artifact is present.

## Before production launch

- Replace the prototype key lifecycle with an audited protocol (e.g. Signal Protocol implementation) and authenticated key distribution.
- Add contact discovery, encrypted message send/decrypt flow, realtime delivery, attachment encryption and safe file storage.
- Implement WebRTC signaling, incoming-call notifications, TURN credentials stored securely, reconnects, and call-state cleanup.
- Add key backup/recovery strategy, device linking, rate limiting, abuse reporting, account deletion, privacy policy, and security tests.
- Run dependency audit, browser/device matrix tests, and independent cryptographic review.

## v0.2 status and limitations

The v0.2 upgrade connects the basic text-send flow to Supabase and encrypts message bodies on the client before database insertion. Recipient lookup uses a registered email address or username. The schema includes participant-scoped call signaling storage, but the complete WebRTC call lifecycle is **not implemented yet**.

**Security warning:** this is a development MVP, not an audited secure messenger. Private identity keys are currently stored in browser `localStorage`, which is not suitable secure key storage. Contact public keys are not yet authenticated with a safety-number/fingerprint verification flow. Do not use this version for highly sensitive conversations. Before a public release, implement Android Keystore-backed storage, a reviewed web key-storage/recovery approach, key-change warnings, contact key verification, multi-device key management, abuse controls, and an independent security review.

### Validation status
- Source/schema/config static checks: run locally as part of the delivered package review.
- Dependency install and actual Vite/TypeScript build: **not verified** in this environment because `npm install` timed out.
- Vitest crypto tests: added/updated but **not executed** because dependencies were unavailable.
- Supabase integration and two-device message test: **not run**; requires a configured Supabase project and two test accounts.
- APK build: **not run**; must be verified by GitHub Actions after the final upload.


## v0.3 correctness fixes
- Incoming messages now resolve the sender's public key using the sender's profile ID, rather than mistakenly using the active recipient lookup.
- If an existing account has a published public key but its private key is missing from this browser, the app warns and does not silently overwrite the published key. This preserves the possibility of recovery from another trusted device or a future recovery flow.
- Email/username search is normalized to lowercase.

These are correctness safeguards, not a claim of production-grade E2EE. This project still lacks authenticated key verification, forward secrecy, secure OS-backed key storage, full WebRTC signaling/call controls, and a security audit.


## Security status
ANB Chat is an experimental MVP, not a production-ready secure messenger. Public-key fingerprints can be compared out-of-band, but keys are not yet automatically authenticated. Private keys currently use browser localStorage, which is not secure storage. Calling signaling helpers are foundations only; a complete incoming/outgoing WebRTC call flow and TURN configuration must be implemented and tested. See `TEST-REPORT.md`.


## v0.8 security note
Call signaling payloads are untrusted and must be passed through `parseCallSignal` before being applied to WebRTC. The helper is validation only; it does not implement a complete call UI or guarantee E2EE for audio/video media. Message encryption is an experimental MVP and requires independent review before production use.

### v0.9 input-hardening note
Message encryption now rejects empty or over-500,000-character plaintext, checks public/private key lengths and sender keypair consistency, and rejects oversized envelopes before JSON parsing. Stored identity data receives basic shape checks only; browser localStorage is still not secure key storage.

## v1.0.0 input limits
- Message plaintext is capped at 500,000 characters before encryption.
- Encrypted message payloads are capped at 3,000,000 characters in the client and database.
- WebRTC signaling JSON payloads are capped at 250,000 characters/bytes at the client/database boundary.
- Participant IDs are checked as UUIDs before use in conversation queries.

Apply the current `supabase/schema.sql` in the Supabase SQL editor to add the database constraints. Review any existing oversized rows before applying it. These checks reduce accidental or abusive oversized inputs; they do not replace server-side rate limiting, secure key storage, or a security audit.


## v1.0.1 CI quality gate
The GitHub Actions workflow now runs `node scripts/validate-static.mjs`, then `npm test`, then `npm run build` before Android packaging. A green APK workflow requires all three checks to pass. This repository package has not itself been verified by a successful remote GitHub Actions run.

### Media and location sharing (v1.1.1)
ANB Chat now includes an MVP attachment flow for images, videos, documents, and common files (up to 20 MiB), with file bytes encrypted in the client before upload to a private Supabase Storage bucket. The attachment key is separately encrypted for the sender and recipient. Location sharing is opt-in and sends coordinates/map URL through the encrypted message flow after device permission is granted. Run `supabase/schema.sql` in Supabase to create the private bucket and RLS policies. Live integration testing and independent security review are still required before production use.


## v1.3.0 authentication update
- Signup fields: name, mobile number, email, password, confirm password, optional invite ID.
- Login: mobile number or email ID plus password. Email login uses Supabase Auth; mobile login requires deploying `supabase/functions/mobile-login/index.ts` and applying `supabase/migrations/20261021_profile_signup_fields.sql`.
- Invite IDs are stored but not validated or rewarded yet.
- The GitHub Actions workflow builds the Android debug APK. It does not deploy Supabase Edge Functions automatically.
