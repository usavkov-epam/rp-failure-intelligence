import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedSession } from "@/auth";
import { loadReportSourceChildren } from "@/lib/reportportal";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardConnection } from "@/lib/user-settings";

const querySchema = z.object({
  project: z.string().trim().min(1).max(100),
  launchName: z.string().trim().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    project: url.searchParams.get("project"),
    launchName: url.searchParams.get("launchName") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report source request" }, { status: 400 });
  }

  try {
    const dashboard = await getDashboardConnection(getUserOwnerKey(session));
    if (!dashboard) return NextResponse.json({ error: "Configure ReportPortal in Settings" }, { status: 409 });
    return NextResponse.json(await loadReportSourceChildren({ ...dashboard.reportPortal, testRailBaseUrl: dashboard.testRailBaseUrl }, parsed.data.project, parsed.data.launchName));
  } catch (error) {
    console.error("Unable to load ReportPortal source options", error);
    return NextResponse.json({ error: "Unable to load report source options" }, { status: 502 });
  }
}
