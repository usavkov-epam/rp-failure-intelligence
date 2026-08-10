import { describe, expect, it } from "vitest";

import { hasTrustedGitHubActionsIdentity } from "./github-actions-oidc-policy";

const policy = {
  owner: "usavkov-epam",
  repository: "rp-failure-intelligence",
  workflow: "cypress-selected-specs.yml",
  ref: "main",
};

const trustedClaims = {
  repository: "usavkov-epam/rp-failure-intelligence",
  repository_owner: "usavkov-epam",
  workflow_ref: "usavkov-epam/rp-failure-intelligence/.github/workflows/cypress-selected-specs.yml@refs/heads/main",
  ref: "refs/heads/main",
  event_name: "workflow_dispatch",
  runner_environment: "github-hosted",
};

describe("hasTrustedGitHubActionsIdentity", () => {
  it("accepts only the configured workflow identity", () => {
    expect(hasTrustedGitHubActionsIdentity(trustedClaims, policy)).toBe(true);
  });

  it.each([
    ["repository", "attacker/rp-failure-intelligence"],
    ["repository_owner", "attacker"],
    ["workflow_ref", "usavkov-epam/rp-failure-intelligence/.github/workflows/other.yml@refs/heads/main"],
    ["ref", "refs/heads/feature"],
    ["event_name", "pull_request"],
    ["runner_environment", "self-hosted"],
  ])("rejects an unexpected %s claim", (claim, value) => {
    expect(hasTrustedGitHubActionsIdentity({ ...trustedClaims, [claim]: value }, policy)).toBe(false);
  });
});
