import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/auth";
import SettingsView from "@/components/SettingsView";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project";
import { config } from "@/lib/config";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardSettings, listCypressProfiles } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getAuthorizedSession();
  if (!session) redirect("/signin");
  let ownerKey: string;
  try {
    ownerKey = getUserOwnerKey(session);
  } catch {
    redirect("/signin?error=session-upgrade");
  }
  const [dashboardSettings, cypressProfiles] = await Promise.all([
    getDashboardSettings(ownerKey),
    listCypressProfiles(ownerKey),
  ]);
  const activeProject = (await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value || dashboardSettings?.defaultProject;
  return <SettingsView
    initialDashboardSettings={dashboardSettings}
    initialCypressProfiles={cypressProfiles}
    userName={session.user.name || session.user.githubLogin || "User"}
    activeProject={activeProject}
    localMode={config.isLocal}
    applicationBaseUrl={config.applicationBaseUrl}
  />;
}
