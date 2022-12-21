import { cdkSpec as cloud, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_lambda, aws_ec2, Aspects, Duration } from "aws-cdk-lib";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { getObject } from '../test-helper/helper'
import path from "path";

const lambdaClient = new LambdaClient({});

const testApp = createTestApp({
  creator: (stack, outputs) => {
    const bucket = new aws_s3.Bucket(stack, "state-bucket");

    const vpc = new aws_ec2.Vpc(stack, "vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    const fn = new aws_lambda.DockerImageFunction(stack, "fn", {
      code: aws_lambda.DockerImageCode.fromImageAsset(path.join(__dirname, 'terraform')),
      vpc,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
      timeout: Duration.seconds(30),
      memorySize: 2048,
    });

    bucket.grantReadWrite(fn);

    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "bucket": bucket.bucketName,
      "bucketArn": bucket.bucketArn,
      "fnArn": fn.functionArn,
    })
  },
})

describe("terraform lambda runner", () => {
  cloud.setup({
    testApp
  });

  cloud.it("succeeds", async (outputs) => {
    const { fnArn } = outputs

    const result = await lambdaClient.send(new InvokeCommand({
      FunctionName: fnArn,
      Payload: Buffer.from(JSON.stringify({
        username: "foo",
        name: "JohnDoe",
      }))
    }))

    expect(result.StatusCode).toEqual(200);
  }, 60_000);

  cloud.it("persists state in s3 bucket", async (outputs) => {
    const { fnArn, bucket } = outputs

    // random user name
    const username = Math.random().toString(36).substring(7);
    const statePath = `${username}/terraform.tfstate`;

    console.log({username, statePath})

    await expect(async () => {
      await getObject(bucket, statePath)
    }).rejects.toThrowError('The specified key does not exist')

    const raw = await lambdaClient.send(new InvokeCommand({
      FunctionName: fnArn,
      Payload: Buffer.from(JSON.stringify({
        username,
        name: "JohnDoe",
      }))
    }))

    const payload = JSON.parse(Buffer.from(raw.Payload!).toString());
    expect(payload.result).toMatchSnapshot()
    expect(await getObject(bucket, statePath)).toEqual(expect.anything());
  }, 60_000);
});