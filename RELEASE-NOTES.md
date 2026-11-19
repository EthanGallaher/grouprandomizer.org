# Balanced Group Randomizer — Website P05.15

## Changes
- Improved candidate scoring for pairs and groups of four, while preserving fixed High/Middle/Low labels and group size choices.
- Added Supportive pairing strategy (H–M or M–L preferred for pairs, mixed complementary groups preferred for larger sizes).
- Balanced abilities now uses tier-aware scores and class-wide distribution penalties, adapting to present students rather than forcing ideal patterns.
- Strategy selector on Groups and Layout Builder now has a small, keyboard-accessible ? button with the explanation of the currently selected strategy. Descriptions stay hidden until requested.
- Existing Random, Similar abilities, New partners, class rules, roles, absences, student mode, seating templates, and 2/3/4 group-size handling retained.

## Safety and rollout
1. Export your existing JSON backup to an approved secure location.
2. Keep a rollback copy of your published index.html and current assets.
3. Extract this ZIP and upload its contents to the repository root, not the ZIP itself.
4. Refresh the browser and reopen an installed app if needed. Do not clear browser storage.
5. Test with fictional students before using classroom data.

## Verification
- The 719 original PowerSchool prototype checks pass; 9 added scorer/persistence checks pass.
- Browser checks on isolated fictional pages passed for both ? buttons, changing strategies, Escape to dismiss, and shared selector values (website, offline edition, prototype preview).
- Website fictional 12-student browser test generated three groups of four, then six pairs, with no page errors.
- These checks do NOT constitute live PowerSchool authorization or district approval.
- Web/file navigation was restricted in the test runtime; the browser checks used isolated page content with mocked local storage rather than an installed/hosted production origin.
- Device-specific storage persistence, deployed website/PWA cache behavior, and real SIS integration require separate verification.
