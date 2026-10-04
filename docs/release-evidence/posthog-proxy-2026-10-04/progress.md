# PostHog managed proxy — 4 October 2026

Owner approved updating the existing consent-controlled SDK to the live managed proxy `https://z.armatureailabs.com` and releasing after verification. Retain the existing public project token; use `https://us.posthog.com` as the dashboard host. No new inline bootstrap or collection features.

## Implementation

- Explicitly allow the exact proxy origin and require it in analytics-enabled production builds. Align production/CI environment values and the example configuration.
- Preserve consent/withdrawal, anonymous memory-only identity, strict event-property sanitization, private-route exclusions and enum-only registration counts. Autocapture, replay and person profiles remain disabled.
- Browser interception includes the proxy; tests verify opt-in delivery origin, URL stripping, excluded onboarding pageviews and withdrawal. Production guard rejects old, insecure and lookalike hosts.

## Evidence

- Node 22.22.2, existing lockfile/dependencies; `npm test -- --maxWorkers=2`: 539 tests / 52 files passed.
- `node --test tests/scripts/production-env.node.mjs`: 5 passed.
- Analytics-enabled synthetic `npm run build`: passed, including model/media/SEO checks.
- Independent read-only review: approved; no release blockers.
- Analytics-enabled desktop/mobile production browser checks: 33 passed, 3 existing intentional skips. New proxy opt-in/withdrawal checks passed in both viewports; no real events left the intercepted fixture.
- Initial browser run exposed test-only issues: duplicate consent/privacy region names, runner/build flag mismatch, and one Chromium screenshot-capture error under unrestricted parallelism. Scoped the selector, aligned environment flags and used two workers. The SDK also intentionally filters `navigator.webdriver`/headless visitors: the intercepted local test now represents a normal visitor without changing production bot filtering.
- Hosted CI, squash merge, production workflow and live proxy event read-back: pending.

No account secrets, member details or ID images belong in analytics or these notes. Payment and membership gates stay unchanged. Existing PostHog DNS/proxy provisioning is already live and is not modified.
