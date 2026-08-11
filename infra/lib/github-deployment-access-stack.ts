import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import {
  CfnOIDCProvider,
  FederatedPrincipal,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

import {
  AWS_SERVICE,
  GITHUB_OIDC_CLAIM,
  IAM_ACTION,
  INFRASTRUCTURE,
} from "./infrastructure-constants";

interface GitHubDeploymentAccessStackProps extends StackProps {
  repositoryOwner: string;
  repositoryName: string;
  repositoryOwnerId: string;
  repositoryId: string;
  environmentName: string;
  existingProviderArn?: string;
}

/**
 * Creates the narrowly trusted entry role used by GitHub Actions.
 *
 * The role cannot modify application resources directly. It may only read the
 * CDK bootstrap version and assume this account's standard CDK bootstrap roles;
 * CloudFormation continues to perform deployments through the bootstrap role.
 */
export class GitHubDeploymentAccessStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubDeploymentAccessStackProps) {
    super(scope, id, props);

    const issuerHost = new URL(INFRASTRUCTURE.GITHUB_OIDC_PROVIDER_URL).host;
    const providerArn = props.existingProviderArn || CfnOIDCProvider.arnForOIDCProvider(
      new CfnOIDCProvider(this, "GitHubOidc", {
        url: INFRASTRUCTURE.GITHUB_OIDC_PROVIDER_URL,
        clientIdList: [INFRASTRUCTURE.GITHUB_OIDC_AUDIENCE],
      }),
    );
    const immutableRepository = [
      `${props.repositoryOwner}@${props.repositoryOwnerId}`,
      `${props.repositoryName}@${props.repositoryId}`,
    ].join("/");
    const immutableSubject = [
      `${GITHUB_OIDC_CLAIM.REPOSITORY_PREFIX}:${immutableRepository}`,
      `${GITHUB_OIDC_CLAIM.ENVIRONMENT_CONTEXT}:${props.environmentName}`,
    ].join(":");
    const deploymentRole = new Role(this, "GitHubDeploymentRole", {
      roleName: INFRASTRUCTURE.GITHUB_DEPLOYMENT_ROLE_NAME,
      assumedBy: new FederatedPrincipal(providerArn, {
        StringEquals: {
          [`${issuerHost}:${GITHUB_OIDC_CLAIM.AUDIENCE}`]: INFRASTRUCTURE.GITHUB_OIDC_AUDIENCE,
          [`${issuerHost}:${GITHUB_OIDC_CLAIM.SUBJECT}`]: immutableSubject,
        },
      }, IAM_ACTION.ASSUME_ROLE_WITH_WEB_IDENTITY),
    });

    const bootstrapRoleArns = INFRASTRUCTURE.CDK_BOOTSTRAP_ROLE_KINDS.map((roleKind) => this.formatArn({
      service: AWS_SERVICE.IAM,
      region: "",
      resource: "role",
      resourceName: [
        "cdk",
        INFRASTRUCTURE.CDK_BOOTSTRAP_QUALIFIER,
        roleKind,
        "role",
        this.account,
        this.region,
      ].join("-"),
    }));
    deploymentRole.addToPolicy(new PolicyStatement({
      actions: [IAM_ACTION.ASSUME_ROLE],
      resources: bootstrapRoleArns,
    }));
    deploymentRole.addToPolicy(new PolicyStatement({
      actions: [IAM_ACTION.GET_PARAMETER],
      resources: [this.formatArn({
        service: AWS_SERVICE.SSM,
        resource: "parameter",
        resourceName: INFRASTRUCTURE.CDK_BOOTSTRAP_VERSION_PARAMETER,
      })],
    }));

    new CfnOutput(this, "GitHubDeploymentRoleArn", { value: deploymentRole.roleArn });
  }
}
