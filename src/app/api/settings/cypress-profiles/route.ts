import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { HTTP_STATUS } from "@/lib/domain-constants";
import { getUserOwnerKey } from "@/lib/user-identity";
import { listCypressProfiles, saveCypressProfile } from "@/lib/user-settings";
import { cypressProfileInputSchema } from "@/lib/user-settings-schema";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  try {
    return NextResponse.json({ profiles: await listCypressProfiles(getUserOwnerKey(session)) });
  } catch (error) {
    console.error("Unable to load Cypress profiles", error);
    return NextResponse.json({ error: "Unable to load Cypress profiles" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const parsed = cypressProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Cypress profile" }, { status: HTTP_STATUS.BAD_REQUEST });
  try {
    return NextResponse.json({ profile: await saveCypressProfile(getUserOwnerKey(session), parsed.data) }, { status: HTTP_STATUS.CREATED });
  } catch (error) {
    console.error("Unable to create Cypress profile", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Cypress profile" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
