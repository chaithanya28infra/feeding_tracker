# Automatic same-account synchronization

## Enable

1. Apply `supabase/migrations/003_revisioned_sync.sql` once, after 001 and 002.
2. Run `supabase/tests/privacy_checks.sql` in SQL Editor. It uses synthetic accounts inside a transaction and rolls everything back. Confirm the final PASS result. If a statement errors, fix it before enabling sync for real care data.
3. In app Settings, sign in and select the existing cloud baby profile. Create a manual backup first if there isn't one.
4. Choose **Enable automatic sync** and review the connection confirmation. Only connect the same baby's history. This first connection combines logs and prefers this device's matching event IDs and baby details.
5. Repeat on the second device, selecting the same baby with the same account. To start a clean second device from the cloud profile, use Restore / merge first, then enable sync.

## Behavior

- Saved feeds, diapers, deletions and baby details sync after local changes (debounced 1.5 seconds), on reconnect, when returning to the app, and roughly every 15 seconds while open.
- Every device save writes its state and pending snapshot in one IndexedDB transaction. Refreshing offline retains the queued changes. Sync resumes next time the app is open and online; the app does not promise background delivery while closed.
- The queue is bound to a particular account and baby. Signing out suspends transmission; signing in to a different account cannot flush another account's queue. Signing out hides device logs. Each account has separate local storage and a separate sync queue. Logs remain on the device unless the parent selects the removal option when signing out.
- The server verifies the bearer token with Supabase Auth on each request. Reads are owner-filtered and writes use a security-invoker Postgres function under RLS. A matching revision is mandatory for writes. The database increments the revision, including for manual backup updates.
- A three-way comparison uses the last acknowledged base, this device's current logs, and the cloud state. Changes to different event IDs merge. Deletes propagate. Concurrent changes to the same event, an edit against a delete, or conflicting edits to a baby field pause for review. Conflicts never silently overwrite a cloud value.
- Review conflicts in Settings. Choose local or cloud edits for conflicting items; unrelated changes still merge. If the cloud changes again during review, review the new conflict before proceeding. Overlapping saved feeding sessions require editing their times before resolving.
- A lost upload acknowledgement is safe: re-reading the same event IDs and revision recognizes an already-applied snapshot. Local edits made during an upload are preserved and remain queued.
- Active feeding timers and theme preferences remain device-local. This does not coordinate active sessions across devices. Avoid running independent feeds for the same baby on two devices.
- Pause sync to use manual backups. Pause retains the queue. Resuming keeps the original account/baby binding; switching this device to another cloud baby is intentionally blocked to avoid mixing care histories.

## Limits

Migration 003 provides snapshot sync for one account. Migration 004 extends it to separate invited caregiver accounts; see CAREGIVERS.md. This is not normalized event-level realtime replication. Polling needs an open app. Snapshots support at most 10,000 saved events and a 2 MB payload; large histories should be exported before that limit. Live two-device offline/online and conflict checks remain required before wider release.

## Acceptance test

Use fictional entries on two devices and confirm:

- Device A logs a diaper offline, reloads, reconnects, and Device B sees exactly one matching record.
- Each device adds a different entry offline; both survive reconnection.
- Both edit one entry differently offline; Settings requests review, with no silent overwrite.
- A deletion on one device propagates without reappearing on refresh.
- Sign out A, sign in to another account, and confirm the first account's pending changes never upload to that account.
- An active timer on a device continues unchanged while completed history downloads.

The 31 automated tests cover domain logic, durable queues, retries, account boundaries, API authentication rejection and merge behavior. They do not replace the SQL privacy check or real-device acceptance tests.
