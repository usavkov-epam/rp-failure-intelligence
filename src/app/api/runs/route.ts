import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { cypressRunRequestSchema } from "@/lib/cypress-run-request";
import { dispatchCypressRun } from "@/lib/cypress-runs";

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = cypressRunRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Cypress run request" }, { status: 400 });
  }

  try {
    const result = await dispatchCypressRun(
      parsed.data,
      session.user.githubLogin || session.user.name || "authorized-user",
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error("Unable to dispatch Cypress run", error);
    return NextResponse.json({ error: "Unable to start Cypress run" }, { status: 502 });
  }
}