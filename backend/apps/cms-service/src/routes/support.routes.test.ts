import { describe, expect, it, mock } from "bun:test";
import { HttpError } from "@materialhub/plugins";
import { Elysia } from "elysia";

// Stub Redis so no connection is opened during the test.
const subscribeSpy = mock(async () => async () => {});
mock.module("../lib/ticket-events.ts", () => ({
  ticketChannel: (id: string) => `support:ticket:${id}`,
  publishTicketMessage: async () => {},
  subscribeTicket: subscribeSpy,
}));

// Stub the container so mounting supportRoutes never touches the real
// SupportService / AppDataSource (no live DB in this test).
const mockController = {
  getUserTicket: mock(async () => ({
    id: "11111111-1111-1111-1111-111111111111",
    status: "open",
    messages: [],
  })),
};

mock.module("../container.ts", () => ({
  container: new Elysia({ name: "cms-service-container" }).decorate(
    "supportController",
    mockController as any,
  ),
}));

const { supportRoutes } = await import("./support.routes.ts");

describe("GET /support/tickets/:id/stream", () => {
  it("responds with text/event-stream", async () => {
    const app = new Elysia().use(supportRoutes);
    const res = await app.handle(
      new Request("http://localhost/support/tickets/11111111-1111-1111-1111-111111111111/stream", {
        headers: { "x-guest-session": "gs-test" },
      }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("does not subscribe when the caller does not own the ticket", async () => {
    mockController.getUserTicket.mockImplementationOnce(async () => {
      throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");
    });
    subscribeSpy.mockClear();

    const app = new Elysia().use(supportRoutes);
    const res = await app.handle(
      new Request("http://localhost/support/tickets/11111111-1111-1111-1111-111111111111/stream", {
        headers: { "x-guest-session": "gs-test" },
      }),
    );

    expect(
      res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/event-stream"),
    ).toBe(false);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it("releases resources when the client aborts the stream", async () => {
    const cleanupSpy = mock(async () => {});
    subscribeSpy.mockImplementationOnce(async () => cleanupSpy);

    const app = new Elysia().use(supportRoutes);
    const controller = new AbortController();
    const req = new Request(
      "http://localhost/support/tickets/11111111-1111-1111-1111-111111111111/stream",
      {
        headers: { "x-guest-session": "gs-test" },
        signal: controller.signal,
      },
    );

    const res = await app.handle(req);
    // Pump the stream's start() to completion (subscribeTicket resolves) before aborting.
    const reader = res.body!.getReader();
    await reader.read();

    controller.abort();
    await new Promise((r) => setTimeout(r, 20));

    expect(cleanupSpy).toHaveBeenCalled();
  });

  it("releases resources when the client aborts while subscribeTicket is still pending", async () => {
    const cleanupSpy = mock(async () => {});
    subscribeSpy.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return cleanupSpy;
    });

    const app = new Elysia().use(supportRoutes);
    const controller = new AbortController();
    const req = new Request(
      "http://localhost/support/tickets/11111111-1111-1111-1111-111111111111/stream",
      {
        headers: { "x-guest-session": "gs-test" },
        signal: controller.signal,
      },
    );

    const res = await app.handle(req);
    // Abort while subscribeTicket() is still in flight (well before its 40ms resolution).
    setTimeout(() => controller.abort(), 5);

    // Pump the stream's start() so it actually runs.
    const reader = res.body!.getReader();
    await reader.read();

    // Wait past subscribeTicket's delayed resolution.
    await new Promise((r) => setTimeout(r, 100));

    expect(subscribeSpy).toHaveBeenCalled();
    expect(cleanupSpy).toHaveBeenCalled();
  });
});
