import { cdkSpec as cloud, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { aws_s3, aws_lambda_nodejs, Aspects } from "aws-cdk-lib";
import { LambdaClient, TagResourceCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { putObject } from '../test-helper/helper';
import * as iam from "cdk-iam-floyd";
import * as path from 'path';

const lambdaClient = new LambdaClient({});
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-resourcetag
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-principaltag
// https://aws.amazon.com/blogs/compute/scaling-aws-lambda-permissions-with-attribute-based-access-control-abac/
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

    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "fnArn": fn.functionArn,
      "bucket": bucket.bucketName
    })
  },
})

describe("attribute based access control", () => {
  cloud.setup({
    testApp,
  });

  describe("fetch s3 object via tagged lambda doesn't provide access to S3 bucket", () => {
    cloud.it("succeeds with correctly tagged lambda function", async (outputs) => {
      const { fnArn, bucket } = outputs

      await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

      const username = 'skorfmann';

      await lambdaClient.send(new TagResourceCommand({
        Resource: fnArn,
        Tags: {
          username
        }
      }));

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