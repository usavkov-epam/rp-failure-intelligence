import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { config } from "@/lib/config";
import { loadCypressArtifacts } from "@/lib/cypress-runs";
import { broadcastRunChange, updateCypressRun } from "@/lib/cypress-run-store";
import type { CypressRunState } from "@/lib/types";

interface WorkflowRunPayload {
  action: string;
  repository: { full_name: string };
  workflow_run: {
    id: number;
    run_number: number;
    display_title: string;
    path: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    run_started_at: string | null;
    updated_at: string;
  };
}

const requestIdPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function hasValidSignature(body: string, signature: string | null) {
  const secret = config.githubWebhook.secret;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeStatus(status: string): CypressRunState {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  return "queued";
}

export async function POST(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.text();
  if (!hasValidSignature(body, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (request.headers.get("x-github-event") !== "workflow_run") {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  const payload = JSON.parse(body) as WorkflowRunPayload;
  const expectedRepository = `${config.githubActions.owner}/${config.githubActions.repository}`;
  const requestId = payload.workflow_run.display_title.match(requestIdPattern)?.[0];
  const expectedWorkflowPath = `.github/workflows/${config.githubActions.workflow}`;
  if (payload.repository.full_name !== expectedRepository || !payload.workflow_run.path.startsWith(expectedWorkflowPath) || !requestId) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  const status = normalizeStatus(payload.workflow_run.status);
  const artifactNames = status === "completed"
    ? await loadCypressArtifacts(payload.workflow_run.id)
    : [];
  const ownerKey = await updateCypressRun(requestId, {
    status,
    conclusion: payload.workflow_run.conclusion,
    githubRunId: payload.workflow_run.id,
    githubRunNumber: payload.workflow_run.run_number,
    actionsUrl: payload.workflow_run.html_url,
    startedAt: payload.workflow_run.run_started_at,
    completedAt: status === "completed" ? payload.workflow_run.updated_at : null,
    artifactNames,
  });

  if (ownerKey) await broadcastRunChange(ownerKey, requestId);
  return NextResponse.json({ accepted: true, updated: Boolean(ownerKey) });
}
