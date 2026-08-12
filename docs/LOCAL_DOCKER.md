# Local Docker Guide

This guide describes the self-contained, single-user Failure Intelligence image intended for a developer workstation. Docker is the only workstation prerequisite. The container generates its local encryption key, stores application data in a Docker volume, and executes Cypress directly.

The developer supplies a Cypress repository URL and Git ref when starting the container. A ReportPortal URL and API key are configured in the UI after startup.

## Image variants

| Image tag | Purpose | Authentication and storage |
| --- | --- | --- |
| `local` | Developer workstation | Implicit local user and encrypted Docker-volume storage |
| `local-sha-<commit>` | Reproducible local build | Same behavior as `local`, pinned to a commit |
| `latest`, `sha-<commit>`, version tags | Hosted/production use | GitHub OAuth plus the CDK-created AWS data layer are required |

Local mode is enabled only in the local image target. The production image never falls back to local mode when configuration is missing.

## Start the application

Docker Desktop or another Docker-compatible runtime is the only prerequisite.

```bash
docker run -d \
  --name failure-intelligence \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v failure-intelligence-data:/data \
  -e LOCAL_RUNNER_REPOSITORY_URL=https://github.com/example/cypress-project.git \
  -e LOCAL_RUNNER_REF=main \
  ghcr.io/usavkov-epam/rp-failure-intelligence:local
```

