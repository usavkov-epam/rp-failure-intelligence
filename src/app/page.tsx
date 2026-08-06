import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthorizedSession } from "@/auth";
import Dashboard from "@/components/Dashboard";
import { config } from "@/lib/config";
import { getDashboardData, resolveReportSelection } from "@/lib/reportportal";

export const dynamic = "force-dynamic";

const reportSelectionSchema = z.object({
  project: z.string().trim().min(1).max(100).default("cypress-nightly"),
  launchName: z.string().trim().min(1).max(200).default("runNightlyEurekaReleaseTests-non-ecs"),
  launchId: z.coerce.number().int().positive().optional(),
  team: z.string().trim().min(1).max(100).default("thunderjet"),
  historyDepth: z.coerce.number().int().min(1).max(30).default(10),
});

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getAuthorizedSession();
  if (!session) redirect("/signin");
  const requestedSelection = reportSelectionSchema.parse(await searchParams);
  const { selection, options } = await resolveReportSelection(requestedSelection);
  if (
    selection.project !== requestedSelection.project
    || selection.launchName !== requestedSelection.launchName
    || selection.launchId !== requestedSelection.launchId
  ) {
    redirect(`/?${new URLSearchParams({
      project: selection.project,
      launchName: selection.launchName,
      ...(selection.launchId === undefined ? {} : { launchId: String(selection.launchId) }),
      team: selection.team,
      historyDepth: String(selection.historyDepth),
    })}`);
  }
  return <Dashboard
    initialData={await getDashboardData(selection)}
    reportSelection={selection}
    reportSourceOptions={options}
    sourceRepository={config.githubSource}
    cypressEnvironments={config.cypress.environmentNames}
    user={{ name: session.user.name || session.user.githubLogin || "User" }}
  />;
}
