# Failure Intelligence

An organization-agnostic ReportPortal analytics dashboard that links failures to their Cypress test sources and dispatches selected specs to GitHub Actions. ReportPortal remains the source of truth for failure analytics; Supabase stores durable run metadata and encrypted, user-owned integration profiles. Auth.js stores encrypted JWT sessions.

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

After the first sign-in, open **Settings** and configure your ReportPortal connection and dashboard defaults. Credentials are written to Supabase Vault through authenticated server routes and are never returned to the browser after saving. Valid responses without matching failures show `No data`. Live requests use `launch`, `item/v2`, and `item/history`.

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

Create one or more named Cypress profiles in **Settings**, then select failure rows and choose **Run selected**. A profile stores FOLIO `baseUrl`, Okapi/Kong URL, tenant, login/password, and supported ECS/Eureka options in Supabase Vault. Advanced options can override bounded, non-secret Cypress settings such as viewport, Cypress timeouts, retries, video, and failure screenshots.

At dispatch, the server creates a one-hour, one-time Vault snapshot. The workflow retrieves it from `/api/workflow/cypress-profile` using a short-lived GitHub Actions OIDC identity token bound to the configured repository, workflow, branch, event, and GitHub-hosted runner. No reusable profile-delivery credential is stored. Secret values never enter workflow inputs, summaries, or artifacts, and runtime credentials are registered for log masking before Cypress starts. The workflow writes mode-`0600` `environments.js`, runs `cypress:repeat`, and removes credential files even when the test step fails. Supabase deletes a consumed snapshot atomically and purges expired unclaimed snapshots every 15 minutes.

The authenticated **Runs** page at `/runs` loads the GitHub user's 20 most recent runs from Supabase. GitHub sends signed `workflow_run` webhooks when a run is queued, starts, or completes. The webhook updates the durable row and publishes an opaque Supabase Realtime Broadcast; the open Runs page then reloads the authenticated list once and shows a completion toast. There is no timer polling. The page displays state, conclusion, duration, selected specs, runner settings, and artifact availability. Use **Actions** to inspect logs and download artifacts.

The Broadcast channel name is an HMAC of the immutable GitHub owner key and `AUTH_SECRET`. Its payload contains only the request UUID. Run data remains behind the authenticated `/api/runs` endpoint; the browser has no direct table access.

Configure these server-only values for the dashboard:

- `GITHUB_ACTIONS_TOKEN`: fine-grained token with **Actions: Read and write** for `usavkov-epam/rp-failure-intelligence`; write dispatches workflows and read retrieves run and artifact status.
- `GITHUB_ACTIONS_OWNER`, `GITHUB_ACTIONS_REPO`, `GITHUB_ACTIONS_WORKFLOW`, and `GITHUB_ACTIONS_REF`: dispatch destination, with defaults shown in `.env.example`.
- `GITHUB_WEBHOOK_SECRET`: shared HMAC secret configured both in Vercel and the repository's `workflow_run` webhook.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Realtime connection settings.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only database and broadcast credential.

All three Supabase variables must be configured together. Apply the migration under `supabase/migrations/` before enabling run dispatch. The table has RLS enabled and intentionally defines no browser policies.

Configure the GitHub Actions variable `DASHBOARD_BASE_URL`. The workflow requests a short-lived OIDC token with `id-token: write`; no profile-delivery Actions secret is required. During the one-release cutover, the workflow can fall back to the existing `DASHBOARD_PROFILE_ACCESS_TOKEN` only when the old dashboard rejects OIDC. After one OIDC-authenticated run succeeds, remove the legacy `DASHBOARD_PROFILE_ACCESS_TOKEN` and `STRIPES_TESTING_ENVIRONMENTS_B64` GitHub secrets and the `WORKFLOW_PROFILE_SECRET`, `RP_API_KEY`, `RP_API_URL`, `TESTRAIL_BASE_URL`, and `CYPRESS_ENVIRONMENT_NAMES` Vercel values; the fallback is then inactive and obsolete shared integration configuration is gone.

## GitHub Source Repository

Configure `GITHUB_SOURCE_OWNER`, `GITHUB_SOURCE_REPO`, and `GITHUB_SOURCE_REF` to resolve each ReportPortal `codeRef` to its source spec. Source links require no repository token. The selected-spec workflow checks out the public repository read-only and receives its test environment through an encrypted secret; the dashboard has no source-repository write path.

## Production Deployment

Production is deployed to Vercel at [rp-failure-intelligence.vercel.app](https://rp-failure-intelligence.vercel.app). The repository is linked to the `rp-failure-intelligence` Vercel project.

1. Configure all values from `.env.example` in the Vercel project. ReportPortal, TestRail, and Cypress user credentials are not deployment variables.
2. Apply the Supabase migrations and enable Realtime for the project.
3. Configure a GitHub repository webhook with payload URL `https://<dashboard-host>/api/webhooks/github`, content type `application/json`, the same `GITHUB_WEBHOOK_SECRET`, and only the **Workflow runs** event.
4. Configure `DASHBOARD_BASE_URL` as an Actions variable. GitHub OIDC authenticates profile retrieval without a reusable secret.
5. Run `pnpm check` and deploy with `pnpm dlx vercel@latest --prod`.
6. Set the production OAuth App homepage and callback to the deployed HTTPS origin.

OpenNext and Wrangler scripts remain in the repository for optional Cloudflare evaluation, but Vercel is the supported production deployment.

## Security Model

- The only `NEXT_PUBLIC_*` integration values are Supabase's intentionally public URL and anon key; RLS grants the browser no table access.
- Dashboard routes verify an authorized server session at the data boundary.
- OAuth, user integration, GitHub Actions, webhook, and Supabase service-role credentials stay server-side.
- Report project, launch, team, and history inputs are length/range validated before server-side API use.
- The source repository and ref are fixed by deployment configuration, not accepted from browser requests.
- GitHub Actions dispatch accepts only authenticated, validated, bounded selected-spec requests; no source-repository mutation API is exposed.
- Supabase stores run metadata plus user-owned configuration. API and test credentials are authenticated-encrypted in Vault; browser roles have no table or Vault access.
- User-configured integration and Cypress endpoints must use HTTPS.
- `.env`, `.env.local`, and Vercel's local project metadata are ignored. Never commit credentials or generated environment files.
