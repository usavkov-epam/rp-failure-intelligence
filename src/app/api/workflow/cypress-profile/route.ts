import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyGitHubActionsIdentity } from "@/lib/github-actions-oidc";
import { config } from "@/lib/config";
import { consumeRunProfileSnapshot } from "@/lib/user-settings";

const querySchema = z.string().uuid();

export async function GET(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await verifyGitHubActionsIdentity(authorization.slice(7));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const profile = await consumeRunProfileSnapshot(parsed.data);
    if (!profile) return NextResponse.json({ error: "Profile unavailable or expired" }, { status: 404 });
    return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to provide Cypress workflow profile", error);
    return NextResponse.json({ error: "Unable to provide Cypress workflow profile" }, { status: 502 });
  }
}
