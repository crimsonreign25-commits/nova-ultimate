# NOVA Ultimate 21.5.0 — Test Report

## Automated checks completed

- `npm run test:syntax`: PASS.
- `npm test`: PASS, including encryption round-trip and tamper detection, production key enforcement, cloud AI opt-out, provider routing/failover, chat composer state, six persona instructions/holograms, voice/camera behavior, access policy, creator identity, private chat ownership, action-plan integrity/replay protection, and Guardian validation.
- Encrypted-store test confirms stored conversation text is not visible in the data file and can be recovered after restart with the same key.
- ZIP integrity will be checked after packaging.

## Checks not completed

- `npm install --ignore-scripts --no-audit --no-fund` timed out in this workspace, and application dependencies are not installed here. Therefore the Express server could not be launched for API integration tests.
- A local Chromium browser attempt was blocked by the environment's administrator policy. Therefore no visual desktop/mobile browser test is claimed.
- No live Render deployment, Supabase account flow, external AI provider call, real Android camera/microphone permission, or desktop/Android app-control test was performed.

## Deployment requirements and limits

- Before production startup, set `NOVA_DATA_ENCRYPTION_KEY` to a securely generated 64-character hex key and preserve a safe backup. Production intentionally refuses to start without it.
- Server-side file storage is encrypted when configured, but it remains file-backed. A host with ephemeral filesystem storage may lose history during restarts/redeploys; durable cross-device history requires persistent storage or a database-backed store.
- Browser-local copies of guest and account chat history remain in browser `localStorage` and are not encrypted by the server-side key. This release does not implement end-to-end encryption.
- Cloud AI providers receive prompts, relevant context, and attachments submitted for generation. Use trusted providers or set `NOVA_EXTERNAL_AI_ENABLED=false` to block cloud routing.
- The UI still uses inline scripts/styles, so CSP is disabled for compatibility. This should be addressed in a future hardening pass.
- The action gateway prepares and approves consent-gated plans; it does not provide universal remote control of every phone or PC app. Native companion permissions and supported integrations are required for real device control.
