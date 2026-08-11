import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedSession } from "@/auth";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project";
import { loadReportPortalProjects } from "@/lib/reportportal";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardConnection } from "@/lib/user-settings";

const inputSchema = z.object({ project: z.string().trim().min(1).max(100) }).strict();

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  try {
    const dashboard = await getDashboardConnection(getUserOwnerKey(session));
    if (!dashboard?.reportPortal.apiKey) return NextResponse.json({ error: "Configure ReportPortal in Settings" }, { status: 409 });
    const projects = await loadReportPortalProjects(dashboard.reportPortal);
    if (!projects.includes(parsed.data.project)) return NextResponse.json({ error: "ReportPortal project is not available" }, { status: 400 });
    (await cookies()).set(ACTIVE_PROJECT_COOKIE, parsed.data.project, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return NextResponse.json({ project: parsed.data.project });
  } catch (error) {
    console.error("Unable to update active ReportPortal project", error);
    return NextResponse.json({ error: "Unable to update active project" }, { status: 502 });
  }
}
