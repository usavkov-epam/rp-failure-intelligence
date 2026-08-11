import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getAuthorizedSession } from "@/auth";
import { getCypressRun, getLocalCypressArtifact } from "@/lib/cypress-run-store";
import { config } from "@/lib/config";
import { loadCypressArtifactDownloadUrl } from "@/lib/cypress-runs";
import { getUserOwnerKey } from "@/lib/user-identity";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string; artifactId: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId, artifactId: requestedArtifactId } = await params;
  const artifactId = Number(requestedArtifactId);
  if (!Number.isSafeInteger(artifactId) || artifactId <= 0) return NextResponse.json({ error: "Invalid artifact" }, { status: 400 });
  try {
    const ownerKey = getUserOwnerKey(session);
    const run = await getCypressRun(ownerKey, requestId);
    if (config.isLocal) {
      if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: 404 });
      const artifact = await getLocalCypressArtifact(ownerKey, requestId, artifactId);
      if (!artifact) return NextResponse.json({ error: "Artifact was not found" }, { status: 404 });
      return new NextResponse(await readFile(artifact.path), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${path.basename(artifact.name).replaceAll('"', "")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (!run?.runId) return NextResponse.json({ error: "Cypress run was not found" }, { status: 404 });
    const downloadUrl = await loadCypressArtifactDownloadUrl(run.runId, artifactId);
    if (!downloadUrl) return NextResponse.json({ error: "Artifact was not found" }, { status: 404 });
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error("Unable to download Cypress artifact", error);
    return NextResponse.json({ error: "Unable to download Cypress artifact" }, { status: 502 });
  }
}
