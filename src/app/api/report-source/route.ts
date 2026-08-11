import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedSession } from "@/auth";
import { HTTP_STATUS, VALIDATION_LIMITS } from "@/lib/domain-constants";
import { loadReportPortalProjects, loadReportSourceChildren } from "@/lib/reportportal";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardConnection } from "@/lib/user-settings";

const querySchema = z.object({
  project: z.string().trim().min(1).max(VALIDATION_LIMITS.KEY_LENGTH).optional(),
  launchName: z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH).optional(),
});

export async function GET(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    project: url.searchParams.get("project") || undefined,
    launchName: url.searchParams.get("launchName") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report source request" }, { status: HTTP_STATUS.BAD_REQUEST });
  }

  try {
    const dashboard = await getDashboardConnection(getUserOwnerKey(session));
    if (!dashboard || !dashboard.reportPortal.apiKey) return NextResponse.json({ error: "Configure ReportPortal in Settings", configured: false }, { status: HTTP_STATUS.CONFLICT });
    if (!parsed.data.project) return NextResponse.json({ projects: await loadReportPortalProjects(dashboard.reportPortal), launches: [], launchRuns: [] });
    return NextResponse.json(await loadReportSourceChildren({ ...dashboard.reportPortal, testRailBaseUrl: dashboard.testRailBaseUrl }, parsed.data.project, parsed.data.launchName));
  } catch (error) {
    console.error("Unable to load ReportPortal source options", error);
    return NextResponse.json({ error: "Unable to load report source options" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
