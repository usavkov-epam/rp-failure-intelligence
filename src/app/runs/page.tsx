import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/auth";
import RunsView from "@/components/RunsView";
import { config } from "@/lib/config";
import { getRunChannel, listCypressRuns } from "@/lib/cypress-run-store";
import { getUserOwnerKey } from "@/lib/user-identity";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await getAuthorizedSession();
  if (!session) redirect("/signin");
  const ownerKey = getUserOwnerKey(session);
  const { url, anonKey } = config.supabase;
  if (!url || !anonKey) throw new Error("Supabase run history is not configured");

  return <RunsView
    initialRuns={await listCypressRuns(ownerKey)}
    channelName={getRunChannel(ownerKey)}
    supabaseUrl={url}
    supabaseAnonKey={anonKey}
    userName={session.user.name || session.user.githubLogin || "User"}
  />;
}
