import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/auth";
import SettingsView from "@/components/SettingsView";
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
  return <SettingsView
    initialDashboardSettings={dashboardSettings}
    initialCypressProfiles={cypressProfiles}
    userName={session.user.name || session.user.githubLogin || "User"}
  />;
}
