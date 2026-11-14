# Automatic Sync — V45 Notes

- Sign-in on an authorized device restores the newest known encrypted cloud revision if local data has no unsynced edits.
- Class changes schedule encrypted uploads after editing; another online, authorized device can receive them through Firestore listeners.
- While visible and active, the app checks the Firestore server about every two minutes even if a notification was missed, and checks on return/focus/network reconnect.
- Switches between selected classes are **local navigation** and do not count as a cloud edit, including switches during an in-flight upload (V45 fix).
- The **?** panel now shows the last completed encrypted upload or restore timestamp for this device; local saves and Google sign-ins alone are not counted.
- Concurrent changes create a conflict, and the app pauses rather than silently choosing either version. It does not merge divergent revisions.
- When asleep, backgrounded or closed, an iPhone may suspend timers and cannot be guaranteed to sync. One-time pairing is still needed for previously unauthorized browsers.

Use `DEPLOY.md` to upgrade from V44. Preserve all browser website data and encryption keys while updating.
