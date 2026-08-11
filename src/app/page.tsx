import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthorizedSession } from "@/auth";
import Dashboard from "@/components/Dashboard";
import { config } from "@/lib/config";
import { resolveLaunchProfileId } from "@/lib/configuration-mappings";
import { getDashboardData, resolveReportSelection } from "@/lib/reportportal";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardConnection, listCypressProfiles } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

const reportSelectionSchema = z.object({
  project: z.string().trim().min(1).max(100).default("cypress-nightly"),
  launchName: z.string().trim().min(1).max(200).default("runNightlyEurekaReleaseTests-non-ecs"),
  launchId: z.coerce.number().int().positive().optional(),
  historyDepth: z.coerce.number().int().min(1).max(30).default(10),
});

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getAuthorizedSession();
  if (!session) redirect("/signin");
  const ownerKey = getUserOwnerKey(session);
  const dashboard = await getDashboardConnection(ownerKey);
  if (!dashboard) redirect("/settings?required=dashboard");
  const parameters = await searchParams;
  const sourceSelection = reportSelectionSchema.parse({
    project: parameters.project || dashboard.settings.defaultProject,
    launchName: parameters.launchName || dashboard.settings.defaultLaunchName,
    launchId: parameters.launchId,
    historyDepth: parameters.historyDepth || dashboard.settings.defaultHistoryDepth,
  });
  const fields = Object.fromEntries(dashboard.settings.reportFields.map((field) => {
    const requested = queryValue(parameters[`field.${field.key}`]);
    const legacyTeam = field.reportPortalParameter === "filter.cnt.name" ? queryValue(parameters.team) : undefined;
    const value = (requested ?? legacyTeam ?? field.defaultValue).trim();
    if (value.length > 200 || (field.required && !value)) throw new Error(`Invalid value for ${field.label}`);
    return [field.key, value];
  }));
  const requestedSelection = { ...sourceSelection, fields };
  const connection = { ...dashboard.reportPortal, testRailBaseUrl: dashboard.testRailBaseUrl };
  const [{ selection, options }, cypressProfiles] = await Promise.all([
    resolveReportSelection(connection, requestedSelection),
    listCypressProfiles(ownerKey),
  ]);
  if (
    selection.project !== requestedSelection.project
    || selection.launchName !== requestedSelection.launchName
    || selection.launchId !== requestedSelection.launchId
  ) {
    redirect(`/?${new URLSearchParams({
      project: selection.project,
      launchName: selection.launchName,
      ...(selection.launchId === undefined ? {} : { launchId: String(selection.launchId) }),
      historyDepth: String(selection.historyDepth),
      ...Object.fromEntries(Object.entries(selection.fields).filter(([, value]) => value).map(([key, value]) => [`field.${key}`, value])),
    })}`);
  }
  const availableProfileIds = new Set(cypressProfiles.map(({ id }) => id));
  const suggestedProfileId = resolveLaunchProfileId(
    selection.launchName,
    dashboard.settings.launchProfileMappings,
    availableProfileIds,
  ) || cypressProfiles.find(({ isDefault }) => isDefault)?.id || cypressProfiles[0]?.id || "";
  return <Dashboard
    initialData={await getDashboardData(connection, selection, dashboard.settings.reportFields)}
    reportSelection={selection}
    reportSourceOptions={options}
    sourceRepository={config.githubSource}
    cypressProfiles={cypressProfiles.map(({ id, name, isDefault }) => ({ id, name, isDefault }))}
    reportFields={dashboard.settings.reportFields}
    cypressConfigFields={dashboard.settings.cypressConfigFields}
    suggestedProfileId={suggestedProfileId}
    user={{ name: session.user.name || session.user.githubLogin || "User" }}
  />;
}
