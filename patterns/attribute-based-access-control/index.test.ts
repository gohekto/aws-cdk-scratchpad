import { cdkSpec as cloud, createTestApp } from "@hekto/cloud-spec-aws-cdk";
import { CfnOutput, aws_s3, aws_iam, Stack } from "aws-cdk-lib";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { putObject } from '../test-helper/helper';
import * as iam from "cdk-iam-floyd";
import { SessionTagsPrincipal } from "aws-cdk-lib/aws-iam";
import { getCredentials } from './helper'

const stsClient = new STSClient({});

const output = (stack: Stack, name: string, value: string) => {
  new CfnOutput(stack, name, {
    value,
  })
}


const testApp = createTestApp({
  creator: (stack) => {
    const bucket = new aws_s3.Bucket(stack, "test-bucket");

    const role = new aws_iam.Role(stack, "abac", {
      assumedBy: new SessionTagsPrincipal(new aws_iam.AccountRootPrincipal()),
    });

    role.attachInlinePolicy(new aws_iam.Policy(stack, "abac-policy", {
      statements: [
        new iam.S3()
        .allow()
        .toGetObject()
        .on(
          `${bucket.bucketArn}/\${aws:PrincipalTag/username}/*`
        )
      ]
    }));

    output(stack, "bucket", bucket.bucketName);
    output(stack, "role", role.roleArn);
  },
})

describe("attribute based access control", () => {
  describe("s3 bucket access via policy variables", () => {
    cloud.setup({
      testApp,
    });

    cloud.it("succeeds with correctly tagged role session", async (outputs) => {
      const { role, bucket } = outputs[testApp.stackName]
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'skorfmann';

      const sts = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: role,
          RoleSessionName: `${username}`,
          Tags: [
            {
              Key: 'username',
              Value: username
            }
          ]
        })
      );

      const s3Client = new S3Client({credentials: getCredentials(sts.Credentials)});
      const s3 = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: 'skorfmann/foo.txt',
        }),
      );

      expect(s3.$metadata.httpStatusCode).toEqual(200);
    }, 10_000);

    cloud.it("fails with incorrectly tagged role session", async (outputs) => {
      const { role, bucket } = outputs[testApp.stackName]
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'other';

      const sts = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: role,
          RoleSessionName: `${username}`,
          Tags: [
            {
              Key: 'username',
              Value: username
            }
          ]
        })
      );

      const s3Client = new S3Client({credentials: getCredentials(sts.Credentials)});
      await expect(
        s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: 'skorfmann/foo.txt',
          }),
        )
      ).rejects.toThrow('Access Denied');
    }, 10_000);
  });
});