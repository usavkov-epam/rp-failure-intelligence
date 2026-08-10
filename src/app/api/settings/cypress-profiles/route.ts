import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getUserOwnerKey } from "@/lib/user-identity";
import { listCypressProfiles, saveCypressProfile } from "@/lib/user-settings";
import { cypressProfileInputSchema } from "@/lib/user-settings-schema";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ profiles: await listCypressProfiles(getUserOwnerKey(session)) });
  } catch (error) {
    console.error("Unable to load Cypress profiles", error);
    return NextResponse.json({ error: "Unable to load Cypress profiles" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = cypressProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Cypress profile" }, { status: 400 });
  try {
    return NextResponse.json({ profile: await saveCypressProfile(getUserOwnerKey(session), parsed.data) }, { status: 201 });
  } catch (error) {
    console.error("Unable to create Cypress profile", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Cypress profile" }, { status: 502 });
  }
}
