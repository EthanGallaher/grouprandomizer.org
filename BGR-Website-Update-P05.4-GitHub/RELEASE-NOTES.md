# BGR P05.4 and Manual Website — Role-position swap update

Click a student in Group Display, choose Swap, then click a second student in the SAME group to exchange their positions. The displayed roles follow their new positions (for pairs, the second position combines roles 2 and 3). Swapping students in DIFFERENT groups still works as before. A group-locked student can exchange positions within their existing group; a locked student cannot move to a different group. Keep Separate / Keep Together rules continue to block invalid cross-group swaps.

Website: local browser storage + manual JSON backup only, no Firebase/cloud synchronization. Make a backup before replacing your deployed website. The downloadable manual edition is updated too. PDF.js files are not bundled; PDF import requires separately approved locally hosted assets.

PowerSchool: fictional-data-only, installation UNVERIFIED; no real SIS integration, district storage or synchronization. Obtain CCS approval before sandbox testing. V70.3 unchanged.

Developer browser test: same-group position swap, role reassignment, lock retention, tab rerender, no outbound requests or JavaScript errors in both editions. Existing group/seating regression checks also run. These are not independent security tests.
