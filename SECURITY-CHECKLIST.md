# Security Checklist — V45 (2026-11-14)

This checklist is a record of development status, **not** a certification or authorization to process education records.

## Implemented design (code-level, not independently audited)

- [x] Firebase Google authentication for identifying the owner; no second account password.
- [x] Browser AES-256-GCM encryption of classroom content before Firestore write.
- [x] Associated-data authentication ties ciphertext to owner UID and document revision.
- [x] P-256 ECDH/HKDF encrypted transfer of the vault key during manually approved device pairing.
- [x] Firestore rules **source** includes Google-account owner checks, field allowlist, revisions, and pairing transitions.
- [x] Auto-upload, live listener, 2-minute visible-window fallback check and conflict pause.
- [x] V45 avoids cloud transfers on mere class selection and reports completed uploads/restores separately from local saves.
- [x] Local JSON export/restore remains available, with duplicate export controls removed.

## Remaining acceptance gates for a real-student pilot

- [ ] Confirm the **exact** Firestore rules deployed live; run emulator tests for allow/deny behavior.
- [ ] Verify another Google account and unauthenticated clients cannot read/write the owner's vault or pairing requests.
- [ ] Verify plaintext student marker absent from **actual Firestore documents and network request bodies** in live beta tests.
- [ ] Adversarial device pairing: unapproved attempt, mismatched number, expiry, replay, revoked device.
- [ ] Test offline edit/reconnect/conflicts, data corruption and revision rollback across actual Mac/iPhone hardware.
- [ ] Protect/local-encrypt plaintext browser data or document approved device and browser safeguards.
- [ ] Add robust lost-device revocation/key rotation and a district-acceptable recovery approach.
- [ ] Restrict deployment pipeline (MFA, code review, branch protection, dependency integrity) and perform independent application-security assessment.
- [ ] Document retention/deletion, incident reporting, provider/subprocessor relationships and district privacy agreement.
- [ ] Receive explicit district IT/privacy/legal approval before any real student record is used.

**Testing with invented students is appropriate. The fictional-data checkbox is an acknowledgment, not a technical PII detector.**
