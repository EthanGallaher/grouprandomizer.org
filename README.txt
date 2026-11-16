BGR V46 — Conflict visibility / reconnection diagnostic patch

Based on BGR-V46-login-repair-2.zip.

CHANGES:
- Shows a persistent warning on all pages whenever offline edits remain unsynced, upload is pending, or two devices conflict.
- Offers direct access to conflict resolution in Teacher Setup.
- Keeps both existing cloud-versus-local decisions and backup-before-replace behavior.
- Changes PWA cache name to load the patched files.

IMPORTANT: No automatic merge has been added. Two offline/online edits to different data fields can still conflict because the database is encrypted as one vault. Export safety backups from BOTH devices before choosing which whole version to retain. If you select one version, manually reapply the other device's change after synchronization resumes.

TEST WITH FICTIONAL CLASSROOM RECORDS ONLY. Preserve browser data/IndexedDB and take backups before installation. This patch has not been tested against live Firebase.

NO AUTOMATIC JSON DOWNLOAD ON IPAD:
- New/blank devices restore encrypted classes from the cloud without downloading a plaintext JSON file.
- Previously paired devices continue normal cloud refresh without an automatic download.
- If the iPad already has substantive local data, pairing will NOT overwrite it: select Restore from cloud explicitly; a safety backup is downloaded before that destructive replacement.
- Explicit conflict resolutions and user-requested backup exports retain their existing safety downloads.
- Do not clear local storage or IndexedDB; test with fictional classes.
