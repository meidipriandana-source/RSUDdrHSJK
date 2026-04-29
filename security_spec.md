# Security Specification - Sertifikat Outhouse 2026

## Data Invariants
1. **Temporal Integrity**: `updatedAt` must strictly match `request.time` on all creates and updates.
2. **Identity Integrity**: For operations that modify data, the user must be authenticated with a verified email.
3. **Idempotent Ownership**: (Currently no direct ownership implemented, but we assume an Admin-led system for global management).
4. **ID Poisoning Guard**: Document IDs must be alphanumeric strings under 128 characters.
5. **Strict Schema**: No shadow fields or unexpected keys allowed.

## The Dirty Dozen Payloads
1. **Future Timestamp Attack**: Attempt to create a certificate with a manual `updatedAt` in the future.
2. **Missing Required Fields**: Attempt to create a certificate without `status` or `issueDate`.
3. **Shadow Field Injection**: Attempt to create an employee record with an extra `isVerifiedAdmin: true` field.
4. **Resource Poisoning (ID)**: Attempt to create a document with ID `../../etc/passwd` or a 10KB string.
5. **Denial of Wallet (String Size)**: Attempt to create a certificate with a 1MB `name`.
6. **Type Poisoning**: Attempt to update `skp` (number) with a string `"lots"`.
7. **Bypass Verification**: Attempt to write as a user whose `email_verified` is `false`.
8. **Unauthenticated Write**: Attempt to write without any auth token.
9. **Blanket Read Request**: Attempt to list certificates without being and authenticated/verified user (if restricted).
10. **Malicious ID update**: Attempt to update a document and change its immutable fields (not applicable to ID directly but to keys like `nip` if we decide).
11. **Regex Bypass**: Attempt to use `!` or `@` in document IDs.
12. **Status Skipping**: (If terminal states exist, try to move from 'Expired' to 'Aktif' without permission).

## Test Runner Plan
We will use `firestore_test.rules` (draft) and verify them using simulated requests.
(Since I cannot run actual `npm test` here easily for firestore rules without a local emulator, I will focus on making the rules perfect and linting them).
