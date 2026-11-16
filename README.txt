Balanced Group Randomizer — V47 controlled merge test
==================================================

IMPORTANT: FICTIONAL CLASSROOM DATA ONLY. Not production- or FERPA-approved.

Files to replace in the existing GitHub Pages root:
  index.html, cloud-sync.js, e2ee-core.js, firebase-config.js, sw.js
NEW FILE (required): merge-core.js
Existing PNG icons, manifest, pdf.min.js, and pdf.worker.min.js remain unchanged.

WHAT CHANGED
- A verified merge ancestor is retained per authenticated teacher and Firestore
  revision in this browser's existing localStorage.
- New three-way merge combines non-overlapping field edits, including keyed
  student records, distinct seating assignments, and layout changes.
- Edits to the SAME field, conflicting reorders, deletion-vs-modification, or
  changed class membership are not silently guessed; the merge is refused.
- Existing V46 conflicts have no verified ancestor. Guided manual mode lets
  the teacher choose the source for (1) student performance tiers and (2)
  seating configurations, ONLY when every other field matches.
- A combined two-original JSON safety archive is requested on merge. Browsers
  sometimes block downloads; explicitly export backups from EACH device first.
- Existing sign-in, encryption, pairing, fictional-data-only restriction,
  and offline/PWA functionality are preserved.

FOR YOUR EXISTING CONFLICT
1. BEFORE INSTALLING, export a JSON backup separately from iPad and laptop.
   Do not clear either browser's site data, sign out, or reinstall.
2. Upload all six files to your GitHub repository (same paths); accept the
   app update if prompted, then reopen both devices.
3. Open Teacher Setup > Cloud Sync on the conflicted device.
4. Choose ranking source and seating source. Example: if the iPad has the
   new rankings, and the CLOUD already contains your laptop's seating edit,
   select 'This device' for rankings and 'Cloud version' for seating on iPad.
5. Choose 'Combine selected rankings and seating'. Confirm only after checking
   that BOTH desired versions are in the selected sources.
6. Verify the changes on both devices after the successful encrypted upload.

CAUTION: THE CLOUD MUST ACTUALLY CONTAIN ONE OF THE NEW EDITS. If the laptop's
seating edits exist only on the laptop and have not uploaded, choosing 'Cloud
version' for seating cannot recover them! Preserve both device backups and
do not finalize a merge until at least one desired edit is verifiably in cloud.
This release does not merge two devices' private caches directly.

For subsequent divergence on V47, choose 'Try safe three-way merge'; it
requires a verified common revision and will refuse overlapping edits.
Merges are USER-INITIATED in this test version; routine non-conflicting
changes still synchronize automatically as before.

VALIDATION
- Node syntax check completed on updated cloud-sync.js, merge-core.js, sw.js
  and all inline index.html scripts.
- 8 assertions of pure merge behavior passed.
- Live Firebase, installed iPad PWA, and cross-device restore remain untested.
- Prior emulator security tests are retained, but new merge behavior requires
  targeted testing with fictional data.

ROLLBACK: Keep an untouched copy of the V46 package. Rollback must preserve
localStorage, IndexedDB and device keys; do not clear site storage.
