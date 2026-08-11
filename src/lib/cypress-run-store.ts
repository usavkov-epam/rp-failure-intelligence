import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { config } from "./config";
import { readLocalStore, updateLocalStore, type LocalRunRecord } from "./local-store";
import type { CypressRunRequest } from "./cypress-run-request";
import type { CypressRunRecord, CypressRunState } from "./types";

interface CypressRunRow {
  request_id: string;
  owner_key: string | null;
  requested_by: string;
  specs: string[];
  runs: number;
  threads: number;
  browser: string;
  timeout_seconds: number;
  environment: string | null;
  cypress_config: Record<string, string | number | boolean>;
  status: CypressRunState;
  conclusion: string | null;
  github_run_id: number | null;
  github_run_number: number | null;
  actions_url: string;
  started_at: string | null;
  completed_at: string | null;
  artifact_names: string[];
  created_at: string;
  updated_at: string;
}

function getSupabaseConfig() {
  const { url, serviceRoleKey } = config.supabase;
  if (!url || !serviceRoleKey) throw new Error("Supabase run storage is not configured");
  return { url, serviceRoleKey };
}

function getClient() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toRecord(row: CypressRunRow): CypressRunRecord {
  return {
    requestId: row.request_id,
    actionsUrl: row.actions_url,
    specs: row.specs,
    runs: row.runs,
    threads: row.threads,
    browser: row.browser,
    timeoutSeconds: row.timeout_seconds,
    environment: row.environment || undefined,
    cypressConfig: row.cypress_config || {},
    requestedAt: row.created_at,
    status: row.status,
    conclusion: row.conclusion,
    runId: row.github_run_id ?? undefined,
    runNumber: row.github_run_number ?? undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    artifactCount: row.artifact_names.length,
    artifactNames: row.artifact_names,
  };
}

export function getRunChannel(ownerKey: string) {
  const digest = createHmac("sha256", config.auth.notificationSecret)
    .update(ownerKey)
    .digest("hex");
  return `cypress-runs:${digest}`;
}

export async function createCypressRun(
  requestId: string,
  ownerKey: string,
  requestedBy: string,
  request: CypressRunRequest,
  actionsUrl: string,
  profile: { id: string; name: string },
) {
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const now = new Date().toISOString();
      const run: LocalRunRecord = {
        requestId,
        ownerKey,
        requestedBy,
        actionsUrl,
        specs: request.specs,
        runs: request.runs,
        threads: request.threads,
        browser: request.browser,
        timeoutSeconds: request.timeoutSeconds,
        environment: profile.name,
        cypressConfig: request.cypressConfig,
        requestedAt: now,
        status: "queued",
        conclusion: null,
        updatedAt: now,
        artifactCount: 0,
        artifactNames: [],
      };
      store.runs.unshift(run);
      store.runs = store.runs.slice(0, 100);
      return run;
    });
  }
  const { data, error } = await getClient().from("cypress_runs").insert({
    request_id: requestId,
    owner_key: ownerKey,
    requested_by: requestedBy,
    specs: request.specs,
    runs: request.runs,
    threads: request.threads,
    browser: request.browser,
    timeout_seconds: request.timeoutSeconds,
    environment: profile.name,
    profile_id: profile.id,
    profile_name: profile.name,
    cypress_config: request.cypressConfig,
    actions_url: actionsUrl,
  }).select().single();

  if (error) throw new Error(`Unable to store Cypress run: ${error.message}`);
  return toRecord(data as CypressRunRow);
}

export async function listCypressRuns(ownerKey: string) {
  if (config.isLocal) return (await readLocalStore()).runs.filter((run) => run.ownerKey === ownerKey).slice(0, 20);
  const { data, error } = await getClient()
    .from("cypress_runs")
    .select("*")
    .eq("owner_key", ownerKey)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Unable to load Cypress runs: ${error.message}`);
  return (data as CypressRunRow[]).map(toRecord);
}

export async function getCypressRun(ownerKey: string, requestId: string) {
  if (config.isLocal) return (await readLocalStore()).runs.find((run) => run.ownerKey === ownerKey && run.requestId === requestId) || null;
  const { data, error } = await getClient().from("cypress_runs").select("*")
    .eq("owner_key", ownerKey).eq("request_id", requestId).maybeSingle();
  if (error) throw new Error(`Unable to load Cypress run: ${error.message}`);
  return data ? toRecord(data as CypressRunRow) : null;
}

export async function failCypressRunDispatch(requestId: string) {
  if (config.isLocal) {
    await updateLocalStore((store) => {
      const run = store.runs.find((item) => item.requestId === requestId);
      if (!run) return;
      run.status = "completed";
      run.conclusion = "dispatch_failure";
      run.updatedAt = new Date().toISOString();
    });
    return;
  }
  const { error } = await getClient().from("cypress_runs").update({
    status: "completed",
    conclusion: "dispatch_failure",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("request_id", requestId);

  if (error) throw new Error(`Unable to update Cypress run: ${error.message}`);
}

export async function updateCypressRun(requestId: string, update: {
  status: CypressRunState;
  conclusion: string | null;
  githubRunId: number;
  githubRunNumber: number;
  actionsUrl: string;
  startedAt: string | null;
  completedAt: string | null;
  artifactNames: string[];
}) {
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const run = store.runs.find((item) => item.requestId === requestId);
      if (!run) return undefined;
      run.status = update.status;
      run.conclusion = update.conclusion;
      run.runId = update.githubRunId;
      run.runNumber = update.githubRunNumber;
      run.actionsUrl = update.actionsUrl;
      run.startedAt = update.startedAt;
      run.updatedAt = update.completedAt || new Date().toISOString();
      run.artifactNames = update.artifactNames;
      run.artifactCount = update.artifactNames.length;
      return run.ownerKey;
    });
  }
  const { data, error } = await getClient().from("cypress_runs").update({
    status: update.status,
    conclusion: update.conclusion,
    github_run_id: update.githubRunId,
    github_run_number: update.githubRunNumber,
    actions_url: update.actionsUrl,
    started_at: update.startedAt,
    completed_at: update.completedAt,
    artifact_names: update.artifactNames,
    updated_at: new Date().toISOString(),
  }).eq("request_id", requestId).select("owner_key").maybeSingle();

  if (error) throw new Error(`Unable to update Cypress run: ${error.message}`);
  return data?.owner_key as string | undefined;
}

export async function broadcastRunChange(ownerKey: string, requestId: string) {
  if (config.isLocal) return;
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{
        topic: getRunChannel(ownerKey),
        event: "cypress_run_changed",
        payload: { requestId },
        private: false,
      }],
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Unable to broadcast Cypress run change: ${response.status}`);
}
