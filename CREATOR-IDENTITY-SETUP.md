# NOVA Ultimate — Creator Identity Setup

This build identifies the Creator from a verified Supabase Auth session. The browser cannot promote itself by editing local storage or sending a role string.

## Render configuration

1. Open the NOVA Ultimate service in Render.
2. Open **Environment**.
3. Add `NOVA_CREATOR_EMAIL` and set its value to the exact email address used by the Creator account to sign in to NOVA.
4. Optional: add `NOVA_CREATOR_USER_ID` with the Creator account's UUID from **Supabase → Authentication → Users**. The UUID is a stable fallback if the account email changes.
5. Confirm `SUPABASE_URL` and `SUPABASE_KEY` (the anon/public key used by this build) are already configured. Do not put a Supabase service-role key in frontend code.
6. Save changes and redeploy the service.
7. Sign out of NOVA, sign in again with the Creator account, then check the account chip. It should say **Creator • Full Experience**.

## How the check works

- `/api/auth/me` first verifies the bearer token with Supabase Auth.
- The server compares the verified user's email (and optionally UUID) with the Creator environment configuration.
- The server returns the role as `access.role`; the UI only displays this server-returned role.
- Restricted endpoints continue to check role on the server. A displayed label alone does not grant access.

## If NOVA still shows User

- Check that the sign-in email exactly matches `NOVA_CREATOR_EMAIL` (case does not matter; leading/trailing spaces are ignored).
- Check that Render finished deploying the new commit/build and inspect its logs for startup errors.
- Sign out and sign in again to refresh the account identity response.
- If the account's email has changed, configure `NOVA_CREATOR_USER_ID` with the verified Supabase Auth UUID.

Never commit actual secrets, creator tokens, or Supabase service-role keys to GitHub. Keep `.env` private; `.env.example` is only a template.
