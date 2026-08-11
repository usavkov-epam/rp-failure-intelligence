import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { CfnOIDCProvider, FederatedPrincipal, Role } from "aws-cdk-lib/aws-iam";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

import { INFRASTRUCTURE } from "./infrastructure-constants";

interface VercelAccessStackProps extends StackProps {
  table: Table;
  teamSlug: string;
  projectName: string;
  existingProviderArn?: string;
  webPushPublicKey: string;
}

export class VercelAccessStack extends Stack {
  constructor(scope: Construct, id: string, props: VercelAccessStackProps) {
    super(scope, id, props);
    const issuerHost = `oidc.vercel.com/${props.teamSlug}`;
    const audience = `https://vercel.com/${props.teamSlug}`;
    const providerArn = props.existingProviderArn || CfnOIDCProvider.arnForOIDCProvider(
      new CfnOIDCProvider(this, "VercelOidc", {
        url: `https://${issuerHost}`,
        clientIdList: [audience],
      }),
    );
    const role = new Role(this, "VercelApplicationRole", {
      roleName: INFRASTRUCTURE.VERCEL_ROLE_NAME,
      assumedBy: new FederatedPrincipal(providerArn, {
        StringEquals: {
          [`${issuerHost}:aud`]: audience,
          [`${issuerHost}:sub`]: `owner:${props.teamSlug}:project:${props.projectName}:environment:production`,
        },
      }, "sts:AssumeRoleWithWebIdentity"),
    });
    props.table.grantReadWriteData(role);

    new CfnOutput(this, "ApplicationRoleArn", { value: role.roleArn });
    new CfnOutput(this, "DynamoDbTableName", { value: props.table.tableName });
    new CfnOutput(this, "AwsRegion", { value: this.region });
    new CfnOutput(this, "WebPushPublicKey", { value: props.webPushPublicKey });
  }
}
