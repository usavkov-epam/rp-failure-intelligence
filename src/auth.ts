import NextAuth, { type Session } from "next-auth";
import GitHub from "next-auth/providers/github";

import { config } from "@/lib/config";

interface GitHubProfile {
  login?: string;
}

interface Membership {
  state: "active" | "pending";
  organization: { login: string };
}

interface GitHubError {
  message?: string;
  documentation_url?: string;
}

async function findAuthorizedOrganization(accessToken: string, githubLogin?: string) {
  for (const organization of config.auth.allowedOrganizations) {
    const response = await fetch(`https://api.github.com/user/memberships/orgs/${encodeURIComponent(organization)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (response.ok) {
      const membership = await response.json() as Membership;
      if (membership.state === "active") return membership.organization.login;
      console.warn("GitHub organization membership is not active", {
        githubLogin,
        organization,
        state: membership.state,
      });
      continue;
    }

    const error = await response.json().catch(() => ({})) as GitHubError;
    console.warn("GitHub organization membership check failed", {
      githubLogin,
      organization,
      status: response.status,
      message: error.message,
      documentationUrl: error.documentation_url,
      grantedScopes: response.headers.get("x-oauth-scopes"),
      acceptedScopes: response.headers.get("x-accepted-oauth-scopes"),
      sso: response.headers.get("x-github-sso"),
    });
  }
  return null;
}

function findAuthorizedUser(githubLogin?: string) {
  if (!githubLogin) return null;
  return config.auth.allowedUsers.find((user) => user.toLowerCase() === githubLogin.toLowerCase()) || null;
}

async function findAuthorizationContext(accessToken: string | undefined, githubLogin?: string) {
  if (config.auth.authorizationMode === "users") {
    const authorizedUser = findAuthorizedUser(githubLogin);
    return authorizedUser ? `user:${authorizedUser}` : null;
  }
  if (!accessToken) return null;
  const authorizedOrganization = await findAuthorizedOrganization(accessToken, githubLogin);
  return authorizedOrganization ? `organization:${authorizedOrganization}` : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({
    authorization: {
      params: {
        scope: config.auth.authorizationMode === "organization"
          ? "read:user user:email read:org"
          : "read:user user:email",
      },
    },
  })],
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile, user }) {
      const githubLogin = (profile as GitHubProfile | undefined)?.login;
      const authorizationContext = await findAuthorizationContext(account?.access_token, githubLogin);
      if (!authorizationContext) return false;
      user.githubLogin = githubLogin;
      user.authorizationContext = authorizationContext;
      return true;
    },
    jwt({ token, account, user }) {
      if (user) {
        token.githubLogin = user.githubLogin;
      }
      if (account?.providerAccountId) token.githubUserId = account.providerAccountId;
      if (account?.access_token && config.auth.authorizationMode === "organization") {
        token.githubAccessToken = account.access_token;
      }
      if (config.auth.authorizationMode === "users") {
        delete token.githubAccessToken;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.githubLogin = typeof token.githubLogin === "string" ? token.githubLogin : undefined;
      session.user.githubUserId = typeof token.githubUserId === "string" ? token.githubUserId : undefined;
      session.user.authorizationContext = await findAuthorizationContext(
        typeof token.githubAccessToken === "string" ? token.githubAccessToken : undefined,
        session.user.githubLogin,
      ) || undefined;
      return session;
    },
  },
});

export async function getAuthorizedSession() {
  if (config.isLocal) {
    return {
      user: {
        name: "Local developer",
        githubLogin: "local",
        githubUserId: "local",
        authorizationContext: "local",
      },
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    } satisfies Session;
  }
  try {
    const session = await auth();
    return session?.user.authorizationContext ? session : null;
  } catch {
    return null;
  }
}
