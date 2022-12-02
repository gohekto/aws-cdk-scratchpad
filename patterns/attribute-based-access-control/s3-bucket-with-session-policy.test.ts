import { cdkSpec as cloud, createTestApp } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_iam } from "aws-cdk-lib";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { putObject } from '../test-helper/helper';
import * as iam from "cdk-iam-floyd";
import { getCredentials } from './helper'

const stsClient = new STSClient({});

const testApp = createTestApp({
  creator: (stack, outputs) => {
    const bucket = new aws_s3.Bucket(stack, "test-bucket");

    const role = new aws_iam.Role(stack, "abac", {
      assumedBy: new aws_iam.AccountRootPrincipal(),
    });

    // this will be scoped down via the session policy. Effective permission
    // will be this policy + the dynamically created session policy.
    role.attachInlinePolicy(new aws_iam.Policy(stack, "policy", {
      statements: [
        new iam.S3()
        .allow()
        .toGetObject()
        .on(
          `${bucket.bucketArn}/*`
        )
      ]
    }));

    outputs({
      "bucket": bucket.bucketName,
      "bucketArn": bucket.bucketArn,
      "role": role.roleArn,
    })
  },
})

describe("attribute based access control", () => {
  cloud.setup({
    testApp
  });

  describe("s3 bucket access via session policy", () => {
    const assumeRoleAndGetObject = async (role: string, username: string, bucket: string, bucketArn: string) => {
      const sessionPolicy = {
        Version: "2012-10-17",
        Statement: [
          new iam.S3()
            .allow()
            .toGetObject()
            .on(
              `${bucketArn}/${username}/*`
            )
      ]};

      const sts = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: role,
          RoleSessionName: `${username}`,
          Policy: JSON.stringify(sessionPolicy),
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

    cloud.it("succeeds with correctly created session policy", async (outputs) => {
      const { role, bucket, bucketArn } = outputs
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'skorfmann';
      const s3Result = await assumeRoleAndGetObject(role, username, bucket, bucketArn);
      expect(s3Result.$metadata.httpStatusCode).toEqual(200);
    }, 10_000);

    cloud.it("fails with incorrectly created session policy", async (outputs) => {
      const { role, bucket, bucketArn } = outputs
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'other';
      await expect(
        assumeRoleAndGetObject(role, username, bucket, bucketArn)
      ).rejects.toThrow('Access Denied');
    }, 10_000);
  });


  describe("s3 bucket access can't be extended via session policy", () => {
    const assumeRoleAndPutObject = async (role: string, username: string, bucket: string, bucketArn: string) => {
      // The session policy can't add more permissions than the role policy already has.
      const sessionPolicy = {
        Version: "2012-10-17",
        Statement: [
          new iam.S3()
            .allow()
            .toPutObject()
            .on(
              `${bucketArn}/${username}/*`
            )
      ]};

      const sts = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: role,
          RoleSessionName: `${username}`,
          Policy: JSON.stringify(sessionPolicy),
        })
      );

      const s3Client = new S3Client({credentials: getCredentials(sts.Credentials)});
      return await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: 'skorfmann/foo.txt',
          Body: 'Hello, world!',
          ContentType: 'text/plain',
        }),
      )
    }

    cloud.it("fails since the session policy can't add more permissions than the principal already has", async (outputs) => {
      const { role, bucket, bucketArn } = outputs
      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'skorfmann';
      await expect(
        assumeRoleAndPutObject(role, username, bucket, bucketArn)
      ).rejects.toThrow('Access Denied');
    }, 10_000);
  });
});