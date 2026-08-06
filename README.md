# Failure Intelligence

An organization-agnostic ReportPortal analytics dashboard that links failures to their Cypress test sources. It uses no application database: Auth.js stores encrypted JWT sessions and ReportPortal remains the source of truth for failure history.

For architecture, use cases, security boundaries, code conventions, data flows, and contribution guidance, see [Engineering Guide](docs/ENGINEERING.md).

The included `.env.example` demonstrates read-only source links to `folio-org/stripes-testing`. Organization names, source repositories, refs, and integration endpoints are runtime configuration rather than product policy. ReportPortal project, launch name, specific run, team, and history depth are selected in the web app.

## Architecture

- Next.js 16, React 19, Material UI, and MUI Data Grid
- Server-only ReportPortal REST client with explicit error and empty states
- Auth.js GitHub OAuth with selectable organization-membership or static-user authorization
- Read-only links from ReportPortal failures to source specs in GitHub
- OpenNext deployment to Cloudflare Workers Free

GitHub OAuth establishes the user's identity. In organization mode, the token also verifies active organization membership. The app does not dispatch workflows or modify the source repository.

## Local Setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm exec auth secret
pnpm dev
```

Create a separate GitHub OAuth App for local development:

- Homepage URL: `http://localhost:8080`
- Authorization callback URL: `http://localhost:8080/api/auth/callback/github`
- Set its client ID as `AUTH_GITHUB_ID` and client secret as `AUTH_GITHUB_SECRET` in `.env.local`.
- Choose `AUTHORIZATION_MODE=organization` and set `AUTH_ALLOWED_ORGS`, or choose `AUTHORIZATION_MODE=users` and set `AUTH_ALLOWED_USERS`.

Run the app and open [http://localhost:8080](http://localhost:8080). The `pnpm dev` script binds to `localhost:8080`; use that exact host and port in the registered callback. Authentication is required in every environment, and there is no local bypass.

Without valid ReportPortal credentials, the app shows an error toast and no report rows. Valid responses without matching failures show `No data`. Live requests use `launch`, `item/v2`, and `item/history`; `RP_API_KEY` is never serialized into the React payload.

Use the **Report source** controls to choose the ReportPortal project, completed launch name, specific run, team, and history depth. The latest completed run is selected by default; choosing an older run displays a warning. Applying a selection stores its launch ID in the page URL, so the exact report can be bookmarked and shared without changing server environment variables.

Run all checks with `pnpm check`.

## GitHub OAuth App

Create an OAuth App under the account that operates the dashboard:

- Homepage URL: the deployed dashboard URL
- Callback URL: `https://<dashboard-host>/api/auth/callback/github`
- Client ID: `AUTH_GITHUB_ID`
- Client secret: `AUTH_GITHUB_SECRET`

The authorization mode is selected by `AUTHORIZATION_MODE`:

- `organization` (default): requests `read:user user:email read:org`. Sign-in and every protected request succeed only when `GET /user/memberships/orgs/{org}` returns `state: active` for an organization in `AUTH_ALLOWED_ORGS`. The GitHub access token remains inside the encrypted HTTP-only Auth.js JWT and is never added to the browser-visible session payload.
- `users`: requests `read:user user:email` and compares the authenticated GitHub login case-insensitively with `AUTH_ALLOWED_USERS`. The OAuth access token is not retained because protected requests revalidate the login against deployment configuration.

Both allowlists are comma-separated. The allowlist selected by the active mode must contain at least one entry or configuration validation fails.

## GitHub Source Repository

Configure `GITHUB_SOURCE_OWNER`, `GITHUB_SOURCE_REPO`, and `GITHUB_SOURCE_REF` to resolve each ReportPortal `codeRef` to its source spec. For the public `folio-org/stripes-testing` repository this requires no GitHub App, installation, repository secret, or workflow. The dashboard has no repository write path.

## Cloudflare Workers Free

OpenNext provides the Worker adapter. No R2, D1, KV, or paid queue is required.

1. Authenticate Wrangler with `pnpm exec wrangler login`.
2. Set each secret with `pnpm exec wrangler secret put <NAME>`, including authentication, `RP_API_KEY`, and other credential values.
3. Set non-secret configuration the same way or add it under `vars` in `wrangler.jsonc`.
4. Run `pnpm deploy`.
5. Update the OAuth App homepage and callback to the assigned `workers.dev` or custom-domain URL.

Useful commands:

```bash
pnpm preview     # build and run in the local Workers runtime
pnpm upload      # upload a version without deploying it
pnpm deploy      # build and deploy
pnpm cf-typegen  # regenerate Cloudflare binding types
```

Cloudflare Workers Free can operate without recurring hosting fees, subject to provider quotas.

## Security Model

- No `NEXT_PUBLIC_*` secret variables are used.
- Dashboard routes verify an authorized server session at the data boundary.
- ReportPortal, Jira, TestRail, and OAuth credentials stay server-side.
- Report project, launch, team, and history inputs are length/range validated before server-side API use.
- The source repository and ref are fixed by deployment configuration, not accepted from browser requests.
- No GitHub Actions or repository mutation API is exposed.
