import type { UserTaggingPermission } from "@materialhub/database";

export interface TaggableProductRow {
  product_id: string;
  name: string;
  thumbnail_url: string | null;
  variant_label: string | null;
  delivered_at: string | null;
  source: "purchased" | "vendor_owned" | "permission";
}

export interface UserContext {
  vendorId: string | null;
  permissions: UserTaggingPermission[];
}

export interface Fetchers {
  fetchDelivered: (args: {
    userId: string;
    q: string;
    limit: number;
  }) => Promise<Omit<TaggableProductRow, "source">[]>;
  fetchVendorProducts: (args: {
    vendorId: string;
    q: string;
    limit: number;
  }) => Promise<Omit<TaggableProductRow, "source">[]>;
  fetchPermissionProducts: (args: {
    permission: UserTaggingPermission;
    q: string;
    limit: number;
  }) => Promise<Omit<TaggableProductRow, "source">[]>;
  loadUserContext: (userId: string, activeVendorId: string | null) => Promise<UserContext>;
}

export interface ListInput {
  userId: string;
  activeVendorId?: string | null;
  q: string;
  limit: number;
}

export interface ListOutput {
  items: TaggableProductRow[];
  partialSources: string[];
}

export class TaggableProductsService {
  constructor(private readonly deps: Fetchers) {}

  async list(input: ListInput): Promise<ListOutput> {
    const q = (input.q ?? "").trim();
    const limit = Math.min(Math.max(input.limit, 1), 50);
    const ctx = await this.deps.loadUserContext(input.userId, input.activeVendorId ?? null);

    // Vendor path: a vendor tags from their own full catalog. Their products
    // are taggable regardless of whether anyone has ordered them, so we drive
    // the picker purely from the vendor catalog and skip the delivered-orders
    // and permission sources entirely.
    if (ctx.vendorId) {
      try {
        const rows = await this.deps.fetchVendorProducts({ vendorId: ctx.vendorId, q, limit });
        return {
          items: rows.map((r) => ({ ...r, source: "vendor_owned" as const })).slice(0, limit),
          partialSources: [],
        };
      } catch {
        throw new TaggableProductsUnavailableError();
      }
    }

    // Non-vendor (customer) path: delivered purchases plus explicit tagging
    // permissions. Customers can only tag products they've received or been
    // granted access to.
    const partialSources: string[] = [];
    let purchased: TaggableProductRow[] = [];
    try {
      const raw = await this.deps.fetchDelivered({ userId: input.userId, q, limit });
      purchased = raw.map((r) => ({ ...r, source: "purchased" as const }));
    } catch {
      partialSources.push("order");
    }

    // Empty-q convention: purchased only.
    if (q === "") {
      if (purchased.length === 0 && partialSources.includes("order")) {
        throw new TaggableProductsUnavailableError();
      }
      return { items: purchased.slice(0, limit), partialSources };
    }

    const now = Date.now();
    const activePermissions = ctx.permissions.filter(
      (p) => !p.expires_at || new Date(p.expires_at).getTime() > now,
    );

    const permissionPromises: Promise<TaggableProductRow[]>[] = activePermissions.map((perm) =>
      this.deps
        .fetchPermissionProducts({ permission: perm, q, limit })
        .then((rows) => rows.map((r) => ({ ...r, source: "permission" as const })))
        .catch(() => {
          if (!partialSources.includes("product_permission")) {
            partialSources.push("product_permission");
          }
          return [];
        }),
    );

    const permissionRows = (await Promise.all(permissionPromises)).flat();

    const hasOrder = !partialSources.includes("order");
    const hasPermission =
      activePermissions.length === 0 || !partialSources.includes("product_permission");
    if (!hasOrder && !hasPermission) {
      throw new TaggableProductsUnavailableError();
    }

    // Merge: first-write-wins, priority purchased > permission.
    const merged = new Map<string, TaggableProductRow>();
    for (const row of [...purchased, ...permissionRows]) {
      if (!merged.has(row.product_id)) merged.set(row.product_id, row);
    }

    return {
      items: Array.from(merged.values()).slice(0, limit),
      partialSources,
    };
  }
}

export class TaggableProductsUnavailableError extends Error {
  constructor() {
    super("taggable_products_unavailable");
    this.name = "TaggableProductsUnavailableError";
  }
}
