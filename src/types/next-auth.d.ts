import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      githubLogin?: string;
      githubUserId?: string;
      authorizationContext?: string;
    };
  }

  interface User {
    githubLogin?: string;
    githubUserId?: string;
    authorizationContext?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubLogin?: string;
    githubUserId?: string;
    githubAccessToken?: string;
  }
}
