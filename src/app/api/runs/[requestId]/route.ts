import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getCypressRun } from "@/lib/cypress-run-store";
import { loadCypressRunDetails } from "@/lib/cypress-runs";
import { getUserOwnerKey } from "@/lib/user-identity";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId } = await params;
  try {
    const run = await getCypressRun(getUserOwnerKey(session), requestId);
    if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: 404 });
    if (!run.runId) return NextResponse.json({ error: "GitHub run details are not available yet" }, { status: 409 });
    return NextResponse.json({ details: await loadCypressRunDetails(run.runId, requestId) });
  } catch (error) {
    console.error("Unable to load Cypress run details", error);
    return NextResponse.json({ error: "Unable to load Cypress run details" }, { status: 502 });
  }
}
