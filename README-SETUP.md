# Balanced Group Randomizer — End-to-End Encrypted Sync BETA (v36)

## Read this first

This pilot uses **Google sign-in as the ONLY account sign-in**, and it requires **no extra password**. Google sign-in is **not** used as a cryptographic secret. That is impossible to do safely with genuine end-to-end encryption: an OAuth token is known to Google and rotates, and it is not a stable teacher-controlled encryption key.

Instead, the first authorized browser creates a **random AES-256 classroom key** and stores it in that browser's IndexedDB. Firebase receives ciphertext (AES-256-GCM), not readable student rosters. To authorize a second device, sign in with the same Google account and **compare an 8-digit number on both screens, then approve the transfer once**. The encrypted key transfer uses ephemeral P-256 ECDH and HKDF; neither Google OAuth nor the Firebase database stores the master classroom key in readable form. After pairing, syncing is automatic while signed in and online.

**This is an unaudited development BETA, not FERPA-certified or district-approved. Test only with fictional student information and a separate browser profile.** A safeguard blocks automatic uploads unless display and source student names begin with `Fictional`, `Imaginary`, `Demo`, or `Test`; this does not guarantee that other free-text fields contain no real personal information. Do not use it with real students pending school approval and independent security testing.

## Files you will upload to GitHub Pages

- `index.html` — your existing Balanced Group Randomizer with the E2EE sync/approval UI, including all prior group and seating features.
- `sw.js` — PWA cache upgraded to `bgr-pwa-v36`, also caches the encryption module.
- `cloud-sync.js` — authenticated cloud sync, conflict checks, pairing and approvals.
- `e2ee-core.js` — browser-side AES-256-GCM, ephemeral ECDH, HKDF, local key storage.
- `firebase-config.js` — **replace the four `PASTE_...` values** with the Firebase web app configuration from Firebase Console.
- `firestore.rules` — copy this into **Firestore Database → Rules** and publish it. Uploading the file to GitHub alone does NOT activate the rules.

Keep all preexisting site assets in GitHub (icons, manifest, pdf scripts, etc.). Back up the existing `index.html` and **export your classroom data BEFORE replacing any site files**. Use a separate test profile for the encrypted-sync pilot.

## One-time Firebase setup

1. Create/select a **TEST** project at https://console.firebase.google.com/.
2. Create a Firebase **Web app** under Project Settings → Your apps; copy the public web configuration into `firebase-config.js`. These values are public web-app identifiers, not a server private key. **Never put Firebase service-account credentials in a public repository.**
3. In **Authentication → Sign-in method**, enable **Google** and select a support email. Add your GitHub Pages host to Authentication's **Authorized domains**. If the school's Workspace account is managed, district admin approval may be required.
4. In **Firestore Database**, create a database in **production/locked mode**, not open test mode. In **Rules**, paste the enclosed `firestore.rules` and **Publish**. These rules allow only the signed-in teacher to read/write their ciphertext vault and pairing messages. They refuse legacy plaintext `payload` writes.
5. Verify that the existing public Google OAuth client ID in `index.html` allows your GitHub Pages origin as an Authorized JavaScript Origin. The Google identity token must be accepted by the project's Firebase Authentication Google provider; verify this on the live HTTPS site.
6. Deploy the five website files (`index.html`, `sw.js`, `cloud-sync.js`, `e2ee-core.js`, `firebase-config.js`) to your GitHub Pages repository root, together with existing site resources. Publish database rules separately.
7. Reload or restart the installed app so its service worker update activates. Export a fresh local backup before first sync.

### If you tested the older, unencrypted Firebase sync beta

That beta stored **readable JSON** in `teacherCloud/{uid}`. The new beta intentionally **refuses to read or overwrite that legacy plaintext cloud record**. First ensure you have a local/exported copy of your FICTIONAL test data. If needed, use the prior beta to export it. Then delete the old test cloud record via the old beta, or use Firebase Console under the test account's `teacherCloud` document. Only then create your new encrypted vault. Updating code and rules does **not** retroactively encrypt the old document or remove old copies in service backups.

## Mac → iPad test with fictional students

1. On your Mac, use a dedicated browser profile. Add `Fictional Alice`, `Fictional Blake`, and `Fictional Casey`. Open **Teacher Setup → Google Account & Cloud Sync** and connect your Google account.
2. Click **Enable encrypted sync with this device**, confirm, then watch the status become **End-to-end encrypted sync is on**. In Firestore, `teacherCloud/{uid}` should contain `schema`, `iv`, `ciphertext`, `revision`, `writer`, `updatedAt` — **never a `payload` field or readable student names**.
3. On an iPad (or a different browser profile), open the exact same HTTPS website and sign in with **the same Google account**. Because this browser has no encryption key, select **Request access from another device**.
4. On the Mac, an authorization request appears. Click **Review new device**. Wait until **both devices show an 8-digit verification number**, visually compare the numbers and ensure they are identical. Never approve an unexpected request or one whose numbers differ.
5. On the Mac click **Approve matching number and share key**; on the iPad click **Numbers match on both devices** (either device can confirm first). The iPad receives an encrypted key envelope, decrypts it locally, and verifies it against the encrypted classroom vault.
6. On the iPad choose **Restore classes from cloud**. The app downloads a local safety backup before replacing local test data. New changes on either device should then synchronize automatically.
7. Test offline edits, reloading, conflict resolution, turning sync off, and deletion with fake students. Avoid editing the same record simultaneously except when deliberately testing conflicts.

