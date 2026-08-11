#!/usr/bin/env node

import { App } from "aws-cdk-lib";

import { NotificationStack } from "../lib/notification-stack";
import { StorageStack } from "../lib/storage-stack";
import { VercelAccessStack } from "../lib/vercel-access-stack";
import { INFRASTRUCTURE, STACK_ID } from "../lib/infrastructure-constants";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const app = new App();
const account = required("CDK_DEFAULT_ACCOUNT");
const region = process.env.CDK_DEFAULT_REGION?.trim() || INFRASTRUCTURE.DEFAULT_REGION;
const environment = { account, region };
const tableName = process.env.AWS_DYNAMODB_TABLE?.trim() || INFRASTRUCTURE.DEFAULT_TABLE_NAME;
const webPushPublicKey = required("WEB_PUSH_PUBLIC_KEY");

const storage = new StorageStack(app, STACK_ID.STORAGE, {
  env: environment,
  tableName,
});

new NotificationStack(app, STACK_ID.NOTIFICATIONS, {
  env: environment,
  table: storage.table,
  webPushPublicKey,
  webPushPrivateKeyParameter: process.env.WEB_PUSH_PRIVATE_KEY_PARAMETER?.trim() || INFRASTRUCTURE.DEFAULT_PUSH_PRIVATE_KEY_PARAMETER,
  vapidSubject: process.env.VAPID_SUBJECT?.trim() || INFRASTRUCTURE.DEFAULT_VAPID_SUBJECT,
});

new VercelAccessStack(app, STACK_ID.VERCEL_ACCESS, {
  env: environment,
  table: storage.table,
  teamSlug: required("VERCEL_TEAM_SLUG"),
  projectName: required("VERCEL_PROJECT_NAME"),
  existingProviderArn: process.env.VERCEL_OIDC_PROVIDER_ARN?.trim(),
  webPushPublicKey,
});
