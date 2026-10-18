# NOVA Guardian — 21.4.4

## Included in this release

- A Guardian area inside the existing Security Center.
- Explicit consent and authorisation confirmation before a passive public-server assessment.
- Server-side authenticated endpoint (`POST /api/guardian/assess`) with rate limiting.
- A bounded HTTP `HEAD` request against a public IPv4 HTTP(S) target on standard ports only.
- Private/local address blocking, public IPv4 DNS validation and a pinned lookup for the request.
- Read-only checks for common HTTP security headers and informational server-banner disclosure.
- A downloadable JSON report with severity counts, recommendations, timestamps and limitations.
- Audit events for assessment start, completion and failure.
- An Android self-check checklist that clearly labels itself as user-confirmed guidance, not a malware scan.
- Unit tests for target validation and public/private IPv4 boundaries.

## Explicit limits

This is a **passive web-server hardening review**, not a penetration test, vulnerability exploit, malware scanner, endpoint detection product, or automatic repair engine. It does not change any server settings, install patches, quarantine files, inspect phone apps, or claim that a phone is malware-free. A missing response header is a hardening observation, not proof of compromise.

The initial server assessment supports public IPv4 hosts on standard HTTP/HTTPS ports only. It does not follow redirects, scan private networks, test arbitrary ports, test authentication, fuzz endpoints, or perform exploit attempts. Assessment requires a valid signed-in NOVA account and explicit consent in the UI.

## Planned next stages

1. **Device companion:** a permission-limited Android companion and Windows desktop agent, with transparent pairing, scoped access, revocation and local audit history.
2. **Device posture checks:** collect only operating-system-approved security signals, such as update status, app installation sources and permissions where available. Use platform security tools for malware verdicts rather than claiming NOVA can inspect private app storage.
3. **Consent-gated remediation:** show an exact change plan, expected impact, backup/rollback path and confirmation prompt before any setting or file is changed.
4. **Approved server repairs:** generate proposed configuration patches for review; never silently deploy changes. Require separate approval for restarts, firewall changes, upgrades and other disruptive actions.
5. **Cross-device project workspace:** authenticated device pairing, per-project access scopes, encrypted transport, explicit file grants and revocable sessions. Do not expose arbitrary desktop or phone control through the web app alone.
6. **Verification:** add integration tests with a controlled test server and Android/Windows test devices before claiming full device protection.

## Developer checks

- `npm run test:syntax`
- `npm run test:guardian`
- `npm test` (requires dependencies installed with `npm install`)

Guardian syntax checks and its 3 unit tests passed in the build environment. The full application test suite was not run because `node_modules` was not present in the extracted source package.
