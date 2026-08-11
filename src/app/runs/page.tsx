import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/auth";
import RunsView from "@/components/RunsView";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project";
import { config } from "@/lib/config";
import { getRunChannel, listCypressRuns } from "@/lib/cypress-run-store";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await getAuthorizedSession();
  if (!session) redirect("/signin");
  const ownerKey = getUserOwnerKey(session);
  const { url, anonKey } = config.supabase;
  if (!config.isLocal && (!url || !anonKey)) throw new Error("Supabase run history is not configured");

  const [initialRuns, dashboardSettings] = await Promise.all([listCypressRuns(ownerKey), getDashboardSettings(ownerKey)]);
  let runs = initialRuns;
  if (config.isLocal) {
    const { recoverInterruptedLocalCypressRuns } = await import("@/lib/local-cypress-runner");
    if (await recoverInterruptedLocalCypressRuns(runs)) runs = await listCypressRuns(ownerKey);
  }
  return <RunsView
    initialRuns={runs}
    channelName={getRunChannel(ownerKey)}
    supabaseUrl={url || ""}
    supabaseAnonKey={anonKey || ""}
    localMode={config.isLocal}
    userName={session.user.name || session.user.githubLogin || "User"}
    activeProject={(await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value || dashboardSettings?.defaultProject}
  />;
}
