import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

import { DYNAMO_ATTRIBUTE } from "../../src/lib/domain-constants";
import { INFRASTRUCTURE } from "./infrastructure-constants";

interface StorageStackProps extends StackProps {
  tableName: string;
}

export class StorageStack extends Stack {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
    this.table = new Table(this, "ApplicationTable", {
      tableName: props.tableName,
      partitionKey: { name: DYNAMO_ATTRIBUTE.PARTITION_KEY, type: AttributeType.STRING },
      sortKey: { name: DYNAMO_ATTRIBUTE.SORT_KEY, type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
      readCapacity: INFRASTRUCTURE.DYNAMODB_READ_CAPACITY,
      writeCapacity: INFRASTRUCTURE.DYNAMODB_WRITE_CAPACITY,
      timeToLiveAttribute: DYNAMO_ATTRIBUTE.TTL,
      stream: StreamViewType.NEW_IMAGE,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
