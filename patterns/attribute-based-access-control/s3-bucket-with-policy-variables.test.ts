import { cdkSpec as cloud, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_iam, Aspects } from "aws-cdk-lib";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { putObject } from '../test-helper/helper';
import * as iam from "cdk-iam-floyd";
import { SessionTagsPrincipal } from "aws-cdk-lib/aws-iam";
import { getCredentials } from './helper'

const stsClient = new STSClient({});

const testApp = createTestApp({
  creator: (stack, outputs) => {
    const bucket = new aws_s3.Bucket(stack, "test-bucket");

    const role = new aws_iam.Role(stack, "abac", {
      assumedBy: new SessionTagsPrincipal(new aws_iam.AccountRootPrincipal()),
    });

    role.attachInlinePolicy(new aws_iam.Policy(stack, "abac-policy", {
      statements: [
        new iam.S3()
        .allow()
        .toGetObject()
        // https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_variables.html
        .on(
          `${bucket.bucketArn}/\${aws:PrincipalTag/username}/*`
        )
      ]
    }));

    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "bucket": bucket.bucketName,
      "role": role.roleArn,
    })
  },
})

describe("attribute based access control", () => {
  describe("s3 bucket access via policy variables", () => {
    cloud.setup({
      testApp
    });

    const assumeRoleAndGetObject = async (role: string, username: string, bucket: string) => {
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
      return await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: 'skorfmann/foo.txt',
        }),
      )
    }

    cloud.it("succeeds with correctly tagged role session", async (outputs) => {
      const { role, bucket } = outputs
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'skorfmann';
      const s3Result = await assumeRoleAndGetObject(role, username, bucket);
      expect(s3Result.$metadata.httpStatusCode).toEqual(200);
    }, 10_000);

    cloud.it("fails with incorrectly tagged role session", async (outputs) => {
      const { role, bucket } = outputs
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'other';
      await expect(
        assumeRoleAndGetObject(role, username, bucket)
      ).rejects.toThrow('Access Denied');
    }, 10_000);
  });
});