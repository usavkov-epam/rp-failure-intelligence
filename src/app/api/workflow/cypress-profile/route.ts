import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { config } from "@/lib/config";
import { consumeRunProfileSnapshot } from "@/lib/user-settings";

const querySchema = z.string().uuid();

function authorized(header: string | null) {
  const secret = config.workflow.profileAccessSecret;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
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
