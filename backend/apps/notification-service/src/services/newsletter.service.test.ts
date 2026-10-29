import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NewsletterService } from "./newsletter.service.ts";

function buildMocks() {
  const rows: any[] = [];
  const repo = {
    findByEmail: mock((email: string) =>
      Promise.resolve(rows.find((r) => r.email === email && !r.deleted_at) ?? null),
    ),
    findByToken: mock((token: string) =>
      Promise.resolve(rows.find((r) => r.unsubscribe_token === token) ?? null),
    ),
    insert: mock((data: any) => {
      const row = {
        id: `id-${rows.length + 1}`,
        unsubscribe_token: `tok-${rows.length + 1}`,
        unsubscribed_at: null,
        deleted_at: null,
        ...data,
      };
      rows.push(row);
      return Promise.resolve(row);
    }),
    save: mock((entity: any) => Promise.resolve(entity)),
  };
  const email = {
    sendNewsletterWelcomeEmail: mock((_to: string, _p: any) => Promise.resolve()),
  };
  return { repo, email, rows };
}

describe("NewsletterService.subscribe", () => {
  let repo: any;
  let email: any;
  let service: NewsletterService;

  beforeEach(() => {
    ({ repo, email } = buildMocks());
    service = new NewsletterService(repo, email);
  });

  it("inserts a new subscriber and sends a welcome email", async () => {
    const result = await service.subscribe({ email: "A@Example.com " });
    expect(result.subscribed).toBe(true);
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert.mock.calls[0][0].email).toBe("a@example.com");
    expect(email.sendNewsletterWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("stamps user_id when authenticated", async () => {
    await service.subscribe({ email: "u@example.com", userId: "user-1" });
    expect(repo.insert.mock.calls[0][0].user_id).toBe("user-1");
  });

  it("is idempotent for an already-active subscriber (no duplicate, no resend)", async () => {
    await service.subscribe({ email: "dup@example.com" });
    email.sendNewsletterWelcomeEmail.mockClear();
    repo.insert.mockClear();
    repo.save.mockClear();

    const result = await service.subscribe({ email: "dup@example.com" });
    expect(result.subscribed).toBe(true);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    expect(email.sendNewsletterWelcomeEmail).not.toHaveBeenCalled();
  });

  it("reactivates a previously-unsubscribed row and resends welcome", async () => {
    await service.subscribe({ email: "back@example.com" });
    const row = (await repo.findByEmail("back@example.com"))!;
    row.unsubscribed_at = new Date();
    email.sendNewsletterWelcomeEmail.mockClear();

    const result = await service.subscribe({ email: "back@example.com" });
    expect(result.subscribed).toBe(true);
    expect(row.unsubscribed_at).toBeNull();
    expect(repo.save).toHaveBeenCalled();
    expect(email.sendNewsletterWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("does not fail the subscribe when the welcome email throws", async () => {
    email.sendNewsletterWelcomeEmail.mockImplementationOnce(() =>
      Promise.reject(new Error("SES down")),
    );
    const result = await service.subscribe({ email: "resilient@example.com" });
    expect(result.subscribed).toBe(true);
  });

  it("recovers from a concurrent-insert unique violation as idempotent success", async () => {
    // Simulate the race: the row does not exist on the first lookup, the insert
    // loses the race and rejects with a Postgres unique violation (23505), and a
    // re-fetch then finds the row the winning request created.
    let lookups = 0;
    repo.findByEmail.mockImplementation((e: string) => {
      lookups += 1;
      return Promise.resolve(
        lookups === 1
          ? null
          : ({
              email: e,
              unsubscribed_at: null,
              unsubscribe_token: "tok-race",
              user_id: null,
            } as any),
      );
    });
    repo.insert.mockImplementationOnce(() => Promise.reject({ code: "23505" }));

    const result = await service.subscribe({ email: "race@example.com" });
    expect(result.subscribed).toBe(true);
    // No welcome email on the lost race — the winning request already sent it.
    expect(email.sendNewsletterWelcomeEmail).not.toHaveBeenCalled();
  });

  it("rethrows non-unique-violation insert errors", async () => {
    repo.insert.mockImplementationOnce(() => Promise.reject(new Error("connection lost")));
    await expect(service.subscribe({ email: "boom@example.com" })).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("NewsletterService.getStatusByEmail", () => {
  it("true for active, false for unsubscribed/unknown", async () => {
    const { repo, email } = buildMocks();
    const service = new NewsletterService(repo, email);
    await service.subscribe({ email: "active@example.com" });

    expect((await service.getStatusByEmail("active@example.com")).subscribed).toBe(true);
    expect((await service.getStatusByEmail("nobody@example.com")).subscribed).toBe(false);

    const row = (await repo.findByEmail("active@example.com"))!;
    row.unsubscribed_at = new Date();
    expect((await service.getStatusByEmail("active@example.com")).subscribed).toBe(false);
  });
});

describe("NewsletterService.unsubscribe", () => {
  it("marks unsubscribed_at by token; idempotent on unknown token", async () => {
    const { repo, email } = buildMocks();
    const service = new NewsletterService(repo, email);
    await service.subscribe({ email: "leave@example.com" });
    const row = (await repo.findByEmail("leave@example.com"))!;

    const ok = await service.unsubscribe(row.unsubscribe_token);
    expect(ok).toBe(true);
    expect(row.unsubscribed_at).not.toBeNull();

    // Already unsubscribed — second call is a no-op (no extra save).
    repo.save.mockClear();
    const alreadyDone = await service.unsubscribe(row.unsubscribe_token);
    expect(alreadyDone).toBe(true);
    expect(repo.save).not.toHaveBeenCalled();

    const unknown = await service.unsubscribe("does-not-exist");
    expect(unknown).toBe(false);
  });
});
