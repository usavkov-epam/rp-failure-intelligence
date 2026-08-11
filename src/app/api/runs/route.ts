import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { cypressRunRequestSchema } from "@/lib/cypress-run-request";
import { validateCypressConfigValues } from "@/lib/configuration-mappings";
import { HTTP_STATUS } from "@/lib/domain-constants";
import { createCypressRun, failCypressRunDispatch, listCypressRuns } from "@/lib/cypress-run-store";
import { getTestRunner } from "@/lib/test-runners";
import { getRequestedBy, getUserOwnerKey } from "@/lib/user-identity";
import { getCypressProfileSecret, getDashboardSettings } from "@/lib/user-settings";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });

  try {
    const ownerKey = getUserOwnerKey(session);
    let runs = await listCypressRuns(ownerKey);
    const runner = getTestRunner();
    if (await runner.reconcile(runs)) runs = await listCypressRuns(ownerKey);
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Unable to load Cypress runs", error);
    return NextResponse.json({ error: "Unable to load Cypress runs" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });

  const parsed = cypressRunRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Cypress run request" }, { status: HTTP_STATUS.BAD_REQUEST });
  }

  const requestId = crypto.randomUUID();
  const requestedBy = getRequestedBy(session);
  const ownerKey = getUserOwnerKey(session);
  const runner = getTestRunner();
  const runUrl = runner.initialRunUrl();
  try {
    const [selectedProfile, dashboardSettings] = await Promise.all([
      getCypressProfileSecret(ownerKey, parsed.data.profileId),
      getDashboardSettings(ownerKey),
    ]);
    if (!selectedProfile) return NextResponse.json({ error: "Cypress profile was not found" }, { status: HTTP_STATUS.NOT_FOUND });
    if (!dashboardSettings || !validateCypressConfigValues(parsed.data.cypressConfig, dashboardSettings.cypressConfigFields)) {
      return NextResponse.json({ error: "Cypress configuration contains an unknown or invalid value" }, { status: HTTP_STATUS.BAD_REQUEST });
    }
    const run = await createCypressRun(requestId, ownerKey, requestedBy, parsed.data, runUrl, {
      id: selectedProfile.profile.id,
      name: selectedProfile.profile.name,
    });
    await runner.dispatch({
      requestId,
      request: parsed.data,
      requestedBy,
      profileName: selectedProfile.profile.name,
      profile: selectedProfile.environment,
    });
    return NextResponse.json({ requestId, runUrl, run }, { status: HTTP_STATUS.ACCEPTED });
  } catch (error) {
    await failCypressRunDispatch(requestId).catch(() => undefined);
    console.error("Unable to dispatch Cypress run", error);
    return NextResponse.json({ error: "Unable to start Cypress run" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
