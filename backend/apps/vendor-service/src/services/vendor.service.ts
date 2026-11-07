import {
  AppDataSource,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorDocument,
  VendorDocumentType,
  VendorStatus,
  VendorTranslation,
  Warehouse,
} from "@materialhub/database";
import { bumpTokenVersion } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { checkTrn, isValidTrn } from "@materialhub/utils";
import { generateSlug } from "@materialhub/utils";
import { type VendorApplyData, isValidTransition } from "../domain/types.ts";
import type { PaymentProviderAdapter } from "../providers/payment/payment-provider.interface.ts";

export class VendorService {
  private readonly paymentProvider: PaymentProviderAdapter;

  constructor(paymentProvider: PaymentProviderAdapter) {
    this.paymentProvider = paymentProvider;
  }

  private get vendorRepo() {
    return AppDataSource.getRepository(Vendor);
  }
  private get documentRepo() {
    return AppDataSource.getRepository(VendorDocument);
  }
  private get translationRepo() {
    return AppDataSource.getRepository(VendorTranslation);
  }
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }
  private get warehouseRepo() {
    return AppDataSource.getRepository(Warehouse);
  }

  async apply(data: VendorApplyData) {
    // Phase 3b: applicant identity is tracked via vendor_members.owner row, not
    // vendors.user_id. Find existing non-revoked application by joining through
    // vendor_members.
    const existingRows = (await AppDataSource.query(
      `SELECT v.id, v.status FROM vendors v
        JOIN vendor_members vm ON vm.vendor_id = v.id
       WHERE vm.user_id = $1 AND vm.role = 'owner' AND vm.deleted_at IS NULL
         AND vm.status IN ('pending', 'active')
       LIMIT 1`,
      [data.userId],
    )) as Array<{ id: string; status: string }>;
    if (existingRows[0] && existingRows[0].status !== "rejected") {
      throw new HttpError(409, "Vendor application already exists", "VENDOR_EXISTS");
    }
    // Also check for rejected-but-not-yet-reused rows — those can be reused via re-apply.
    const rejectedRows = existingRows[0]
      ? []
      : ((await AppDataSource.query(
          `SELECT v.id FROM vendors v
            JOIN vendor_members vm ON vm.vendor_id = v.id
           WHERE vm.user_id = $1 AND vm.role = 'owner' AND vm.deleted_at IS NULL
             AND v.status = 'rejected'
           LIMIT 1`,
          [data.userId],
        )) as Array<{ id: string }>);
    const reuseVendorId = rejectedRows[0]?.id ?? null;

    const validDocTypes = new Set<string>(Object.values(VendorDocumentType));
    const badDoc = data.documents.find((d) => !validDocTypes.has(d.type) || !d.s3Key);
    if (badDoc) {
      throw new HttpError(
        400,
        `Invalid document: type must be one of ${[...validDocTypes].join(", ")} and s3_key is required`,
        "INVALID_DOCUMENT",
      );
    }
    // Documents are uploaded with the user-scoped `business_licence` presign,
    // so each key must sit under the applicant's own prefix: an applicant must
    // not attach someone else's upload.
    const ownPrefix = `private/business/${data.userId}/`;
    if (data.documents.some((d) => !d.s3Key.startsWith(ownPrefix))) {
      throw new HttpError(
        400,
        "Documents must be uploaded by the applicant",
        "INVALID_DOCUMENT_KEY",
      );
    }

    // Generate unique slug
    let slug = generateSlug(data.businessName);
    const slugExists = await this.vendorRepo.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (slugExists) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Look up applicant email for the vendor_members row.
    const applicant = await this.userRepo.findOne({ where: { id: data.userId } });
    if (!applicant) throw new HttpError(404, "Applicant user not found", "APPLICANT_NOT_FOUND");

    return AppDataSource.transaction(async (manager) => {
      // Vendor entity (no user_id column post-Phase-3b).
      const vendorData = {
        name: data.businessName,
        slug,
        status: VendorStatus.pending,
        business_name: data.businessName,
        business_type: "general",
        contact_email: data.businessEmail,
        contact_phone: data.businessPhone,
        vat_number: data.taxRegistrationNumber ?? null,
        // A UAE TRN given at application also fills the structured TRN.
        trn: isValidTrn(data.taxRegistrationNumber)
          ? parseVendorTrn(data.taxRegistrationNumber)
          : null,
        address: data.businessAddress,
      };

      let vendor: Vendor;
      if (reuseVendorId) {
        // Re-apply: update existing rejected record.
        const existing = await manager.findOne(Vendor, { where: { id: reuseVendorId } });
        if (!existing) throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
        Object.assign(existing, vendorData);
        existing.status = "pending" as any;
        existing.deleted_at = null;
        vendor = await manager.save(Vendor, existing);

        // Re-activate the prior owner row to status='pending' so approve() can
        // flip it to 'active'. The row already exists for this (vendor, user).
        await manager.query(
          `UPDATE vendor_members
              SET status = 'pending', revoked_at = NULL, revoked_by_user_id = NULL,
                  updated_at = NOW()
            WHERE vendor_id = $1 AND user_id = $2 AND role = 'owner' AND deleted_at IS NULL`,
          [vendor.id, data.userId],
        );
      } else {
        vendor = await manager.save(Vendor, manager.create(Vendor, vendorData));

        // Insert pending owner membership. approve() will flip status to 'active'.
        await manager.query(
          `INSERT INTO vendor_members
             (id, vendor_id, user_id, email, role, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'owner', 'pending', NOW(), NOW())`,
          [vendor.id, data.userId, applicant.email.toLowerCase()],
        );
      }

      // Save documents — entity uses `type` (not document_type), `is_verified` (not status)
      // Also requires `file_name`
      for (const doc of data.documents) {
        await manager.save(
          VendorDocument,
          manager.create(VendorDocument, {
            vendor_id: vendor.id,
            type: doc.type as any,
            file_url: doc.s3Key,
            file_name: doc.fileName || (doc.s3Key.split("/").pop() ?? "document"),
            is_verified: false,
          }),
        );
      }

      return vendor;
    });
  }

  async findById(id: string) {
    const vendor = await this.vendorRepo.findOne({ where: { id } });
    if (!vendor) throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
    return vendor;
  }

  /**
   * Phase 3b: returns the user_id of the current owner for a vendor, or null
   * if no owner row exists. Replaces direct `vendor.user_id` reads.
   */
  async findOwnerUserId(vendorId: string): Promise<string | null> {
    const rows = (await AppDataSource.query(
      `SELECT user_id FROM vendor_members
        WHERE vendor_id = $1 AND role = 'owner' AND deleted_at IS NULL
          AND status IN ('pending', 'active')
        ORDER BY status = 'active' DESC, created_at DESC
        LIMIT 1`,
      [vendorId],
    )) as Array<{ user_id: string | null }>;
    return rows[0]?.user_id ?? null;
  }

  /**
   * Phase 3b: resolves a vendor via the active owner membership for `userId`,
   * not via the (now-dropped) `vendors.user_id` column.
   */
  async findByUserId(userId: string) {
    const rows = (await AppDataSource.query(
      `SELECT v.* FROM vendors v
        JOIN vendor_members vm ON vm.vendor_id = v.id
       WHERE vm.user_id = $1
         AND vm.role = 'owner'
         AND vm.status = 'active'
         AND vm.deleted_at IS NULL
         AND v.deleted_at IS NULL
       LIMIT 1`,
      [userId],
    )) as Vendor[];
    const vendor = rows[0];
    if (!vendor) throw new HttpError(404, "Vendor profile not found", "VENDOR_NOT_FOUND");
    return vendor;
  }

  async getPublicProfile(vendorId: string) {
    const vendor = await this.vendorRepo.findOne({
      where: { id: vendorId, status: "approved" as any },
      select: [
        "id",
        "name",
        "slug",
        "logo_url",
        "banner_url",
        "description",
        "rating_avg",
        "rating_count",
        "total_sales",
        "follower_count",
        "created_at",
      ],
    });
    if (!vendor) throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
    return vendor;
  }

  async getPublicProfileBySlug(slug: string) {
    const vendor = await this.vendorRepo.findOne({
      where: { slug, status: "approved" as any },
      select: [
        "id",
        "name",
        "slug",
        "logo_url",
        "banner_url",
        "description",
        "rating_avg",
        "rating_count",
        "total_sales",
        "follower_count",
        "created_at",
      ],
    });
    if (!vendor) throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
    return vendor;
  }

  async transition(vendorId: string, newStatus: string, _adminId?: string, reason?: string) {
    const vendor = await this.findById(vendorId);
    if (!isValidTransition(vendor.status, newStatus)) {
      throw new HttpError(
        422,
        `Cannot transition from '${vendor.status}' to '${newStatus}'`,
        "INVALID_TRANSITION",
      );
    }

    vendor.status = newStatus as any;

    if (newStatus === "approved") {
      vendor.verified_at = new Date();
      // Phase 3b: applicant is the user_id on the pending owner membership row
      // (created in apply()). Activate that row; no need to read vendor.user_id.
      const ownerRows = (await AppDataSource.query(
        `UPDATE vendor_members
            SET status = 'active', accepted_at = NOW(), updated_at = NOW()
          WHERE vendor_id = $1 AND role = 'owner' AND deleted_at IS NULL
            AND status IN ('pending', 'active')
        RETURNING user_id`,
        [vendor.id],
      )) as Array<{ user_id: string | null }>;
      const ownerUserId = ownerRows[0]?.user_id ?? null;
      if (!ownerUserId) {
        throw new HttpError(
          404,
          "No owner membership found for this vendor",
          "OWNER_MEMBERSHIP_MISSING",
        );
      }
      // Bump owner's token_version so next request reissues JWT with vm claim.
      await bumpTokenVersion(ownerUserId);
      // Create default warehouse
      const existingWarehouse = await this.warehouseRepo.findOne({
        where: { vendor_id: vendor.id, is_default: true },
      });
      if (!existingWarehouse) {
        const addr = (vendor.address as any) ?? {};
        await this.warehouseRepo.save(
          this.warehouseRepo.create({
            vendor_id: vendor.id,
            name: "Default Warehouse",
            code: `WH-${vendor.id.slice(0, 8).toUpperCase()}`,
            address_line_1: addr.street ?? "TBD",
            city: addr.city ?? "Dubai",
            // vendors.address is stored as { street, city, state, ... } (see
            // VendorApplyData.businessAddress); accept `emirate` too for safety.
            emirate: addr.emirate ?? addr.state ?? "Dubai",
            is_default: true,
            is_active: true,
          }),
        );
      }
    }

    if (newStatus === "rejected" && reason) {
      vendor.rejection_reason = reason;
    }

    return this.vendorRepo.save(vendor);
  }

  async listForAdmin(status?: string, page = 1, limit = 20, search?: string) {
    const qb = this.vendorRepo.createQueryBuilder("v").withDeleted();
    if (status) qb.where("v.status = :status", { status });
    if (search) {
      const op = status ? "andWhere" : "where";
      qb[op]("(v.business_name ILIKE :q OR v.contact_email ILIKE :q)", {
        q: `%${search}%`,
      });
    }
    qb.orderBy("v.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async usePlatformShipping(vendorId: string) {
    const vendor = await this.findById(vendorId);
    vendor.default_shipping_account_id = null;
    vendor.auto_create_shipment = true;
    return this.vendorRepo.save(vendor);
  }

  async createByAdmin(
    adminId: string,
    data: {
      user: { firstName: string; lastName: string; email: string; phone: string; password: string };
      vendor: Record<string, any>;
      documents?: Array<{
        type: string;
        fileUrl: string;
        fileName: string;
        fileSize?: number;
        mimeType?: string;
        expiryDate?: string;
      }>;
    },
  ) {
    // Pre-check email
    const existingUser = await this.userRepo.findOne({
      where: { email: data.user.email },
      withDeleted: true,
    });
    if (existingUser) throw new HttpError(409, "Email already in use", "EMAIL_EXISTS");

    let slug = generateSlug(data.vendor.name);
    const slugExists = await this.vendorRepo.findOne({ where: { slug }, withDeleted: true });
    if (slugExists) slug = `${slug}-${Date.now().toString(36)}`;

    const result = await AppDataSource.transaction(async (manager) => {
      // 1. Create user
      const passwordHash = await Bun.password.hash(data.user.password, {
        algorithm: "bcrypt",
        cost: 10,
      });
      const user = await manager.save(
        manager.create(User, {
          first_name: data.user.firstName,
          last_name: data.user.lastName,
          email: data.user.email,
          phone: data.user.phone,
          password_hash: passwordHash,
          role: UserRole.customer, // Phase 3a — vendors are customers + owner membership
          status: UserStatus.active,
          email_verified_at: new Date(),
        }),
      );

      // 2. Create vendor — bypass state machine, set approved directly
      // Phase 3b: no user_id column; ownership is tracked via vendor_members below.
      const vendor = await manager.save(
        manager.create(Vendor, {
          name: data.vendor.name,
          slug,
          status: VendorStatus.approved,
          verified_at: new Date(),
          verified_by: adminId,
          description: data.vendor.description ?? null,
          business_name: data.vendor.business_name,
          business_type: data.vendor.business_type ?? "general",
          contact_email: data.vendor.contact_email,
          contact_phone: data.vendor.contact_phone,
          whatsapp: data.vendor.whatsapp ?? null,
          website_url: data.vendor.website_url ?? null,
          trade_license_number: data.vendor.trade_license_number ?? null,
          vat_number: data.vendor.vat_number ?? null,
          vat_registered: data.vendor.vat_registered ?? false,
          address: data.vendor.address ?? null,
          social_links: data.vendor.social_links ?? {},
          commission_type: data.vendor.commission_type ?? null,
          commission_value: data.vendor.commission_value ?? null,
          commission_tiers: data.vendor.commission_tiers ?? null,
          payout_schedule: data.vendor.payout_schedule ?? "biweekly",
          minimum_payout: data.vendor.minimum_payout ?? 10000,
          processing_time_days: data.vendor.processing_time_days ?? 2,
          auto_approve_orders: data.vendor.auto_approve_orders ?? true,
          meta_title: data.vendor.meta_title ?? null,
          meta_description: data.vendor.meta_description ?? null,
        }),
      );

      // 3. Save documents
      if (data.documents?.length) {
        for (const doc of data.documents) {
          await manager.save(
            manager.create(VendorDocument, {
              vendor_id: vendor.id,
              type: doc.type as any,
              file_url: doc.fileUrl,
              file_name: doc.fileName,
              file_size: doc.fileSize ?? null,
              mime_type: doc.mimeType ?? null,
              expiry_date: doc.expiryDate ? (new Date(doc.expiryDate) as any) : null,
              is_verified: false,
            }),
          );
        }
      }

      // 4. Create default warehouse
      await manager.save(
        manager.create(Warehouse, {
          vendor_id: vendor.id,
          name: "Default Warehouse",
          code: `WH-${vendor.id.slice(0, 8).toUpperCase()}`,
          address_line_1: (data.vendor.address as any)?.street ?? "TBD",
          city: (data.vendor.address as any)?.city ?? "Dubai",
          // Canonical address key is `state` (see VendorApplyData); the previous
          // `.emirate`-only read silently fell back to "Dubai". Accept both.
          emirate:
            (data.vendor.address as any)?.emirate ?? (data.vendor.address as any)?.state ?? "Dubai",
          is_default: true,
          is_active: true,
        }),
      );

      // 5. Create owner membership row (Phase 3a — role stays 'customer')
      await manager.query(
        `INSERT INTO vendor_members (id, vendor_id, user_id, email, role, status, accepted_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'owner', 'active', NOW(), NOW(), NOW())`,
        [vendor.id, user.id, user.email.toLowerCase()],
      );

      return { vendor, user_id: user.id };
    });
    // Bump token_version outside the tx — bumpTokenVersion uses AppDataSource
    // directly, so it can't see the uncommitted user row from inside the tx.
    await bumpTokenVersion(result.user_id);
    return result;
  }

  /** Vendor dashboard: set or clear the vendor's TRN. Clears verification. */
  async updateTrn(vendorId: string, input: string | null) {
    const vendor = await this.findById(vendorId);
    const trn = parseVendorTrn(input);
    if (trn !== vendor.trn) {
      vendor.trn = trn;
      vendor.trn_verified_at = null;
      vendor.trn_verified_by = null;
      if (trn) vendor.vat_registered = true;
      await this.vendorRepo.save(vendor);
    }
    return withTrnStatus(vendor);
  }

  /** Admin: mark the TRN as checked against the VAT certificate (or undo). */
  async setTrnVerified(vendorId: string, adminId: string, verified: boolean) {
    const vendor = await this.findById(vendorId);
    if (verified) {
      if (!isValidTrn(vendor.trn)) {
        throw new HttpError(400, "The vendor has no valid 15-digit TRN", "TRN_INVALID");
      }
      vendor.trn_verified_at = new Date();
      vendor.trn_verified_by = adminId;
    } else {
      vendor.trn_verified_at = null;
      vendor.trn_verified_by = null;
    }
    await this.vendorRepo.save(vendor);
    return withTrnStatus(vendor);
  }

  async updateByAdmin(vendorId: string, updates: Record<string, any>) {
    const vendor = await this.findById(vendorId);
    const originalName = vendor.name;

    const allowedFields = [
      "name",
      "description",
      "logo_url",
      "banner_url",
      "business_name",
      "business_type",
      "contact_email",
      "contact_phone",
      "whatsapp",
      "website_url",
      "trade_license_number",
      "vat_number",
      "vat_registered",
      "address",
      "social_links",
      "cover_images",
      "commission_type",
      "commission_value",
      "commission_tiers",
      "payout_schedule",
      "minimum_payout",
      "auto_approve_orders",
      "processing_time_days",
      "return_policy",
      "shipping_policy",
      "is_featured",
      "featured_until",
      "meta_title",
      "meta_description",
    ];

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        (vendor as any)[key] = updates[key];
      }
    }

    if (updates.trn !== undefined) {
      const trn = parseVendorTrn(updates.trn);
      if (trn !== vendor.trn) {
        vendor.trn = trn;
        vendor.trn_verified_at = null;
        vendor.trn_verified_by = null;
      }
    }

    // Regenerate slug if name changed (compare against original, not mutated value)
    if (updates.name && updates.name !== originalName) {
      let slug = generateSlug(updates.name);
      const slugExists = await this.vendorRepo.findOne({
        where: { slug },
        withDeleted: true,
      });
      if (slugExists && slugExists.id !== vendorId) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }
      vendor.slug = slug;
    }

    return this.vendorRepo.save(vendor);
  }

  // NOTE: Stripe Connect fields (stripe_account_id, charges_enabled, payouts_enabled,
  // details_submitted) must be added to the Vendor entity + migration in Task 5.5
  async createConnectedAccount(vendorId: string, returnUrl: string, refreshUrl: string) {
    const vendor = await this.findById(vendorId);
    if (vendor.status !== "approved") {
      throw new HttpError(422, "Vendor must be approved", "VENDOR_NOT_APPROVED");
    }

    if ((vendor as any).stripe_account_id) {
      const url = await this.paymentProvider.generateOnboardingUrl(
        (vendor as any).stripe_account_id,
        returnUrl,
        refreshUrl,
      );
      return { onboardingUrl: url, providerId: (vendor as any).stripe_account_id };
    }

    const { providerId } = await this.paymentProvider.createConnectedAccount({
      id: vendor.id,
      business_email: vendor.contact_email,
      business_name: vendor.business_name ?? vendor.name,
      country: "AE",
    });

    (vendor as any).stripe_account_id = providerId;
    await this.vendorRepo.save(vendor);

    const url = await this.paymentProvider.generateOnboardingUrl(providerId, returnUrl, refreshUrl);

    return { onboardingUrl: url, providerId };
  }

  async handlePaymentWebhook(rawBody: string, signature: string) {
    const result = await this.paymentProvider.handleWebhook(rawBody, signature);
    if (result.eventType !== "account.updated" || !result.accountId) return;

    const vendor = await this.vendorRepo.findOne({
      where: { stripe_account_id: result.accountId } as any,
    });
    if (!vendor) return;

    (vendor as any).charges_enabled = result.status.chargesEnabled;
    (vendor as any).payouts_enabled = result.status.payoutsEnabled;
    (vendor as any).details_submitted = result.status.detailsSubmitted;
    await this.vendorRepo.save(vendor);
  }
}

/** Validate a TRN from a form: null/empty clears it, otherwise 15 digits. */
export function parseVendorTrn(input: unknown): string | null {
  if (input === null || input === undefined || String(input).trim() === "") return null;
  const c = checkTrn(String(input));
  if (!c.ok) {
    throw new HttpError(
      400,
      "A TRN is 15 digits, as printed on the VAT certificate",
      "TRN_INVALID",
    );
  }
  return c.trn;
}

/** Vendor with the derived `trn_format_valid` flag the dashboards show. */
export function withTrnStatus<T extends { trn?: string | null }>(vendor: T) {
  return { ...vendor, trn_format_valid: isValidTrn(vendor.trn ?? null) };
}
