# Phone preview acceptance checks

Use a production HTTPS deployment, not `npm run dev`: the development server intentionally does not register the offline service worker. Use fictional test entries. Browser storage is tied to the exact hostname: localhost, preview URLs, the production URL and custom domains each have separate data. Export important logs before changing hosts.

Record phone model, OS, browser, deployment URL, commit, and pass/fail for each check. These checks require a real device; they are not claimed as completed by automated tests.

## Installation and layout

- iPhone: open in Safari, Share → Add to Home Screen, then open from the installed icon.
- Android: open in Chrome, use Install app / Add to Home screen.
- Confirm the bird logo, Nest Little Baby title, readable larger fonts, bottom navigation, and no horizontal scrolling at phone width.
- Switch between light/nighttime modes and confirm preference survives reopening.

## Feeding reliability

- Start left, wait 30 seconds, switch right, wait 30 seconds, pause for 20 seconds, resume for 10 seconds, then save. Expect roughly 70 seconds total; paused time must not count.
- Repeat with phone locked for one minute. After unlocking, elapsed time must include the locked minute.
- Pause, add a note, reload and reopen: side totals, pause state and note must survive.
- Open a second tab: it should show the active session and must not create a duplicate session.
- Save, edit and add a past feed. Confirm overlapping sessions are rejected.

## Diapers, history and timezone

- Log one Wet, one Dirty and one Both. Expect wet=2, dirty=2, total changes=3.
- Edit a time and note. Confirm date/type filters, daily grouping and export contents.
- Set a timezone different from the phone's. Confirm event times and daily grouping follow the baby's timezone.

## Offline

- Open all app screens online once. Allow the first service worker install and asset cache to finish, then reload once online.
- Enable airplane mode. Relaunch the installed app and verify the shell loads.
- Start/switch/pause/save a feed and log a diaper offline. Reload and verify records persist.
- Restore connectivity. Records must remain exactly once. Phase 1 stays local: it does not upload or sync to another device.

## Release conditions

All applicable checks must pass before relying on the deployed app for regular logging. Verify export before clearing test data. Recheck install/offline behavior after deploying an update. Supabase sharing and cloud synchronization remain Phase 2 and require separate authorization/conflict tests.
