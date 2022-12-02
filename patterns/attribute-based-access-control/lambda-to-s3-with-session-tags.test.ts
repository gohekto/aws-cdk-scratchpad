import { cdkSpec as cloud, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_lambda_nodejs, aws_iam, Aspects } from "aws-cdk-lib";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { putObject } from '../test-helper/helper';
import * as iam from "cdk-iam-floyd";
import * as path from 'path';
import { SessionTagsPrincipal } from "aws-cdk-lib/aws-iam";
import { getCredentials } from './helper'

const stsClient = new STSClient({});
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-resourcetag
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-principaltag
// https://aws.amazon.com/blogs/compute/scaling-aws-lambda-permissions-with-attribute-based-access-control-abac/
// https://stackoverflow.com/questions/73413367/how-to-add-session-tags-with-lambda-execution-role
const testApp = createTestApp({
  creator: (stack, outputs) => {
    const bucket = new aws_s3.Bucket(stack, "test-bucket");

    const fn = new aws_lambda_nodejs.NodejsFunction(stack, "fn", {
      entry: path.join(__dirname, 'lambda-to-s3-with-tags.handler.ts'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      }
    });

    fn.addToRolePolicy(
      new iam.S3()
      .allow()
      .toGetObject()
      .on(
        `${bucket.bucketArn}/\${aws:PrincipalTag/username}/*`
      )
    );

    const role = new aws_iam.Role(stack, "abac", {
      assumedBy: new SessionTagsPrincipal(new aws_iam.AccountRootPrincipal()),
    });

    role.attachInlinePolicy(new aws_iam.Policy(stack, "policy", {
      statements: [
        new iam.Lambda()
        .allow()
        .toInvokeFunction()
        .on(
          fn.functionArn
        )
      ]
    }));

    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "fnArn": fn.functionArn,
      "bucket": bucket.bucketName,
      "roleArn": role.roleArn,
    })
  },
})

describe("attribute based access control", () => {
  cloud.setup({
    testApp,
  });

  describe("fetch s3 object via transitive session tags through lambda doesn't provide access to S3 bucket", () => {
    cloud.it("succeeds with correctly tagged lambda function", async (outputs) => {
      const { fnArn, bucket, roleArn } = outputs

      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'skorfmann';

      const sts = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: `${username}`,
          Tags: [
            {
              Key: "username",
              Value: username,
            }
          ],
          TransitiveTagKeys: [
            "username"
          ]
        })
      );

      const lambdaClient = new LambdaClient({credentials: getCredentials(sts.Credentials)});

      const result = await lambdaClient.send(new InvokeCommand({
        FunctionName: fnArn,
        Payload: Buffer.from(JSON.stringify({
          objectKey: 'skorfmann/foo.txt'
        }))
      }))

      // would be nice if that would actually be working
      expect(Buffer.from(result.Payload!.buffer).toString()).toMatch('AccessDenied')
    }, 10_000);
  });
});