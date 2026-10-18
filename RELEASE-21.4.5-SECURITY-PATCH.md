# NOVA Ultimate 21.4.5 — private account data ownership patch

## Changes
- Saved chat list/read/write/delete routes require a verified Supabase session.
- Conversation identity is derived from the verified session, not a client-supplied `user_id`.
- Guest chat and memory remain local to the current browser; guest requests do not load server-side conversation context.
- Notification and device records are scoped to the verified account identity.
- Client chat sync includes the account bearer token and disables caching for private chat requests.
- Added regression tests for private-data ownership and role-related endpoints.

## Verification
- `npm run test:syntax` passed.
- `npm test` passed, including the new ownership regression tests.
- Live server startup and browser/device end-to-end testing remain unverified because dependency installation could not complete in this environment.
