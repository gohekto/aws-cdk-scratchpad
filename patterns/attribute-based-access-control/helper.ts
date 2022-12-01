import { Credentials } from "@aws-sdk/client-sts";
import { AwsCredentialIdentity } from "@aws-sdk/types";

export const getCredentials = (credentials?: Credentials): AwsCredentialIdentity  => {
  if (!credentials) {
    throw new Error("No credentials returned");
  }

  if (!credentials.AccessKeyId) {
    throw new Error("No access key returned");
  }

  if (!credentials.SecretAccessKey) {
    throw new Error("No secret key");
  }

  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
    expiration: credentials.Expiration,
  }
}