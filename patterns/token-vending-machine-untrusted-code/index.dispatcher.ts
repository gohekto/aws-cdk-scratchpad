import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { tokenVendingMachine } from './vending-machine';
import { parse, build } from '@aws-sdk/util-arn-parser'

export const handler = async (event: any, context: any) => {
  const username = event.username,
    tenant = event.tenant,
    bucketArnString = process.env.BUCKET_ARN!,
    tableArnString = process.env.TABLE_ARN!,
    roleArnString = process.env.TVM_ROLE_ARN!,
    fnArnString = process.env.FN_ARN!,
    fnArn = parse(fnArnString),
    roleArn = parse(roleArnString);

  const credentials = await tokenVendingMachine(tenant, build(roleArn), tableArnString, bucketArnString);

  const lambdaClient = new LambdaClient({});
  const lambda = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: fnArn.resource,
      Payload: Buffer.from(JSON.stringify({
        username,
        tenant,
      })),
      ClientContext: Buffer.from(JSON.stringify({
        credentials
      })).toString('base64'),
    })
  )

  return {
    lambda: {
      statusCode: lambda.StatusCode,
      payload: Buffer.from(lambda.Payload!).toString('base64'),
    }
  }
};