import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { S3Client } from "@aws-sdk/client-s3";
import { config } from "@materialhub/config";

let s3: S3Client | null = null;
let cloudfront: CloudFrontClient | null = null;

function awsCredentials() {
  if (config.aws.accessKeyId) {
    return {
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    };
  }
  return {};
}

export function getS3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: config.aws.region,
      ...awsCredentials(),
      // S3-compatible local servers address buckets by path, not by subdomain.
      ...(config.aws.s3Endpoint ? { endpoint: config.aws.s3Endpoint, forcePathStyle: true } : {}),
    });
  }
  return s3;
}

export function getCloudFrontClient(): CloudFrontClient {
  if (!cloudfront) {
    cloudfront = new CloudFrontClient({ region: config.aws.region, ...awsCredentials() });
  }
  return cloudfront;
}
