# Security

Report security issues privately to the repository owner rather than opening a
public issue. Do not include production credentials, member data, kiosk tokens,
or private inventory evidence in GitHub issues or pull requests.

## Temporary dependency exception

As of 7 August 2026, `react-router-dom` 7.18.2 is the latest published release.
`npm audit` reports `GHSA-qwww-vcr4-c8h2` for React Server Components action
handling. Armature AI Labs is a browser-only Vite SPA and does not expose React Router
RSC actions or a server action endpoint, so that path is not reachable here.

`npm run audit:production` permits only that advisory and expires the exception
on 7 September 2026. Any other production advisory, or the exception remaining
after that date, fails CI. Upgrade immediately when a patched release is
available.
