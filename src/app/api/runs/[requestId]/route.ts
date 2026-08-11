import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getCypressRun, getLocalCypressRunDetails } from "@/lib/cypress-run-store";
import { config } from "@/lib/config";
import { loadCypressRunDetails } from "@/lib/cypress-runs";
import { getUserOwnerKey } from "@/lib/user-identity";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId } = await params;
  try {
    const run = await getCypressRun(getUserOwnerKey(session), requestId);
    if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: 404 });
    if (config.isLocal) return NextResponse.json({ details: await getLocalCypressRunDetails(getUserOwnerKey(session), requestId) });
    if (!run.runId) return NextResponse.json({ error: "GitHub run details are not available yet" }, { status: 409 });
    return NextResponse.json({ details: await loadCypressRunDetails(run.runId, requestId) });
  } catch (error) {
    console.error("Unable to load Cypress run details", error);
    return NextResponse.json({ error: "Unable to load Cypress run details" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!config.isLocal) return NextResponse.json({ error: "Cancellation is available only for local runs" }, { status: 409 });
  const { requestId } = await params;
  const run = await getCypressRun(getUserOwnerKey(session), requestId);
  if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: 404 });
  if (run.status === "completed") return NextResponse.json({ error: "Cypress run has already completed" }, { status: 409 });
  const { cancelLocalCypressRun } = await import("@/lib/local-cypress-runner");
  const cancelled = await cancelLocalCypressRun(requestId);
  if (!cancelled) return NextResponse.json({ error: "Cypress run is no longer active; refresh its status" }, { status: 409 });
  return NextResponse.json({ cancelled }, { status: 202 });
}
