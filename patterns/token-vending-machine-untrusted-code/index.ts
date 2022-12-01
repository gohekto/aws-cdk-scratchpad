import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import * as iam from "cdk-iam-floyd";
import { TokenVendingMachineRole } from './constructs/token-vending-machine';

export class TokenVendingMachineUntrustedCode extends Construct {
  public readonly bucket: Bucket;
  public readonly inventory: Table;
  public readonly dispatcher: NodejsFunction;

  constructor(scope: Construct, name: string) {
    super(scope, name);

    const bucket = new Bucket(this, "assets");

    this.bucket = bucket;

    const inventory = new Table(this, "inventory", {
      tableName: `inventory-${this.node.addr}`,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST
    })

    this.inventory = inventory

    const target = new NodejsFunction(this, "target", {
      environment: {
        TABLE_NAME: inventory.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
      timeout: Duration.seconds(30),
    });

    const dispatcher = new NodejsFunction(this, "dispatcher", {
      environment: {
        TABLE_ARN: inventory.tableArn,
        BUCKET_ARN: bucket.bucketArn,
        FN_ARN: target.functionArn,
      },
      timeout: Duration.seconds(15)
    });

    target.grantInvoke(dispatcher);
    this.dispatcher = dispatcher

    const role = new TokenVendingMachineRole(this, "role", {
      principalRoleArn: dispatcher.role?.roleArn!,
      policyStatements: [
        new iam.S3()
          .allow()
          .toGetObject()
          .on(
            // allow everything on the bucket and scope it down dynamically
            // to a tenant in the Lambda function
            `${bucket.bucketArn}/*`
          ),
        new iam.Dynamodb()
          .allow()
          .toPutItem()
          .toUpdateItem()
          // allow everything on the table and scope it down dynamically
          // to a tenant in the Lambda function
          .on(inventory.tableArn)
      ]
    });

    // role.resource.grantAssumeRole(dispatcher.role!);
    dispatcher.addEnvironment('TVM_ROLE_ARN', role.resource.roleArn)
  }
}