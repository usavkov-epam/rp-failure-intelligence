import "server-only";

import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import { config } from "./config";
import { getDynamoClient, getDynamoTableName } from "./dynamodb";
import { ownerPartitionKey, runLookupKey, runSortKey } from "./dynamodb-keys";
import { DYNAMO_ENTITY, DYNAMO_KEY, RUN_CONCLUSION, RUN_LIMITS, RUN_STATUS } from "./domain-constants";
import { readLocalStore, updateLocalStore, type LocalRunRecord } from "./local-store";
import type { CypressRunRequest } from "./cypress-run-request";
import type { CypressRunDetails, CypressRunRecord, CypressRunState } from "./types";

interface CypressRunItem extends CypressRunRecord {
  pk: string;
  sk: string;
  entity: typeof DYNAMO_ENTITY.CYPRESS_RUN;
  ownerKey: string;
  requestedBy: string;
  profileId: string;
  completedAt?: string | null;
}

interface CypressRunLookupItem {
  pk: string;
  sk: typeof DYNAMO_KEY.LOOKUP;
  entity: typeof DYNAMO_ENTITY.CYPRESS_RUN_LOOKUP;
  ownerKey: string;
  runPk: string;
  runSk: string;
}

function toRecord(item: CypressRunItem): CypressRunRecord {
  return {
    requestId: item.requestId,
    runner: item.runner || config.testRunner.kind,
    runUrl: item.runUrl,
    specs: item.specs,
    runs: item.runs,
    threads: item.threads,
    browser: item.browser,
    timeoutSeconds: item.timeoutSeconds,
    environment: item.environment,
    cypressConfig: item.cypressConfig || {},
    requestedAt: item.requestedAt,
    status: item.status,
    conclusion: item.conclusion,
    runId: item.runId,
    runNumber: item.runNumber,
    startedAt: item.startedAt,
    updatedAt: item.updatedAt,
    artifactCount: item.artifactNames?.length || 0,
    artifactNames: item.artifactNames || [],
  };
}

function normalizeLocalRecord(item: LocalRunRecord): LocalRunRecord {
  // Local volumes may outlive image upgrades; map the former provider-specific URL field lazily.
  const legacy = item as LocalRunRecord & { actionsUrl?: string };
  return {
    ...item,
    runner: item.runner || config.testRunner.kind,
    runUrl: item.runUrl || legacy.actionsUrl || "/runs",
  };
}

async function getRunLocation(requestId: string) {
  const result = await getDynamoClient().send(new GetCommand({
    TableName: getDynamoTableName(),
    Key: { pk: runLookupKey(requestId), sk: DYNAMO_KEY.LOOKUP },
    ConsistentRead: true,
  }));
  return result.Item as CypressRunLookupItem | undefined;
}

export async function getCypressRunOwnerKey(requestId: string) {
  if (config.isLocal) return (await readLocalStore()).runs.find((run) => run.requestId === requestId)?.ownerKey;
  return (await getRunLocation(requestId))?.ownerKey;
}

export async function createCypressRun(
  requestId: string,
  ownerKey: string,
  requestedBy: string,
  request: CypressRunRequest,
  runUrl: string,
  profile: { id: string; name: string },
) {
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const now = new Date().toISOString();
      const run: LocalRunRecord = {
        requestId,
        ownerKey,
        requestedBy,
        runner: config.testRunner.kind,
        runUrl,
        specs: request.specs,
        runs: request.runs,
        threads: request.threads,
        browser: request.browser,
        timeoutSeconds: request.timeoutSeconds,
        environment: profile.name,
        cypressConfig: request.cypressConfig,
        requestedAt: now,
        status: RUN_STATUS.QUEUED,
        conclusion: null,
        updatedAt: now,
        artifactCount: 0,
        artifactNames: [],
      };
      store.runs.unshift(run);
      store.runs = store.runs.slice(0, RUN_LIMITS.LOCAL_HISTORY_SIZE);
      return run;
    });
  }

  const now = new Date().toISOString();
  const pk = ownerPartitionKey(ownerKey);
  const sk = runSortKey(now, requestId);
  const item: CypressRunItem = {
    pk,
    sk,
    entity: DYNAMO_ENTITY.CYPRESS_RUN,
    ownerKey,
    requestedBy,
    profileId: profile.id,
    requestId,
    runner: config.testRunner.kind,
    runUrl,
    specs: request.specs,
    runs: request.runs,
    threads: request.threads,
    browser: request.browser,
    timeoutSeconds: request.timeoutSeconds,
    environment: profile.name,
    cypressConfig: request.cypressConfig,
    requestedAt: now,
    status: RUN_STATUS.QUEUED,
    conclusion: null,
    updatedAt: now,
    artifactCount: 0,
    artifactNames: [],
  };
  const lookup: CypressRunLookupItem = {
    pk: runLookupKey(requestId),
    sk: DYNAMO_KEY.LOOKUP,
    entity: DYNAMO_ENTITY.CYPRESS_RUN_LOOKUP,
    ownerKey,
    runPk: pk,
    runSk: sk,
  };
  await getDynamoClient().send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: getDynamoTableName(), Item: item, ConditionExpression: "attribute_not_exists(pk)" } },
      { Put: { TableName: getDynamoTableName(), Item: lookup, ConditionExpression: "attribute_not_exists(pk)" } },
    ],
  }));
  return toRecord(item);
}

