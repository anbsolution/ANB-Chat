# ANB Chat v0.2 setup

## Web development
1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project. Never put a service-role key in this app.
3. In Supabase SQL Editor, run `supabase/schema.sql`.
4. In Supabase Authentication settings, enable Email provider and configure email verification/redirect URLs for your deployed domain.
5. From the project directory run `npm install`, then `npm test`, then `npm run build`, and finally `npm run dev`.
6. Create two test accounts and verify email registration, sign-in, profile creation, sending from one account to the other, and decryption on both devices.
7. Enable Realtime for `public.messages` and `public.call_signals` in Supabase if you want realtime subscriptions in a later implementation.

## Android APK
The GitHub Actions workflow builds the web assets and packages them with Capacitor. Upload the full tested project once to a public GitHub repository, then open Actions on GitHub mobile and run `ANB Chat Android APK`. Download the artifact only after the workflow is green. Do not compile the APK in Termux.

## Important security limitations
- Current private keys are stored in browser localStorage for this prototype. Do not use with sensitive real-world messages until secure key storage is implemented.
- Public-key fingerprint verification and key-change warnings are not yet implemented.
- Call signaling schema exists, but audio/video calling is not yet a complete usable feature; WebRTC offer/answer/ICE exchange, incoming-call UI, runtime camera/microphone permission handling and TURN testing remain required.
- Never commit `.env`, TURN credentials, signing keys or service-role secrets.

## v0.6 realtime and contact-key verification notes
- In Supabase Dashboard, enable Realtime for `public.messages` (Database/Replication or Publications, depending on dashboard version).
- In Chats, enter the recipient email/username and tap the shield button to display their public-key fingerprint.
- Compare the fingerprint with the contact over a separate trusted channel (for example, in person). Do not treat the fingerprint as verified until it matches on both devices.
- Incoming messages refresh the currently selected conversation through Supabase Realtime. A valid Supabase URL/key and configured RLS policies are required.
- The app still uses browser `localStorage` for private keys. Do not use it for sensitive production conversations until platform secure storage is implemented and reviewed.

## Attachment and location sharing (v1.1.0)
1. Re-run the complete `supabase/schema.sql` in the Supabase SQL Editor while signed in as a project administrator. This creates the private `anb-chat-attachments` bucket and participant-only storage policies.
2. Images, videos, documents, and common files up to 20 MiB are encrypted in the browser before upload. The storage bucket should remain private; do not switch it to public.
3. A sender must enter a recipient account and select a file, then tap **Send file**. The receiver opens the attachment using the download icon in the chat.
4. To share location, tap **Share location** and grant browser/device location permission if desired. The coordinates and map URL are sent as an encrypted chat message. You can deny the permission to cancel.
5. These features require configured Supabase Auth, the `profiles`/`messages` schema, and the SQL storage policies. This feature has not yet been integration-tested against a live Supabase project.


## Media and location sharing
Run `supabase/schema.sql` in the Supabase SQL Editor to create the private encrypted attachment bucket and its access policies. Configure the Supabase URL and anon key in `.env`. Location is requested only when the user presses Share location; recipients receive a location message with a Google Maps link. Attachment files are limited to 20 MB. Live backend testing is still required before production use.
