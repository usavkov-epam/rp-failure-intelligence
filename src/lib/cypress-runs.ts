import "server-only";

import { config } from "./config";
import type { CypressRunRequest } from "./cypress-run-request";

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

interface GitHubArtifact {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes: number;
  created_at: string;
}

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps?: Array<{ name: string; number: number; status: string; conclusion: string | null }>;
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

export async function loadCypressRunDetails(runId: number, requestId: string) {
  const { token, owner, repository } = config.githubActions;
  if (!token) throw new Error("GitHub Actions run details are not configured");
  const [jobsResponse, artifactsResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}/jobs?per_page=100`, { headers: githubHeaders(token), cache: "no-store" }),
    fetch(`https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}/artifacts?per_page=100`, { headers: githubHeaders(token), cache: "no-store" }),
  ]);
  if (!jobsResponse.ok) throw new Error(`GitHub Actions jobs request failed with ${jobsResponse.status}`);
  if (!artifactsResponse.ok) throw new Error(`GitHub Actions artifacts request failed with ${artifactsResponse.status}`);
  const jobsData = await jobsResponse.json() as { jobs: GitHubJob[] };
  const artifactsData = await artifactsResponse.json() as { artifacts: GitHubArtifact[] };
  return {
    jobs: jobsData.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      htmlUrl: job.html_url,
      steps: job.steps || [],
    })),
    artifacts: artifactsData.artifacts.filter(({ expired }) => !expired).map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes,
      createdAt: artifact.created_at,
      downloadUrl: `/api/runs/${requestId}/artifacts/${artifact.id}`,
    })),
  };
}

export async function loadCypressArtifactDownloadUrl(runId: number, artifactId: number) {
  const { token, owner, repository } = config.githubActions;
  if (!token) throw new Error("GitHub Actions artifacts are not configured");
  const artifactsResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
    { headers: githubHeaders(token), cache: "no-store" },
  );
  if (!artifactsResponse.ok) throw new Error(`GitHub Actions artifacts request failed with ${artifactsResponse.status}`);
  const artifactsData = await artifactsResponse.json() as { artifacts: GitHubArtifact[] };
  if (!artifactsData.artifacts.some(({ id, expired }) => id === artifactId && !expired)) return null;
  const downloadResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/artifacts/${artifactId}/zip`,
    { headers: githubHeaders(token), redirect: "manual", cache: "no-store" },
  );
  if (downloadResponse.status !== 302) throw new Error(`GitHub artifact download request failed with ${downloadResponse.status}`);
  return downloadResponse.headers.get("location");
}
