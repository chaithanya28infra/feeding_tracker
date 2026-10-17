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

Open http://localhost:3000. Configure the baby's name, birth date, and timezone in Settings. No sample care data is inserted. Production service worker requires HTTPS or localhost; it is intentionally disabled in development.

## Implemented Phase 1

- Timestamp-based nursing timer with persistent left/right segments, switching, pause, resume and save. Closing, refreshing, or locking the phone does not reset the timer.
- IndexedDB commits before UI confirmation. Browser Web Locks serialize cross-tab writes; BroadcastChannel updates other open tabs. Browsers without Web Locks have a single-tab limitation.
- Wet, dirty and both diaper logs with immediate save, edit, undo/delete, notes, color and consistency.
- Dashboard totals, editable date-grouped history, date/type filters, manual feeding, 7/30-day charts and timezone-aware display.
- Baby profile, nighttime theme, JSON export, install manifest, icons and production offline shell cache.
- All care data stays on this browser. There is no account, cloud sync, caregiver sharing or background notification delivery in Phase 1. Local data is not encrypted and can be lost if browser storage is cleared. Export backups regularly.

## Architecture

`app/page.tsx` contains the responsive application and forms. `lib/model.ts` contains pure timer, date, and counting logic; `lib/storage.ts` persists one transactional app snapshot in IndexedDB. `tests/model.test.ts` covers timestamp recovery, switching, pause/resume, counts, duplicate IDs and DST boundaries. `tests/storage.test.ts` verifies IndexedDB timer/note recovery and offline local commits with fake-indexeddb. `public/sw.js` caches the production shell and same-origin assets after first visit. The timer's open segment records its original UTC start time, so elapsed time is reconstructed rather than accumulated by an interval. Intervals only refresh the display.

## Database / Phase 2

Copy `.env.example` to `.env.local` when integrating Supabase. Never put a service-role key in a NEXT_PUBLIC variable. Apply `supabase/migrations/001_initial.sql` to a fresh Supabase project. It supplies normalized profiles, babies, memberships, sessions, segments, diapers and reminders; RLS, tenant checks, immutable attribution, revision counters and one active feed per baby. The UI intentionally does not send local data to Supabase yet. The migration has not been applied or integration-tested against a hosted database.

Next phase: authenticated server routes and cookie sessions; owner-authorized, expiring invite redemption; explicit local-to-account import; a durable IndexedDB outbox with UUID idempotency and tombstones; revision-based conditional updates (`WHERE revision = expected`), explicit conflict resolution; realtime subscriptions filtered by baby; database tests with two caregivers and an unrelated account; authenticated export and account deletion. RLS must be verified against a live test database before enabling cloud care data. Historical session overlap constraints and segment-range validation must also be added for cloud synchronization.

## Deployment to Vercel

Import this repository into Vercel, choose Next.js, use `npm run build`, and deploy. No environment variables are needed for Phase 1. Use an HTTPS deployment for install/offline support. Icons are included at 192px and 512px. On iOS use Safari → Share → Add to Home Screen. Web push on iOS requires iOS 16.4+, a Home Screen installation, user permission and a backend push service; no unsupported background timers are offered. Reminders remain disabled and are not medical recommendations.

## Validation limits

Nine unit tests cover domain logic and IndexedDB persistence. Manual browser QA verified starting, switching sides, pausing, reload recovery with notes, saving a feeding, and the 390px mobile dashboard. Actual device installation, service-worker offline recovery, database authorization, and cloud synchronization still need integration tests. Phase 2 requires separate sync/authorization integration tests. Use production build in airplane mode after an initial online load to verify offline behavior on the target device.
