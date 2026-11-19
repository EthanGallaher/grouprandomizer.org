# BGR P05.14 — Compact Groups & Consistent Roles

## Changes
- Replaced separate wide control panels with one compact, responsive teacher toolbar containing Seating Chart, Group Size (2–4), Roles checkbox, and Grouping Strategy.
- Shortened classroom button labels and moved long help text into accessible descriptions and tooltips. A short group-count/status line sits next to Rebalance present.
- Revised role assignment **based on preferred group size and actual group size**. Each student takes their numbered role. When a group is smaller than the preferred size, the final student covers remaining roles. In size-2 mode, however, an odd-roster trio uses distinct Roles 1/2/3 and standard pairs show only Roles 1/2.
- Group size 4: a trio now assigns Role 3 + Role 4 to the third student; a pair assigns Roles 2 + 3 + 4 to the second student.
- Customized fourth role labels and the Roles checkbox are honored in group cards, seating display, and after attendance changes.
- All existing separate logical/physical grouping behavior, seat-cluster restriction, student privacy view, class data format and permanent seating are unchanged.

## Upgrade
1. Export and verify your current BGR JSON backup; keep a copy of the current GitHub Pages files.
2. Extract the website ZIP and upload the files at its root to your existing GitHub Pages repository, replacing the old `index.html` and manual-edition ZIP. Do not clear browser storage.
3. Hard-refresh the website (and reopen installed app shortcuts) before classroom testing.
4. With a **fictional** class of 11 students, switch sizes 2/3/4, inspect two-person roles and the 4-mode trio role, toggle Roles, and switch seating/card views.

## Test evidence and limitations
- Chromium functional tests with fictional data passed in website, offline manual, PowerSchool mock plugin page, and standalone PowerSchool mock preview.
- Verified group roles for 2, 3, 4 preferences; the 4-mode three-person fallback; custom fourth-role name; Roles checkbox; no-split seating; restored group card sizes; student view privacy; responsive mobile controls.
- The PowerSchool mock suite passed 18 data-service, 10 grouping-engine, 109 quick-seating, 26 roster, 9 permanent-seating, 186 group-size, and 361 no-split checks (total 719).
- JavaScript syntax checked in all four editions. Browser tests used a document-injected test harness; localStorage was unavailable in that environment. Direct localhost/file navigation was blocked by administrator policy, so an actual-origin persistence test could not be performed here. Data format and storage-key names were not changed.
- These checks are not a district authorization, live PowerSchool test, or production security review. No real student data should be used to test an unapproved prototype.
