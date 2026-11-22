# Security Specification — Larder Press

## Data Invariants
1. **User Isolation & PII Protection**: A `users/{userId}` document contains personal email and profile metadata and may only be read, created, or updated by the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **Recipe Ownership & Immutability**: Every `recipes/{recipeId}` document must belong to an existing owner (`ownerId == request.auth.uid`). `id`, `ownerId`, and `createdAt` are immutable once created.
3. **Shopping Item Ownership & Immutability**: Every `shoppingItems/{itemId}` document must belong to an existing owner (`ownerId == request.auth.uid`). `id`, `ownerId`, and `createdAt` are immutable once created.
4. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must match `request.time` on creation, and `updatedAt` must match `request.time` on update.
5. **Bounded Payloads**: All strings, IDs, tags (`<= 12`), ingredients (`1..60`), and steps (`1..40`) enforce strict length/size bounds to prevent Denial of Wallet attacks.

## The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write to `/recipes/r1` -> `PERMISSION_DENIED`
2. Unverified email (`email_verified: false`) attempting write to `/recipes/r1` -> `PERMISSION_DENIED`
3. User B attempting `get` on User A's `/users/userA` PII document -> `PERMISSION_DENIED`
4. User B attempting `list` on `/recipes` without filtering `ownerId == userB` -> `PERMISSION_DENIED`
5. User A creating `/recipes/r1` with `ownerId: "userB"` (Identity Spoofing) -> `PERMISSION_DENIED`
6. User A creating `/recipes/r1` with extra ghost field `isVerified: true` (Shadow Field) -> `PERMISSION_DENIED`
7. User A updating `/recipes/r1` to mutate `ownerId` or `createdAt` -> `PERMISSION_DENIED`
8. User A creating `/recipes/../../bad` or 200-char document ID (ID Poisoning) -> `PERMISSION_DENIED`
9. User A creating `/recipes/r1` with `createdAt` backdated to `2020-01-01` -> `PERMISSION_DENIED`
10. User A updating `/recipes/r1` with `ingredients: []` (empty array violation) or `tags` > 12 -> `PERMISSION_DENIED`
11. User A updating `/shoppingItems/s1` with `purchased: "yes"` (type poisoning) -> `PERMISSION_DENIED`
12. User B deleting User A's `/shoppingItems/s1` -> `PERMISSION_DENIED`
