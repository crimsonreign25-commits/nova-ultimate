# NOVA Ultimate 21.6.1 — Manual Render Deployment

This package includes a cache-reset release intended to prevent older NOVA UI assets from being reused by the browser.

## Before deploying
1. Keep a copy of the currently deployed project as a rollback backup.
2. Extract this ZIP. The project root is the folder containing `package.json`, `index.js`, `public/`, and `core/`.
3. Confirm Render's service uses this repository/branch and the root directory is the project root.

## Render settings
- Build command: `npm install --no-audit --no-fund`
- Start command: `npm start`
- Health check path: `/health`
- Runtime: Node.js 22 (or newer supported by Render)

Keep existing environment variables in Render. Do not put API keys in source files or commit `.env`.

## Deploy with a clean build
1. Upload/commit the contents of this ZIP to the intended GitHub repository and deployment branch. Ensure `package.json` and `index.js` are at the repository root, not inside an extra nested folder.
2. In Render, open the service, select **Manual Deploy** → **Clear build cache & deploy**.
3. Wait for the deploy to finish and for the service to become Live.
4. Open `/health` on the deployed domain and confirm it returns JSON with `version` `21.6.1` and `ok: true`.
5. Open the site in a new Incognito tab first. If the old UI still appears, compare the deployed `/` HTML with `/public/index.html` in this package and check Render's selected branch/commit.

## Verification performed on this package
- `node --check index.js` passed.
- `node --check public/app.js` passed.
- Full `npm test` suite passed in the package environment.
- Root and `public/` copies of HTML, JavaScript, CSS and service worker are aligned.

## Important limitations
Tests passing verifies the included automated checks; it cannot guarantee external AI, image generation, voice provider, Supabase, or other integrations will work until the required environment variables and provider accounts are configured in Render.
