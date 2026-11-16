Balanced Group Randomizer — V48 automatic encrypted merging
=========================================================

IMPORTANT: FICTIONAL CLASSROOM DATA ONLY. This is a testing release. It is
NOT production-ready, security-audited, or approved for actual student data.

DEPLOYMENT (existing GitHub Pages repository)
---------------------------------------------------------
1. Export separate JSON backups from your CURRENT MacBook and iPad, especially
   if they still have different unsynchronized edits. Keep both files safe.
2. Upload/replace these six files at the GitHub Pages site root:
       index.html
       cloud-sync.js
       merge-core.js
       e2ee-core.js
       firebase-config.js
       sw.js
   Keep your existing manifest.webmanifest, icon PNG files, pdf.min.js,
   and pdf.worker.min.js in place. Never clear browser site data or IndexedDB.
3. Accept the app's update prompt and reopen BGR on each authorized device.
4. Test using invented names only.

WHAT CHANGED
---------------------------------------------------------
- Classroom edits still save instantly on the device, then upload encrypted.
- If the cloud advances while an offline device edits, V48 compares the local
  state, newest cloud state and this device's VERIFIABLY SAVED last cloud copy.
- Different settings, students or individually identified desk groups are
  combined automatically and uploaded using a Firestore revision transaction.
- Teacher UI shows one short save status: all saved / saving / offline / review.
- No confirmation popups or automatic JSON downloads for routine merges.
- Two pre-merge snapshots are encrypted with the device-held vault key and
  stored in bounded local IndexedDB recovery storage before an automatic write.
  Access a recovery export ONLY if needed under Cloud Sync > ? >
  Download latest encrypted-merge recovery copy. The downloaded JSON is
  DECRYPTED and must be stored securely.
- If both devices change the SAME value differently, if a class is deleted
  while another device edits it, or if no verified common ancestor exists,
  V48 pauses for review; it never silently overwrites either version.
- When other devices save during an automatic merge, V48 rechecks the cloud
  revision and retries without using a blind last-write-wins update.
- Firebase database rules and encrypted cloud schema remain unchanged.

IMPORTANT LIMITATION WITH EXISTING V46/V47 CONFLICTS
---------------------------------------------------------
If the conflicting changes originated before your device saved a verified
common starting revision, V48 CANNOT safely infer what each device changed.
That ONE legacy conflict may still need the existing guided merge after you
save backups and confirm which copy contains each desired change. After a
verified baseline is created, future independent changes can merge themselves.
If BOTH desired edits exist only in different local caches, the cloud alone
cannot combine them. Preserve both JSON backups before attempting a resolution.

RECOMMENDED FUNCTIONAL TEST (invented records only)
---------------------------------------------------------
A. Start with both devices synced to the same fictional class.
B. Turn OFF iPad Wi-Fi. Change student A's tier on the iPad.
C. On the online MacBook, change a seating layout position and confirm that
   the MacBook reports its cloud changes have been saved.
D. Turn iPad Wi-Fi back ON. Keep BGR open. Confirm both edits arrive on BOTH
   devices, without any JSON download or manual merge selection.
E. Repeat with BOTH devices changing the SAME student tier to different
   values. V48 must request review and preserve both versions, not overwrite.
F. Test pairing / permissions / cross-account isolation in a separate test
   profile; preserve your earlier emulator evidence and perform regression
   testing for modified sync behavior.

VALIDATION PERFORMED
---------------------------------------------------------
- Syntax checks on JavaScript modules, service worker, and HTML inline scripts.
- 11 pure merge tests: disjoint students, seating, templates, deleted classes,
  overlapping edits, local-only class selection, edits made during a merge.
- 3 mocked Firebase workflow tests: automatic offline/online merge;
  overlapping change rejected; absent verified ancestor rejected.
- The real Google sign-in flow, Firebase service, and installed iPad PWA
  were NOT exercised in the live environment.

ROLLBACK
---------------------------------------------------------
Keep the untouched V47 package and your two exported backups. Rolling back
must NEVER remove device keys or local browser data. Do not delete site data,
IndexedDB, or the Firestore vault while troubleshooting. Test in a separate
browser profile if possible.
