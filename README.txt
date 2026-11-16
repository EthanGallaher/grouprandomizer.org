BGR V46 — Google login loop repair 2 (fictional-data testing only)

Replace index.html, cloud-sync.js and sw.js in your GitHub Pages repository.
The included e2ee-core.js and firebase-config.js are unchanged.
The original Firestore security rules are unchanged.

WHAT IS DIFFERENT
1. Completing the Google popup actively verifies the selected UID; it no longer
   waits solely for an auth-state callback.
2. Concurrent auth checks cannot allow an older check to apply its response.
3. A successful Google login whose cloud check fails now shows the underlying
   error rather than appearing to reject the account.
4. Only after the SAME Google account has been identified can the teacher
   explicitly open the local classroom copy with cloud sync paused.
5. The app's service-worker cache version is bumped to force fresh assets.

DO NOT clear browser storage, IndexedDB, or cookies. Back up V45 data first.
This patch has static syntax checks but has NOT been live-tested against your Firebase project.

After deployment, reopen the page and confirm its updated PWA version is active.
If the gate remains visible, copy the full message shown below its title.
