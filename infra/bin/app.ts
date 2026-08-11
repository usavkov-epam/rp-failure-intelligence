#!/usr/bin/env node

import { App } from "aws-cdk-lib";

import { NotificationStack } from "../lib/notification-stack";
import { StorageStack } from "../lib/storage-stack";
import { VercelAccessStack } from "../lib/vercel-access-stack";
import { GitHubDeploymentAccessStack } from "../lib/github-deployment-access-stack";
import { INFRASTRUCTURE, STACK_ID } from "../lib/infrastructure-constants";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const app = new App();
const account = required("CDK_DEFAULT_ACCOUNT");
// CDK CLI owns CDK_DEFAULT_REGION and may replace it from the active profile.
// AWS_REGION is therefore the explicit application deployment-region override.
const region = process.env.AWS_REGION?.trim()
  || process.env.CDK_DEFAULT_REGION?.trim()
  || INFRASTRUCTURE.DEFAULT_REGION;
const environment = { account, region };
const tableName = process.env.AWS_DYNAMODB_TABLE?.trim() || INFRASTRUCTURE.DEFAULT_TABLE_NAME;
const webPushPublicKey = required("WEB_PUSH_PUBLIC_KEY");

const githubDeploymentAccess = new GitHubDeploymentAccessStack(app, STACK_ID.GITHUB_DEPLOYMENT_ACCESS, {
  env: environment,
  repositoryOwner: process.env.GITHUB_REPOSITORY_OWNER?.trim() || INFRASTRUCTURE.GITHUB_REPOSITORY_OWNER,
  repositoryName: process.env.GITHUB_REPOSITORY_NAME?.trim() || INFRASTRUCTURE.GITHUB_REPOSITORY_NAME,
  repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID?.trim() || INFRASTRUCTURE.GITHUB_REPOSITORY_OWNER_ID,
  repositoryId: process.env.GITHUB_REPOSITORY_ID?.trim() || INFRASTRUCTURE.GITHUB_REPOSITORY_ID,
  environmentName: process.env.GITHUB_DEPLOYMENT_ENVIRONMENT?.trim()
    || INFRASTRUCTURE.GITHUB_DEPLOYMENT_ENVIRONMENT,
  existingProviderArn: process.env.GITHUB_OIDC_PROVIDER_ARN?.trim(),
});

const storage = new StorageStack(app, STACK_ID.STORAGE, {
  env: environment,
  tableName,
});
// Keep the GitHub entry role alive until all application stacks are destroyed.
storage.addStackDependency(githubDeploymentAccess);

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
