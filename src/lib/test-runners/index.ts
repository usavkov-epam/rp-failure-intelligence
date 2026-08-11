import "server-only";

import { config } from "../config";
import { TEST_RUNNER_KIND, type TestRunnerKind } from "../domain-constants";
import type { TestRunner } from "./contracts";
import { githubActionsRunner } from "./github-actions";
import { localCliRunner } from "./local-cli";

const runners: Record<TestRunnerKind, TestRunner> = {
  [TEST_RUNNER_KIND.GITHUB_ACTIONS]: githubActionsRunner,
  [TEST_RUNNER_KIND.LOCAL_CLI]: localCliRunner,
};

export function getTestRunner(kind: TestRunnerKind = config.testRunner.kind) {
  return runners[kind];
}

export type { ArtifactDownload, CancellationResult, TestRunner, TestRunnerDescriptor } from "./contracts";
