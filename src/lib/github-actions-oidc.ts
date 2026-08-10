import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

import { config } from "./config";
import {
  CYPRESS_PROFILE_OIDC_AUDIENCE,
  hasTrustedGitHubActionsIdentity,
} from "./github-actions-oidc-policy";

const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
const githubActionsKeys = createRemoteJWKSet(new URL(`${GITHUB_ACTIONS_ISSUER}/.well-known/jwks`));

export async function verifyGitHubActionsIdentity(token: string) {
  const { payload } = await jwtVerify(token, githubActionsKeys, {
    algorithms: ["RS256"],
    audience: CYPRESS_PROFILE_OIDC_AUDIENCE,
    issuer: GITHUB_ACTIONS_ISSUER,
  });

  if (!hasTrustedGitHubActionsIdentity(payload, config.githubActions)) {
    throw new Error("Untrusted GitHub Actions identity");
  }
}
