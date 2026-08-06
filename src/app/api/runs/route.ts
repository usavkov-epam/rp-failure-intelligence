import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { cypressRunRequestSchema } from "@/lib/cypress-run-request";
import { dispatchCypressRun } from "@/lib/cypress-runs";
import { createCypressRun, failCypressRunDispatch, getRunChannel, listCypressRuns } from "@/lib/cypress-run-store";

function getRequestedBy(session: Awaited<ReturnType<typeof getAuthorizedSession>>) {
  return session?.user.githubLogin || session?.user.name || "authorized-user";
}

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const requestedBy = getRequestedBy(session);
    return NextResponse.json({
      runs: await listCypressRuns(requestedBy),
      channel: getRunChannel(requestedBy),
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
  const { owner, repository, workflow } = (await import("@/lib/config")).config.githubActions;
  const actionsUrl = `https://github.com/${owner}/${repository}/actions/workflows/${workflow}`;
  try {
    const run = await createCypressRun(requestId, requestedBy, parsed.data, actionsUrl);
    await dispatchCypressRun(requestId, parsed.data, requestedBy);
    return NextResponse.json({ requestId, actionsUrl, run }, { status: 202 });
  } catch (error) {
    await failCypressRunDispatch(requestId).catch(() => undefined);
    console.error("Unable to dispatch Cypress run", error);
    return NextResponse.json({ error: "Unable to start Cypress run" }, { status: 502 });
  }
}