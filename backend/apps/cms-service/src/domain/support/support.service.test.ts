import { describe, expect, it, mock } from "bun:test";

mock.module("../../lib/ticket-events.ts", () => ({
  ticketChannel: (id: string) => id,
  publishTicketMessage: async () => {},
  subscribeTicket: async () => async () => {},
}));

import { SupportService } from "./support.service.ts";

// Build a service whose repo getters return the provided mocks.
function makeService(ticketRepo: any, messageRepo: any) {
  const svc = new SupportService();
  Object.defineProperty(svc, "ticketRepo", { get: () => ticketRepo });
  Object.defineProperty(svc, "messageRepo", { get: () => messageRepo });
  return svc;
}

describe("SupportService identity", () => {
  it("createTicket for a logged-in user stamps user_id and null guest fields", async () => {
    const saved = { id: "t1" };
    const ticketRepo = {
      create: (x: any) => x,
      save: mock(async (x: any) => ({ ...x, id: "t1" })),
    };
    const messageRepo = { create: (x: any) => x, save: mock(async (x: any) => x) };
    const svc = makeService(ticketRepo, messageRepo);

    await svc.createTicket({ subject: "Help", category: null, message: "hi" } as any, {
      userId: "u1",
      guestSession: null,
    });

    const ticketArg = ticketRepo.save.mock.calls[0]![0];
    expect(ticketArg.user_id).toBe("u1");
    expect(ticketArg.guest_session).toBeNull();
    const msgArg = messageRepo.save.mock.calls[0]![0];
    expect(msgArg.sender_id).toBe("u1");
    expect(msgArg.sender_role).toBe("customer");
  });

  it("createTicket for a guest stamps guest fields and null sender_id", async () => {
    const ticketRepo = {
      create: (x: any) => x,
      save: mock(async (x: any) => ({ ...x, id: "t2" })),
    };
    const messageRepo = { create: (x: any) => x, save: mock(async (x: any) => x) };
    const svc = makeService(ticketRepo, messageRepo);

    await svc.createTicket(
      {
        subject: "Help",
        category: null,
        message: "hi",
        guest_email: "g@x.com",
        guest_name: "Guest",
      } as any,
      { userId: null, guestSession: "gs-123" },
    );

    const ticketArg = ticketRepo.save.mock.calls[0]![0];
    expect(ticketArg.user_id).toBeNull();
    expect(ticketArg.guest_session).toBe("gs-123");
    expect(ticketArg.guest_email).toBe("g@x.com");
    const msgArg = messageRepo.save.mock.calls[0]![0];
    expect(msgArg.sender_id).toBeNull();
  });

  it("getUserTicket scopes by user_id for a user and by guest_session for a guest", async () => {
    const findOne = mock(async (_opts: any) => ({ id: "t1", status: "open" }));
    const ticketRepo = { findOne };
    const messageRepo = { find: mock(async () => []) };
    const svc = makeService(ticketRepo, messageRepo);

    await svc.getUserTicket("t1", { userId: "u1", guestSession: null });
    expect(findOne.mock.calls[0]![0].where).toEqual({ id: "t1", user_id: "u1" });

    await svc.getUserTicket("t1", { userId: null, guestSession: "gs-9" });
    expect(findOne.mock.calls[1]![0].where).toEqual({ id: "t1", guest_session: "gs-9" });
  });
});

function serviceWithSlack(ticketRepo: any, messageRepo: any, slack: any) {
  const svc = new SupportService(slack);
  Object.defineProperty(svc, "ticketRepo", { get: () => ticketRepo });
  Object.defineProperty(svc, "messageRepo", { get: () => messageRepo });
  return svc;
}

describe("SupportService Slack echo", () => {
  const ticket = {
    id: "t1",
    ticket_number: "TKT-1",
    subject: "hi",
    status: "open",
    slack_thread_ts: null,
    slack_channel_id: null,
  };

  it("createTicket posts the opening message to Slack and persists thread coords", async () => {
    const postToThread = mock(async () => ({ channel: "C42", ts: "1700000000.000200" }));
    const ticketRepo = {
      create: (x: any) => x,
      save: mock(async (x: any) => ({ ...x, id: "t9" })),
    };
    const messageRepo = { create: (x: any) => x, save: async (x: any) => ({ ...x, id: "m9" }) };
    const svc = serviceWithSlack(ticketRepo, messageRepo, { postToThread });

    await svc.createTicket({ subject: "Help", category: null, message: "first" } as any, {
      userId: "u1",
      guestSession: null,
    });

    expect(postToThread).toHaveBeenCalled();
    // Second save() is the relay persisting the Slack thread coordinates.
    const relaySave = ticketRepo.save.mock.calls[1]![0];
    expect(relaySave.slack_thread_ts).toBe("1700000000.000200");
    expect(relaySave.slack_channel_id).toBe("C42");
  });

  it("addCustomerMessage posts to Slack (origin=app)", async () => {
    const postToThread = mock(async () => null);
    const ticketRepo = { findOne: async () => ticket, save: async (x: any) => x };
    const messageRepo = { create: (x: any) => x, save: async (x: any) => ({ ...x, id: "m1" }) };
    const svc = serviceWithSlack(ticketRepo, messageRepo, { postToThread });
    await svc.addCustomerMessage("t1", { userId: "u1", guestSession: null }, {
      message: "hello",
    } as any);
    expect(postToThread).toHaveBeenCalled();
  });

  it("addCustomerMessage persists Slack thread coords on the first post", async () => {
    const postToThread = mock(async () => ({ channel: "C42", ts: "1700000000.000100" }));
    const ticketRepo = {
      findOne: async () => ({ ...ticket }),
      save: mock(async (x: any) => x),
    };
    const messageRepo = { create: (x: any) => x, save: async (x: any) => ({ ...x, id: "m3" }) };
    const svc = serviceWithSlack(ticketRepo, messageRepo, { postToThread });
    await svc.addCustomerMessage("t1", { userId: "u1", guestSession: null }, {
      message: "hello",
    } as any);

    expect(postToThread).toHaveBeenCalled();
    const savedTicket = ticketRepo.save.mock.calls[0]![0];
    expect(savedTicket.slack_thread_ts).toBe("1700000000.000100");
    expect(savedTicket.slack_channel_id).toBe("C42");
  });

  it("addSlackAgentMessage does NOT post back to Slack and marks origin=slack", async () => {
    const postToThread = mock(async () => null);
    const saved: any[] = [];
    const ticketRepo = { findOne: async () => ({ ...ticket }), save: async (x: any) => x };
    const messageRepo = {
      create: (x: any) => x,
      save: async (x: any) => {
        saved.push(x);
        return { ...x, id: "m2" };
      },
    };
    const svc = serviceWithSlack(ticketRepo, messageRepo, { postToThread });
    await svc.addSlackAgentMessage("1234.5678", "agent reply", "U9");
    expect(postToThread).not.toHaveBeenCalled();
    expect(saved[0].origin).toBe("slack");
    expect(saved[0].sender_role).toBe("agent");
  });
});
