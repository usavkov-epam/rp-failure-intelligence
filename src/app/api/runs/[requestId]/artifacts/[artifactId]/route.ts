import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getCypressRun } from "@/lib/cypress-run-store";
import { loadCypressArtifactDownloadUrl } from "@/lib/cypress-runs";
import { getUserOwnerKey } from "@/lib/user-identity";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string; artifactId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId, artifactId: requestedArtifactId } = await params;
  const artifactId = Number(requestedArtifactId);
  if (!Number.isSafeInteger(artifactId) || artifactId <= 0) return NextResponse.json({ error: "Invalid artifact" }, { status: 400 });
  try {
    const run = await getCypressRun(getUserOwnerKey(session), requestId);
    if (!run?.runId) return NextResponse.json({ error: "Cypress run was not found" }, { status: 404 });
    const downloadUrl = await loadCypressArtifactDownloadUrl(run.runId, artifactId);
    if (!downloadUrl) return NextResponse.json({ error: "Artifact was not found" }, { status: 404 });
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error("Unable to download Cypress artifact", error);
    return NextResponse.json({ error: "Unable to download Cypress artifact" }, { status: 502 });
  }
}
