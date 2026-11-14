# Pre-approval checklist — NOT yet cleared for student data

- [ ] Confirm Firebase Google Sign-In and Firestore work under the school-approved Google Workspace account.
- [ ] Publish and exercise `firestore.rules` in Firebase Rules Playground/emulator, including cross-user denial, encrypted-only writes, revision requirement, and pairing stage transitions.
- [ ] Verify that the Firestore console stores ciphertext only and **never** fields containing names, rankings, or seating assignments in readable form.
- [ ] Test Mac Chrome, Mac Safari, and iPad Safari/installed PWA using exclusively fictional data. Test local IndexedDB key persistence after app restart, sign-out/in, browser updates, and intermittent network connectivity.
- [ ] Verify that an unknown Google account cannot access another UID and that a Google account with no authorized device cannot decrypt existing classroom records.
- [ ] Verify second-device pairing code mismatch stops key transfer, expire requests, and assess mitigation of social engineering.
- [ ] Add a secure device-removal/master-key-rotation flow before broad deployment.
- [ ] Choose a recovery strategy acceptable to schools; key loss without a backup is unrecoverable.
- [ ] Harden code delivery: repo branch protections, MFA, deploy approvals, supply-chain audit, CSP, dependency pinning, minimize analytics and cross-origin scripts.
- [ ] Review browser plaintext localStorage, downloaded JSON backups and deletion semantics for sensitive records.
- [ ] Obtain a professional security review, privacy policy, data-processing agreement, district IT approval, and applicable legal review.
- [ ] Review Firebase Admin permissions, billing, logs, availability, incident response, school Workspace restrictions, and data retention/deletion.

Design note: "Google sign-in is the only authentication" does **not** mean "Google sign-in is the encryption key." A Google-issued token is not a teacher-only secret. The vault key must originate and remain on authorized clients, or the system is not genuinely end-to-end encrypted.
