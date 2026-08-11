import { GITHUB, HTTP_HEADER, MEDIA_TYPE } from "../domain-constants";
import type { CypressRunRequest } from "../cypress-run-request";
import type { CypressRunDetails } from "../types";

interface GitHubActionsConfiguration {
  token?: string;
  owner: string;
  repository: string;
  workflow: string;
  ref: string;
}

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

/** GitHub protocol adapter. Domain orchestration remains in the runner implementation. */
export class GitHubActionsClient {
  constructor(
    private readonly configuration: GitHubActionsConfiguration,
    private readonly request: typeof fetch = fetch,
  ) {}

  workflowUrl() {
    const { owner, repository, workflow } = this.configuration;
    return `${GITHUB.WEB_BASE_URL}/${owner}/${repository}/actions/workflows/${workflow}`;
  }

  private apiUrl(path: string) {
    return `${GITHUB.API_BASE_URL}/repos/${this.configuration.owner}/${this.configuration.repository}${path}`;
  }

  private headers() {
    if (!this.configuration.token) throw new Error("GitHub Actions is not configured");
    return {
      Accept: GITHUB.API_ACCEPT,
      Authorization: `Bearer ${this.configuration.token}`,
      "X-GitHub-Api-Version": GITHUB.API_VERSION,
    };
  }

  private async artifacts(runId: number) {
    const response = await this.request(
      this.apiUrl(`/actions/runs/${runId}/artifacts?per_page=${GITHUB.API_PAGE_SIZE}`),
      { headers: this.headers(), cache: "no-store" },
    );
    if (!response.ok) throw new Error(`GitHub Actions artifacts request failed with ${response.status}`);
    return (await response.json() as { artifacts: GitHubArtifact[] }).artifacts;
  }

  async dispatch(requestId: string, run: CypressRunRequest, requestedBy: string) {
    const response = await this.request(
      this.apiUrl(`/actions/workflows/${this.configuration.workflow}/dispatches`),
      {
        method: "POST",
        headers: { ...this.headers(), [HTTP_HEADER.CONTENT_TYPE]: MEDIA_TYPE.JSON },
        body: JSON.stringify({
          ref: this.configuration.ref,
          inputs: {
            request_id: requestId,
            requested_by: requestedBy,
            specs: JSON.stringify(run.specs),
            runs: String(run.runs),
            threads: String(run.threads),
            browser: run.browser,
            timeout_seconds: String(run.timeoutSeconds),
            cypress_config: JSON.stringify(run.cypressConfig),
          },
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`GitHub Actions dispatch failed with ${response.status}`);
  }

  async artifactNames(runId: number) {
    return (await this.artifacts(runId)).filter(({ expired }) => !expired).map(({ name }) => name);
  }

  async details(runId: number, requestId: string): Promise<CypressRunDetails> {
    const jobsRequest = this.request(
      this.apiUrl(`/actions/runs/${runId}/jobs?per_page=${GITHUB.API_PAGE_SIZE}`),
      { headers: this.headers(), cache: "no-store" },
    );
    const [jobsResponse, artifacts] = await Promise.all([jobsRequest, this.artifacts(runId)]);
    if (!jobsResponse.ok) throw new Error(`GitHub Actions jobs request failed with ${jobsResponse.status}`);
    const jobs = (await jobsResponse.json() as { jobs: GitHubJob[] }).jobs;
    return {
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        htmlUrl: job.html_url,
        steps: job.steps || [],
      })),
      artifacts: artifacts.filter(({ expired }) => !expired).map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
        sizeInBytes: artifact.size_in_bytes,
        createdAt: artifact.created_at,
        downloadUrl: `/api/runs/${requestId}/artifacts/${artifact.id}`,
      })),
    };
  }

  async artifactDownloadUrl(runId: number, artifactId: number) {
    if (!(await this.artifacts(runId)).some(({ id, expired }) => id === artifactId && !expired)) return null;
    const response = await this.request(
      this.apiUrl(`/actions/artifacts/${artifactId}/zip`),
      { headers: this.headers(), redirect: "manual", cache: "no-store" },
    );
    if (response.status !== GITHUB.ARTIFACT_REDIRECT_STATUS) {
      throw new Error(`GitHub artifact download request failed with ${response.status}`);
    }
    return response.headers.get("location");
  }
}
