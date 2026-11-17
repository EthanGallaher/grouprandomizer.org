# BGR Website P05.5 — manual-only verification update

The Google/Firebase synchronization settings are absent from the shipped website HTML. No cloud-sync or Firebase SDK is loaded. Classroom data stays in browser storage, and JSON export/import is the manual transfer method.

**Deployment:** Back up existing classroom data before replacing the website. Upload the contents of this ZIP to the GitHub Pages publishing directory, replacing the old `index.html`. Commit and wait for Pages deployment. Open the site in a private window or hard-refresh (Mac: Cmd+Shift+R). Inspect page source for `<meta name="bgr-build" content="P05.5-manual-only">`. If Google sync settings still appear, the live site is serving an older page, a different publishing branch/folder, or a cached installed app/service worker.

**Important:** Removing synchronization does not erase any existing Firebase data. Browser local storage and JSON backups are not automatically encrypted. A legacy cloud-account marker triggers a safety migration notice rather than silently opening old data. Do not clear the old browser profile until a verified backup has been made.
