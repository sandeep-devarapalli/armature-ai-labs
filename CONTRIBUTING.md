# Contributing to Armature AI Labs

Thanks for helping improve Armature AI Labs, the physical AI and robotics lab in HSR
Layout, Bengaluru.

## Before you start

- Read `AGENTS.md` for project facts, editing constraints, and validation steps.
- Read `DESIGN.md` before changing the site, layout, or visual assets.
- Open an issue before a large content, design, or financial-model change.

## Making a change

1. Fork the repository and create a focused branch.
2. Use Node.js 22 and the committed npm lockfile.
3. Preserve intentional placeholders such as `Rs [rate]`, `[Founder name]`, and
   `href="#"` until final values are supplied.
4. Use INR as the primary currency on procurement and pricing pages.

Preview the React application on macOS with:

```sh
npm ci
npm run dev
```

Run the frontend checks before opening a pull request:

```sh
npm test
npm run build
```

The `site/` folder is the preserved legacy site. Do not deploy it over the
React application in `src/`.

## Project media

Every file added under `public/project-images/` must also add or update its row
in `BRAND-ASSETS.md`. Record the exact asset source, creator or rightsholder,
license or permission evidence, any crop or other modification, and the site
usage. A project repository license does not automatically license screenshots,
photographs, logos, or paper figures.

When the license cannot be established, write `Verification required` rather
than guessing. Such an asset is outside this repository's Apache-2.0 grant and
needs maintainer review before production promotion or reuse outside the site.

## Ecosystem map data

The Bengaluru robotics and physical AI map is maintained in
`src/data/bengaluruEcosystem.ts`.

To add a company or improve a listing:

1. Copy an existing entry and give it a unique, stable `slug`.
2. Add a concise description, relevant sectors, the organization website, and
   a public source for the details.
3. Use a public office, lab, or neighbourhood for the location. Do not publish
   private addresses or guess coordinates. Leave `coordinates` out when only a
   city-level presence is known.
4. Keep the internal review fields so maintainers can check the change before
   it appears on the public map.
5. Run the checks above and open a focused pull request that explains the
   source of the new information.

Signed-in edit suggestions with staff approval are planned. Until that flow is
available, GitHub pull requests are the public contribution path.

## Pull requests

Keep pull requests small and explain why the change is needed. Include the
validation you ran and screenshots for visual changes. Do not commit API keys,
`.env` files, Wrangler state, `dist/`, `dev-dist/`, generated review assets,
Supabase temporary state, private source material, or other machine-local files.

Contributions to source code and documentation are submitted under the Apache
License 2.0. Do not add or modify reserved Armature AI Labs identity assets unless a
maintainer has explicitly requested the change. See `BRAND-ASSETS.md`.
