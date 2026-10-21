# Website to courses sign-in

A member with an active website session can open Courses without another email sign-in. The isolated `/auth/course-session` frame responds only to the exact Courses parent origin, window and random nonce. A server endpoint validates the existing bearer, confirmed account and live Auth session before generating a single-use credential for that same user. Courses exchanges it for its own session. Refresh tokens are never copied between origins or placed in URLs. No email is sent.

Course membership, enrollment, paid entitlement, lesson and lab permissions remain in the existing RPC/RLS checks. Newly created sessions have AAL1: this does not bypass existing MFA requirements. An existing Courses session or email callback takes priority. Missing sessions, blocked storage/frames or timeouts fall back to normal sign-in. Explicit course sign-out suppresses automatic re-entry until “Continue with website sign-in” is selected.

The main build starts from production commit 8e1bb6897693b602c2909c296ba29ce37f46e53e. Course changes are separately integrated into the active courses-workbench sources: `CourseSession.tsx`, new `website-session.ts`, release CSP `frame-src`, and receiver tests. The course source is maintained in that existing local release workflow, not imported into this main-site PR. All other course files match the current combined sources, including lab submissions/reviews, Claude's diagrams and HSTS. No lesson packages or member policies are republished.

## Validation

- Main website: 860 tests passed; TypeScript, production build, artifact and actual Pages runtime checks passed.
- Course frontend: 561 tests passed; TypeScript, production build and 77-file release guard passed, including lab markers.
- Security tests exercise exact origins, window source, nonce, malformed messages, cleanup, account changes, expired/revoked source sessions, absent authentication, and server identity matching.
- Local browser tests use real isolated Auth and PostgREST with compiled production assets at the intended origins.
- Prepublication browser tests use disposable production accounts with staged frontend assets. Registered users retain samples and are denied restricted lessons; verified enrolled users retain full lessons and the Robot Actuators lab form. Independent session IDs/refresh tokens, refresh, signout/reload, single-use credentials and revoked-source denial passed. No real member records or messages were used.
- Actual Wrangler headers: canonical bridge 200 with exact Courses frame-ancestors and no X-Frame-Options; `.html` canonical redirect retains protection; other main pages keep DENY. Courses itself retains DENY and frame-ancestors none.

Test harness caveats: isolated copies needed missing fixture paths restored and explicit dependency realpath allowlists; existing timing-sensitive tests passed with bounded workers. No product tests were weakened. Cross-tab signout racing an already submitted credential verification is not claimed atomic.

## Rollback

Withdraw the Courses handoff first by restoring prior course deployment `db1be2e9.armature-courses.pages.dev`; then main deployment `d057b2e9.armature-lab.pages.dev`. The service-only RPC and authenticated endpoint can safely remain unused, or be removed after frontend rollback. Keep the endpoint inaccessible to anonymous callers. The schema migration has no learner-data mutation.
