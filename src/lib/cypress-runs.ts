import "server-only";

import { config } from "./config";
import type { CypressRunRequest } from "./cypress-run-request";

export async function dispatchCypressRun(request: CypressRunRequest, requestedBy: string) {
  const { token, owner, repository, workflow, ref } = config.githubActions;
  if (!token) throw new Error("GitHub Actions dispatch is not configured");

  const requestId = crypto.randomUUID();
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
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