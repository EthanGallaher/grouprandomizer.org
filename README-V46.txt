BGR V46 — cloud-first safety update (fictional-data beta)

FILES
Upload the five files in this folder to the same location in your existing GitHub Pages repository, replacing those filenames. Do NOT remove your manifest, icon PNGs, or PDF.js files. Keep a V45 backup before replacing anything.

WHAT CHANGED
- On a browser previously bound to a Google account, hides cached classroom content during login/cloud revision verification.
- Refuses to unlock a classroom cache for a different signed-in Google account; allows export of a local backup from the lock screen.
- Keeps a bound classroom cache hidden after sign-out; sign back in to access it.
- Offers explicitly chosen offline use when the browser is offline (not when online authentication merely fails).
- Handles legacy sync metadata lacking a content fingerprint conservatively: conflicting local and cloud data now require an explicit choice instead of a silent replacement.
- Ignores stale Firestore cached / pending local snapshot events in live updates; server polling continues.
- Preserves the encrypted vault format, device pairing, backups, seating templates, student features, and fictional-data-only cloud upload gate.
- V46 service-worker cache name.

LIMITATIONS / TESTS
This is an integration patch, NOT a security certification or production-ready cloud-first implementation. The login curtain is a UI privacy barrier, not data encryption of localStorage; someone with access to browser storage can still inspect cached names. A secured, per-account encrypted offline cache would require a separate data migration. Offline access assumes the saved browser profile belongs to its previously bound teacher. Test on a disposable browser profile using fictional students before any live deployment.

REGRESSION CHECKS
1. Make a V45 JSON backup and keep a copy of V45 deployed source.
2. Signed-in MacBook with clean synced fictional data: reload; verify the gate closes only after cloud verification and classes remain intact.
3. Signed-out bound device: reload; gate stays, cloud content not shown. Sign in with original account to unlock.
4. Sign in with another Google teacher account on same browser: gate stays; no data copied to that account. Export backup if needed.
5. Offline bound device: reload; click 'Use saved classes offline'; edit one fictional student; reconnect with the original account; pending revision is uploaded or a conflict is shown. Do not confirm a destructive conflict without reviewing both copies.
6. Simultaneous conflicting edits on two devices: only one write accepted, second requires explicit conflict resolution.
7. Verify pairing and iPad fullscreen as before. Verify backup import/export.
8. Confirm no existing PWA assets are missing from the GitHub repository (install uses cache.addAll).
9. Confirm Firebase rules remain your previously emulator-tested rules; this patch does not modify them.
