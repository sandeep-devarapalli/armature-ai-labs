# Update readiness repair for the photo release

The photo flow was squash-merged as `ed810d27` (PR #158). Main CI run `40181714939` blocked production: its final real-worker upgrade test retained the old document after Update now. All database, registration/photo and feedback checks passed. No deployment was approved.

The trace showed the new worker and new HTML fetched before the click, but no document navigation after it. It did not record worker activation events. Independent source review identified a matching readiness race: the component manually showed the button from `registration.waiting`, while Workbox delays its waiting event and Vite PWA attaches its controlling/reload handler only before delivering that event's notification.

Two deterministic unit scenarios, for already-waiting and newly discovered workers, both failed against the old component. Removing the two manual state changes makes readiness follow the PWA hook, whose reload handler is then installed. Explicit activation, update checking, throttling, offline/error handling and storage remain unchanged.

Validation: full unit suite passed 886 assertions. The unchanged real-worker upgrade test passed 10 consecutive runs in the same synthetic alternate-backend/analytics build configuration; it retains the original five-second new-document assertion, no premature reload, one requested navigation, preserved unfinished search and account/session storage. Independent review found no blocker. Logs: `/private/tmp/member-photo-update-race-before.log`, `member-photo-update-unit-after.log`, `member-photo-update-repeat.log`. Normal reviewed CI and production gates still apply.
