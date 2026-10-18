# NOVA Ultimate 21.5.0 — Secure Router Update

## Included
- AES-256-GCM authenticated encryption for server-side persistent JSON data, with plaintext migration when the key is configured.
- Production startup guard requiring `NOVA_DATA_ENCRYPTION_KEY`.
- Security status endpoint at `/api/security/status`.
- Privacy disclosure in the chat UI and a router setting to disable cloud AI with `NOVA_EXTERNAL_AI_ENABLED=false`.
- Helmet headers, production HTTPS redirect, configurable CORS origin allowlist, auth throttling, assistant throttling, and private no-store cache headers.
- Regression tests for encryption round trips/tamper detection, production key enforcement, and cloud AI opt-out.

## Required deployment setup
1. Generate a unique key: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
2. Add the output as the secret `NOVA_DATA_ENCRYPTION_KEY` in Render environment variables. Never add the real value to GitHub.
3. Keep a secure backup of the key. The data cannot be decrypted without it.
4. Configure `NOVA_APP_URL` and `NOVA_ALLOWED_ORIGINS` if cross-origin access is required. Same-origin deployment does not need a CORS exception.
5. Deploy, then verify `/api/security/status`, `/health`, sign-in, chat, and the configured AI providers.

## Verification limits
Automated tests are not a penetration test. No claim is made that Render, physical Android/desktop browser behavior, external provider policies, or production secrets have been independently verified by this package. The existing interface still relies on inline JavaScript/styles, so CSP is disabled in this release.


## Storage boundaries
The server-side encrypted store does not encrypt the duplicate chat history held in the browser's `localStorage`; the UI now discloses this. Guest history remains local to that browser profile. This release does not claim end-to-end encryption. A future client-side encrypted vault would need its own key-recovery design and browser/device testing.
