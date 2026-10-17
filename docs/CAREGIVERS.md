# Shared parenting with separate accounts

## Database setup

Run `supabase/migrations/004_caregiver_invites.sql` once after 001–003. Then run `supabase/tests/caregiver_privacy_checks.sql` in SQL Editor. It inserts synthetic accounts and babies inside a transaction and rolls back all fixtures. Confirm the final PASS result before sharing real care data. The older `privacy_checks.sql` was for the pre-sharing owner-only milestone; after migration 004 use the new caregiver test instead.

## Owner

1. Sign in, choose your existing cloud baby, and ensure it has a current backup/synced snapshot.
2. Under Caregivers, enter the other person's email and choose Create invite link.
3. Share the generated link or code privately with that person. This shares all saved and future synced history for the selected baby, including notes and baby details. No email is sent by the app.
4. The link expires after 7 days, works once and is bound to the invited person's confirmed email. Only the hash is stored in the database. The raw link is shown once; revoke and recreate if lost.
5. Revoke pending invites from the Invitations list. Remove accepted caregivers from the care-team list. Removal blocks subsequent cloud reads and writes; it cannot erase copies already downloaded to their device.

## Caregiver

Open the invitation, or paste its link/code under Settings → Caregivers → Have an invitation? Sign in or create an account using the exact invited email and confirm it. Reopen the invitation after email confirmation if necessary. Accept it, select the shared baby, restore / merge its history, and enable automatic sync.

Use your own device or an unlinked local profile. A browser already linked to another account/baby remains bound to it to avoid mixing histories; export its logs rather than attempting to reuse that browser for a different baby.

Set a display name (e.g. Mum, Dad, Alex) in Caregivers. Future synced entries show the server-recorded last editor. Existing historical entries without attribution are not retroactively assigned. The database stamps attribution from the signed-in user; the server returns the stamped snapshot to the sync engine.

## Security and behavior

Owners alone create/revoke invitations and remove caregivers. Confirmed invited accounts can read/update only their accessible babies under RLS. Caregivers cannot replace/delete owner backups through manual backup controls, transfer ownership, or invite others. Shared sync uses the same revision checks, offline queue and conflict review as same-account sync.

Invite tokens have 256 bits of randomness and travel in the URL fragment to avoid server request logs. Acceptance is explicit, transactional, email-bound, expiring and single-use. Removing membership immediately blocks new cloud access, including queued writes from a removed account. Local history and active timers remain on the device; offline copies are not remotely erased.

Active feeding timers are still device-local. Avoid starting a feed for the same baby on two devices. This milestone does not coordinate an active session across caregivers.

Localhost invitation links work only on the originating computer. Deploy an HTTPS app for real multi-device use, or share the code and open Settings on a device pointing at the same Supabase project.

## Verification

Automated tests cover token/email validation, signed-out API rejection and attribution-aware merging. The SQL test checks owner-only invitations, wrong-email/expired/revoked/replayed tokens, access before and after acceptance/removal, spoof-resistant attribution and revision conflicts. Its live result and real two-account device checks remain required; a successful app build alone does not verify RLS.
