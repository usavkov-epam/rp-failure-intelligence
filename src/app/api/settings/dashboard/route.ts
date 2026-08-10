import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardSettings, saveDashboardSettings } from "@/lib/user-settings";
import { dashboardSettingsInputSchema } from "@/lib/user-settings-schema";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ settings: await getDashboardSettings(getUserOwnerKey(session)) });
  } catch (error) {
    console.error("Unable to load dashboard settings", error);
    return NextResponse.json({ error: "Unable to load dashboard settings" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = dashboardSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid dashboard settings" }, { status: 400 });
  try {
    return NextResponse.json({ settings: await saveDashboardSettings(getUserOwnerKey(session), parsed.data) });
  } catch (error) {
    console.error("Unable to save dashboard settings", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save dashboard settings" }, { status: 502 });
  }
}
