import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const client = new S3Client({})

export const handler = async (event: any): Promise<any> => {
  const { BUCKET_NAME } = process.env;

  console.log({BUCKET_NAME, event: JSON.stringify(event, null, 2)})
  const params = {
    Bucket: BUCKET_NAME,
    Key: event.objectKey,
  };

  const response = await client.send(new GetObjectCommand(params))

  return {
    statusCode: 200,
    body: response.Body?.toString(),
  };
}