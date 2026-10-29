import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type DispatchEvent,
  NotificationDispatcherService,
} from "./notification-dispatcher.service.ts";
import { NotificationPreferenceService } from "./notification-preference.service.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePreferences(
  overrides: Record<string, boolean> = {},
): Record<string, Record<string, boolean>> {
  const defaults: Record<string, boolean> = {
    in_app: true,
    email: false,
    push: false,
    sms: false,
    whatsapp: false,
  };
  const channelRow = { ...defaults, ...overrides };

  // Use the same event types that exist in templates
  const types = [
    "order_confirmed",
    "order_shipped",
    "order_delivered",
    "payment_received",
    "payout_sent",
    "new_review",
    "low_stock",
    "vendor_approved",
    "return_requested",
    "dispute_opened",
    "dispute_resolved",
    "vendor_new_order",
  ];

  const matrix: Record<string, Record<string, boolean>> = {};
  for (const t of types) {
    matrix[t] = { ...channelRow };
  }
  return matrix;
}

const USER_ID = "user-001";
const ORDER_EVENT: DispatchEvent = {
  type: "order_confirmed",
  userId: USER_ID,
  variables: { order_number: "ORD-123" },
  data: { orderId: "order-001" },
};
// order_confirmed's email is a rich, standalone message sent by OrderEmailService,
// so the generic dispatcher suppresses its email channel. Use a type that still
// goes through the generic email path to exercise that channel.
const EMAIL_EVENT: DispatchEvent = {
  type: "order_shipped",
  userId: USER_ID,
  variables: { order_number: "ORD-123", tracking_url: "https://track/abc" },
  data: { orderId: "order-001" },
};

