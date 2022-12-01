import {
  S3Client,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

export const handler = async (event: any, context: any) => {
  console.log({event, context})

  const { username } = event;
  const credentials = context.clientContext.credentials;

  const s3client = new S3Client({credentials});
  const ddbClient = new DynamoDB({credentials});
  const ddbDocClient = DynamoDBDocument.from(ddbClient);

  try {
    const s3 = await s3client.send(
      new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: `${username}/foo.txt`,
      })
    );

    const result = await ddbDocClient.put({
      TableName: process.env.TABLE_NAME,
      Item: {
        PK: username,
        foo: "bar",
      },
    });

    console.log({ddbResult: result, s3Result: s3})
  }
  catch (e) {
    console.log({e})
    throw e;
  }
};