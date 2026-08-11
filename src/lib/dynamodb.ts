import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

import { config } from "./config";

let documentClient: DynamoDBDocumentClient | undefined;

export function getDynamoTableName() {
  if (!config.aws.tableName) throw new Error("AWS_DYNAMODB_TABLE is not configured");
  return config.aws.tableName;
}

export function getDynamoClient() {
  if (documentClient) return documentClient;
  const client = new DynamoDBClient({
    region: config.aws.region,
    credentials: config.aws.roleArn
      ? awsCredentialsProvider({ roleArn: config.aws.roleArn })
      : undefined,
  });
  documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return documentClient;
}
