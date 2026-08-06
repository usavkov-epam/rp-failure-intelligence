import "server-only";

import { config } from "./config";
import type { CypressRunRequest } from "./cypress-run-request";

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

interface GitHubArtifact {
  name: string;
  expired: boolean;
}

export async function dispatchCypressRun(requestId: string, request: CypressRunRequest, requestedBy: string) {
  const { token, owner, repository, workflow, ref } = config.githubActions;
  if (!token) throw new Error("GitHub Actions dispatch is not configured");

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          request_id: requestId,
          requested_by: requestedBy,
          specs: JSON.stringify(request.specs),
          runs: String(request.runs),
          threads: String(request.threads),
          browser: request.browser,
          timeout_seconds: String(request.timeoutSeconds),
          environment: request.environment || "",
          cypress_config: JSON.stringify(request.cypressConfig),
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub Actions dispatch failed with ${response.status}`);
  }

  return {
    requestId,
    actionsUrl: `https://github.com/${owner}/${repository}/actions/workflows/${workflow}`,
  };
}

export async function loadCypressArtifacts(runId: number) {
  const { token, owner, repository } = config.githubActions;
  if (!token) throw new Error("GitHub Actions artifacts are not configured");
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
    { headers: githubHeaders(token), cache: "no-store" },
  );
  if (!response.ok) throw new Error(`GitHub Actions artifacts request failed with ${response.status}`);

  const data = await response.json() as { artifacts: GitHubArtifact[] };
  return data.artifacts.filter((artifact) => !artifact.expired).map((artifact) => artifact.name);
}
