import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getCypressRun } from "@/lib/cypress-run-store";
import { CANCELLATION_RESULT, HTTP_STATUS, RUN_STATUS } from "@/lib/domain-constants";
import { getTestRunner } from "@/lib/test-runners";
import { getUserOwnerKey } from "@/lib/user-identity";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const { requestId } = await params;
  try {
    const run = await getCypressRun(getUserOwnerKey(session), requestId);
    if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: HTTP_STATUS.NOT_FOUND });
    const details = await getTestRunner(run.runner).getDetails(getUserOwnerKey(session), run);
    if (!details) return NextResponse.json({ error: "Run details are not available yet" }, { status: HTTP_STATUS.CONFLICT });
    return NextResponse.json({ details });
  } catch (error) {
    console.error("Unable to load Cypress run details", error);
    return NextResponse.json({ error: "Unable to load Cypress run details" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const { requestId } = await params;
  const run = await getCypressRun(getUserOwnerKey(session), requestId);
  if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: HTTP_STATUS.NOT_FOUND });
  if (run.status === RUN_STATUS.COMPLETED) return NextResponse.json({ error: "Cypress run has already completed" }, { status: HTTP_STATUS.CONFLICT });
  const result = await getTestRunner(run.runner).cancel(run);
  if (result === CANCELLATION_RESULT.UNSUPPORTED) return NextResponse.json({ error: "This runner does not support cancellation" }, { status: HTTP_STATUS.CONFLICT });
  if (result === CANCELLATION_RESULT.NOT_ACTIVE) return NextResponse.json({ error: "Cypress run is no longer active; refresh its status" }, { status: HTTP_STATUS.CONFLICT });
  return NextResponse.json({ cancelled: true }, { status: HTTP_STATUS.ACCEPTED });
}
