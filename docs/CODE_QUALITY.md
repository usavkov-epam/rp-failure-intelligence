# Code quality conventions

## Principles

- **Single responsibility:** route handlers authenticate, validate, and delegate. Provider clients handle remote protocols. Repositories handle persistence. Components render state and invoke APIs.
- **Open/closed:** new runners implement the runner contract and register once; generic run routes remain unchanged.
- **Dependency inversion:** orchestration depends on `TestRunner`, not GitHub Actions or child processes.
- **Interface segregation:** capability flags and explicit unsupported results prevent consumers from assuming every runner behaves alike.
- **KISS:** prefer small functions and direct data transformations. Add an abstraction when it isolates a likely change axis or security boundary.
- **DRY:** security algorithms, domain vocabulary, limits, storage keys, protocol constants, and infrastructure defaults have one source of truth.

## Constants

`src/lib/domain-constants.ts` is dependency-free and can be imported by browser, server, tests, and infrastructure code. It owns shared run states, conclusions, runner kinds, ReportPortal statuses, limits, time conversions, DynamoDB vocabulary, media types, and HTTP statuses.

Infrastructure-only values live in `infra/lib/infrastructure-constants.ts`. A feature-local constant stays beside its implementation when sharing it would create coupling—for example package-manager filenames used only by the local runner.

Do not hide business meaning in anonymous numeric/string literals. Styling tokens, array indexes, zero checks, and one-off user-facing text are structural or presentation values rather than cross-cutting configuration.

## Comments and documentation

Comments explain security properties, compatibility decisions, extension constraints, or non-obvious reasons. They should not narrate syntax. Architecture and operational flows belong in `docs/`; provider extension instructions belong in `docs/TEST_RUNNERS.md`.

## Review checklist

- Is provider-specific behavior behind an adapter?
- Is sensitive data kept server-side and encrypted at the persistence boundary?
- Is a domain/protocol value duplicated instead of named once?
- Does the change add a branch to a generic route that belongs in a strategy implementation?
- Are errors provider-neutral at shared boundaries and specific inside adapters/logs?
- Are tests focused on public behavior and security invariants?