function buildMocks() {
  const notificationService = {
    send: mock((_data: any) => Promise.resolve({ id: "notif-1" })),
  };
  const preferenceService = {
    getPreferences: mock((_userId?: any) => Promise.resolve(makePreferences())),
  };
  const emailDispatcher = {
    send: mock((_to: any, _subject?: any, _html?: any) => Promise.resolve()),
  };
  const pushDispatcher = {
    send: mock((_token: any, _title?: any, _body?: any, _data?: any) => Promise.resolve()),
    sendToTopic: mock((_topic: any, _title?: any, _body?: any) => Promise.resolve()),
  };
  const whatsAppDispatcher = {
    send: mock((_to: any, _type?: any, _variables?: any) => Promise.resolve(true)),
  };
  const userRepo = {
    findOneBy: mock(
      (_criteria?: any): Promise<any> =>
        Promise.resolve({
          id: USER_ID,
          email: "user@test.com",
          fcm_token: "fcm-token-abc",
          phone: "+971501234567",
          phone_verified_at: new Date("2026-01-01T00:00:00Z"),
        }),
    ),
  };
  const redisClient = {
    publish: mock((_channel: any, _message?: any) => Promise.resolve()),
  };

  const service = new NotificationDispatcherService(
    notificationService as any,
    preferenceService as any,
    emailDispatcher,
    pushDispatcher,
    whatsAppDispatcher,
    userRepo as any,
    redisClient as any,
  );

  return {
    service,
    notificationService,
    preferenceService,
    emailDispatcher,
    pushDispatcher,
    whatsAppDispatcher,
    userRepo,
    redisClient,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("NotificationDispatcherService", () => {
  let ctx: ReturnType<typeof buildMocks>;

  beforeEach(() => {
    ctx = buildMocks();
  });

  it("maps event to template correctly (uses getTemplate + renderTemplate)", async () => {
    await ctx.service.dispatch(ORDER_EVENT);

    // notificationService.send should have been called with rendered title/body
    expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
    const sendArg = ctx.notificationService.send.mock.calls[0]![0] as any;
    expect(sendArg.title).toBe("Order Confirmed");
    expect(sendArg.body).toBe("Your order ORD-123 has been confirmed");
    expect(sendArg.action_url).toBe("/orders/{orderId}");
  });

  it("returns silently if no template found for event type", async () => {
    await ctx.service.dispatch({
      type: "nonexistent_event",
      userId: USER_ID,
      variables: {},
    });

    expect(ctx.notificationService.send).not.toHaveBeenCalled();
    expect(ctx.preferenceService.getPreferences).not.toHaveBeenCalled();
  });

  it("dispatches to in-app channel (calls notificationService.send + redis publish)", async () => {
    await ctx.service.dispatch(ORDER_EVENT);

    expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
    const sendArg = ctx.notificationService.send.mock.calls[0]![0] as any;
    expect(sendArg.user_id).toBe(USER_ID);
    expect(sendArg.channel).toBe("in_app");
    expect(sendArg.type).toBe("order_confirmed");

    expect(ctx.redisClient.publish).toHaveBeenCalledTimes(1);
    const [channel, payload] = ctx.redisClient.publish.mock.calls[0]! as any;
    expect(channel).toBe(`notifications:${USER_ID}`);
    const parsed = JSON.parse(payload);
    expect(parsed.title).toBe("Order Confirmed");
  });

  it("dispatches to email when enabled (calls emailDispatcher.send with rendered HTML)", async () => {
    ctx.preferenceService.getPreferences.mockImplementation(() =>
      Promise.resolve(makePreferences({ email: true })),
    );

    await ctx.service.dispatch(EMAIL_EVENT);

    expect(ctx.emailDispatcher.send).toHaveBeenCalledTimes(1);
    const [to, subject, html] = ctx.emailDispatcher.send.mock.calls[0]! as any;
    expect(to).toBe("user@test.com");
    expect(subject).toBe("Order Shipped");
    expect(html).toContain("Your order has shipped");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("suppresses the generic email for order_confirmed (rich email sent separately)", async () => {
    // Even with email preference on, order_confirmed must not send a plain
    // email — OrderEmailService owns that message. In-app still fires.
    ctx.preferenceService.getPreferences.mockImplementation(() =>
      Promise.resolve(makePreferences({ email: true })),
    );

    await ctx.service.dispatch(ORDER_EVENT);

    expect(ctx.emailDispatcher.send).not.toHaveBeenCalled();
    expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
  });

  it("suppresses the generic email for vendor_new_order too", async () => {
    // OrderEmailService.sendForConfirmedOrder already mails every vendor
    // member the rich new-order alert unconditionally, so a plain email here
    // is a duplicate for anyone whose rows were seeded with email enabled.
    ctx.preferenceService.getPreferences.mockImplementation(() =>
      Promise.resolve(makePreferences({ email: true })),
    );

    await ctx.service.dispatch({
      type: "vendor_new_order",
      userId: USER_ID,
      variables: { order_number: "ORD-123", amount: "250.00" },
    });

    expect(ctx.emailDispatcher.send).not.toHaveBeenCalled();
    expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
  });

  it("skips email when disabled in preferences", async () => {
    // Default preferences have email disabled
    await ctx.service.dispatch(ORDER_EVENT);

    expect(ctx.emailDispatcher.send).not.toHaveBeenCalled();
  });

  it("dispatches to push when enabled and user has fcm_token", async () => {
    ctx.preferenceService.getPreferences.mockImplementation(() =>
      Promise.resolve(makePreferences({ push: true })),
    );

    await ctx.service.dispatch(ORDER_EVENT);

    expect(ctx.pushDispatcher.send).toHaveBeenCalledTimes(1);
    const [token, title, body, data] = ctx.pushDispatcher.send.mock.calls[0]! as any;
    expect(token).toBe("fcm-token-abc");
    expect(title).toBe("Order Confirmed");
    expect(body).toBe("Your order ORD-123 has been confirmed");
    expect(data).toEqual({ orderId: "order-001" });
  });

  // Uses the REAL NotificationPreferenceService over a mocked repo (not this
  // file's hand-built makePreferences matrix), because the bug lived exactly
  // in the gap between the two: getPreferences() used to pre-fill every
  // missing {type, channel} cell with a hard `false`, so the dispatcher's
  // `typePrefs?.in_app ?? true` default-enabled intent never fired for any
  // type added to the enum after a user's rows were seeded.
  describe("absent preference rows (real getPreferences shape)", () => {
    function buildMocksWithRealPreferences(preferenceRows: any[]) {
      const base = buildMocks();
      const preferenceRepo = {
        findByUserId: mock(async (_userId: string) => preferenceRows),
        findOne: mock(async () => null),
        save: mock(async (d: any) => d),
        saveBatch: mock(async (items: any[]) => items),
        upsertBatch: mock(async () => undefined),
      };
      const realPreferenceService = new NotificationPreferenceService(preferenceRepo as any);
      const service = new NotificationDispatcherService(
        base.notificationService as any,
        realPreferenceService as any,
        base.emailDispatcher,
        base.pushDispatcher,
        base.whatsAppDispatcher,
        base.userRepo as any,
        base.redisClient as any,
      );
      return { ...base, service };
    }

    // vendor_new_order post-dates every existing user's seeded rows, so it is
    // the type an absent row must default in-app ON for.
    const VENDOR_ORDER_EVENT: DispatchEvent = {
      type: "vendor_new_order",
      userId: "vendor-member-1",
      variables: { order_number: "VO-001", amount: "AED 250.00", vendorOrderId: "vo-1" },
      data: { orderId: "order-001", vendorOrderId: "vo-1" },
    };

    it("user with ZERO preference rows: vendor_new_order in-app notification IS created (absent row = default enabled), email/push stay off", async () => {
      const m = buildMocksWithRealPreferences([]);

      await m.service.dispatch(VENDOR_ORDER_EVENT);

      expect(m.notificationService.send).toHaveBeenCalledTimes(1);
      const sendArg = m.notificationService.send.mock.calls[0]![0] as any;
      expect(sendArg.channel).toBe("in_app");
      expect(sendArg.type).toBe("vendor_new_order");
      // Absent rows must NOT silently enable email/push (dispatcher intent:
      // those default false).
      expect(m.emailDispatcher.send).not.toHaveBeenCalled();
      expect(m.pushDispatcher.send).not.toHaveBeenCalled();
    });

    it("explicit in_app=false DB row: vendor_new_order in-app notification is suppressed (real opt-outs keep working)", async () => {
      const m = buildMocksWithRealPreferences([
        { notification_type: "vendor_new_order", channel: "in_app", enabled: false },
      ]);

      await m.service.dispatch(VENDOR_ORDER_EVENT);

      expect(m.notificationService.send).not.toHaveBeenCalled();
    });

    it("pre-existing type with ZERO rows keeps its historical in_app=false default (no silent behaviour change)", async () => {
      const m = buildMocksWithRealPreferences([]);

      await m.service.dispatch(EMAIL_EVENT);

      expect(m.notificationService.send).not.toHaveBeenCalled();
      expect(m.emailDispatcher.send).not.toHaveBeenCalled();
    });

    it("explicit email=true DB row (in_app row absent): email fires for a generic-email type", async () => {
      const m = buildMocksWithRealPreferences([
        { notification_type: "order_shipped", channel: "email", enabled: true },
      ]);

      await m.service.dispatch(EMAIL_EVENT);

      expect(m.emailDispatcher.send).toHaveBeenCalledTimes(1);
      expect(m.notificationService.send).not.toHaveBeenCalled();
    });
  });

  it("skips push when user has no fcm_token", async () => {
    ctx.preferenceService.getPreferences.mockImplementation(() =>
      Promise.resolve(makePreferences({ push: true })),
    );
    ctx.userRepo.findOneBy.mockImplementation(() =>
      Promise.resolve({
        id: USER_ID,
        email: "user@test.com",
        fcm_token: null as string | null,
      }),
    );

    await ctx.service.dispatch(ORDER_EVENT);

    expect(ctx.pushDispatcher.send).not.toHaveBeenCalled();
  });

  it("Redis publish failure is non-fatal (does not throw)", async () => {
    ctx.redisClient.publish.mockImplementation(() =>
      Promise.reject(new Error("Redis connection lost")),
    );

    // Should not throw
    await ctx.service.dispatch(ORDER_EVENT);

    expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
  });

  it("loads user only when email or push is enabled", async () => {
    // Default: email=false, push=false — should NOT load user
    await ctx.service.dispatch(ORDER_EVENT);
    expect(ctx.userRepo.findOneBy).not.toHaveBeenCalled();

    // Enable email — should load user (use a type whose email isn't suppressed)
    ctx.preferenceService.getPreferences.mockImplementation(() =>
      Promise.resolve(makePreferences({ email: true })),
    );
    await ctx.service.dispatch(EMAIL_EVENT);
    expect(ctx.userRepo.findOneBy).toHaveBeenCalledTimes(1);
  });

  // ─── WhatsApp channel ───────────────────────────────────────────────────────
  describe("whatsapp channel", () => {
    function enableWhatsApp() {
      ctx.preferenceService.getPreferences.mockImplementation(() =>
        Promise.resolve(makePreferences({ whatsapp: true })),
      );
    }

    it("sends via whatsapp dispatcher when pref enabled and phone is verified", async () => {
      enableWhatsApp();
      await ctx.service.dispatch(ORDER_EVENT);

      expect(ctx.whatsAppDispatcher.send).toHaveBeenCalledTimes(1);
      const [to, type, variables] = ctx.whatsAppDispatcher.send.mock.calls[0]! as any[];
      expect(to).toBe("+971501234567");
      expect(type).toBe("order_confirmed");
      expect(variables).toEqual(ORDER_EVENT.variables);
    });

    it("is off by default (pref false)", async () => {
      await ctx.service.dispatch(ORDER_EVENT);
      expect(ctx.whatsAppDispatcher.send).not.toHaveBeenCalled();
    });

    it("swallows a send failure so the job does not retry the whole dispatch", async () => {
      // WhatsApp is the LAST step: the in-app row, the Redis publish and the
      // email have already happened. The dispatch queue retries the handler
      // 3x from the top, so a thrown Meta error would write a second
      // notification row and send two more emails. Meta failures are routine
      // (unapproved template, non-WhatsApp number, rate limit).
      enableWhatsApp();
      ctx.whatsAppDispatcher.send.mockImplementation(() =>
        Promise.reject(new Error("WhatsApp send failed: 500")),
      );

      await expect(ctx.service.dispatch(ORDER_EVENT)).resolves.toBeUndefined();
      expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
    });

    it("skips when user has no phone", async () => {
      enableWhatsApp();
      ctx.userRepo.findOneBy.mockImplementation(() =>
        Promise.resolve({ id: USER_ID, email: "user@test.com", phone: null }),
      );
      await ctx.service.dispatch(ORDER_EVENT);
      expect(ctx.whatsAppDispatcher.send).not.toHaveBeenCalled();
    });

    it("skips when phone is unverified", async () => {
      enableWhatsApp();
      ctx.userRepo.findOneBy.mockImplementation(() =>
        Promise.resolve({
          id: USER_ID,
          email: "user@test.com",
          phone: "+971501234567",
          phone_verified_at: null,
        }),
      );
      await ctx.service.dispatch(ORDER_EVENT);
      expect(ctx.whatsAppDispatcher.send).not.toHaveBeenCalled();
    });

    it("skips silently when the stored phone can't be normalized to E.164", async () => {
      enableWhatsApp();
      ctx.userRepo.findOneBy.mockImplementation(() =>
        Promise.resolve({
          id: USER_ID,
          email: "user@test.com",
          phone: "not-a-phone",
          phone_verified_at: new Date(),
        }),
      );
      await ctx.service.dispatch(ORDER_EVENT);
      expect(ctx.whatsAppDispatcher.send).not.toHaveBeenCalled();
      // In-app still went out — a bad phone must not break the dispatch.
      expect(ctx.notificationService.send).toHaveBeenCalledTimes(1);
    });

    it("normalizes UAE local format (05x) to +971 before sending", async () => {
      enableWhatsApp();
      ctx.userRepo.findOneBy.mockImplementation(() =>
        Promise.resolve({
          id: USER_ID,
          email: "user@test.com",
          phone: "0501234567",
          phone_verified_at: new Date(),
        }),
      );
      await ctx.service.dispatch(ORDER_EVENT);
      expect(ctx.whatsAppDispatcher.send).toHaveBeenCalledTimes(1);
      expect((ctx.whatsAppDispatcher.send.mock.calls[0]! as any[])[0]).toBe("+971501234567");
    });

    it("loads user when only whatsapp is enabled", async () => {
      enableWhatsApp();
      await ctx.service.dispatch(ORDER_EVENT);
      expect(ctx.userRepo.findOneBy).toHaveBeenCalledTimes(1);
    });
  });
});
