import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import { GitHubDeploymentAccessStack } from "./github-deployment-access-stack";
import { IAM_ACTION, INFRASTRUCTURE } from "./infrastructure-constants";

const TEST_ENVIRONMENT = {
  account: "111111111111",
  region: "us-east-1",
} as const;
const TEST_REPOSITORY = {
  owner: "example-owner",
  name: "example-repository",
  ownerId: "1234",
  repositoryId: "5678",
  environment: INFRASTRUCTURE.GITHUB_DEPLOYMENT_ENVIRONMENT,
} as const;

function createTemplate() {
  const app = new App();
  const stack = new GitHubDeploymentAccessStack(app, "TestStack", {
    env: TEST_ENVIRONMENT,
    repositoryOwner: TEST_REPOSITORY.owner,
    repositoryName: TEST_REPOSITORY.name,
    repositoryOwnerId: TEST_REPOSITORY.ownerId,
    repositoryId: TEST_REPOSITORY.repositoryId,
    environmentName: TEST_REPOSITORY.environment,
  });
  return Template.fromStack(stack);
}

describe("GitHubDeploymentAccessStack", () => {
  it("trusts only the immutable repository subject and protected environment", () => {
    const template = createTemplate();

    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([Match.objectLike({
          Action: IAM_ACTION.ASSUME_ROLE_WITH_WEB_IDENTITY,
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": INFRASTRUCTURE.GITHUB_OIDC_AUDIENCE,
              "token.actions.githubusercontent.com:sub": [
                `repo:${TEST_REPOSITORY.owner}@${TEST_REPOSITORY.ownerId}`,
                `${TEST_REPOSITORY.name}@${TEST_REPOSITORY.repositoryId}`,
              ].join("/") + `:environment:${TEST_REPOSITORY.environment}`,
            },
          },
        })]),
      },
    });
  });

  it("can assume only the current environment's standard CDK bootstrap roles", () => {
    const template = createTemplate();
    const policies = template.findResources("AWS::IAM::Policy");

    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([Match.objectLike({
          Action: IAM_ACTION.ASSUME_ROLE,
        })]),
      },
    });
    const serializedPolicies = JSON.stringify(policies);
    for (const roleKind of INFRASTRUCTURE.CDK_BOOTSTRAP_ROLE_KINDS) {
      expect(serializedPolicies).toContain(`cdk-${INFRASTRUCTURE.CDK_BOOTSTRAP_QUALIFIER}-${roleKind}-role`);
    }
    expect(template.findResources("AWS::IAM::OIDCProvider")).toHaveProperty("GitHubOidc");
  });
});
