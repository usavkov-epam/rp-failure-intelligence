import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { HTTP_STATUS } from "@/lib/domain-constants";
import { getUserOwnerKey } from "@/lib/user-identity";
import { removeCypressProfile, saveCypressProfile } from "@/lib/user-settings";
import { cypressProfileInputSchema } from "@/lib/user-settings-schema";

export async function PUT(request: Request, context: RouteContext<"/api/settings/cypress-profiles/[id]">) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const parsed = cypressProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Cypress profile" }, { status: HTTP_STATUS.BAD_REQUEST });
  try {
    const { id } = await context.params;
    return NextResponse.json({ profile: await saveCypressProfile(getUserOwnerKey(session), parsed.data, id) });
  } catch (error) {
    console.error("Unable to update Cypress profile", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Cypress profile" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/settings/cypress-profiles/[id]">) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  try {
    const { id } = await context.params;
    const removed = await removeCypressProfile(getUserOwnerKey(session), id);
    return removed ? new NextResponse(null, { status: HTTP_STATUS.NO_CONTENT }) : NextResponse.json({ error: "Cypress profile not found" }, { status: HTTP_STATUS.NOT_FOUND });
  } catch (error) {
    console.error("Unable to delete Cypress profile", error);
    return NextResponse.json({ error: "Unable to delete Cypress profile" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
