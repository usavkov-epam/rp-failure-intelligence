import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyGitHubActionsIdentity } from "@/lib/github-actions-oidc";
import { config } from "@/lib/config";
import { getCypressRunOwnerKey } from "@/lib/cypress-run-store";
import { AUTHORIZATION, HTTP_HEADER, HTTP_STATUS } from "@/lib/domain-constants";
import { consumeRunProfileSnapshot, getGitHubIntegration } from "@/lib/user-settings";

const querySchema = z.string().uuid();

export async function GET(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: HTTP_STATUS.NOT_FOUND });
  const authorization = request.headers.get(HTTP_HEADER.AUTHORIZATION);
  if (!authorization?.startsWith(AUTHORIZATION.BEARER_PREFIX)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  }
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: HTTP_STATUS.BAD_REQUEST });
  try {
    const ownerKey = await getCypressRunOwnerKey(parsed.data);
    const github = ownerKey ? await getGitHubIntegration(ownerKey) : null;
    if (!github) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
    await verifyGitHubActionsIdentity(
      authorization.slice(AUTHORIZATION.BEARER_PREFIX.length),
      github.actions,
    );
    const profile = await consumeRunProfileSnapshot(parsed.data);
    if (!profile) return NextResponse.json({ error: "Profile unavailable or expired" }, { status: HTTP_STATUS.NOT_FOUND });
    return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to provide Cypress workflow profile", error);
    return NextResponse.json({ error: "Unable to provide Cypress workflow profile" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
