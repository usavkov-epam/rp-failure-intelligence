import "server-only";

import { config } from "../config";
import { CANCELLATION_RESULT, TEST_RUNNER_KIND } from "../domain-constants";
import { createRunProfileSnapshot } from "../user-settings";
import type { TestRunner } from "./contracts";
import { GitHubActionsClient } from "./github-actions-client";

export const githubActionsClient = new GitHubActionsClient(config.githubActions);

export const githubActionsRunner: TestRunner = {
  descriptor: {
    kind: TEST_RUNNER_KIND.GITHUB_ACTIONS,
    label: "GitHub Actions",
    executionDescription: "Runs remotely in GitHub Actions.",
    supportsCancellation: false,
    hasExternalRunPage: true,
  },
  initialRunUrl: () => githubActionsClient.workflowUrl(),
  async dispatch(context) {
    await createRunProfileSnapshot(context.requestId, { name: context.profileName, environment: context.profile });
    await githubActionsClient.dispatch(context.requestId, context.request, context.requestedBy);
  },
  async reconcile() {
    return false;
  },
  async getDetails(_ownerKey, run) {
    return run.runId ? githubActionsClient.details(run.runId, run.requestId) : null;
  },
  async getArtifact(_ownerKey, run, artifactId) {
    if (!run.runId) return null;
    const url = await githubActionsClient.artifactDownloadUrl(run.runId, artifactId);
    return url ? { kind: "redirect", url } : null;
  },
  async cancel() {
    return CANCELLATION_RESULT.UNSUPPORTED;
  },
};
