import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { Credentials } from "@aws-sdk/types";
import * as iam from 'iam-floyd';

const stsClient = new STSClient({});

export const tokenVendingMachine = async (username: string, roleArn: string, tableArn: string, bucketArn: string) => {
  const sessionPolicy = {
    Version: "2012-10-17",
    Statement: [
      new iam.S3()
        .allow()
        .toGetObject()
        .on(
          `${bucketArn}/${username}/*`
        ),
      new iam.Dynamodb()
        .allow()
        .toPutItem()
        .toUpdateItem()
        .on(tableArn)
        .ifLeadingKeys(
          username,
          new iam.Operator().forAllValues().stringEquals()
        )
  ]};
  try {
  const sts = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `${username}`,
      DurationSeconds: 15 * 60,
      Policy: JSON.stringify(sessionPolicy),
      Tags: [{
        Key: "username",
        Value: username
      }]
    })
  );

  if (sts.Credentials == null) throw new Error('No credentials');
  if (sts.Credentials.AccessKeyId == null) throw new Error('No access key');
  if (sts.Credentials.SecretAccessKey == null) throw new Error('No secret key');

  const credentials: Credentials = {
    accessKeyId: sts.Credentials.AccessKeyId,
    secretAccessKey: sts.Credentials.SecretAccessKey,
    sessionToken: sts.Credentials.SessionToken,
    expiration: sts.Credentials.Expiration,
  }

  return credentials;
  } catch (e) {
    console.log({e});
    throw e;
  }
}