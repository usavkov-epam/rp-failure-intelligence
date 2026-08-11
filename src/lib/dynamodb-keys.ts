import { createHash } from "node:crypto";

import { DYNAMO_KEY } from "./domain-constants";

export const ownerPartitionKey = (ownerKey: string) => `${DYNAMO_KEY.OWNER_PREFIX}${ownerKey}`;
export const profileSortKey = (profileId: string) => `${DYNAMO_KEY.PROFILE_PREFIX}${profileId}`;
export const runSortKey = (timestamp: string, requestId: string) => `${DYNAMO_KEY.RUN_PREFIX}${timestamp}#${requestId}`;
export const runLookupKey = (requestId: string) => `${DYNAMO_KEY.RUN_LOOKUP_PREFIX}${requestId}`;
export const snapshotKey = (requestId: string) => `${DYNAMO_KEY.SNAPSHOT_PREFIX}${requestId}`;
export const pushSubscriptionSortKey = (endpoint: string) => (
  `${DYNAMO_KEY.PUSH_PREFIX}${createHash("sha256").update(endpoint).digest("hex")}`
);
