# BGR Website P05.9 — Quick Groups on Seating Chart

The Groups tab is now the everyday presentation hub. Use **Show groups on seating chart** to project the same active groups onto any saved seating template. Choose a layout in the Groups tab or use Edit layout to open the Seating Chart Builder.

## What stays connected

- One active group arrangement drives both cards and quick seating views. Switching views does not randomize students.
- Randomization strategies, avoid pairs/groups, keep-together, group locks, role order, intra/intergroup swaps, absent/return, and present-student rebalancing are shared by both views.
- Student fullscreen hides teacher controls, performance tiers, absent sidebar, and lock markers. Print groups prints the active view.
- The seating template contributes desk geometry and priority/capacity only; current groups are *temporarily* mapped to compatible 2/3/4-seat clusters. Empty clusters and extra seats remain empty. Group members are never split across clusters.
- If the template cannot fit the current groups, the screen explains the shortage and retains the usable group-card view rather than dropping anyone.
- Attendance and group swaps do **not** alter saved Seating Chart > Populate assignments. The existing permanent seating Populate operation remains independent of daily absences.
- Existing class data is migrated in place through the application's unchanged data key. No account or cloud sync is added.

## Deployment & limitations

1. Export and verify a JSON backup in the currently installed BGR *before* replacing GitHub files.
2. Extract this ZIP into the GitHub Pages publishing directory, retaining paths. The file `BGR-Manual-Local-Edition.zip` is refreshed to P05.9.
3. Hard-refresh and check the service worker/PWA state if an old version persists.
4. A template must have a distinct compatible desk cluster for each current group; a cluster of three or four can host a triple, a cluster of two/three/four can host a pair. Single desks are not combined automatically.
5. The website and local edition store student names and classroom data in the browser. Exported JSON backups contain readable student data. Follow district rules; no automatic encryption or cross-device synchronization exists.
6. Optional PDF importing still depends on an existing, matching local `pdf.min.js`/`pdf.worker.min.js` pair, which are not bundled in this ZIP. This release does not fix that dependency.

## Verification

- Local Chromium browser check with 9 fictional students: card/chart switching, three cluster mappings, role rendering, absence/return, insufficient-layout warning, layout re-selection, and randomizing in chart view — PASS.
- Verified permanent assignments on the original saved seating template were unchanged by all above actions — PASS.
- Repeated browser check for manual local HTML — PASS.
- Fullscreen-style privacy check (iPad presentation style): teacher toolbar/guidance and absent sidebar hidden — PASS.
- Not deployed to live GitHub Pages or tested in a live classroom.
