import type {
  CartItem,
  Product,
  ProductVariant,
  QuoteAttachment,
  QuoteMessage,
  QuoteRequest,
  QuoteRequestVendor,
  QuoteResponse,
  QuoteStatusHistory,
  Vendor,
  VendorMember,
} from "@materialhub/database";
import {
  QUOTE_EMIRATES,
  QUOTE_UNITS,
  type QuoteActorRole,
  QuoteRequestStatus,
  QuoteResponseStatus,
  QuoteVendorStatus,
} from "@materialhub/database/src/enums/quote.enums.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  type HttpError,
  NotFoundError,
  UnprocessableEntityError,
} from "@materialhub/plugins";
import { type DataSource, type EntityManager, Raw, type Repository } from "typeorm";
import type { CartService } from "../cart/cart.service.ts";
import {
  QuoteRuleError,
  assertAcceptable,
  assertNeedByDate,
  assertResponseInput,
  canMessage,
  deriveRequestStatus,
  formatRequestNumber,
  isRequestOpen,
  nextVendorStatus,
  normaliseVendorIds,
  responseDisplayState,
} from "./quote-state-machine.ts";

/* ------------------------------------------------------------------ */
/*  Inputs                                                            */
/* ------------------------------------------------------------------ */

export interface CreateQuoteRequestInput {
  product_id?: string | null;
  variant_id?: string | null;
  category_id?: string | null;
  title?: string | null;
  specification: string;
  quantity: number;
  unit: string;
  need_by?: string | null;
  delivery_emirate: string;
  attachments?: QuoteAttachment[];
  /** Supplier ids and/or slugs; 1 to 3 suppliers in total. */
  vendor_ids?: string[];
  vendor_slugs?: string[];
}

export interface RespondInput {
  product_id: string;
  variant_id?: string | null;
  unit_price: number;
  moq: number;
  lead_time_days: number;
  valid_until: string;
  notes?: string | null;
}

export interface MessageInput {
  body: string;
  attachments?: QuoteAttachment[];
}

export interface ListQuery {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
}

/** Narrow queue shape so tests can pass a stub. */
export interface NotificationQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
}

export interface AttachmentSigner {
  getQuoteAttachmentSignedUrl(key: string): Promise<{ url: string; expiresAt: Date }>;
}

const ATTACHMENT_PREFIX = "private/quotes/";
const MAX_ATTACHMENTS = 5;
const NOTIFY_VENDOR_ROLES = new Set(["owner", "manager", "staff"]);

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */

export class QuoteRequestService {
  constructor(
    private dataSource: DataSource,
    private requestRepo: Repository<QuoteRequest>,
    private requestVendorRepo: Repository<QuoteRequestVendor>,
    private responseRepo: Repository<QuoteResponse>,
    private messageRepo: Repository<QuoteMessage>,
    private historyRepo: Repository<QuoteStatusHistory>,
    private vendorRepo: Repository<Vendor>,
    private vendorMemberRepo: Repository<VendorMember>,
    private productRepo: Repository<Product>,
    private variantRepo: Repository<ProductVariant>,
    private cartService: CartService,
    private notificationQueue: NotificationQueue,
    private signer: AttachmentSigner,
  ) {}

  /* ================================================================ */
  /*  Buyer                                                           */
  /* ================================================================ */

