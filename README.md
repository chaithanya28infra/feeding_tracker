# Nest Little Baby

Brand domain: `nestlittlebaby.com` (DNS and hosting are not configured by this rename).

A calm, mobile-first baby care PWA built with Next.js App Router, TypeScript, Tailwind, Lucide, Recharts, date-fns and IndexedDB.

## Run

Node.js 20.9+ required.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build # uses Webpack for portable compilation
npm start
```

Open http://localhost:3000 and sign in or create an account. Add your baby with a name and birth date; saving is set up automatically. Returning families open their existing baby. Edit details and timezone in Settings. No sample care data is inserted. Production service worker requires HTTPS or localhost; it is intentionally disabled in development.

## Implemented Phase 1

- Timestamp-based nursing timer with persistent left/right segments, switching, pause, resume and save. Closing, refreshing, or locking the phone does not reset the timer.
- IndexedDB commits before UI confirmation. Browser Web Locks serialize cross-tab writes; BroadcastChannel updates other open tabs. Browsers without Web Locks have a single-tab limitation.
- Wet, dirty and both diaper logs with immediate save, edit, undo/delete, notes, color and consistency.
- Dashboard totals, editable date-grouped history, date/type filters, manual feeding, 7/30-day charts and timezone-aware display.
- Baby profile, nighttime theme, JSON export, install manifest, icons and production offline shell cache.
- Care logs stay on this browser by default. Sign-in is required to open the tracker; each account has separate device storage. Settings offers explicit cloud backups and restore/merge. Optional automatic same-account sync is available after migration 003 and explicit device linking. Migration 004 adds email-bound caregiver invitations for a selected baby; background notification delivery is not enabled. Local data is not encrypted and can be lost if browser storage is cleared. Export backups regularly.

## Architecture

`app/page.tsx` contains the responsive application and forms. `lib/model.ts` contains pure timer, date, and counting logic; `lib/storage.ts` persists one transactional snapshot and sync queue per account in IndexedDB. The original `littlenest` database is retained for migration; linked logs follow the matching account, and unlinked logs require explicit import. `tests/model.test.ts` covers timestamp recovery, switching, pause/resume, counts, duplicate IDs and DST boundaries. `tests/storage.test.ts` verifies IndexedDB timer/note recovery and offline local commits with fake-indexeddb. `public/sw.js` caches the production shell and same-origin assets after first visit. The timer's open segment records its original UTC start time, so elapsed time is reconstructed rather than accumulated by an interval. Intervals only refresh the display.

## Database / Phase 2

Copy `.env.example` to `.env.local` when integrating Supabase. Never put a service-role key in a NEXT_PUBLIC variable. Apply `supabase/migrations/001_initial.sql` to a fresh Supabase project. It supplies normalized profiles, babies, memberships, sessions, segments, diapers and reminders; RLS, tenant checks, immutable attribution, revision counters and one active feed per baby. Apply `002_cloud_backups.sql` after `001_initial.sql` to enable manual backups. Data uploads only after the signed-in parent chooses Back up now. The project connection has been verified; database migrations and live cross-account authorization checks still need to be run. See [Supabase setup](docs/SUPABASE_SETUP.md).

Implemented: bearer-authenticated server routes verify each token through Supabase Auth and execute under the user’s RLS context. No service-role key is used. Implemented additionally: owner-authorized expiring invites, explicit local-to-cloud import, a durable IndexedDB snapshot queue, revision-based conditional updates (`WHERE revision = expected`) and conflict review. Remaining work: normalized event-level replication; realtime subscriptions filtered by baby; database tests with two caregivers and an unrelated account; authenticated export and account deletion. RLS must be verified against a live test database before enabling cloud care data. Historical session overlap constraints and segment-range validation must also be added for cloud synchronization.

## Deployment to Vercel

Import `chaithanya28infra/feeding_tracker` into Vercel, choose Next.js, keep the root directory as `./`, and deploy. `vercel.json` pins the install and build commands. GitHub Actions runs tests, type checks, and a production build for pushes to main and pull requests. Git integration creates subsequent deployments from pushes. Sign-in requires Supabase configuration. Set the two public Supabase variables in the Vercel environment and redeploy. Use an HTTPS deployment for install/offline support. Icons are included at 192px and 512px. On iOS use Safari → Share → Add to Home Screen. Web push on iOS requires iOS 16.4+, a Home Screen installation, user permission and a backend push service; no unsupported background timers are offered. Reminders remain disabled and are not medical recommendations.

## Validation limits

Automated tests cover domain logic, IndexedDB persistence, service-worker cache isolation, backup validation/merge, API authentication rejection, offline sync queues, account boundaries and conflict/retry behavior. Live multi-user RLS tests remain required after migration. Manual browser QA verified starting, switching sides, pausing, reload recovery with notes, saving a feeding, and the 390px mobile dashboard. Actual device installation, service-worker offline recovery, database authorization, and cloud synchronization still need integration tests. Phase 2 requires separate sync/authorization integration tests. Use production build in airplane mode after an initial online load to verify offline behavior on the target device.

## Phone acceptance testing

Follow [the phone checklist](docs/PHONE_TESTING.md) on the HTTPS deployment. The custom domain is not configured yet. Localhost and each deployed hostname have separate browser storage; export logs before switching hosts.

## Automatic same-account sync

See [automatic sync setup and limitations](docs/AUTOMATIC_SYNC.md). Run migration 003, then the transactional SQL privacy test before enabling sync. The app only syncs saved history after explicit linking; active timers remain device-local. Migration 004 extends sync to invited caregiver accounts; see caregiver setup below.

## Caregiver invitations

See [caregiver setup](docs/CAREGIVERS.md). Migration 004 shares a selected baby’s synced snapshot with confirmed, invited caregiver accounts under RLS. Run the new transactional caregiver privacy test after migration 004. Invites are email-bound, single-use and expire after seven days. No invitation emails are sent automatically. Active timers remain device-local.
