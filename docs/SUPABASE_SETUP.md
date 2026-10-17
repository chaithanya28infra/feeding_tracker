# Connect Supabase

The project URL and publishable/legacy anon key live in ignored `.env.local`. The app uses no service-role key. Restart development after changing environment values. For Vercel, add the same two public variables to the project environment settings and redeploy.

## Database setup (one time)

In Supabase SQL Editor, open a new query and run the contents of these files **in order**:

1. `supabase/migrations/001_initial.sql` — normalized baby/caregiver/event schema and RLS.
2. `supabase/migrations/002_cloud_backups.sql` — owner-only manual backup storage and RLS.

These migrations target a fresh project; do not rerun migration 001 if it has already succeeded. No care records are seeded.

After migrations 003 and 004, run `005_baby_creation_access.sql`. It repairs baby creation with `INSERT ... RETURNING`: the read policy must test `owner_id = auth.uid()` directly because a stable helper cannot see the newly inserted row during that statement. It also explicitly grants authenticated SELECT/INSERT on babies. RLS stays enabled; owner-only creation and caregiver access rules remain enforced. The repair is safe to rerun and changes no care records. Run `supabase/tests/baby_creation_checks.sql` to verify creation and backup plus denial for unrelated/anonymous accounts; all synthetic fixtures roll back. The local SQL runner reproduces the old failure before applying 005, tests the repair with INSERT grants removed, and repeats creation/caregiver checks twice.

## Authentication

Enable Email authentication in Supabase Authentication → Providers. Under URL Configuration, use the deployment origin as Site URL and allow the development origin (`http://localhost:3000`) and exact deployment origins as Redirect URLs. The welcome page requires email/password sign-in or account creation before mounting the tracker. Each account has separate IndexedDB state, active timer, and sync queue; signed-out parents see no care history. Existing legacy logs linked to a sync account migrate to that same account. Unlinked legacy logs require an explicit import choice, or parents can start fresh while preserving the original copy. Signing out keeps device logs unless the removal option is selected in Settings. If email confirmation is enabled, confirm the received link before signing in. Never share your password or secret/service-role key in chat.

## Password recovery

The Settings sign-in form links to `/reset-password`. Signed-out parents can request a reset email; the email returns to this page where the authenticated recovery session allows a new password and confirmation. Invalid or expired links show a fresh email request form. Passwords must have 8–128 characters. A signed-in parent can also use this page to change their password.

In Authentication → URL Configuration, allow these exact Redirect URLs in addition to the existing app origins:

- `https://www.nestlittlebaby.com/reset-password`
- `http://localhost:3000/reset-password`
- Any additional deployment origin followed by `/reset-password` used for testing.

Set Site URL to `https://www.nestlittlebaby.com`. Configure custom SMTP (for example Resend with a verified sending domain) for production email. Keep `{{ .ConfirmationURL }}` in the Reset Password email template and disable email-provider link tracking for auth links. SMTP credentials stay in Supabase; the app needs no Resend key.

After deploying, test with your own account: request an email, open the link, enter matching new passwords, then sign out and sign in with the new password. Also check that a reused or expired email link offers a new reset request. Unit/build checks do not verify delivery or change a real account password.

## Backups

After sign-in, a new account sees **Add your baby** with name and birth date. This saves baby details locally, creates the first cloud backup, and enables automatic saving. A fresh device with one accessible saved baby opens that baby automatically; multiple babies require an explicit choice. A device with existing logs requires a compatible baby before combining histories. Existing connected accounts keep their timers, queue, and any paused-saving preference.

Settings shows the family account, baby details, and **Invite a caregiver**. Manual snapshot controls, pause/resume and conflict recovery are under **Advanced: backup & recovery**. The header reports Saved, Saving, Offline, or Needs attention and opens Settings when pressed. No cloud success is claimed when setup fails. Error details retain the server stage/code. Existing device logs can still be opened if account setup is temporarily unavailable.

The app still uses revisioned snapshots and account-separated IndexedDB; this interface change does not migrate or delete care data. Manual backups are owner-only, and cloud access remains subject to Supabase RLS.

On another device, sign in to the same account, select the baby and choose **Restore / merge**. Review the confirmation. Local event IDs win over the same IDs in a backup; existing local entries are retained, and baby details come from the backup. Export important local data first if you want a separate copy. Signing out leaves device logs in place. Restore imports data into the account's single local baby profile: do not merge different babies' histories.

Manual snapshots work after migrations 001 and 002. Migration 003 adds optional automatic same-account snapshot sync; see AUTOMATIC_SYNC.md. Migration 004 adds caregiver invitations; see CAREGIVERS.md. Shared active timers and normalized event-level realtime sync remain pending. The normalized event tables are foundations for the next milestone; backups use the separate baby_backups table.

## Access checks before release

- Signed-out API GET and POST must return 401 with no-store caching.
- Create test accounts A and B yourself; each creates a test baby and backup.
- A must not see B's baby or backup. Requests for B's baby ID with A's token must return no snapshot; writes must fail.
- Before migration 004, caregivers cannot access owner backups. After 004, an accepted caregiver must access only the invited baby’s shared snapshot; test with caregiver_privacy_checks.sql.
- In Supabase's policy explorer, confirm RLS is enabled on every app table and no anon role can read backups.
- These live cross-account checks require the migrations and real test users and are not claimed complete by unit tests.
