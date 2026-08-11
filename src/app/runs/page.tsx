import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/auth";
import RunsView from "@/components/RunsView";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project";
import { config } from "@/lib/config";
import { listCypressRuns } from "@/lib/cypress-run-store";
import { getTestRunner } from "@/lib/test-runners";
import { getUserOwnerKey } from "@/lib/user-identity";
import { getDashboardSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await getAuthorizedSession();
  if (!session) redirect("/signin");
  const ownerKey = getUserOwnerKey(session);
  const [initialRuns, dashboardSettings] = await Promise.all([listCypressRuns(ownerKey), getDashboardSettings(ownerKey)]);
  let runs = initialRuns;
  const runner = getTestRunner();
  if (await runner.reconcile(runs)) runs = await listCypressRuns(ownerKey);
  return <RunsView
    initialRuns={runs}
    webPushPublicKey={config.aws.webPushPublicKey || ""}
    runner={runner.descriptor}
    localMode={config.isLocal}
    userName={session.user.name || session.user.githubLogin || "User"}
    activeProject={(await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value || dashboardSettings?.defaultProject}
  />;
}
