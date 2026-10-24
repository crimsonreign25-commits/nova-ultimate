# NOVA Evolution Engine — v21.6.0

## Purpose

NOVA follows **Understand → Learn → Evolve → Adapt → Verify → Improve**. This release adds an evidence-led backend layer for explicit opt-in experience records, feedback signals, evaluations, and controlled upgrade proposals.

## What it really does

- Records task outcomes only when the signed-in user explicitly opts in.
- Separates a recorded outcome from independently verified evidence.
- Stores ratings as feedback signals; it does not silently change model weights.
- Records evaluations, and marks one as passing only when it contains at least one check and every check passes.
- Lets the creator propose, approve/reject, and verify software upgrades. Verification requires checks; approval alone does not imply success.
- Does **not** autonomously edit production files, deploy code, or retrain the underlying language model.

## API

Authenticated user endpoints (user records are isolated by server-verified account identity):

- `GET /api/evolution/status` — aggregate counters and honest capability flags.
- `GET /api/evolution/records/experiences|feedback|evaluations` — current user's records.
- `POST /api/evolution/experience` — requires `{ "optedIn": true, "taskType": "coding", "outcome": "success|partial|failure|unknown", "summary": "...", "verified": false }`.
- `POST /api/evolution/feedback` — requires `{ "optedIn": true, "rating": 1..5, "comment": "..." }`.
- `POST /api/evolution/evaluate` — requires a non-empty `checks` array; each check has `name`, `ok`, and optional `evidence`.

Creator-only endpoints (configure existing NOVA creator authorization):

- `POST /api/evolution/proposals` — create an upgrade proposal including rationale, change plan, and rollback plan.
- `GET /api/evolution/proposals` — list proposals.
- `POST /api/evolution/proposals/:id/decision` — body `{"decision":"approved"}` or `{"decision":"rejected"}`.
- `POST /api/evolution/proposals/:id/verify` — send non-empty verification checks. A proposal becomes `verified` only if it was approved and every check passes. This still does not deploy code.

## Persistence and privacy

Evolution records use NOVA's existing `PersistentStore`, including its configured encrypted-at-rest storage behavior. Production startup already requires `NOVA_DATA_ENCRYPTION_KEY`. Do not commit secrets or send API keys in prompts.

## Verification

Run `npm run test:evolution`, `npm run test:syntax`, and `npm test`. The evolution unit tests cover opt-in, account isolation, rating validation, evaluation gating, creator approval, and verification gating. A passing local test suite does not prove that external providers, Render, or every UI feature works in production.
