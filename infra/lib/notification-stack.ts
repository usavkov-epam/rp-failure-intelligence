import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource, SqsDlq } from "aws-cdk-lib/aws-lambda-event-sources";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { join } from "node:path";

import { INFRASTRUCTURE } from "./infrastructure-constants";
import { NOTIFIER_ENVIRONMENT } from "./notifier-environment";

interface NotificationStackProps extends StackProps {
  table: Table;
  webPushPublicKey: string;
  webPushPrivateKeyParameter: string;
  vapidSubject: string;
}

export class NotificationStack extends Stack {
  constructor(scope: Construct, id: string, props: NotificationStackProps) {
    super(scope, id, props);

    const deadLetterQueue = new Queue(this, "NotificationDeadLetterQueue", {
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(INFRASTRUCTURE.DLQ_RETENTION_DAYS),
    });
    const functionName = INFRASTRUCTURE.NOTIFIER_FUNCTION_NAME;
    const logGroup = new LogGroup(this, "NotifierLogs", {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const privateKey = StringParameter.fromSecureStringParameterAttributes(this, "WebPushPrivateKey", {
      parameterName: props.webPushPrivateKeyParameter,
    });
    const notifier = new NodejsFunction(this, "Notifier", {
      functionName,
      runtime: Runtime.NODEJS_22_X,
      entry: join(__dirname, "../functions/push-notifier.ts"),
      handler: "handler",
      timeout: Duration.seconds(INFRASTRUCTURE.NOTIFIER_TIMEOUT_SECONDS),
      memorySize: INFRASTRUCTURE.NOTIFIER_MEMORY_MB,
      environment: {
        [NOTIFIER_ENVIRONMENT.TABLE_NAME]: props.table.tableName,
        [NOTIFIER_ENVIRONMENT.WEB_PUSH_PUBLIC_KEY]: props.webPushPublicKey,
        [NOTIFIER_ENVIRONMENT.WEB_PUSH_PRIVATE_KEY_PARAMETER]: props.webPushPrivateKeyParameter,
        [NOTIFIER_ENVIRONMENT.VAPID_SUBJECT]: props.vapidSubject,
      },
      bundling: { minify: true, sourceMap: true },
      logGroup,
    });
    props.table.grantReadWriteData(notifier);
    privateKey.grantRead(notifier);
    notifier.addEventSource(new DynamoEventSource(props.table, {
      startingPosition: StartingPosition.LATEST,
      batchSize: INFRASTRUCTURE.STREAM_BATCH_SIZE,
      maxBatchingWindow: Duration.seconds(INFRASTRUCTURE.STREAM_BATCH_WINDOW_SECONDS),
      retryAttempts: INFRASTRUCTURE.STREAM_RETRY_ATTEMPTS,
      onFailure: new SqsDlq(deadLetterQueue),
      reportBatchItemFailures: true,
    }));
  }
}
