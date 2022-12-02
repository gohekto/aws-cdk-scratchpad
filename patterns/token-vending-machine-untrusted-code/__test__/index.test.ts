import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { putObject } from '../../test-helper/helper';
import { TokenVendingMachineUntrustedCode } from "..";
import { cdkSpec, createTestApp, ForceEphemeralResources } from "@hekto/cloud-spec-aws-cdk";
import { Aspects } from "aws-cdk-lib";

const testApp = createTestApp({
  creator: (stack, outputs) => {
    const component = new TokenVendingMachineUntrustedCode(stack, 'token-vending-machine-untrusted-code');

    // this should probabl go into cloud-spec-aws-cdk
    Aspects.of(stack).add(new ForceEphemeralResources());

    outputs({
      "bucket": component.bucket.bucketName,
      "table": component.inventory.tableName,
      "dispatcher": component.dispatcher.functionName,
    })
  },
});

describe("token vending machine", () => {
  cdkSpec.setup({
    testApp,
  });

  cdkSpec.it("works if user is scoped with matching tenant", async (outputs) => {
    const { bucket, dispatcher } = outputs

    await putObject(bucket, 'skorfmann/foo.txt', 'Hello, world!', 'text/plain')

    const handlerArn = dispatcher

    const lambdaClient = new LambdaClient({});
    const lambda = await lambdaClient.send(new InvokeCommand({
      FunctionName: handlerArn,
      Payload: Buffer.from(JSON.stringify({
        username: 'skorfmann',
        tenant: 'skorfmann'
      })),
    }))

    expect(lambda.FunctionError).toBe(undefined);

    const payload = JSON.parse(Buffer.from(lambda.Payload!.buffer).toString());
    expect(payload.lambda.statusCode).toEqual(200);
    const targetPayload = JSON.parse(Buffer.from(payload.lambda.payload, 'base64').toString("ascii"));
    expect(targetPayload).toBeNull();

  }, 10_000);
});