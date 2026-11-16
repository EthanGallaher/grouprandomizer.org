Balanced Group Randomizer V59 — Classroom-first navigation

CHANGES
• Navigation: Groups > Seating Chart > Random Student > Teacher Setup.
• One shared class selector above the tabs controls all tools.
• Teacher Setup shows the selected class name beside Rename/Delete, avoiding a duplicate visible selector.
• Class selection is a local viewing preference, not a new cloud edit.
• Existing users with populated rosters open on Groups; empty rosters open in Teacher Setup.
• Existing Getting Started tutorial still works and now highlights the shared selector.
• All previous classroom, cloud, merge, PDF import, grouping, seating, and fullscreen functions retained.
• Service worker bumped to V59 to refresh the app.

INSTALL
1. Export a current JSON backup on each device if it holds unique edits.
2. Upload the six application files (index.html, sw.js, cloud-sync.js, merge-core.js, e2ee-core.js, firebase-config.js) to your existing website repository, replacing matching filenames. The four JavaScript supporting modules are unchanged from V58.
3. Keep existing manifest, icons, and PDF.js files. Do not clear browser storage or IndexedDB.
4. Wait for website deployment, reload, and accept the PWA update if prompted.
5. Try switching a fictional class from the common selector while on each tab, and check synced devices.

This is a layout update, not a district security approval. Test before deploying for real student data.
