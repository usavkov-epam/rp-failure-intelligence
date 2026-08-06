# Failure Intelligence

An organization-agnostic ReportPortal analytics dashboard that links failures to their Cypress test sources and dispatches selected specs to GitHub Actions. ReportPortal remains the source of truth for failure analytics; Supabase stores only durable Cypress run metadata and provides Realtime notifications. Auth.js stores encrypted JWT sessions.

For architecture, use cases, security boundaries, code conventions, data flows, and contribution guidance, see [Engineering Guide](docs/ENGINEERING.md).

The included `.env.example` demonstrates read-only source links to `folio-org/stripes-testing`. Organization names, source repositories, refs, and integration endpoints are runtime configuration rather than product policy. ReportPortal project, launch name, specific run, team, and history depth are selected in the web app.

## Architecture

- Next.js 16, React 19, Material UI, and MUI Data Grid
- Server-only ReportPortal REST client with explicit error and empty states
- Auth.js GitHub OAuth with selectable organization-membership or static-user authorization
- Read-only links from ReportPortal failures to source specs in GitHub
- Authenticated dispatch of selected Cypress specs to GitHub Actions
- Supabase Postgres and Realtime for durable, webhook-driven Cypress run tracking
- Production deployment on Vercel

GitHub OAuth establishes the user's identity. In organization mode, the token also verifies active organization membership. A separate server-only token dispatches the bounded selected-spec workflow; the app does not modify the source repository.

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

## Cypress Runs

Select one or more failure rows and choose **Run selected**. The dashboard accepts 1–25 unique `cypress/e2e/**/*.cy.js` or `.cy.ts` paths and allows bounded repetition, concurrency, browser, and timeout settings. An allowlisted `environments.js` profile can be selected without exposing its credentials. Advanced options can override bounded, non-secret Cypress settings such as viewport, Cypress timeouts, retries, video, and failure screenshots. The workflow checks out `folio-org/stripes-testing`, runs its existing `cypress:repeat` command, and uploads logs, configuration metadata, summaries, Allure results, screenshots, and videos for 14 days.

The authenticated **Runs** page at `/runs` loads the GitHub user's 20 most recent runs from Supabase. GitHub sends signed `workflow_run` webhooks when a run is queued, starts, or completes. The webhook updates the durable row and publishes an opaque Supabase Realtime Broadcast; the open Runs page then reloads the authenticated list once and shows a completion toast. There is no timer polling. The page displays state, conclusion, duration, selected specs, runner settings, and artifact availability. Use **Actions** to inspect logs and download artifacts.

The Broadcast channel name is an HMAC of the lowercased GitHub login and `AUTH_SECRET`. Its payload contains only the request UUID. Run data remains behind the authenticated `/api/runs` endpoint; the browser has no direct table access.

Configure these server-only values for the dashboard:

- `GITHUB_ACTIONS_TOKEN`: fine-grained token with **Actions: Read and write** for `usavkov-epam/rp-failure-intelligence`; write dispatches workflows and read retrieves run and artifact status.
- `GITHUB_ACTIONS_OWNER`, `GITHUB_ACTIONS_REPO`, `GITHUB_ACTIONS_WORKFLOW`, and `GITHUB_ACTIONS_REF`: dispatch destination, with defaults shown in `.env.example`.
- `GITHUB_WEBHOOK_SECRET`: shared HMAC secret configured both in Vercel and the repository's `workflow_run` webhook.
- `CYPRESS_ENVIRONMENT_NAMES`: comma-separated, non-secret profile names that are safe to display and must exactly match keys in the encrypted `environments.js` file.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Realtime connection settings.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only database and broadcast credential.

All three Supabase variables must be configured together. Apply the migration under `supabase/migrations/` before enabling run dispatch. The table has RLS enabled and intentionally defines no browser policies.

Configure `STRIPES_TESTING_ENVIRONMENTS_B64` as an encrypted secret in the dashboard GitHub repository. Its value is the Base64-encoded content of a valid, uncommitted `stripes-testing/environments.js`. The workflow decodes it only on the ephemeral runner. Never commit that file or expose its credentials to the browser.

Environment selection changes only `activeEnvironment`; the selected profile supplies `baseUrl`, API endpoints, tenant, credentials, and environment flags from the encrypted file. UI-provided Cypress overrides are validated independently and applied through Cypress configuration environment variables. Secret environment values are never accepted as workflow inputs or stored in Supabase.

## GitHub Source Repository

Configure `GITHUB_SOURCE_OWNER`, `GITHUB_SOURCE_REPO`, and `GITHUB_SOURCE_REF` to resolve each ReportPortal `codeRef` to its source spec. Source links require no repository token. The selected-spec workflow checks out the public repository read-only and receives its test environment through an encrypted secret; the dashboard has no source-repository write path.

## Production Deployment

Production is deployed to Vercel at [rp-failure-intelligence.vercel.app](https://rp-failure-intelligence.vercel.app). The repository is linked to the `rp-failure-intelligence` Vercel project.

1. Configure all values from `.env.example` in the Vercel project. Encrypt secrets such as OAuth credentials, `AUTH_SECRET`, `RP_API_KEY`, `GITHUB_ACTIONS_TOKEN`, `GITHUB_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`.
2. Apply the Supabase migrations and enable Realtime for the project.
3. Configure a GitHub repository webhook with payload URL `https://<dashboard-host>/api/webhooks/github`, content type `application/json`, the same `GITHUB_WEBHOOK_SECRET`, and only the **Workflow runs** event.
4. Configure `STRIPES_TESTING_ENVIRONMENTS_B64` as an encrypted GitHub Actions secret.
5. Run `pnpm check` and deploy with `pnpm dlx vercel@latest --prod`.
6. Set the production OAuth App homepage and callback to the deployed HTTPS origin.

OpenNext and Wrangler scripts remain in the repository for optional Cloudflare evaluation, but Vercel is the supported production deployment.

## Security Model

- The only `NEXT_PUBLIC_*` integration values are Supabase's intentionally public URL and anon key; RLS grants the browser no table access.
- Dashboard routes verify an authorized server session at the data boundary.
- OAuth, ReportPortal, GitHub Actions, webhook, and Supabase service-role credentials stay server-side.
- Report project, launch, team, and history inputs are length/range validated before server-side API use.
- The source repository and ref are fixed by deployment configuration, not accepted from browser requests.
- GitHub Actions dispatch accepts only authenticated, validated, bounded selected-spec requests; no source-repository mutation API is exposed.
- Supabase stores run requests and GitHub result metadata, not ReportPortal reports, OAuth tokens, test credentials, or user profiles.
- `.env`, `.env.local`, and Vercel's local project metadata are ignored. Never commit credentials or generated environment files.
