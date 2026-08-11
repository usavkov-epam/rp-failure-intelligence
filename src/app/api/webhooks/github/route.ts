import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { config } from "@/lib/config";
import { updateCypressRun } from "@/lib/cypress-run-store";
import { AUTHORIZATION, GITHUB, HTTP_HEADER, HTTP_STATUS, RUN_STATUS } from "@/lib/domain-constants";
import { githubActionsClient } from "@/lib/test-runners/github-actions";
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
  if (!secret || !signature?.startsWith(AUTHORIZATION.SHA256_SIGNATURE_PREFIX)) return false;
  const expected = `${AUTHORIZATION.SHA256_SIGNATURE_PREFIX}${createHmac("sha256", secret).update(body).digest("hex")}`;
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeStatus(status: string): CypressRunState {
  if (status === RUN_STATUS.COMPLETED) return RUN_STATUS.COMPLETED;
  if (status === RUN_STATUS.IN_PROGRESS) return RUN_STATUS.IN_PROGRESS;
  return RUN_STATUS.QUEUED;
}

export async function POST(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: HTTP_STATUS.NOT_FOUND });
  const body = await request.text();
  if (!hasValidSignature(body, request.headers.get(HTTP_HEADER.GITHUB_SIGNATURE))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: HTTP_STATUS.UNAUTHORIZED });
  }

  if (request.headers.get(HTTP_HEADER.GITHUB_EVENT) !== GITHUB.ACTIONS_EVENT) {
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
  const artifactNames = status === RUN_STATUS.COMPLETED
    ? await githubActionsClient.artifactNames(payload.workflow_run.id)
    : [];
  const ownerKey = await updateCypressRun(requestId, {
    status,
    conclusion: payload.workflow_run.conclusion,
    githubRunId: payload.workflow_run.id,
    githubRunNumber: payload.workflow_run.run_number,
    runUrl: payload.workflow_run.html_url,
    startedAt: payload.workflow_run.run_started_at,
    completedAt: status === RUN_STATUS.COMPLETED ? payload.workflow_run.updated_at : null,
    artifactNames,
  });

  return NextResponse.json({ accepted: true, updated: Boolean(ownerKey) });
}
