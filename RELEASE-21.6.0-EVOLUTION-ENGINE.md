# NOVA Ultimate 21.6.0 — Evolution Engine

This release adds an evidence-led evolution backend and Evolution Engine workspace tab. It includes opt-in experience records, user feedback, pass/fail evaluations, creator-reviewed upgrade proposals, and verification gating.

## Checks performed

- `npm run test:syntax` — passed.
- `npm run test:evolution` — 5 tests passed.
- `npm test` — full configured test suite passed in the build workspace.

## Limits

This release does not retrain the underlying language model or autonomously deploy code. The workspace's live status control calls `/api/evolution/status` when a backend URL is supplied. Production hosting, third-party AI providers, and the user's Render deployment were not changed or verified by this local build.
