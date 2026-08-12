import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

import { GITHUB } from "./domain-constants";
import {
  CYPRESS_PROFILE_OIDC_AUDIENCE,
  hasTrustedGitHubActionsIdentity,
} from "./github-actions-oidc-policy";

const githubActionsKeys = createRemoteJWKSet(new URL(`${GITHUB.ACTIONS_OIDC_ISSUER}/.well-known/jwks`));

export async function verifyGitHubActionsIdentity(token: string, policy: Parameters<typeof hasTrustedGitHubActionsIdentity>[1]) {
  const { payload } = await jwtVerify(token, githubActionsKeys, {
    algorithms: ["RS256"],
    audience: CYPRESS_PROFILE_OIDC_AUDIENCE,
    issuer: GITHUB.ACTIONS_OIDC_ISSUER,
  });

  if (!hasTrustedGitHubActionsIdentity(payload, policy)) {
    throw new Error("Untrusted GitHub Actions identity");
  }
}
