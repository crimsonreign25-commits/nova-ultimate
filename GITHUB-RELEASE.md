# NOVA Ultimate v16 release checklist

- Version: 16.0.0
- Guest mode remains available.
- Provider/account integrations are optional.
- `.env` and runtime job data are excluded from Git.
- `npm run test:syntax` passes in the release environment.
- `npm test` passes for the local core test suite.
- Live provider testing requires network access and valid credentials.

CREATOR IDENTITY (IMPORTANT)
1. In Render, open the NOVA service → Environment.
2. Set NOVA_CREATOR_EMAIL to the exact email address of the account you use to sign in to NOVA with Supabase.
3. Optionally set NOVA_CREATOR_USER_ID to that account's Supabase Auth user UUID for a stable identity check.
4. Save changes and redeploy. Sign out of NOVA, then sign in again.
5. The profile should show “Creator • Full Experience” and a toast confirming Creator access. If it still shows “User”, check the email spelling and Render deployment logs.
Creator status is determined by the server from a verified Supabase session. A role displayed in the browser is not an authorization mechanism. Do not expose the Supabase service-role key or creator token in frontend code or commit secrets to GitHub.
