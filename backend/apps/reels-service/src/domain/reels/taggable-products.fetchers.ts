import { config } from "@materialhub/config";
import { AppDataSource, UserTaggingPermission } from "@materialhub/database";
import type { Fetchers, UserContext } from "./taggable-products.service.ts";

const TIMEOUT_MS = 1500;

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

function orderServiceUrl(): string {
  return process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
}

function productServiceUrl(): string {
  return (
    process.env.PRODUCT_SERVICE_URL ?? `http://${config.serviceHost.product}:${config.port.product}`
  );
}

function internalHeaders(): Record<string, string> {
  return { "x-internal-secret": config.internal.serviceSecret };
}

export function makeFetchers(): Fetchers {
  return {
    async fetchDelivered({ userId, q, limit }) {
      const params = new URLSearchParams({ userId, limit: String(limit) });
      if (q) params.set("q", q);
      const url = `${orderServiceUrl()}/internal/orders/my-delivered-items?${params.toString()}`;
      let res: Response;
      try {
        res = await fetchWithTimeout(url, { headers: internalHeaders() });
      } catch (err) {
        console.error("[taggable-products] fetchDelivered network error:", url, err);
        throw err;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[taggable-products] fetchDelivered HTTP error:", res.status, url, body);
        throw new Error(`order_service_${res.status}`);
      }
      const json = (await res.json()) as { data?: { items?: any[] } };
      return json.data?.items ?? [];
    },

    async fetchVendorProducts({ vendorId, q, limit }) {
      const params = new URLSearchParams({ vendorId, limit: String(limit) });
      if (q) params.set("q", q);
      const url = `${productServiceUrl()}/internal/products/by-vendor?${params.toString()}`;
      let res: Response;
      try {
        res = await fetchWithTimeout(url, { headers: internalHeaders() });
      } catch (err) {
        console.error("[taggable-products] fetchVendorProducts network error:", url, err);
        throw err;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[taggable-products] fetchVendorProducts HTTP error:", res.status, url, body);
        throw new Error(`product_service_${res.status}`);
      }
      const json = (await res.json()) as { data?: { items?: any[] } };
      return json.data?.items ?? [];
    },

    async fetchPermissionProducts({ permission, q, limit }) {
      const params = new URLSearchParams({
        scope: permission.scope as unknown as string,
        limit: String(limit),
      });
      if (q) params.set("q", q);
      if (permission.brand_id) params.set("brandId", permission.brand_id);
      if (permission.vendor_id) params.set("vendorId", permission.vendor_id);
      if (permission.product_ids && permission.product_ids.length > 0) {
        params.set("productIds", permission.product_ids.join(","));
      }
      const url = `${productServiceUrl()}/internal/products/by-permission?${params.toString()}`;
      let res: Response;
      try {
        res = await fetchWithTimeout(url, { headers: internalHeaders() });
      } catch (err) {
        console.error("[taggable-products] fetchPermissionProducts network error:", url, err);
        throw err;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          "[taggable-products] fetchPermissionProducts HTTP error:",
          res.status,
          url,
          body,
        );
        throw new Error(`product_service_${res.status}`);
      }
      const json = (await res.json()) as { data?: { items?: any[] } };
      return json.data?.items ?? [];
    },

    async loadUserContext(userId: string, activeVendorId: string | null): Promise<UserContext> {
      const permRepo = AppDataSource.getRepository(UserTaggingPermission);
      const permissions = await permRepo.find({ where: { user_id: userId } });
      return {
        vendorId: activeVendorId,
        permissions,
      };
    },
  };
}
