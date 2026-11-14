# Deploy Version 45 — Maintenance & Verification

This is a maintenance update from the **user-supplied Version 44 ZIP**. The encryption protocol, Firestore schema, Firebase project settings, database security rules, and device pairing format are unchanged.

1. **Export a manual JSON backup on each device first.** Store it in a school-approved secure location: exports are readable, not end-to-end encrypted.
2. In the existing GitHub Pages repository, replace only **`index.html`**, **`cloud-sync.js`**, and **`sw.js`** with the corresponding V45 files from this package. Keep all other deployed files, including `firebase-config.js`, `e2ee-core.js`, `firestore.rules`, icons, manifest, and PDF parser assets. Do not upload the evidence tests as public website files.
3. Confirm your GitHub Pages deployment completes, then reload on Mac and iPhone. If the app displays **Restart to Update**, choose it. Do **not** clear browser/site storage: that can remove the local classroom encryption key.
4. Google sync remains opted in and auto-syncs after authorized sign-in. A fresh device still requires one-time pairing, with matching 8-digit verification codes. Click the **?** icon for expanded sync status and the **Last verified encrypted transfer** timestamp.
5. Keep using **fictional names only**. This release is **not independently audited or approved by a district for real student records**.

## Changes in V45

- Removed the duplicate Export/Import buttons from the expanded Google Sync panel. The original **Backup & Restore** card is the one manual backup location.
- Fixed cloud upload comparison to exclude the selected class even if class navigation happens during an in-progress encrypted upload. A class switch by itself is not a classroom edit.
- The hidden detailed sync panel now distinguishes the **last verified encrypted transfer** (completed upload or decrypted restore) from local saving. No successful transfer is claimed just because the teacher signs in.
- Clarified the manual-backup reminder; cloud sync is not a substitute for a separately retained backup.
- Removed obsolete identity-only pilot comments and updated the PWA cache version to **`bgr-pwa-v45`**.

**Preserved:** The compact Google account section, first-time welcome dialog, realtime listeners, 2-minute foreground fallback checks, automatic uploads, pairing, conflict protection, and main classroom/seating features.

## Quick acceptance test (fictional data)

1. On the Mac, sign into the authorized Google account and confirm auto-sync is active. Under **?**, record the last-transfer timestamp.
2. Rename an imaginary student on the Mac. Confirm that the cloud transfer timestamp advances **after** a completed encrypted upload.
3. Keep the iPhone app open/visible. Confirm that the new name arrives without pressing **Check now**. Under **?**, confirm a completed cloud restore time appears.
4. Switch selected classes several times on the iPhone. Confirm this alone does not trigger a new cloud upload or conflict.
5. Make a genuine fictional content edit on the phone and confirm it reaches the Mac.
6. Export a manual backup from the **Backup & Restore** card. Confirm there are no duplicates in the Google panel.

If a device shows a conflict, **do not press the overwrite option until you have exported both devices' local backups and identified the correct copy**.
