import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getLocalCypressArtifact, getLocalCypressRunDetails } from "../cypress-run-store";
import { CANCELLATION_RESULT, TEST_RUNNER_KIND } from "../domain-constants";
import type { TestRunner } from "./contracts";

export const localCliRunner: TestRunner = {
  descriptor: {
    kind: TEST_RUNNER_KIND.LOCAL_CLI,
    label: "Local Cypress CLI",
    executionDescription: "Runs inside the local application container.",
    supportsCancellation: true,
    hasExternalRunPage: false,
  },
  initialRunUrl: () => "/runs",
  async dispatch(context) {
    const { enqueueLocalCypressRun } = await import("../local-cypress-runner");
    enqueueLocalCypressRun(context.requestId, context.request, context.profileName, context.profile);
  },
  async reconcile(runs) {
    const { recoverInterruptedLocalCypressRuns } = await import("../local-cypress-runner");
    return recoverInterruptedLocalCypressRuns(runs);
  },
  async getDetails(ownerKey, run) {
    return getLocalCypressRunDetails(ownerKey, run.requestId);
  },
  async getArtifact(ownerKey, run, artifactId) {
    const artifact = await getLocalCypressArtifact(ownerKey, run.requestId, artifactId);
    if (!artifact) return null;
    return {
      kind: "file",
      content: await readFile(artifact.path),
      fileName: path.basename(artifact.name).replaceAll('"', ""),
    };
  },
  async cancel(run) {
    const { cancelLocalCypressRun } = await import("../local-cypress-runner");
    return await cancelLocalCypressRun(run.requestId) ? CANCELLATION_RESULT.CANCELLED : CANCELLATION_RESULT.NOT_ACTIVE;
  },
};
