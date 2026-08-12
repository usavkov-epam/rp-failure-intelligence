import { describe, expect, it, vi } from "vitest";

import { CYPRESS_BROWSER, GITHUB, RUN_DEFAULTS } from "../domain-constants";
import { GitHubActionsClient } from "./github-actions-client";

const configuration = {
  token: "test-token",
  owner: "example-owner",
  repository: "example-repository",
  workflow: "run-tests.yml",
  ref: "main",
};

describe("GitHubActionsClient", () => {
  it("dispatches the provider-neutral run request as workflow inputs", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GitHubActionsClient(configuration, request as typeof fetch);

    await client.dispatch("request-id", {
      launchName: "Nightly Eureka",
      specs: ["cypress/e2e/example.cy.ts"],
      runs: RUN_DEFAULTS.REPETITIONS,
      threads: RUN_DEFAULTS.THREADS,
      browser: CYPRESS_BROWSER.CHROME,
      timeoutSeconds: RUN_DEFAULTS.TIMEOUT_SECONDS,
      profileId: "0d697360-d730-4e0c-8a9c-cb4c09f632f1",
      cypressConfig: { video: false },
    }, "developer", "https://dashboard.example.org", { owner: "source-owner", repository: "tests", ref: "develop" });

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${GITHUB.API_BASE_URL}/repos/example-owner/example-repository/actions/workflows/run-tests.yml/dispatches`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      ref: "main",
      inputs: {
        request_id: "request-id",
        requested_by: "developer",
        dashboard_base_url: "https://dashboard.example.org",
        browser: CYPRESS_BROWSER.CHROME,
        cypress_config: JSON.stringify({ video: false }),
        source_owner: "source-owner",
        source_repository: "tests",
        source_ref: "develop",
      },
    });
  });

  it("filters expired artifacts and builds a provider URL", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({
      artifacts: [
        { id: 1, name: "results", expired: false, size_in_bytes: 10, created_at: "2026-01-01" },
        { id: 2, name: "expired", expired: true, size_in_bytes: 10, created_at: "2026-01-01" },
      ],
    }));
    const client = new GitHubActionsClient(configuration, request as typeof fetch);

    expect(await client.artifactNames(42)).toEqual(["results"]);
    expect(client.workflowUrl()).toBe(`${GITHUB.WEB_BASE_URL}/example-owner/example-repository/actions/workflows/run-tests.yml`);
  });
});
