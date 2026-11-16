BGR V46 LOGIN LOOP HOTFIX — fictional-data beta

Fix: when the original already-signed-in Google account is selected a second time,
explicitly retry encrypted-cloud verification. Firebase does not emit an auth-state
change for selecting the SAME account. Errors are shown on the full-screen gate.

Replace index.html, cloud-sync.js and sw.js on GitHub Pages. Other files are included
for convenience and are unchanged. Preserve classroom backups and all asset files.

AFTER DEPLOY: verify GitHub Pages has updated; fully close/reopen the PWA or accept
the available app update. Do NOT clear site data or delete localStorage/IndexedDB.

TEST:
1. Keep a JSON backup and test with fictional classes only.
2. On a previously connected browser, reload and select original Google account.
   If it was already signed in, it should now recheck the cloud and unlock.
3. If it fails, read the specific cloud verification error on the gate; the local
   classes have not been overwritten.
4. Select another Google account: it must NOT unlock original-account classes.
5. Repeat on iPad PWA and confirm no regression to seating/templates/pairing.

This is not a FERPA certification or production approval.
