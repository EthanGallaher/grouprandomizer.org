# BGR Website P05.10 — Compact grouping controls / Student View

## Changes
- Groups > Show groups on seating chart toolbar now keeps toggle, saved-layout selector and Edit Layout on the same compact row at desktop widths. Hint appears in small type below. Small screens wrap naturally.
- Student View is a separate toggle from Fullscreen. It hides teacher navigation, performance tiers, lock icons/stripes, absence sidebar, teacher actions, notices and teacher-only toasts. Student View is read-only, and has a Return to teacher view control.
- Fullscreen expands **the current view**. Teacher fullscreen keeps teacher tiers, lock markers, attendance sidebar, main grouping buttons and the layout switch; groups remain interactive. Student fullscreen stays sanitized. Escape exits fullscreen; on iPad use Exit fullscreen.
- Existing saved seating chart layouts, daily attendance independence, group rules, strategies, and local JSON storage formats remain unchanged.

## Install
1. Back up current repository, export and verify a JSON backup from the live site.
2. Extract this ZIP at the GitHub Pages publishing root, replacing `index.html`, icons, and `BGR-Manual-Local-Edition.zip`. Keep any separate trusted PDF.js dependencies already used by your site.
3. Hard refresh; close/relaunch any installed PWA. Test with a **fictional class** before real use.

## Limitations
- The website was not deployed here. Student View conceals information visually, but does not secure stored student data from someone with device/browser access.
- This update does not add new roster/storage integrations, cloud sync or actual PowerSchool access.
- Quick seating still requires sufficient compatible desk clusters; it warns and falls back to group cards if the layout is undersized.
- `pdf.min.js` and `pdf.worker.min.js` are not bundled by this release.

## Tests (local browser with fictional data)
- Website, offline manual, inline fictional PowerSchool preview: group card generation, student view toggle and return, same-row layout controls, chart view, teacher-fullscreen tiers and attendance, student-fullscreen sanitization, JS runtime errors: PASS.
- Lock action visibility, red stripe privacy masking, disabled student actions, fullscreen teacher popup: PASS.
- PowerSchool engine test suites: data services 17/17; grouping 10/10; roster adapter 26/26; seating 9/9. All work in isolation using mock data.