export async function listCypressRuns(ownerKey: string) {
  if (config.isLocal) return (await readLocalStore()).runs
    .filter((run) => run.ownerKey === ownerKey)
    .slice(0, RUN_LIMITS.LIST_SIZE)
    .map(normalizeLocalRecord);
  const result = await getDynamoClient().send(new QueryCommand({
    TableName: getDynamoTableName(),
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": ownerPartitionKey(ownerKey), ":prefix": DYNAMO_KEY.RUN_PREFIX },
    ScanIndexForward: false,
    Limit: RUN_LIMITS.LIST_SIZE,
    ConsistentRead: true,
  }));
  return ((result.Items || []) as CypressRunItem[]).map(toRecord);
}

export async function getCypressRun(ownerKey: string, requestId: string) {
  if (config.isLocal) {
    const run = (await readLocalStore()).runs.find((item) => item.ownerKey === ownerKey && item.requestId === requestId);
    return run ? normalizeLocalRecord(run) : null;
  }
  const location = await getRunLocation(requestId);
  if (!location || location.ownerKey !== ownerKey) return null;
  const result = await getDynamoClient().send(new GetCommand({
    TableName: getDynamoTableName(),
    Key: { pk: location.runPk, sk: location.runSk },
    ConsistentRead: true,
  }));
  return result.Item ? toRecord(result.Item as CypressRunItem) : null;
}

export async function failCypressRunDispatch(requestId: string) {
  if (config.isLocal) {
    await updateLocalStore((store) => {
      const run = store.runs.find((item) => item.requestId === requestId);
      if (!run) return;
      run.status = RUN_STATUS.COMPLETED;
      run.conclusion = RUN_CONCLUSION.DISPATCH_FAILURE;
      run.updatedAt = new Date().toISOString();
    });
    return;
  }
  const location = await getRunLocation(requestId);
  if (!location) return;
  const now = new Date().toISOString();
  await getDynamoClient().send(new UpdateCommand({
    TableName: getDynamoTableName(),
    Key: { pk: location.runPk, sk: location.runSk },
    UpdateExpression: "SET #status = :status, conclusion = :conclusion, completedAt = :now, updatedAt = :now",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": RUN_STATUS.COMPLETED, ":conclusion": RUN_CONCLUSION.DISPATCH_FAILURE, ":now": now },
  }));
}

export async function updateCypressRun(requestId: string, update: {
  status: CypressRunState;
  conclusion: string | null;
  githubRunId: number;
  githubRunNumber: number;
  runUrl: string;
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
      run.runUrl = update.runUrl;
      run.startedAt = update.startedAt;
      run.updatedAt = update.completedAt || new Date().toISOString();
      run.artifactNames = update.artifactNames;
      run.artifactCount = update.artifactNames.length;
      return run.ownerKey;
    });
  }
  const location = await getRunLocation(requestId);
  if (!location) return undefined;
  await getDynamoClient().send(new UpdateCommand({
    TableName: getDynamoTableName(),
    Key: { pk: location.runPk, sk: location.runSk },
    UpdateExpression: "SET #status = :status, conclusion = :conclusion, runId = :runId, runNumber = :runNumber, runUrl = :runUrl, startedAt = :startedAt, completedAt = :completedAt, artifactNames = :artifactNames, artifactCount = :artifactCount, updatedAt = :updatedAt",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": update.status,
      ":conclusion": update.conclusion,
      ":runId": update.githubRunId,
      ":runNumber": update.githubRunNumber,
      ":runUrl": update.runUrl,
      ":startedAt": update.startedAt,
      ":completedAt": update.completedAt,
      ":artifactNames": update.artifactNames,
      ":artifactCount": update.artifactNames.length,
      ":updatedAt": new Date().toISOString(),
    },
  }));
  return location.ownerKey;
}

export async function updateLocalCypressRun(requestId: string, update: (run: LocalRunRecord) => void) {
  if (!config.isLocal) throw new Error("Local Cypress execution is not enabled");
  return updateLocalStore((store) => {
    const run = store.runs.find((item) => item.requestId === requestId);
    if (!run) return false;
    update(run);
    run.updatedAt = new Date().toISOString();
    return true;
  });
}

export async function getLocalCypressRunDetails(ownerKey: string, requestId: string): Promise<CypressRunDetails | null> {
  if (!config.isLocal) return null;
  const run = (await readLocalStore()).runs.find((item) => item.ownerKey === ownerKey && item.requestId === requestId);
  if (!run) return null;
  return {
    jobs: run.localJobs || [],
    artifacts: (run.localArtifacts || []).map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.sizeInBytes,
      createdAt: artifact.createdAt,
      downloadUrl: artifact.downloadUrl,
    })),
  };
}

export async function getLocalCypressArtifact(ownerKey: string, requestId: string, artifactId: number) {
  if (!config.isLocal) return null;
  const run = (await readLocalStore()).runs.find((item) => item.ownerKey === ownerKey && item.requestId === requestId);
  return run?.localArtifacts?.find((artifact) => artifact.id === artifactId) || null;
}
