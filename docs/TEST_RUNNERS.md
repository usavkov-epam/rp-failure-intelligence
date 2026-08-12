# Test runner extension guide

The application treats test execution as a provider capability, not as a GitHub Actions feature. API routes, pages, run persistence, and the UI depend on the `TestRunner` contract in `src/lib/test-runners/contracts.ts`.

## Contract

Every runner provides:

- a stable kind and presentation descriptor;
- an initial provider-neutral run URL;
- dispatch behavior;
- reconciliation after application restarts;
- run details and artifact retrieval;
- cancellation behavior; and
- explicit capability flags for cancellation and external run pages.

The current implementations are:

| Kind | Implementation | Execution model |
| --- | --- | --- |
| `github-actions` | `src/lib/test-runners/github-actions.ts` | Remote workflow dispatch, webhook status, GitHub jobs/artifacts |
| `local-cli` | `src/lib/test-runners/local-cli.ts` | Queued child processes inside the local Docker container |

GitHub HTTP details live in `github-actions-client.ts`; they do not leak into route handlers. Local process management remains in `local-cypress-runner.ts`; its adapter translates the process runner into the shared contract.

## GitHub Actions integration

Each hosted user configures GitHub from **Settings → Integrations**. The encrypted owner-scoped record contains a fine-grained token, webhook secret, Actions repository/workflow/ref, and a separate source repository/ref. No Actions repository or test-source repository is fixed by deployment variables.

The selected workflow must implement the `workflow_dispatch` inputs used by `github-actions-client.ts`, including `dashboard_base_url`, `source_owner`, `source_repository`, and `source_ref`. A compatible reference workflow is available at `.github/workflows/cypress-selected-specs.yml`. The application supplies its origin with every dispatch, so the Actions repository does not need a dashboard URL variable.

Configure a repository webhook for the `workflow_run` event at `https://<application-host>/api/webhooks/github`. Its secret must match the write-only webhook secret stored in the integration. Incoming events are matched to the run owner and then verified against that owner's secret, repository, and workflow.

## Adding a runner

1. Add a stable value to `TEST_RUNNER_KIND` in `src/lib/domain-constants.ts`.
2. Implement `TestRunner` in `src/lib/test-runners/<provider>.ts`.
3. Register it in `src/lib/test-runners/index.ts`.
4. Extend environment validation in `src/lib/config.ts` only if the runner requires deployment configuration.
5. Add provider-specific inbound adapters, such as a signed webhook route, without placing provider logic in the generic `/api/runs` routes.
6. Add contract tests covering dispatch, unavailable details, artifacts, cancellation, and reconciliation.

Run records persist the runner kind. This lets details and artifact requests resolve the runner that created the record rather than assuming the deployment's current default.

## Design rules

- Keep provider SDK/HTTP payloads inside the provider client or adapter.
- Never expose provider credentials to browser components.
- Return provider-neutral domain models from adapters.
- Represent unsupported operations explicitly instead of throwing generic errors.
- Use named constants for domain states, limits, protocol values, TTLs, and storage keys.
- Avoid abstractions that only rename a single operation; introduce a boundary when it isolates change, credentials, protocols, or lifecycle behavior.
