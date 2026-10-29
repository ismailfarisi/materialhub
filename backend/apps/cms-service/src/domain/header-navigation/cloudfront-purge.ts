import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { config } from "@materialhub/config";

let client: CloudFrontClient | null = null;

function getClient(): CloudFrontClient | null {
  if (!config.media.cloudfrontDistributionId) return null;
  if (!client) client = new CloudFrontClient({ region: config.aws.region });
  return client;
}

export async function purgeHeaderNavCache(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const c = getClient();
  if (!c) return { ok: false, reason: "no_distribution_id" };
  try {
    await c.send(
      new CreateInvalidationCommand({
        DistributionId: config.media.cloudfrontDistributionId,
        InvalidationBatch: {
          CallerReference: `header-nav-${Date.now()}`,
          Paths: { Quantity: 1, Items: ["/navigation/header*"] },
        },
      }),
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
