import type { Session } from "next-auth";

export function getUserOwnerKey(session: Session) {
  if (session.user.authorizationContext === "local") return "local:developer";
  if (!session.user.githubUserId) {
    throw new Error("Your session predates user configuration support. Sign out and sign in again.");
  }
  return `github:${session.user.githubUserId}`;
}

export function getRequestedBy(session: Session) {
  return session.user.githubLogin || session.user.name || `github-${session.user.githubUserId}`;
}
