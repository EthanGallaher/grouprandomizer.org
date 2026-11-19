# Balanced Group Randomizer P05.13 — Group Size, Fourth Role & Desk-Aligned Groups

## New classroom features
- **Preferred group-size slider** in Groups, with choices 2, 3, or 4 (per class, default 3).
  - **2:** groups of two. With an odd number of present students, exactly one trio.
  - **3:** groups of three first, then pairs. No isolated student for rosters of 2+.
  - **4:** maximize fours, then threes, then pairs. No isolated student for rosters of 2+.
- **Fourth shared role** in Teacher Setup, default “Checker”. The other three existing titles are preserved. Four-person groups use all four roles; pair members cover roles 1 and 2+3 respectively.
- **Roles checkbox** in Groups turns assignment/visible role labels off and back on; preference persists per class. Student View continues to hide teacher-only tiers and locks.
- **Desk-aligned Quick Groups:** Each displayed group occupies exactly one physical desk cluster; the planner can split a logical four-person group into new smaller groups, merge classmates when needed, or place two small groups in one large cluster. It never scatters one displayed group across two clusters.
- Switching to cards restores the chosen group-size priorities if desk constraints forced smaller groups. This may change temporary partner assignments; it never modifies permanent seating assignments or desk layouts.

## Physical trade-offs and rule conflicts
- A one-seat desk cluster can only hold a group of one. When no valid pairing is possible in the physical layout, the app uses that seat and shows a teacher-facing explanation; **only insufficient total seat count blocks seating display**.
- The planner attempts to preserve **Keep Together**, **Keep Apart**, and group locks. Where the physical cluster capacities make one or more impossible, it shows a teacher-facing notice; an affected group lock may be released. Those exceptional conflicts cannot all be satisfied simultaneously without changing desk layout or rules.
- A group-size-2 setting may need more than one trio in seating mode if, for example, two 3-seat clusters are the only tables available for six students. Card mode restores three pairs.
- Layout Builder’s permanent Populate algorithm is unchanged.

## Upgrade safely
1. Export and verify a BGR JSON backup and keep a copy of your current GitHub files.
2. Extract this ZIP and upload the root files to your existing GitHub Pages repository. Replace `index.html`, images where needed, and `BGR-Manual-Local-Edition.zip`.
3. Preserve any trusted, existing local PDF.js assets as needed; they are not provided in this package.
4. Hard-refresh the website and re-open installed shortcuts. Do not clear browser storage or overwrite a cloud vault during upgrade.
5. In a fictional class, try sizes 2/3/4, four role labels, Roles on/off, and 11 students at 4-seat, 3-seat, then 2-seat pods.

## Verified locally
- Browser tests with fictional classes: website, offline manual, mock PowerSchool plugin page, and standalone mock preview all passed (slider, roles, 11 students, four role inputs, desk-aligned placement, attendance, no-teacher-controls Student View, and return to preferred card sizes).
- 350 randomized seat-planning cases and 361 PowerSchool-compatibility no-split tests passed without losing or duplicating students.
- 1,020 browser attendance removal and restoration checks, across group-size preferences 2/3/4 and rosters 2–18, produced no unnecessary singletons.
- Existing and new reusable mock PowerSchool engine tests passed (data services, grouping, roster, permanent seating, Quick Groups).
- A browser test using a real hosted origin was blocked by local container browser policy; persistence was evaluated through source and mocked browser execution, not an authorized district deployment.

**Not tested:** live school data, authorized PowerSchool, district security requirements or SIS permissions.