  async create(buyerId: string, input: CreateQuoteRequestInput): Promise<any> {
    return this.rules(async () => {
      const specification = input.specification?.trim() ?? "";
      if (specification.length < 10) {
        throw new QuoteRuleError(
          "INVALID_INPUT",
          "Describe the material in at least 10 characters",
        );
      }
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        throw new QuoteRuleError("INVALID_INPUT", "Quantity must be a whole number above zero");
      }
      if (!(QUOTE_UNITS as readonly string[]).includes(input.unit)) {
        throw new QuoteRuleError("INVALID_INPUT", `Unit must be one of ${QUOTE_UNITS.join(", ")}`);
      }
      if (!(QUOTE_EMIRATES as readonly string[]).includes(input.delivery_emirate)) {
        throw new QuoteRuleError("INVALID_INPUT", "Choose the emirate to deliver to");
      }
      assertNeedByDate(input.need_by);
      const attachments = this.cleanAttachments(input.attachments);

      // Resolve product context (product page) before suppliers, so the
      // product's own supplier is always one of the targets.
      let product: Product | null = null;
      let variant: ProductVariant | null = null;
      if (input.product_id) {
        product = await this.productRepo.findOne({ where: { id: input.product_id } });
        if (!product || product.status !== "published") {
          throw new QuoteRuleError("INVALID_INPUT", "That product isn't available");
        }
        if (input.variant_id) {
          variant = await this.variantRepo.findOne({
            where: { id: input.variant_id, product_id: product.id },
          });
          if (!variant) throw new QuoteRuleError("INVALID_INPUT", "That option isn't available");
        }
      }

      const requestedIds = [...(input.vendor_ids ?? [])];
      if (input.vendor_slugs?.length) {
        const bySlug = await this.vendorRepo.find({
          where: { slug: anyOf(input.vendor_slugs) } as any,
          select: { id: true, slug: true } as any,
        });
        if (bySlug.length !== new Set(input.vendor_slugs).size) {
          throw new QuoteRuleError("INVALID_INPUT", "One of the suppliers wasn't found");
        }
        requestedIds.push(...bySlug.map((v) => v.id));
      }
      if (product) requestedIds.unshift(product.vendor_id);
      const vendorIds = normaliseVendorIds(requestedIds);

      const vendors = await this.vendorRepo.find({ where: { id: anyOf(vendorIds) } as any });
      const approved = vendors.filter((v) => String(v.status) === "approved");
      if (approved.length !== vendorIds.length) {
        throw new QuoteRuleError("INVALID_INPUT", "One of the suppliers isn't taking quotes");
      }

      const title =
        input.title?.trim() ||
        [product?.name, variant?.name].filter(Boolean).join(" · ") ||
        (specification.split("\n")[0] ?? specification).slice(0, 120);

      const saved = await this.dataSource.transaction(async (m) => {
        const [{ nextval }] = await m.query(
          `SELECT nextval('quote_request_number_seq') AS nextval`,
        );
        const request = await m.getRepository<QuoteRequest>("QuoteRequest").save({
          request_number: formatRequestNumber(new Date().getFullYear(), Number(nextval)),
          buyer_id: buyerId,
          product_id: product?.id ?? null,
          variant_id: variant?.id ?? null,
          category_id: input.category_id ?? product?.category_id ?? null,
          title: title.slice(0, 200),
          specification,
          quantity: input.quantity,
          unit: input.unit,
          need_by: input.need_by || null,
          delivery_emirate: input.delivery_emirate,
          attachments,
          status: QuoteRequestStatus.open,
        } as any);
        const links = await m.getRepository<QuoteRequestVendor>("QuoteRequestVendor").save(
          vendorIds.map((vendor_id) => ({
            quote_request_id: request.id,
            vendor_id,
            status: QuoteVendorStatus.pending,
          })) as any[],
        );
        await this.log(
          m,
          request.id,
          null,
          "request",
          null,
          QuoteRequestStatus.open,
          "buyer",
          buyerId,
        );
        return { request, links };
      });

      for (const link of saved.links) {
        await this.notifyVendor(link.vendor_id, "quote_request_received", {
          eventId: `quote_request_${link.id}`,
          variables: { request_number: saved.request.request_number, title: saved.request.title },
          data: { quoteRequestId: saved.request.id, requestVendorId: link.id },
        });
      }
      return this.getForBuyer(buyerId, saved.request.id);
    });
  }

  async listForBuyer(buyerId: string, query: ListQuery) {
    const { page, limit, skip } = paging(query);
    const qb = this.requestRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.vendors", "rv")
      .leftJoinAndSelect("rv.vendor", "v")
      .where("r.buyer_id = :buyerId", { buyerId })
      .orderBy("r.created_at", "DESC")
      .skip(skip)
      .take(limit);
    if (query.status) qb.andWhere("r.status = :status", { status: query.status });
    const [rows, total] = await qb.getManyAndCount();
    const responses = await this.currentResponses(rows.flatMap((r) => r.vendors ?? []));
    return {
      data: rows.map((r) => {
        const live = (r.vendors ?? [])
          .map((rv) => responses.get(rv.current_response_id ?? ""))
          .filter((x): x is QuoteResponse => !!x && responseDisplayState(x) === "live");
        return {
          ...this.requestSummary(r),
          suppliers: (r.vendors ?? []).map((rv) => ({
            id: rv.id,
            status: rv.status,
            vendor: vendorPublic(rv.vendor),
          })),
          response_count: live.length,
          best_unit_price: live.length ? Math.min(...live.map((x) => x.unit_price)) : null,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async getForBuyer(buyerId: string, requestId: string) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId, buyer_id: buyerId } as any,
      relations: ["vendors", "vendors.vendor", "product", "variant"],
    });
    if (!request) throw new NotFoundError("Quote request not found");
    return this.detail(request, "buyer");
  }

  async buyerMessage(
    buyerId: string,
    requestId: string,
    requestVendorId: string,
    input: MessageInput,
  ) {
    return this.rules(async () => {
      const { request, link } = await this.loadPairForBuyer(buyerId, requestId, requestVendorId);
      const message = await this.postMessage(request, link, "buyer", buyerId, input);
      await this.notifyVendor(link.vendor_id, "quote_message_received", {
        eventId: `quote_message_${message.id}`,
        variables: { request_number: request.request_number },
        data: { quoteRequestId: request.id, requestVendorId: link.id },
      });
      return message;
    });
  }

  /**
   * Accept one supplier's live response: lock the request and its supplier
   * rows, apply the acceptance rules, mark the others not selected, and add
   * the quoted line to the buyer's cart, all in one transaction.
   *
   * Idempotent: accepting the response that is already accepted returns the
   * same result without touching the cart again.
   */
  async accept(buyerId: string, requestId: string, requestVendorId: string) {
    return this.rules(async () => {
      const result = await this.dataSource.transaction(async (m) => {
        const request = await m
          .getRepository<QuoteRequest>("QuoteRequest")
          .createQueryBuilder("r")
          .setLock("pessimistic_write")
          .where("r.id = :id AND r.buyer_id = :buyerId", { id: requestId, buyerId })
          .getOne();
        if (!request) throw new NotFoundError("Quote request not found");
        const links = await m
          .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
          .createQueryBuilder("rv")
          .setLock("pessimistic_write")
          .where("rv.quote_request_id = :id", { id: request.id })
          .getMany();
        const link = links.find((l) => l.id === requestVendorId);
        if (!link) throw new NotFoundError("Supplier not found on this request");

        if (
          request.status === QuoteRequestStatus.accepted &&
          link.status === QuoteVendorStatus.accepted &&
          request.accepted_response_id === link.current_response_id
        ) {
          return { request, link, cartItem: null as CartItem | null, replay: true };
        }

        const response = link.current_response_id
          ? await m
              .getRepository<QuoteResponse>("QuoteResponse")
              .findOne({ where: { id: link.current_response_id } })
          : null;
        const { quantity } = assertAcceptable({
          requestStatus: request.status,
          vendorStatus: link.status,
          response,
          currentResponseId: link.current_response_id,
          requestedQuantity: request.quantity,
        });
        if (!response) throw new QuoteRuleError("NO_LIVE_RESPONSE", "No live quote");

        // The quoted listing must still be buyable.
        const product = await m.getRepository<Product>("Product").findOne({
          where: { id: response.product_id },
        });
        if (!product || product.status !== "published" || product.vendor_id !== link.vendor_id) {
          throw new QuoteRuleError(
            "NO_LIVE_RESPONSE",
            "The quoted listing is no longer available; ask the supplier to re-quote",
          );
        }
        let listPrice = product.price;
        if (response.variant_id) {
          const variant = await m.getRepository<ProductVariant>("ProductVariant").findOne({
            where: { id: response.variant_id, product_id: product.id },
          });
          if (!variant) {
            throw new QuoteRuleError(
              "NO_LIVE_RESPONSE",
              "The quoted option is no longer available",
            );
          }
          listPrice = variant.price;
        }

        const now = new Date();
        const rvRepo = m.getRepository<QuoteRequestVendor>("QuoteRequestVendor");
        const respRepo = m.getRepository<QuoteResponse>("QuoteResponse");

        await respRepo.update({ id: response.id }, { status: QuoteResponseStatus.accepted });
        await this.log(
          m,
          request.id,
          link.id,
          "response",
          response.status,
          "accepted",
          "buyer",
          buyerId,
        );
        const acceptedStatus = nextVendorStatus(link.status, "accept");
        await rvRepo.update({ id: link.id }, { status: acceptedStatus });
        await this.log(
          m,
          request.id,
          link.id,
          "vendor",
          link.status,
          acceptedStatus,
          "buyer",
          buyerId,
        );
        link.status = acceptedStatus;

        for (const other of links) {
          if (other.id === link.id) continue;
          if (
            other.status === QuoteVendorStatus.vendor_declined ||
            other.status === QuoteVendorStatus.cancelled
          ) {
            continue;
          }
          const to = nextVendorStatus(other.status, "not_selected");
          await rvRepo.update({ id: other.id }, { status: to });
          await this.log(m, request.id, other.id, "vendor", other.status, to, "buyer", buyerId);
          other.status = to;
        }

        const requestStatus = deriveRequestStatus(links.map((l) => l.status));
        await m
          .getRepository<QuoteRequest>("QuoteRequest")
          .update(
            { id: request.id },
            { status: requestStatus, accepted_response_id: response.id, accepted_at: now },
          );
        await this.log(
          m,
          request.id,
          null,
          "request",
          request.status,
          requestStatus,
          "buyer",
          buyerId,
        );
        request.status = requestStatus;
        request.accepted_response_id = response.id;

        const cartItem = await this.cartService.upsertQuotedLine(m, buyerId, {
          productId: product.id,
          variantId: response.variant_id,
          vendorId: link.vendor_id,
          quantity,
          quoteId: response.id,
          quotedUnitPrice: response.unit_price,
          listPrice,
        });
        return { request, link, cartItem, replay: false };
      });

      if (!result.replay && result.cartItem) {
        await this.cartService
          .syncQuotedLine(buyerId, result.cartItem)
          .catch((err) =>
            console.error("[quote] redis cart sync failed", { requestId, error: String(err) }),
          );
        await this.notifyVendor(result.link.vendor_id, "quote_accepted", {
          eventId: `quote_accepted_${result.link.id}`,
          variables: { request_number: result.request.request_number },
          data: { quoteRequestId: result.request.id, requestVendorId: result.link.id },
        });
      }
      return {
        request: await this.getForBuyer(buyerId, requestId),
        cart_item: result.cartItem
          ? {
              id: result.cartItem.id,
              product_id: result.cartItem.product_id,
              variant_id: result.cartItem.variant_id,
              quantity: result.cartItem.quantity,
              unit_price: result.cartItem.unit_price,
              quote_id: result.cartItem.quote_id,
            }
          : null,
      };
    });
  }

  /** The buyer turns down one supplier's current response. The supplier may re-quote. */
  async decline(
    buyerId: string,
    requestId: string,
    requestVendorId: string,
    reason?: string | null,
  ) {
    return this.rules(async () => {
      const { request, link, responseId } = await this.dataSource.transaction(async (m) => {
        const { request, link } = await this.lockPair(m, requestId, requestVendorId, { buyerId });
        if (!isRequestOpen(request.status)) {
          throw new QuoteRuleError("REQUEST_CLOSED", `This request is ${request.status}`);
        }
        const to = nextVendorStatus(link.status, "buyer_decline");
        const responseId = link.current_response_id;
        if (responseId) {
          await m
            .getRepository<QuoteResponse>("QuoteResponse")
            .update({ id: responseId }, { status: QuoteResponseStatus.declined });
          await this.log(
            m,
            request.id,
            link.id,
            "response",
            "submitted",
            "declined",
            "buyer",
            buyerId,
          );
        }
        await m
          .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
          .update({ id: link.id }, { status: to });
        await this.log(
          m,
          request.id,
          link.id,
          "vendor",
          link.status,
          to,
          "buyer",
          buyerId,
          reason ?? null,
        );
        link.status = to;
        await this.syncRequestStatus(m, request, "buyer", buyerId);
        if (reason?.trim()) {
          await this.insertMessage(m, request.id, link.id, "buyer", buyerId, reason.trim(), []);
        }
        return { request, link, responseId };
      });
      await this.notifyVendor(link.vendor_id, "quote_message_received", {
        eventId: `quote_declined_${responseId ?? link.id}`,
        variables: { request_number: request.request_number },
        data: { quoteRequestId: request.id, requestVendorId: link.id },
      });
      return this.getForBuyer(buyerId, requestId);
    });
  }

  async cancel(buyerId: string, requestId: string) {
    return this.rules(async () => {
      await this.dataSource.transaction(async (m) => {
        const request = await m
          .getRepository<QuoteRequest>("QuoteRequest")
          .createQueryBuilder("r")
          .setLock("pessimistic_write")
          .where("r.id = :id AND r.buyer_id = :buyerId", { id: requestId, buyerId })
          .getOne();
        if (!request) throw new NotFoundError("Quote request not found");
        if (!isRequestOpen(request.status)) {
          throw new QuoteRuleError("REQUEST_CLOSED", `This request is ${request.status}`);
        }
        const links = await m.getRepository<QuoteRequestVendor>("QuoteRequestVendor").find({
          where: { quote_request_id: request.id },
        });
        for (const link of links) {
          if (link.status === QuoteVendorStatus.vendor_declined) continue;
          const to = nextVendorStatus(link.status, "cancel");
          await m
            .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
            .update({ id: link.id }, { status: to });
          await this.log(m, request.id, link.id, "vendor", link.status, to, "buyer", buyerId);
        }
        await m
          .getRepository<QuoteRequest>("QuoteRequest")
          .update(
            { id: request.id },
            { status: QuoteRequestStatus.cancelled, cancelled_at: new Date() },
          );
        await this.log(
          m,
          request.id,
          null,
          "request",
          request.status,
          "cancelled",
          "buyer",
          buyerId,
        );
      });
      return this.getForBuyer(buyerId, requestId);
    });
  }

  /* ================================================================ */
  /*  Vendor                                                          */
  /* ================================================================ */

  async listForVendor(vendorId: string, query: ListQuery) {
    const { page, limit, skip } = paging(query);
    const qb = this.requestVendorRepo
      .createQueryBuilder("rv")
      .innerJoinAndSelect("rv.quoteRequest", "r")
      .leftJoinAndSelect("r.buyer", "b")
      .where("rv.vendor_id = :vendorId", { vendorId })
      .orderBy("rv.updated_at", "DESC")
      .skip(skip)
      .take(limit);
    if (query.status) qb.andWhere("rv.status = :status", { status: query.status });
    if (query.q) {
      qb.andWhere("(r.request_number ILIKE :q OR r.title ILIKE :q)", { q: `%${query.q}%` });
    }
    const [rows, total] = await qb.getManyAndCount();
    const responses = await this.currentResponses(rows);
    const counts = await this.requestVendorRepo
      .createQueryBuilder("rv")
      .select("rv.status", "status")
      .addSelect("COUNT(*)::int", "count")
      .where("rv.vendor_id = :vendorId", { vendorId })
      .groupBy("rv.status")
      .getRawMany();
    return {
      data: rows.map((rv) => {
        const response = responses.get(rv.current_response_id ?? "");
        return {
          id: rv.id,
          status: rv.status,
          last_message_at: rv.last_message_at,
          updated_at: rv.updated_at,
          request: {
            ...this.requestSummary(rv.quoteRequest),
            buyer: buyerPublic(rv.quoteRequest.buyer),
          },
          current_response: response ? responseView(response, rv.quoteRequest.quantity) : null,
        };
      }),
      total,
      page,
      limit,
      status_counts: Object.fromEntries(counts.map((c: any) => [c.status, Number(c.count)])),
    };
  }

  async getForVendor(vendorId: string, requestVendorId: string) {
    const link = await this.requestVendorRepo.findOne({
      where: { id: requestVendorId, vendor_id: vendorId } as any,
      relations: [
        "quoteRequest",
        "quoteRequest.buyer",
        "quoteRequest.product",
        "quoteRequest.variant",
        "vendor",
      ],
    });
    if (!link) throw new NotFoundError("Quote request not found");
    const request = link.quoteRequest;
    const [responses, messages, history] = await Promise.all([
      this.responseRepo.find({
        where: { quote_request_vendor_id: link.id },
        relations: ["product", "product.images", "variant"],
        order: { created_at: "DESC" },
      }),
      this.messageRepo.find({
        where: { quote_request_vendor_id: link.id },
        order: { created_at: "ASC" },
      }),
      this.historyRepo.find({
        where: [
          { quote_request_id: request.id, quote_request_vendor_id: link.id },
          { quote_request_id: request.id, subject: "request" },
        ] as any,
        order: { created_at: "ASC" },
      }),
    ]);
    return {
      id: link.id,
      status: link.status,
      decline_reason: link.decline_reason,
      request: {
        ...this.requestSummary(request),
        specification: request.specification,
        attachments: request.attachments ?? [],
        buyer: buyerPublic(request.buyer),
        product: productPublic(request.product),
        variant: request.variant ? { id: request.variant.id, name: request.variant.name } : null,
        // Other suppliers stay anonymous: only whether someone else won.
        outcome:
          request.status === QuoteRequestStatus.accepted
            ? link.status === QuoteVendorStatus.accepted
              ? "won"
              : "lost"
            : null,
      },
      current_response_id: link.current_response_id,
      responses: responses.map((r) => responseView(r, request.quantity)),
      messages: messages.map(messageView),
      history: history.map(historyView),
      can_respond: isRequestOpen(request.status) && canVendorAct(link.status, "respond"),
      can_decline: isRequestOpen(request.status) && canVendorAct(link.status, "vendor_decline"),
      can_message: canMessage(request.status, link.status),
    };
  }

  async respond(vendorId: string, userId: string, requestVendorId: string, input: RespondInput) {
    return this.rules(async () => {
      assertResponseInput(input);
      const product = await this.productRepo.findOne({ where: { id: input.product_id } });
      if (!product || product.vendor_id !== vendorId) {
        throw new QuoteRuleError("INVALID_INPUT", "Choose one of your own listings");
      }
      if (product.status !== "published") {
        throw new QuoteRuleError(
          "INVALID_INPUT",
          "The listing must be published so the buyer can order it",
        );
      }
      if (input.variant_id) {
        const variant = await this.variantRepo.findOne({
          where: { id: input.variant_id, product_id: product.id },
        });
        if (!variant)
          throw new QuoteRuleError("INVALID_INPUT", "That option isn't on this listing");
      }

      const { request, link, response, revised } = await this.dataSource.transaction(async (m) => {
        const { request, link } = await this.lockPair(m, null, requestVendorId, { vendorId });
        if (!isRequestOpen(request.status)) {
          throw new QuoteRuleError("REQUEST_CLOSED", `This request is ${request.status}`);
        }
        const to = nextVendorStatus(link.status, "respond");
        const respRepo = m.getRepository<QuoteResponse>("QuoteResponse");
        const revised = !!link.current_response_id;
        if (link.current_response_id) {
          const prev = await respRepo.findOne({ where: { id: link.current_response_id } });
          if (prev && prev.status === QuoteResponseStatus.submitted) {
            await respRepo.update({ id: prev.id }, { status: QuoteResponseStatus.superseded });
            await this.log(
              m,
              request.id,
              link.id,
              "response",
              prev.status,
              "superseded",
              "vendor",
              userId,
            );
          }
        }
        const response = await respRepo.save({
          quote_request_vendor_id: link.id,
          quote_request_id: request.id,
          vendor_id: vendorId,
          product_id: product.id,
          variant_id: input.variant_id ?? null,
          unit_price: input.unit_price,
          currency: "AED",
          moq: input.moq,
          lead_time_days: input.lead_time_days,
          valid_until: input.valid_until,
          notes: input.notes?.trim() || null,
          status: QuoteResponseStatus.submitted,
          responded_by: userId,
        } as any);
        await this.log(m, request.id, link.id, "response", null, "submitted", "vendor", userId);
        await m
          .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
          .update(
            { id: link.id },
            { status: to, current_response_id: response.id, decline_reason: null },
          );
        if (to !== link.status) {
          await this.log(m, request.id, link.id, "vendor", link.status, to, "vendor", userId);
        }
        link.status = to;
        await this.syncRequestStatus(m, request, "vendor", userId);
        return { request, link, response, revised };
      });

      const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
      await this.notify(request.buyer_id, "quote_response_received", {
        eventId: `quote_response_${response.id}`,
        variables: {
          request_number: request.request_number,
          vendor_name: vendor?.name ?? "",
          revised: revised ? "revised" : "new",
        },
        data: { quoteRequestId: request.id, requestVendorId: link.id },
      });
      return this.getForVendor(vendorId, requestVendorId);
    });
  }

  async vendorDecline(
    vendorId: string,
    userId: string,
    requestVendorId: string,
    reason?: string | null,
  ) {
    return this.rules(async () => {
      const { request } = await this.dataSource.transaction(async (m) => {
        const { request, link } = await this.lockPair(m, null, requestVendorId, { vendorId });
        if (!isRequestOpen(request.status)) {
          throw new QuoteRuleError("REQUEST_CLOSED", `This request is ${request.status}`);
        }
        const to = nextVendorStatus(link.status, "vendor_decline");
        if (link.current_response_id) {
          await m
            .getRepository<QuoteResponse>("QuoteResponse")
            .update(
              { id: link.current_response_id, status: QuoteResponseStatus.submitted } as any,
              { status: QuoteResponseStatus.superseded },
            );
        }
        await m
          .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
          .update({ id: link.id }, { status: to, decline_reason: reason?.trim() || null });
        await this.log(
          m,
          request.id,
          link.id,
          "vendor",
          link.status,
          to,
          "vendor",
          userId,
          reason ?? null,
        );
        link.status = to;
        await this.syncRequestStatus(m, request, "vendor", userId);
        return { request };
      });
      await this.notify(request.buyer_id, "quote_message_received", {
        eventId: `quote_vendor_declined_${requestVendorId}`,
        variables: { request_number: request.request_number },
        data: { quoteRequestId: request.id, requestVendorId },
      });
      return this.getForVendor(vendorId, requestVendorId);
    });
  }

  async vendorMessage(
    vendorId: string,
    userId: string,
    requestVendorId: string,
    input: MessageInput,
  ) {
    return this.rules(async () => {
      const link = await this.requestVendorRepo.findOne({
        where: { id: requestVendorId, vendor_id: vendorId } as any,
        relations: ["quoteRequest"],
      });
      if (!link) throw new NotFoundError("Quote request not found");
      const message = await this.postMessage(link.quoteRequest, link, "vendor", userId, input);
      await this.notify(link.quoteRequest.buyer_id, "quote_message_received", {
        eventId: `quote_message_${message.id}`,
        variables: { request_number: link.quoteRequest.request_number },
        data: { quoteRequestId: link.quote_request_id, requestVendorId: link.id },
      });
      return message;
    });
  }

  /* ================================================================ */
  /*  Admin (read-only)                                               */
  /* ================================================================ */

  async listForAdmin(query: ListQuery) {
    const { page, limit, skip } = paging(query);
    const qb = this.requestRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.buyer", "b")
      .leftJoinAndSelect("r.vendors", "rv")
      .leftJoinAndSelect("rv.vendor", "v")
      .orderBy("r.created_at", "DESC")
      .skip(skip)
      .take(limit);
    if (query.status) qb.andWhere("r.status = :status", { status: query.status });
    if (query.q) {
      qb.andWhere("(r.request_number ILIKE :q OR r.title ILIKE :q OR b.email ILIKE :q)", {
        q: `%${query.q}%`,
      });
    }
    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((r) => ({
        ...this.requestSummary(r),
        buyer: buyerAdmin(r.buyer),
        suppliers: (r.vendors ?? []).map((rv) => ({
          id: rv.id,
          status: rv.status,
          vendor: vendorPublic(rv.vendor),
        })),
      })),
      total,
      page,
      limit,
    };
  }

  async getForAdmin(requestId: string) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ["vendors", "vendors.vendor", "product", "variant", "buyer"],
    });
    if (!request) throw new NotFoundError("Quote request not found");
    const detail = await this.detail(request, "admin");
    return { ...detail, buyer: buyerAdmin(request.buyer) };
  }

  /* ================================================================ */
  /*  Attachments                                                     */
  /* ================================================================ */

  /** A short-lived URL for an attachment, only for a party to the request. */
  async attachmentUrl(
    actor:
      | { role: "buyer"; userId: string }
      | { role: "vendor"; vendorId: string }
      | { role: "admin" },
    requestId: string,
    key: string,
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ["vendors"],
    });
    if (!request) throw new NotFoundError("Quote request not found");
    if (actor.role === "buyer" && request.buyer_id !== actor.userId) {
      throw new NotFoundError("Quote request not found");
    }
    let allowedLinks = request.vendors ?? [];
    if (actor.role === "vendor") {
      allowedLinks = allowedLinks.filter((l) => l.vendor_id === actor.vendorId);
      if (allowedLinks.length === 0) throw new NotFoundError("Quote request not found");
    }
    const onRequest = (request.attachments ?? []).some((a) => a.key === key);
    let onMessage = false;
    if (!onRequest && allowedLinks.length) {
      const msgs = await this.messageRepo.find({
        where: { quote_request_vendor_id: anyOf(allowedLinks.map((l) => l.id)) } as any,
        select: { id: true, attachments: true } as any,
      });
      onMessage = msgs.some((msg) => (msg.attachments ?? []).some((a) => a.key === key));
    }
    if (!onRequest && !onMessage) throw new ForbiddenError("That file isn't on this request");
    return this.signer.getQuoteAttachmentSignedUrl(key);
  }

  /* ================================================================ */
  /*  Internals                                                       */
  /* ================================================================ */

  /** Translate rule failures into HTTP errors the error handler understands. */
  private async rules<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof QuoteRuleError) throw ruleToHttp(err);
      throw err;
    }
  }

  private cleanAttachments(list: QuoteAttachment[] | undefined): QuoteAttachment[] {
    const items = (list ?? []).filter(Boolean);
    if (items.length > MAX_ATTACHMENTS) {
      throw new QuoteRuleError("INVALID_INPUT", `Attach at most ${MAX_ATTACHMENTS} files`);
    }
    for (const a of items) {
      if (
        typeof a.key !== "string" ||
        !a.key.startsWith(ATTACHMENT_PREFIX) ||
        a.key.includes("..")
      ) {
        throw new QuoteRuleError("INVALID_INPUT", "Upload attachments with the quote upload first");
      }
    }
    return items.map((a) => ({
      key: a.key,
      filename: String(a.filename ?? "").slice(0, 200),
      content_type: String(a.content_type ?? "").slice(0, 100),
    }));
  }

  private async postMessage(
    request: QuoteRequest,
    link: QuoteRequestVendor,
    role: "buyer" | "vendor",
    senderId: string,
    input: MessageInput,
  ) {
    const body = input.body?.trim() ?? "";
    if (!body) throw new QuoteRuleError("INVALID_INPUT", "Write a message first");
    if (body.length > 4000)
      throw new QuoteRuleError("INVALID_INPUT", "Keep messages under 4,000 characters");
    if (!canMessage(request.status, link.status)) {
      throw new QuoteRuleError("REQUEST_CLOSED", "This conversation is closed");
    }
    const attachments = this.cleanAttachments(input.attachments);
    const saved = await this.dataSource.transaction((m) =>
      this.insertMessage(m, request.id, link.id, role, senderId, body, attachments),
    );
    return messageView(saved);
  }

  private async insertMessage(
    m: EntityManager,
    requestId: string,
    linkId: string,
    role: "buyer" | "vendor" | "system",
    senderId: string | null,
    body: string,
    attachments: QuoteAttachment[],
  ): Promise<QuoteMessage> {
    const saved = await m.getRepository<QuoteMessage>("QuoteMessage").save({
      quote_request_vendor_id: linkId,
      quote_request_id: requestId,
      sender_id: senderId,
      sender_role: role,
      body,
      attachments,
    } as any);
    await m
      .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
      .update({ id: linkId }, { last_message_at: new Date() });
    return saved as QuoteMessage;
  }

  private async lockPair(
    m: EntityManager,
    requestId: string | null,
    requestVendorId: string,
    owner: { buyerId?: string; vendorId?: string },
  ): Promise<{ request: QuoteRequest; link: QuoteRequestVendor }> {
    const link = await m
      .getRepository<QuoteRequestVendor>("QuoteRequestVendor")
      .createQueryBuilder("rv")
      .setLock("pessimistic_write")
      .where("rv.id = :id", { id: requestVendorId })
      .getOne();
    if (!link || (requestId && link.quote_request_id !== requestId)) {
      throw new NotFoundError("Quote request not found");
    }
    if (owner.vendorId && link.vendor_id !== owner.vendorId) {
      throw new NotFoundError("Quote request not found");
    }
    const request = await m
      .getRepository<QuoteRequest>("QuoteRequest")
      .createQueryBuilder("r")
      .setLock("pessimistic_write")
      .where("r.id = :id", { id: link.quote_request_id })
      .getOne();
    if (!request || (owner.buyerId && request.buyer_id !== owner.buyerId)) {
      throw new NotFoundError("Quote request not found");
    }
    return { request, link };
  }

  private async loadPairForBuyer(buyerId: string, requestId: string, requestVendorId: string) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId, buyer_id: buyerId } as any,
    });
    if (!request) throw new NotFoundError("Quote request not found");
    const link = await this.requestVendorRepo.findOne({
      where: { id: requestVendorId, quote_request_id: request.id } as any,
    });
    if (!link) throw new NotFoundError("Supplier not found on this request");
    return { request, link };
  }

  /** Recompute the request status from its supplier rows and log a change. */
  private async syncRequestStatus(
    m: EntityManager,
    request: QuoteRequest,
    role: QuoteActorRole,
    actorId: string | null,
  ) {
    const links = await m.getRepository<QuoteRequestVendor>("QuoteRequestVendor").find({
      where: { quote_request_id: request.id },
    });
    const next = deriveRequestStatus(links.map((l) => l.status));
    if (next !== request.status) {
      await m
        .getRepository<QuoteRequest>("QuoteRequest")
        .update({ id: request.id }, { status: next });
      await this.log(m, request.id, null, "request", request.status, next, role, actorId);
      request.status = next;
    }
  }

  private async log(
    m: EntityManager,
    requestId: string,
    linkId: string | null,
    subject: "request" | "vendor" | "response",
    from: string | null,
    to: string,
    role: QuoteActorRole,
    actorId: string | null,
    note: string | null = null,
  ) {
    await m.getRepository<QuoteStatusHistory>("QuoteStatusHistory").insert({
      quote_request_id: requestId,
      quote_request_vendor_id: linkId,
      subject,
      from_status: from,
      to_status: to,
      actor_role: role,
      actor_id: actorId,
      note: note?.trim() || null,
    } as any);
  }

  private async currentResponses(links: QuoteRequestVendor[]): Promise<Map<string, QuoteResponse>> {
    const ids = links.map((l) => l.current_response_id).filter((x): x is string => !!x);
    if (!ids.length) return new Map();
    const rows = await this.responseRepo.find({
      where: { id: anyOf(ids) } as any,
      relations: ["product", "product.images", "variant"],
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private requestSummary(r: QuoteRequest) {
    return {
      id: r.id,
      request_number: r.request_number,
      title: r.title,
      quantity: r.quantity,
      unit: r.unit,
      need_by: r.need_by,
      delivery_emirate: r.delivery_emirate,
      status: r.status,
      product_id: r.product_id,
      variant_id: r.variant_id,
      category_id: r.category_id,
      accepted_response_id: r.accepted_response_id,
      accepted_at: r.accepted_at,
      cancelled_at: r.cancelled_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  /** Full view for the buyer (their own request) and admin (any request). */
  private async detail(request: QuoteRequest, audience: "buyer" | "admin") {
    const links = request.vendors ?? [];
    const linkIds = links.map((l) => l.id);
    const [responses, messages, history] = await Promise.all([
      linkIds.length
        ? this.responseRepo.find({
            where: { quote_request_vendor_id: anyOf(linkIds) } as any,
            relations: ["product", "product.images", "variant"],
            order: { created_at: "DESC" },
          })
        : Promise.resolve([] as QuoteResponse[]),
      linkIds.length
        ? this.messageRepo.find({
            where: { quote_request_vendor_id: anyOf(linkIds) } as any,
            order: { created_at: "ASC" },
          })
        : Promise.resolve([] as QuoteMessage[]),
      this.historyRepo.find({
        where: { quote_request_id: request.id },
        order: { created_at: "ASC" },
      }),
    ]);
    const open = isRequestOpen(request.status);
    return {
      ...this.requestSummary(request),
      specification: request.specification,
      attachments: request.attachments ?? [],
      product: productPublic(request.product),
      variant: request.variant ? { id: request.variant.id, name: request.variant.name } : null,
      can_cancel: audience === "buyer" && open,
      suppliers: links.map((l) => {
        const mine = responses.filter((r) => r.quote_request_vendor_id === l.id);
        const current = mine.find((r) => r.id === l.current_response_id) ?? null;
        const currentView = current ? responseView(current, request.quantity) : null;
        return {
          id: l.id,
          status: l.status,
          decline_reason: l.decline_reason,
          vendor: vendorPublic(l.vendor),
          current_response: currentView,
          previous_responses: mine
            .filter((r) => r.id !== l.current_response_id)
            .map((r) => responseView(r, request.quantity)),
          messages: messages.filter((msg) => msg.quote_request_vendor_id === l.id).map(messageView),
          can_accept:
            audience === "buyer" &&
            open &&
            canVendorAct(l.status, "accept") &&
            currentView?.display_state === "live",
          can_decline: audience === "buyer" && open && canVendorAct(l.status, "buyer_decline"),
          can_message: audience === "buyer" && canMessage(request.status, l.status),
        };
      }),
      history: history.map(historyView),
    };
  }

  private async notify(
    userId: string,
    notificationType: string,
    payload: { eventId: string; variables: Record<string, string>; data: Record<string, string> },
    audience: "buyer" | "vendor" = "buyer",
  ) {
    const actionPath =
      audience === "buyer"
        ? `/account/quotes/${payload.data.quoteRequestId}`
        : `/quotes/${payload.data.requestVendorId}`;
    // Best effort: a queue outage must not fail the buyer's or supplier's action.
    await this.notificationQueue
      .add("notification-event", {
        type: `quote.${notificationType}`,
        userId,
        notificationType,
        variables: { ...payload.variables, ...payload.data, action_path: actionPath },
        data: payload.data,
        eventId: `${payload.eventId}_${userId}`,
      })
      .catch((err) =>
        console.error("[quote] notification enqueue failed", {
          notificationType,
          error: String(err),
        }),
      );
  }

  private async notifyVendor(
    vendorId: string,
    notificationType: string,
    payload: { eventId: string; variables: Record<string, string>; data: Record<string, string> },
  ) {
    const members = await this.vendorMemberRepo.find({
      where: { vendor_id: vendorId, status: "active" } as any,
    });
    for (const member of members) {
      if (!member.user_id || !NOTIFY_VENDOR_ROLES.has(String(member.role))) continue;
      await this.notify(member.user_id, notificationType, payload, "vendor");
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Views and helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * `column = ANY($ids)`. Used instead of TypeORM's In(): payout.service.test.ts
 * mocks In() process-wide under bun, which breaks real queries in later files.
 */
function anyOf(values: string[]) {
  return Raw((alias) => `${alias} = ANY(:anyOfValues)`, { anyOfValues: values });
}

function canVendorAct(status: QuoteVendorStatus, action: Parameters<typeof nextVendorStatus>[1]) {
  try {
    nextVendorStatus(status, action);
    return true;
  } catch {
    return false;
  }
}

function paging(q: ListQuery) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function ruleToHttp(err: QuoteRuleError): HttpError {
  switch (err.code) {
    case "INVALID_INPUT":
    case "TOO_MANY_VENDORS":
    case "NO_VENDORS":
      return new BadRequestError(err.message);
    case "QUOTE_EXPIRED":
    case "NO_LIVE_RESPONSE":
      return new UnprocessableEntityError(err.message);
    default:
      return new ConflictError(err.message);
  }
}

function vendorPublic(v: Vendor | null | undefined) {
  if (!v) return null;
  return { id: v.id, name: v.name, slug: v.slug, logo_url: v.logo_url ?? null };
}

/** What a supplier sees of the buyer: a first name and an initial, nothing to contact off-platform. */
function buyerPublic(u: any) {
  if (!u) return null;
  const last = typeof u.last_name === "string" && u.last_name ? `${u.last_name[0]}.` : "";
  return { display_name: [u.first_name, last].filter(Boolean).join(" ") || "Buyer" };
}

function buyerAdmin(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
  };
}

function productPublic(p: any) {
  if (!p) return null;
  const images = Array.isArray(p.images) ? p.images : [];
  const primary = images.find((i: any) => i.is_primary) ?? images[0];
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    image_url: primary?.thumbnail_url ?? primary?.card_url ?? primary?.url ?? null,
  };
}

export function responseView(r: QuoteResponse, requestedQuantity: number) {
  const quantity = Math.max(requestedQuantity, r.moq);
  return {
    id: r.id,
    status: r.status,
    display_state: responseDisplayState(r),
    unit_price: r.unit_price,
    currency: r.currency,
    moq: r.moq,
    lead_time_days: r.lead_time_days,
    valid_until: r.valid_until,
    notes: r.notes,
    order_quantity: quantity,
    total: r.unit_price * quantity,
    product: productPublic((r as any).product),
    variant: (r as any).variant
      ? { id: (r as any).variant.id, name: (r as any).variant.name }
      : null,
    created_at: r.created_at,
  };
}

function messageView(m: QuoteMessage) {
  return {
    id: m.id,
    quote_request_vendor_id: m.quote_request_vendor_id,
    sender_role: m.sender_role,
    body: m.body,
    attachments: m.attachments ?? [],
    created_at: m.created_at,
  };
}

function historyView(h: QuoteStatusHistory) {
  return {
    id: h.id,
    quote_request_vendor_id: h.quote_request_vendor_id,
    subject: h.subject,
    from_status: h.from_status,
    to_status: h.to_status,
    actor_role: h.actor_role,
    note: h.note,
    created_at: h.created_at,
  };
}
