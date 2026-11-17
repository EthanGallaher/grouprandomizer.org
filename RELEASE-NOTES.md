# BGR P05.6 — Manual-only website, no migration blocker

Removed the automatic **Manual migration required** overlay. Existing local classroom data is loaded using the ordinary local-storage path. Google sign-in and cloud synchronization are not present. No browser reset or backup import is required to continue using existing locally saved data.

**Important:** If the browser previously belonged to a different teacher or shared account, check the loaded class data before using it. The local data is not automatically encrypted. Removing cloud code does not delete historical Firebase records. Make a JSON backup before replacing website files.

Deploy the contents of this ZIP to your GitHub Pages publishing folder and hard-refresh the site. The source contains the build marker `P05.6-manual-only`.
