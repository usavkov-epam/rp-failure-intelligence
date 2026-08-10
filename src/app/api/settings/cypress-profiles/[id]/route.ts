import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getUserOwnerKey } from "@/lib/user-identity";
import { removeCypressProfile, saveCypressProfile } from "@/lib/user-settings";
import { cypressProfileInputSchema } from "@/lib/user-settings-schema";

export async function PUT(request: Request, context: RouteContext<"/api/settings/cypress-profiles/[id]">) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = cypressProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Cypress profile" }, { status: 400 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ profile: await saveCypressProfile(getUserOwnerKey(session), parsed.data, id) });
  } catch (error) {
    console.error("Unable to update Cypress profile", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Cypress profile" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/settings/cypress-profiles/[id]">) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const removed = await removeCypressProfile(getUserOwnerKey(session), id);
    return removed ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Cypress profile not found" }, { status: 404 });
  } catch (error) {
    console.error("Unable to delete Cypress profile", error);
    return NextResponse.json({ error: "Unable to delete Cypress profile" }, { status: 502 });
  }
}
