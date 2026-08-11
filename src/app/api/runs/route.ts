import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { cypressRunRequestSchema } from "@/lib/cypress-run-request";
import { validateCypressConfigValues } from "@/lib/configuration-mappings";
import { dispatchCypressRun } from "@/lib/cypress-runs";
import { createCypressRun, failCypressRunDispatch, getRunChannel, listCypressRuns } from "@/lib/cypress-run-store";
import { getRequestedBy, getUserOwnerKey } from "@/lib/user-identity";
import { createRunProfileSnapshot, getCypressProfileSecret, getDashboardSettings } from "@/lib/user-settings";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ownerKey = getUserOwnerKey(session);
    return NextResponse.json({
      runs: await listCypressRuns(ownerKey),
      channel: getRunChannel(ownerKey),
    });
  } catch (error) {
    console.error("Unable to load Cypress runs", error);
    return NextResponse.json({ error: "Unable to load Cypress runs" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = cypressRunRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Cypress run request" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  const requestedBy = getRequestedBy(session);
  const ownerKey = getUserOwnerKey(session);
  const configuration = (await import("@/lib/config")).config;
  const { owner, repository, workflow } = configuration.githubActions;
  const actionsUrl = `https://github.com/${owner}/${repository}/actions/workflows/${workflow}`;
  try {
    const [selectedProfile, dashboardSettings] = await Promise.all([
      getCypressProfileSecret(ownerKey, parsed.data.profileId),
      getDashboardSettings(ownerKey),
    ]);
    if (!selectedProfile) return NextResponse.json({ error: "Cypress profile was not found" }, { status: 404 });
    if (!dashboardSettings || !validateCypressConfigValues(parsed.data.cypressConfig, dashboardSettings.cypressConfigFields)) {
      return NextResponse.json({ error: "Cypress configuration contains an unknown or invalid value" }, { status: 400 });
    }
    const run = await createCypressRun(requestId, ownerKey, requestedBy, parsed.data, actionsUrl, {
      id: selectedProfile.profile.id,
      name: selectedProfile.profile.name,
    });
    await createRunProfileSnapshot(requestId, { name: selectedProfile.profile.name, environment: selectedProfile.environment });
    await dispatchCypressRun(requestId, parsed.data, requestedBy);
    return NextResponse.json({ requestId, actionsUrl, run }, { status: 202 });
  } catch (error) {
    await failCypressRunDispatch(requestId).catch(() => undefined);
    console.error("Unable to dispatch Cypress run", error);
    return NextResponse.json({ error: "Unable to start Cypress run" }, { status: 502 });
  }
}
