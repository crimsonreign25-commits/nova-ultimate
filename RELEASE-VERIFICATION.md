# NOVA Ultimate 21.3.0 — Verification Report

## Automated checks completed in this workspace

- `npm run test:syntax`: passed, including the new server-owned access policy module.
- `npm test`: passed, including recovery, autonomous execution, builder, AI routing, provider discovery, voice engine, persistence, code generation, Voice Studio/camera, chat composer and the new access-control suite.
- Access-control tests verify guest/user/authorised-personnel/creator policy separation, least-privilege defaults, unknown-role fallback, and role-aware UI integration.
- Existing regression tests continue to cover chat send controls, visible assistant errors, six personas, Voice Studio, camera fallback/attachment handoff, and cache versioning.
- ZIP archive integrity is checked during final packaging.

## Changes in 21.3.0

- Added server-owned role policy definitions for Guest, User, Authorised Personnel, and Creator.
- Added `/api/access/capabilities`, with verified account identity and `Cache-Control: no-store`; the browser cannot assign its own role.
- Added optional allowlists for authorised personnel by verified Supabase email or user UUID (`NOVA_AUTHORISED_EMAILS`, `NOVA_AUTHORISED_USER_IDS`).
- Added role-specific access-level settings and visible capability badges.
- Creator-only advanced navigation is shown only after the server reports Creator; if capability verification fails, advanced navigation stays hidden.
- Kept sensitive write operations behind creator-only backend middleware; authorised personnel remain read-only for restricted builder information.
- Updated app and service-worker versions to invalidate stale cached UI.

## Runtime limitations

The server startup smoke test could not run because Express is not installed in this workspace; `npm install --ignore-scripts --no-audit --no-fund` timed out. Therefore live endpoint authorization, Supabase identity assignment, live AI provider calls, Render deployment, microphone/camera permission prompts, and physical mobile/desktop behavior remain unverified and must be tested in the configured deployment and real browsers/devices. Do not paste API secrets into the repository or frontend.
