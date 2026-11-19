# BGR Website P05.12 — Flexible seating for Quick Groups

## Change
- **Groups → Show groups on seating chart** now uses all available seats, including single desks.
- Groups of three and pairs are placed within a single desk cluster where possible. When a matching cluster is unavailable, the same logical group uses nearby open seats, sometimes across neighboring desk clusters. Group membership, roles and group locks do not change.
- A desk cluster can contain students from two different logical groups; labels identify shared clusters and individual seats receive a `G#` tag when needed to show the student's group.
- Daily seating mode **only** displays an error when the present student count exceeds the total seats in the chosen layout. The message states the shortage and links the remedy to Layout Builder.
- Existing grouping logic favors groups of three with pairs instead of isolated students; a single student is unavoidable only if fewer than two remain present. Absence repairs and balancing remain separate from permanent seating.
- The three-tab navigation, Random student picker, Student View/Fullscreen separation, grouping rules, template selector and permanent seating builder remain unchanged.
- Quick Groups reads saved desk positions, sizes, priorities and orientations **without editing** permanent seating assignments, class data, or templates.

## Safe upgrade
1. Export and verify a JSON backup of your existing data; back up the current GitHub repository.
2. Replace the published files with the contents of this ZIP at the repository root. Keep any trusted PDF.js files currently deployed; they are **not** included here.
3. Hard refresh the website (and relaunch installed shortcuts if applicable). Do **not** clear local browser storage during installation.
4. Test with a **fictional** roster: 5 students at two 3-seat tables, 9 students at three 4-seat tables, a mixed layout with individual desks, then one fewer seat than students.

## Local checks performed
- Planner: 350 randomized layout/capacity checks plus 13 targeted scenarios; no dropped, duplicated or re-grouped students.
- Chromium UI: website, offline manual version, standalone fictional PowerSchool preview and fictional plugin page; all passed tests covering seat placement, pair priority after an absence, shortage warnings, unchanged saved seating assignments and Student View.
- Absence sequences from starting class sizes 2–26: no single-person group when two or more students remained present.
- Fictional PowerSchool shared-engine tests: 17 data service, 10 grouping, 26 roster adapter, 9 seating engine, 109 Quick Groups assertions passed.
- No authorized live PowerSchool, district SIS, production security assessment or real student data tested.

## Important boundary
Only the **temporary Quick Groups seating display** has this flexible capacity-only fallback. **Layout Builder → Populate** remains the existing permanent seating planner and still enforces its own seat locks and Keep Apart / Keep Together constraints. This update deliberately avoids changing that feature.
