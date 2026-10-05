# NOVA Ultimate v16

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
