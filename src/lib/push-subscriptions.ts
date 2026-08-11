import "server-only";

import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { getDynamoClient, getDynamoTableName } from "./dynamodb";
import { ownerPartitionKey, pushSubscriptionSortKey } from "./dynamodb-keys";
import { DYNAMO_ENTITY, TIME } from "./domain-constants";

export interface StoredPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(ownerKey: string, subscription: StoredPushSubscription) {
  const now = new Date().toISOString();
  await getDynamoClient().send(new PutCommand({
    TableName: getDynamoTableName(),
    Item: {
      pk: ownerPartitionKey(ownerKey),
      sk: pushSubscriptionSortKey(subscription.endpoint),
      entity: DYNAMO_ENTITY.WEB_PUSH_SUBSCRIPTION,
      ownerKey,
      ...subscription,
      updatedAt: now,
      ...(subscription.expirationTime
        ? { expiresAtEpoch: Math.floor(subscription.expirationTime / TIME.MILLISECONDS_PER_SECOND) }
        : {}),
    },
  }));
}

export async function removePushSubscription(ownerKey: string, endpoint: string) {
  await getDynamoClient().send(new DeleteCommand({
    TableName: getDynamoTableName(),
    Key: { pk: ownerPartitionKey(ownerKey), sk: pushSubscriptionSortKey(endpoint) },
  }));
}
