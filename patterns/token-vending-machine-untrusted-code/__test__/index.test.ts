import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { putObject } from './helper';
import { TokenVendingMachineUntrustedCode } from "..";
import { cdkSpec, createTestApp } from "@hekto/cloud-spec-aws-cdk";
import { CfnOutput } from "aws-cdk-lib";

const testApp = createTestApp({
  creator: (stack) => {
    const component = new TokenVendingMachineUntrustedCode(stack, 'token-vending-machine-untrusted-code');

    new CfnOutput(stack, "bucket", {
      value: component.bucket.bucketName,
    })

    new CfnOutput(stack, "table", {
      value: component.inventory.tableName,
    })

    new CfnOutput(stack, "dispatcher", {
      value: component.dispatcher.functionArn,
    })
  },
});

describe("token vending machine", () => {
  cdkSpec.setup({
    testApp,
  });

  cdkSpec.it("works if user is scoped with matching tenant", async (outputs) => {
    const { bucket, dispatcher, table } = outputs[testApp.stackName]

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
    console.log({lambda, payload, targetPayload})
    expect(targetPayload).toBeNull();

  }, 10_000);
});