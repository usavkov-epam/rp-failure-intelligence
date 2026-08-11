import { NextResponse } from "next/server";

import { getAuthorizedSession } from "@/auth";
import { getCypressRun } from "@/lib/cypress-run-store";
import { HTTP_STATUS, MEDIA_TYPE } from "@/lib/domain-constants";
import { getTestRunner } from "@/lib/test-runners";
import { getUserOwnerKey } from "@/lib/user-identity";

interface ArtifactRouteParameters {
  requestId: string;
  artifactId: string;
}

export async function GET(_request: Request, { params }: { params: Promise<ArtifactRouteParameters> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const { requestId, artifactId: requestedArtifactId } = await params;
  const artifactId = Number(requestedArtifactId);
  if (!Number.isSafeInteger(artifactId) || artifactId <= 0) {
    return NextResponse.json({ error: "Invalid artifact" }, { status: HTTP_STATUS.BAD_REQUEST });
  }

  try {
    const ownerKey = getUserOwnerKey(session);
    const run = await getCypressRun(ownerKey, requestId);
    if (!run) return NextResponse.json({ error: "Cypress run was not found" }, { status: HTTP_STATUS.NOT_FOUND });
    const artifact = await getTestRunner(run.runner).getArtifact(ownerKey, run, artifactId);
    if (!artifact) return NextResponse.json({ error: "Artifact was not found" }, { status: HTTP_STATUS.NOT_FOUND });
    if (artifact.kind === "redirect") return NextResponse.redirect(artifact.url);
    return new NextResponse(Uint8Array.from(artifact.content).buffer, {
      headers: {
        "Content-Type": MEDIA_TYPE.BINARY,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Unable to download Cypress artifact", error);
    return NextResponse.json({ error: "Unable to download Cypress artifact" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
