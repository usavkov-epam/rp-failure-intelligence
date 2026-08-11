import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { HTTP_STATUS } from "@/lib/domain-constants";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardSettings, saveDashboardSettings } from "@/lib/user-settings";
import { dashboardSettingsInputSchema } from "@/lib/user-settings-schema";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  try {
    return NextResponse.json({ settings: await getDashboardSettings(getUserOwnerKey(session)) });
  } catch (error) {
    console.error("Unable to load dashboard settings", error);
    return NextResponse.json({ error: "Unable to load dashboard settings" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}

export async function PUT(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const parsed = dashboardSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.length ? ` (${issue.path.join(".")})` : "";
    return NextResponse.json({ error: `Invalid dashboard settings${field}: ${issue.message}` }, { status: HTTP_STATUS.BAD_REQUEST });
  }
  try {
    return NextResponse.json({ settings: await saveDashboardSettings(getUserOwnerKey(session), parsed.data) });
  } catch (error) {
    console.error("Unable to save dashboard settings", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save dashboard settings" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