## Security properties and limits

### Protects against

- A cloud database copy revealing student names, rankings, seating arrangements, or other classroom payload fields without the private classroom key.
- A different Google user reading or changing your cloud records through Firestore rules (provided the rules are properly deployed; must be tested in the emulator/real project).
- Silent overwrites when two devices save different revisions: an optimistic transaction and conflict UI stop some competing updates. They do **not** automatically merge individual student changes.
- A rogue or altered pairing relay trivially receiving the key: P-256 ECDH creates a shared secret, and the **human compares an 8-digit short authentication string** before the key is sent. Treat mismatched numbers as a hard stop.
- Unexpected upload of most real rosters in this test build via a fictional-name gate. It is **not** a comprehensive PII detector.

### Does NOT protect against

- Malicious JavaScript delivered to an authorized browser, compromised GitHub hosting/repository, compromised CDN dependencies, malicious browser extensions, or a compromised unlocked computer. Code running in the browser can access plaintext local storage and the encryption key. The key is intentionally extractable to support device pairing.
- A teacher's local `localStorage` database, manual `.json` exports, or downloaded safety backups being unencrypted. Store those backups in school-approved secure storage and protect devices.
- The cloud operator hiding/deleting ciphertext, rolling back to an older valid encrypted snapshot, observing revision/timestamp/Google account metadata, or causing synchronization outages. Data is encrypted; availability and metadata confidentiality are not guaranteed.
- A compromised authorized device: it retains its key and plaintext local data. **Remote device revocation and master-key rotation are not implemented** in this beta.
- Loss of **every** authorized browser/device: Google sign-in alone **cannot** recover the secret classroom key. The encrypted cloud backup then cannot be decrypted without an existing authorized device or a separate safe recovery mechanism. A plaintext backup can restore the data manually but must be handled as sensitive.
- Safari/iPad IndexedDB eviction, private browsing limitations, school-managed browser restrictions. **Live testing on the actual Mac/iPad is required.**
- District policies or contractual requirements. E2EE does not create FERPA certification or permission to use a service with student records.

### Storage and protocol details

- Main vault: `teacherCloud/{uid}` with `schema:'bgr-e2ee-v1'`, fresh 96-bit random AES-GCM nonce per revision, AES-256 key, authenticated associated data binding the Firebase user ID and revision, base64url ciphertext, and a monotone revision.
- Local key: browser IndexedDB `bgr-e2ee-keys-v1` / `keys` keyed by Firebase `uid`. Google ID/access tokens are never converted into AES keys.
- Device pairing: 10-minute request stored in `teacherCloud/{uid}/pairRequests/{requestId}`, ephemeral P-256 ECDH and HKDF-SHA-256 produce a wrapping key; each device derives an 8-digit verification number from the shared secret plus both public keys and the request ID. The existing device must approve after comparing codes, then wraps the master key with AES-GCM, authenticating the pairing transcript as AAD. Browser uses the unwrapped key only after successfully decrypting the existing vault. Old pairing records are cleaned up best-effort.
- Teacher-specific Firebase Auth UID must be verified by Firestore rules, including the Google provider. **Firestore Admin SDK bypasses Security Rules**, so secure developer/admin credentials are still vital (admin can access ciphertext and metadata).
- All cloud uploads are limited to about 500 KB of plaintext before encryption so they remain within the Firestore document limit; for larger datasets, use chunking with separate authenticated ciphertext records.

## What has and has not been tested

**Passed:** Real Node.js WebCrypto tests for AES-GCM encrypt/decrypt, wrong-key/tamper/revision rejection, ephemeral ECDH/HKDF verification equality, and secure key wrapping/unwrapping. UI integration tests in two isolated browser pages with **mocked** Firebase/Google plus **mocked** cryptography covered first sync, autosave, pairing, restoration and remote updates.

**NOT yet tested:** Real Firebase Auth and Firestore network calls, published Firestore Security Rules (no emulator configured), Safari/iPad IndexedDB persistence, live WebCrypto through the exact deployed site, live service-worker refresh, recovery under device reset, or independent penetration/security audit. These are mandatory steps before even considering a real-student pilot.

## Authoritative references

- Firebase client-side encryption: https://docs.cloud.google.com/firestore/native/docs/server-side-encryption
- Firebase Authentication and rules: https://firebase.google.com/docs/firestore/security/get-started
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- WebAuthn PRF (an alternative, but optional, device key-access technique): https://www.w3.org/TR/webauthn-3/
