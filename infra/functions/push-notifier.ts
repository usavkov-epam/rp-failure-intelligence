import { DynamoDBClient, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBBatchResponse, DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import webPush, { type PushSubscription } from "web-push";

import { DISPLAY, DYNAMO_ENTITY, DYNAMO_KEY, PUSH_MESSAGE_TYPE, RUN_STATUS } from "../../src/lib/domain-constants";
import { NOTIFIER_ENVIRONMENT } from "../lib/notifier-environment";

interface RunImage {
  entity: typeof DYNAMO_ENTITY.CYPRESS_RUN;
  ownerKey: string;
  requestId: string;
  status: string;
  conclusion?: string | null;
  runNumber?: number;
}

interface SubscriptionItem extends PushSubscription {
  pk: string;
  sk: string;
}

const tableName = required(NOTIFIER_ENVIRONMENT.TABLE_NAME);
const publicKey = required(NOTIFIER_ENVIRONMENT.WEB_PUSH_PUBLIC_KEY);
const privateKeyParameter = required(NOTIFIER_ENVIRONMENT.WEB_PUSH_PRIVATE_KEY_PARAMETER);
const vapidSubject = required(NOTIFIER_ENVIRONMENT.VAPID_SUBJECT);
const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssmClient = new SSMClient({});
let vapidConfigured: Promise<void> | undefined;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configureVapid() {
  vapidConfigured ||= (async () => {
    const result = await ssmClient.send(new GetParameterCommand({ Name: privateKeyParameter, WithDecryption: true }));
    const privateKey = result.Parameter?.Value;
    if (!privateKey) throw new Error(`SecureString ${privateKeyParameter} has no value`);
    webPush.setVapidDetails(vapidSubject, publicKey, privateKey);
  })();
  return vapidConfigured;
}

function runFromRecord(record: DynamoDBRecord) {
  if (!record.dynamodb?.NewImage) return null;
  const image = unmarshall(record.dynamodb.NewImage as unknown as Record<string, AttributeValue>) as Partial<RunImage>;
  if (image.entity !== DYNAMO_ENTITY.CYPRESS_RUN || !image.ownerKey || !image.requestId || !image.status) return null;
  return image as RunImage;
}

function messageFor(run: RunImage) {
  const label = run.runNumber ? `Cypress run #${run.runNumber}` : `Cypress run ${run.requestId.slice(0, DISPLAY.REQUEST_ID_LENGTH)}`;
  if (run.status === RUN_STATUS.COMPLETED) {
    const result = (run.conclusion || RUN_STATUS.COMPLETED).replaceAll("_", " ");
    return { title: `${label} completed`, body: `Result: ${result}.` };
  }
  return { title: `${label} updated`, body: `Status: ${run.status.replaceAll("_", " ")}.` };
}

function isExpiredSubscription(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  return statusCode === 404 || statusCode === 410;
}

async function notifyRun(run: RunImage) {
  await configureVapid();
  const result = await documentClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `${DYNAMO_KEY.OWNER_PREFIX}${run.ownerKey}`,
      ":prefix": DYNAMO_KEY.PUSH_PREFIX,
    },
    ConsistentRead: true,
  }));
  const subscriptions = (result.Items || []) as SubscriptionItem[];
  const message = messageFor(run);
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: subscription.keys,
      }, JSON.stringify({
        ...message,
        type: PUSH_MESSAGE_TYPE.CYPRESS_RUN_UPDATED,
        requestId: run.requestId,
        status: run.status,
        conclusion: run.conclusion,
      }));
    } catch (error) {
      if (!isExpiredSubscription(error)) throw error;
      await documentClient.send(new DeleteCommand({ TableName: tableName, Key: { pk: subscription.pk, sk: subscription.sk } }));
    }
  }));
}

export async function handler(event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> {
  const failures: DynamoDBBatchResponse["batchItemFailures"] = [];
  await Promise.all(event.Records.map(async (record) => {
    try {
      const run = runFromRecord(record);
      if (run) await notifyRun(run);
    } catch (error) {
      console.error("Unable to publish Cypress run update", { eventId: record.eventID, error });
      if (record.eventID) failures.push({ itemIdentifier: record.eventID });
    }
  }));
  return { batchItemFailures: failures };
}
