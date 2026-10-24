# NOVA Ultimate v21.6.0

NOVA Ultimate is an open, guest-first next-generation AI assistant foundation. It combines multimodal chat, web research, voice/camera interfaces, autonomous planning and execution, adaptive recovery, sandboxed software development, persistent job/workspace state, verification, rollback, and artifact packaging.

## Quick start

Requirements: Node.js 18+ and npm.

```bash
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:3000`.

NOVA can run in guest mode. Provider keys are optional depending on which capabilities you want to use.

## Core capabilities

- Assistant / multimodal chat
- Web research
- Autonomous Agent: goal → plan → execute → verify → recover
- Command Center
- Builder Mode
- Multi-file autonomous code changes
- Bounded repair and transactional rollback
- Project/workspace inspection and artifact packaging
- Voice and camera interfaces
- Local history and memory
- Optional Supabase account layer
- PWA/mobile shell

## Builder safety

Builder work is sandboxed under `workspaces/`. Relative paths are validated to prevent traversal outside the workspace. Autonomous execution is bounded and verification-driven. The application does not expose arbitrary shell execution; verification uses restricted runners.

Destructive, external-write, and other approval-sensitive actions are designed to pass through NOVA's approval gates.

## Configuration

Copy `.env.example` to `.env` and add your own provider credentials as needed.

- `GROQ_API_KEY` — enables model-backed assistant/autonomous features.
- `ELEVENLABS_API_KEY` — enables server-side speech when configured.
- `SUPABASE_URL` / `SUPABASE_KEY` — optional account functionality.
- `PORT` — server port, default `3000`.

Never commit `.env` or real API keys.

## Development

Syntax checks:

```bash
npm run test:syntax
```

Core regression tests:

```bash
npm test
```

Full live-provider verification requires network access and valid provider credentials. The automated tests focus on the local NOVA core and its safety/recovery logic.

## Project structure

```text
core/       autonomous execution, recovery, jobs, builder, workspace management
public/     NOVA web UI and PWA assets
security/   request/device safety helpers
studio/     code-generation helpers
tests*.js   local regression tests
index.js    Express API and application entry point
```

## Open development

NOVA is intentionally being developed as an open, guest-first project. Account, cloud-sync, and other ecosystem features remain optional rather than prerequisites for the core assistant.

## License

MIT. See the `license` field in `package.json`.

## NOVA 21.2 — Universal Assistant

NOVA now includes a universal accessibility/personal-assistant layer, a mobile companion foundation, safe action gating, proactive assistance, offline request queuing, cross-device profile synchronization for authenticated accounts, and a minimal browser extension bridge.

### Universal accessibility
Large text, high contrast, reduced motion, live captions, voice-first interaction, focus mode, screen-reader announcements, keyboard shortcuts, and mobile/PWA guidance are built into the main interface.

### Mobile
The `android/` directory is a native Android companion foundation. It provides a launch surface and a permission-gated AccessibilityService boundary for future device assistance. It intentionally does not perform silent sensitive actions.

### Browser
The `extension/` directory contains a Manifest V3 launcher/bridge. It does not silently scrape or modify webpages.

### Safety and reliability
NOVA separates action planning from confirmation for high-risk operations, keeps persistent conversations, uses provider failover/recovery, and queues safe chat requests when connectivity is temporarily unavailable.

CREATOR IDENTITY (IMPORTANT)
1. In Render, open the NOVA service → Environment.
2. Set NOVA_CREATOR_EMAIL to the exact email address of the account you use to sign in to NOVA with Supabase.
3. Optionally set NOVA_CREATOR_USER_ID to that account's Supabase Auth user UUID for a stable identity check.
4. Save changes and redeploy. Sign out of NOVA, then sign in again.
5. The profile should show “Creator • Full Experience” and a toast confirming Creator access. If it still shows “User”, check the email spelling and Render deployment logs.
Creator status is determined by the server from a verified Supabase session. A role displayed in the browser is not an authorization mechanism. Do not expose the Supabase service-role key or creator token in frontend code or commit secrets to GitHub.


## NOVA 21.2.4 — Personalization Studio

- Adds Appearance settings for Premium Glass, Holographic, Minimal, Professional, Immersive, and Classic Chat styles.
- Adds theme choices: Midnight, Aurora, Nebula, Emerald, Sunset, Ocean, Forest, Light, and Follow Device.
- Adds hologram representation choices: Living Avatar, Energy Orb, Geometric AI, Abstract Lightform, Minimal Glow, or Off.
- Adds full/subtle/reduced motion controls and compact/comfortable/spacious layout density.
- Stores appearance preferences locally and provides a reset-to-default control.
- Keeps the active persona's identity colors while adapting the hologram to the selected representation.

These settings are a frontend implementation; platform-specific appearance parity, spoken login greetings, and live device behavior still require end-to-end testing before release.

## NOVA 21.3.0 role access and native voice

NOVA uses server-verified access levels: Guest, User, Authorised Personnel, and Creator. Configure the Creator identity with `NOVA_CREATOR_EMAIL` or `NOVA_CREATOR_USER_ID`; optional comma-separated Creator allowlists use `NOVA_CREATOR_USER_IDS`. Assign Authorised Personnel with `NOVA_AUTHORISED_EMAILS` or `NOVA_AUTHORISED_USER_IDS`. These values are server-side environment variables, not frontend settings. Authorised Personnel get restricted read-only access; Creator-only write routes remain backend-protected.

The default speech path uses the browser/device native Speech Synthesis API and requires no paid voice API. The server TTS adapter remains optional and is used as a fallback only when native speech is unavailable. Speech recognition and camera support still depend on browser/device permissions and HTTPS.

Run `npm run test:syntax`, `npm test`, and `npm run test:creator-identity` before deployment. Runtime testing with configured Supabase/provider credentials and real device permissions is still required for release sign-off.


## Secure deployment note (21.6.0)

For production, configure `NOVA_DATA_ENCRYPTION_KEY` as a 64-character hexadecimal secret before starting NOVA. See `.env.example` and `RELEASE-21.5.0-SECURE-ROUTER.md (historical baseline)`. Keep the key outside source control and back it up; losing it prevents decryption of stored data. Cloud AI providers receive prompts and attachments submitted for processing unless `NOVA_EXTERNAL_AI_ENABLED=false`.


## NOVA Ultimate workspace and audit notes

- `NOVA-ULTIMATE-WORKSPACE.html` is a standalone command-center demo. Its charts and persona dialogue are demonstrations, not live telemetry or a live AI connection. Use its Backend Connection panel to test `/health` and `/api/self-test` on a server you control.
- `NOVA-ULTIMATE-AUDIT-AND-NEXT-STEPS.md` records the initial inspection, fixes, verification limits, and staged plan.
- A successful `/api/self-test` is a local application self-check, not a penetration test or proof of absolute security.


## NOVA Evolution Engine (v21.6.0)

See [NOVA-EVOLUTION-ENGINE.md](./NOVA-EVOLUTION-ENGINE.md) for the evidence-led learning/evolution APIs, explicit opt-in storage, evaluation gates, creator-reviewed upgrade proposals, and test commands. NOVA does not claim underlying-model retraining or automatic production deployment.
