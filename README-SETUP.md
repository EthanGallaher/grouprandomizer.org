# Balanced Group Randomizer V45

**Status:** Development beta for **fictional test classrooms only**. The working website is hosted on GitHub Pages. Google login uses Firebase Authentication; Cloud Firestore relays encrypted classroom snapshots to authorized devices.

## How the application works

- The teacher signs in to the same Google account on each device. Google authentication identifies the user but **does not generate the encryption key**.
- The first device generates a random AES-256-GCM classroom key and stores it locally in browser IndexedDB. Classroom JSON is encrypted inside the browser before it is written to Firestore.
- Additional devices require one-time explicit approval from an existing device using a matching eight-digit code. The key is transferred using ephemeral P-256 ECDH and HKDF, wrapped in AES-GCM.
- Firestore stores `schema`, `iv`, `ciphertext`, `revision`, `writer`, `updatedAt` and short-lived pairing records, not plaintext rosters. These statements describe the application design; live security rules and network traffic must be verified independently.
- Authorized devices send encrypted updates after classroom edits; an active live listener receives remote changes. A two-minute check while the application is visible and an immediate check on return provide fallback. Closed/sleeping apps do **not** sync in the background.
- Concurrent edits are **not merged**. Conflicts pause synchronization and require a deliberate choice of which version to keep.
- Classroom data remains saved as **readable local browser storage** and manual JSON backups are **readable**. The encryption protects the Firestore payload, not a compromised or shared browser.

## V45 improvements

V45 consolidates manual backups in **Backup & Restore**, corrects redundant cloud uploads caused by class selection during network activity, adds a last-verified-cloud-transfer timestamp inside the existing **?** panel, clarifies manual backup reminders, and refreshes release documentation. No changes to the encryption protocol, Firebase configuration, Firestore rules, or pairing format.

## Deployment

Read `DEPLOY.md`. Replace `index.html`, `cloud-sync.js` and `sw.js` in the same GitHub Pages directory. Keep your existing Firebase configuration and all other site assets. Uploading `firestore.rules` to GitHub **does not** publish rules in Firebase Console. Do not deploy the tests or evidence report as classroom website pages.

## Data inventory

| Data category | Local browser | Encrypted cloud payload | Other exposure |
|---|---|---|---|
| Student display name and retained PDF source name (`sourceFullName`) | Readable localStorage | Encrypted | Plaintext manual backup exports |
| Performance tiers, group rules and history | Readable localStorage | Encrypted | Plaintext manual backup exports |
| Seating templates and student assignments | Readable localStorage | Encrypted | Plaintext manual backup exports |
| AES classroom key | IndexedDB on an authorized device; accessible to that app's trusted browser JavaScript | Not stored in Firestore as a readable master key | Encrypted key envelope during approved pairing |
| Firebase user ID and email | Firebase Auth / client | User ID identifies protected document path | Visible to account provider / Firebase administrators |
| Revision, writer pseudonym and transfer time | Local metadata | Firestore plaintext metadata | Visible to database administrators |
| Fictional testing acknowledgment | Local browser storage | Not required in classroom payload | Does **not** detect personally identifying data |

## Remaining security and governance work

- Run **Firebase Security Rules emulator** tests against the exact rules and verify live published rules protect another teacher's documents.
- Gather redacted network captures and screenshots of actual ciphertext produced by V45 with fictional records.
- Test pairing rejection, conflict recovery, offline/reconnect, lost-device behavior, and account changes on actual iOS and desktop browsers.
- Evaluate local plaintext data, local key access by browser JavaScript, device revocation/rotation, recovery when all keys are lost, deployment/JavaScript supply-chain integrity, and deletion/retention.
- Obtain independent application-security review, district legal/privacy review and relevant vendor agreements before use with any real student records. This project is **not FERPA certified** (there is no federal product certification that proves compliance).

For actual tests and a district-facing summary, see the separately packaged **V45 Security Evidence Bundle**.