Open [http://localhost:8080](http://localhost:8080). There is no sign-in screen in local mode.

The loopback address in the port mapping is intentional. Local mode has one implicit user and must not be exposed to a LAN, public interface, ingress, or reverse proxy.

## First-time configuration

1. Open **Settings → Integrations**.
2. Enter the ReportPortal API URL, including `/api/v1`, and its API key.
3. Save the integration.
4. Open **Configuration & mappings** and choose a default project and launch from the live ReportPortal response.
5. Optionally configure ReportPortal fields, Cypress configuration fields, launch-to-profile mappings, TestRail, and Cypress profiles.

Credentials are write-only after saving. The UI shows that a secret is configured but does not return its value to the browser.

## Persistent local data

The named `failure-intelligence-data` volume contains:

- the generated local encryption secret;
- encrypted ReportPortal and TestRail credentials;
- dashboard configuration and mappings;
- Cypress profiles and their secret variables;
- local Cypress run records;
- a cached Cypress-project checkout, package-manager cache, and Cypress binary;
- per-execution CLI logs, screenshots, videos, downloads, and test-result artifacts.

On first boot, the entrypoint generates a random 32-byte secret. Settings, API keys, profiles, and structured run metadata are stored in an AES-256-GCM encrypted envelope. The secret and encrypted store files use owner-only `0600` permissions, and writes replace the store atomically.

The generated key must remain available to decrypt the store, so it is persisted with the encrypted data. This prevents saved integration/profile secrets from appearing as plaintext in the structured store, image, or browser responses; it does not protect against someone who controls the Docker host or can copy the entire volume. Cypress CLI logs and test artifacts are ordinary files because they can be large and must be downloadable. They may contain test-system data and must be treated as sensitive. Local mode assumes the workstation and Docker account are trusted.

Do not mount the volume into production containers or share it between developers.

## Routine operations

Check status:

```bash
docker ps --filter name=failure-intelligence
```

Follow logs:

```bash
docker logs -f failure-intelligence
```

Stop and restart without losing data:

```bash
docker stop failure-intelligence
docker start failure-intelligence
```

The container has a built-in health check. A healthy container reports `healthy` in `docker ps` after its startup period.

## Local Cypress execution

Selecting failures and starting a run queues work inside the dashboard container. The local runner:

1. clones or updates the configured Cypress repository in the persistent volume;
2. detects Yarn, pnpm, or npm from the lockfile;
3. installs dependencies with the frozen lockfile and reuses persistent package/Cypress caches;
4. creates the selected Cypress profile as `environments.js` and applies validated UI configuration overrides;
5. runs each selected spec through Cypress CLI with the requested repetitions, concurrency, browser, and timeout;
6. stores CLI logs and result artifacts in the volume;
7. updates the Runs page through local polling.

Only one dashboard run is prepared at a time. The run's **Threads** setting controls parallel Cypress processes within that run. **Chrome** uses the Chromium browser installed in the local image; Electron uses the version bundled with the Cypress project dependency.

The first run is slower because the repository, npm packages, and Cypress binary must be downloaded. Later runs reuse the volume caches, while still applying the repository's frozen lockfile. The local image does not bundle a fixed Cypress version; the checked-out project controls it.

Active and queued runs can be cancelled from the Runs page. The runner terminates the CLI process group and records the run as cancelled. If the container restarts during execution, the unfinished record is marked `container restarted`; it is not silently resumed.

The temporary `environments.js` can contain Cypress secrets. It is created with owner-only permissions and removed after success, failure, cancellation, and container startup recovery.

### Select the Cypress repository

`LOCAL_RUNNER_REPOSITORY_URL` and `LOCAL_RUNNER_REF` select the repository cloned by the local runner. Both values are required when starting or recreating the container:

```bash
docker run -d \
  --name failure-intelligence \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v failure-intelligence-data:/data \
  -e LOCAL_RUNNER_REPOSITORY_URL=https://github.com/example/cypress-project.git \
  -e LOCAL_RUNNER_REF=main \
  ghcr.io/usavkov-epam/rp-failure-intelligence:local
```

The repository must contain one supported lockfile and a Cypress dependency. Public HTTPS repositories work without credentials. The local runner does not accept private-repository credentials through application settings.

To avoid a remote Git source, mount an existing local Git repository read-only:

```bash
docker run -d \
  --name failure-intelligence \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v failure-intelligence-data:/data \
  -v /absolute/path/to/cypress-project:/runner-source:ro \
  -e LOCAL_RUNNER_REPOSITORY_URL=file:///runner-source \
  -e LOCAL_RUNNER_REF=main \
  ghcr.io/usavkov-epam/rp-failure-intelligence:local
```

## Upgrade the application

Pull the new local image and recreate only the container. Do not remove the volume.

```bash
docker pull ghcr.io/usavkov-epam/rp-failure-intelligence:local
docker stop failure-intelligence
docker rm failure-intelligence
docker run -d \
  --name failure-intelligence \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v failure-intelligence-data:/data \
  -e LOCAL_RUNNER_REPOSITORY_URL=https://github.com/example/cypress-project.git \
  -e LOCAL_RUNNER_REF=main \
  ghcr.io/usavkov-epam/rp-failure-intelligence:local
```

Settings and profiles remain in the named volume. For reproducible testing, replace `local` with an immutable `local-sha-<commit>` tag.

## Back up and restore

The backup must include the complete volume because both the ciphertext and generated key are required.

Stop the application before creating a consistent backup:

```bash
docker stop failure-intelligence
docker run --rm \
  -v failure-intelligence-data:/data:ro \
  -v "$PWD":/backup \
  alpine:3.22 \
  tar -czf /backup/failure-intelligence-data.tgz -C /data .
docker start failure-intelligence
```

Restore into an empty volume:

```bash
docker volume create failure-intelligence-data
docker run --rm \
  -v failure-intelligence-data:/data \
  -v "$PWD":/backup:ro \
  alpine:3.22 \
  tar -xzf /backup/failure-intelligence-data.tgz -C /data
```

Treat the backup archive as a secret: it includes the encryption key and can be decrypted by someone with the application code.

## Hosted integrations in local mode

The local runner executes Cypress in the container. GitHub Actions dispatch, workflow-profile delivery, GitHub webhooks, OAuth login, and Web Push are disabled in local mode. GitHub source configuration saved in Settings can still be used to generate source links, but it does not select the repository executed by the local runner; the two required `LOCAL_RUNNER_*` variables do that.

## Troubleshooting

### Port 8080 is already in use

Map a different loopback port, for example `-p 127.0.0.1:8081:8080`, and open `http://localhost:8081`.

### The container exits immediately

Inspect startup output:

```bash
docker logs failure-intelligence
```

Confirm that `/data` is backed by a writable Docker volume and that the local image tag—not `latest`—was used.

### Configuration disappeared after recreation

Confirm that the new container uses exactly `-v failure-intelligence-data:/data`. An anonymous volume or a different volume name creates a new workspace.

### Stored data cannot be decrypted

The `local-secret` and `store.enc.json` files must come from the same volume or backup. Losing or replacing `local-secret` makes the encrypted store unrecoverable.

### ReportPortal cannot be loaded

Verify the API URL includes `/api/v1`, the API key is current, and ReportPortal is reachable from Docker. For a service running on the host, use the Docker runtime's host gateway name instead of `localhost`, because `localhost` inside the container refers to the container itself.

### A local run fails during preparation

Download `logs/setup.log` from the run details. It contains the Git clone/update and dependency-install output. Confirm the repository/ref exists, the repository is readable without interactive authentication, and its frozen lockfile is valid.

### Cypress cannot start

Download the execution log from run details. The image contains Cypress Linux prerequisites, Chromium, and Xvfb, but the Cypress package and binary version come from the selected project. Confirm that the project's Cypress release supports the image's Node.js version and CPU architecture.

## Remove local mode

Remove only the container while preserving configuration:

```bash
docker stop failure-intelligence
docker rm failure-intelligence
```

Permanently remove the container and all stored credentials, settings, profiles, and history:

```bash
docker stop failure-intelligence
docker rm failure-intelligence
docker volume rm failure-intelligence-data
```

Volume removal is irreversible unless a complete backup exists.
