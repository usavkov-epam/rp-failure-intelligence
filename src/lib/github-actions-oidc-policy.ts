export const CYPRESS_PROFILE_OIDC_AUDIENCE = "rp-failure-intelligence:cypress-profile";

export interface GitHubActionsIdentityClaims {
  [claim: string]: unknown;
  repository?: unknown;
  repository_owner?: unknown;
  workflow_ref?: unknown;
  ref?: unknown;
  event_name?: unknown;
  runner_environment?: unknown;
}

export interface GitHubActionsIdentityPolicy {
  owner: string;
  repository: string;
  workflow: string;
  ref: string;
}

function normalized(value: string) {
  return value.toLowerCase();
}

function expectedRef(ref: string) {
  return ref.startsWith("refs/") ? ref : `refs/heads/${ref}`;
}

export function hasTrustedGitHubActionsIdentity(
  claims: GitHubActionsIdentityClaims,
  policy: GitHubActionsIdentityPolicy,
) {
  const repository = `${policy.owner}/${policy.repository}`;
  const ref = expectedRef(policy.ref);
  const workflowRef = `${repository}/.github/workflows/${policy.workflow}@${ref}`;

  return typeof claims.repository === "string"
    && normalized(claims.repository) === normalized(repository)
    && typeof claims.repository_owner === "string"
    && normalized(claims.repository_owner) === normalized(policy.owner)
    && claims.workflow_ref === workflowRef
    && claims.ref === ref
    && claims.event_name === "workflow_dispatch"
    && claims.runner_environment === "github-hosted";
}
