import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { config } from "@/lib/config";
import { getCypressRunOwnerKey, updateCypressRun } from "@/lib/cypress-run-store";
import { AUTHORIZATION, GITHUB, HTTP_HEADER, HTTP_STATUS, RUN_STATUS } from "@/lib/domain-constants";
import { getGitHubActionsClient } from "@/lib/test-runners/github-actions";
import type { CypressRunState } from "@/lib/types";
import { getGitHubIntegration } from "@/lib/user-settings";

const workflowRunPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({ full_name: z.string() }),
  workflow_run: z.object({
    id: z.number().int().positive(),
    run_number: z.number().int().positive(),
    display_title: z.string(),
    path: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    html_url: z.string().url(),
    run_started_at: z.string().nullable(),
    updated_at: z.string(),
  }),
});

const requestIdPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function hasValidSignature(body: string, signature: string | null, secret: string | undefined) {
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

function parseJson(body: string): unknown {
  try { return JSON.parse(body); } catch { return null; }
}

export async function POST(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: HTTP_STATUS.NOT_FOUND });
  const body = await request.text();
  if (request.headers.get(HTTP_HEADER.GITHUB_EVENT) !== GITHUB.ACTIONS_EVENT) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  const parsedPayload = workflowRunPayloadSchema.safeParse(parseJson(body));
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: HTTP_STATUS.BAD_REQUEST });
  }
  const payload = parsedPayload.data;
  const requestId = payload.workflow_run.display_title.match(requestIdPattern)?.[0];
  if (!requestId) return NextResponse.json({ accepted: true, ignored: true });
  const ownerKey = await getCypressRunOwnerKey(requestId);
  const integration = ownerKey ? await getGitHubIntegration(ownerKey) : null;
  if (!ownerKey || !integration || !hasValidSignature(body, request.headers.get(HTTP_HEADER.GITHUB_SIGNATURE), integration.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: HTTP_STATUS.UNAUTHORIZED });
  }
  const expectedRepository = `${integration.actions.owner}/${integration.actions.repository}`;
  const expectedWorkflowPath = `.github/workflows/${integration.actions.workflow}`;
  if (payload.repository.full_name !== expectedRepository || !payload.workflow_run.path.startsWith(expectedWorkflowPath)) {
    return NextResponse.json({ accepted: true, ignored: true });
  }

  const status = normalizeStatus(payload.workflow_run.status);
  const artifactNames = status === RUN_STATUS.COMPLETED
    ? await (await getGitHubActionsClient(ownerKey)).artifactNames(payload.workflow_run.id)
    : [];
  const updatedOwnerKey = await updateCypressRun(requestId, {
    status,
    conclusion: payload.workflow_run.conclusion,
    githubRunId: payload.workflow_run.id,
    githubRunNumber: payload.workflow_run.run_number,
    runUrl: payload.workflow_run.html_url,
    startedAt: payload.workflow_run.run_started_at,
    completedAt: status === RUN_STATUS.COMPLETED ? payload.workflow_run.updated_at : null,
    artifactNames,
  });

  return NextResponse.json({ accepted: true, updated: Boolean(updatedOwnerKey) });
}
