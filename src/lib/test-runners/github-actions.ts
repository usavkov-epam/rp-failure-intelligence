import "server-only";

import { CANCELLATION_RESULT, TEST_RUNNER_KIND } from "../domain-constants";
import { createRunProfileSnapshot, getGitHubIntegration } from "../user-settings";
import type { TestRunner } from "./contracts";
import { GitHubActionsClient } from "./github-actions-client";

async function clientFor(ownerKey: string) {
  const integration = await getGitHubIntegration(ownerKey);
  if (!integration?.token) throw new Error("Configure GitHub in Settings before starting a run");
  return new GitHubActionsClient({ ...integration.actions, source: integration.source, token: integration.token });
}

export const githubActionsRunner: TestRunner = {
  descriptor: {
    kind: TEST_RUNNER_KIND.GITHUB_ACTIONS,
    label: "GitHub Actions",
    executionDescription: "Runs remotely in GitHub Actions.",
    supportsCancellation: false,
    hasExternalRunPage: true,
  },
  async initialRunUrl(ownerKey) {
    return (await clientFor(ownerKey)).workflowUrl();
  },
  async dispatch(context) {
    await createRunProfileSnapshot(context.requestId, { name: context.profileName, environment: context.profile });
    await (await clientFor(context.ownerKey)).dispatch(context.requestId, context.request, context.requestedBy, context.applicationBaseUrl);
  },
  async reconcile() {
    return false;
  },
  async getDetails(_ownerKey, run) {
    return run.runId ? (await clientFor(_ownerKey)).details(run.runId, run.requestId) : null;
  },
  async getArtifact(_ownerKey, run, artifactId) {
    if (!run.runId) return null;
    const url = await (await clientFor(_ownerKey)).artifactDownloadUrl(run.runId, artifactId);
    return url ? { kind: "redirect", url } : null;
  },
  async cancel() {
    return CANCELLATION_RESULT.UNSUPPORTED;
  },
};

export { clientFor as getGitHubActionsClient };
