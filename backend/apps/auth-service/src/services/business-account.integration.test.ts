// Business account lifecycle against a real Postgres (skips when none is
// reachable): create → invite → accept → roles → verify → net terms.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  BusinessAccount,
  BusinessCreditAccount,
  BusinessMember,
  User,
  ensureDatabase,
} from "@materialhub/database";
import { BusinessAccountService } from "./business-account.service.ts";

let available = false;
const tag = `ba${Date.now().toString(36)}`;
const users: Record<string, string> = {};
let svc: BusinessAccountService;

async function makeUser(key: string) {
  const [row] = await AppDataSource.query(
    `INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, 'Test', $2, 'x') RETURNING id`,
    [key, `${tag}-${key}@workshop.example`],
  );
  users[key] = row.id;
}

const company = {
  legal_name: "Al Qusais Bookbinding Supplies LLC",
  trade_licence_number: "DED-904411",
  trade_licence_issuer: "Dubai DET",
  trade_licence_expiry: "2027-12-31",
  vat_registered: true,
  trn: "100 4455 6677 0003",
  billing_address: {
    line1: "Al Qusais Industrial 4",
    city: "Dubai",
    emirate: "Dubai",
    country_code: "AE",
  },
};

function code(p: Promise<unknown>) {
  return p.then(
    () => undefined,
    (e: { code?: string }) => e.code,
  );
}

beforeAll(async () => {
  try {
    await ensureDatabase();
    available = AppDataSource.isInitialized;
  } catch {
    available = false;
  }
  if (!available) return;
  for (const k of ["owner", "approver", "outsider"]) await makeUser(k);
  svc = new BusinessAccountService(
    AppDataSource.getRepository(BusinessAccount),
    AppDataSource.getRepository(BusinessMember),
    AppDataSource.getRepository(BusinessCreditAccount),
    AppDataSource.getRepository(User),
  );
});

afterAll(async () => {
  if (!available) return;
  const ids = Object.values(users);
  await AppDataSource.query(
    `DELETE FROM business_credit_accounts WHERE business_account_id IN (SELECT id FROM business_accounts WHERE created_by = ANY($1::uuid[]))`,
    [ids],
  );
  await AppDataSource.query(
    `DELETE FROM business_members WHERE business_account_id IN (SELECT id FROM business_accounts WHERE created_by = ANY($1::uuid[]))`,
    [ids],
  );
  await AppDataSource.query("DELETE FROM business_accounts WHERE created_by = ANY($1::uuid[])", [
    ids,
  ]);
  await AppDataSource.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids]);
});

describe("business account lifecycle (real Postgres; skips if unavailable)", () => {
  it("runs from setup to approved net terms", async () => {
    if (!available) return;
    const created = await svc.create(users.owner!, company);
    expect(created.account?.trn).toBe("100445566770003");
    expect(created.account?.peppol_participant_id).toBe("0235:1004455667");
    expect(created.account?.verification_status).toBe("pending");
    expect(String(created.membership?.role)).toBe("admin");
    expect(await code(svc.create(users.owner!, company))).toBe("ALREADY_IN_BUSINESS");

    // Invite → the invitee sees it → accepts.
    await svc.invite(users.owner!, { email: `${tag}-approver@workshop.example`, role: "approver" });
    const mine = await svc.getMine(users.approver!);
    expect(mine.invites.length).toBe(1);
    expect(await code(svc.acceptInvite(users.outsider!, mine.invites[0]!.id))).toBe("NOT_FOUND");
    const accepted = await svc.acceptInvite(users.approver!, mine.invites[0]!.id);
    expect(String(accepted.membership?.role)).toBe("approver");

    // Approvers can't manage members; the last admin can't be demoted.
    expect(await code(svc.invite(users.approver!, { email: "x@y.example", role: "buyer" }))).toBe(
      "BUSINESS_ROLE_REQUIRED",
    );
    const members = await svc.listMembers(users.owner!);
    const ownerRow = members.find((m) => m.user_id === users.owner)!;
    expect(await code(svc.changeRole(users.owner!, ownerRow.id, "buyer"))).toBe("LAST_ADMIN");

    // Net terms need verification first.
    expect(
      await code(
        svc.applyNetTerms(users.owner!, { terms: "net_30", requested_limit_fils: 2_500_000 }),
      ),
    ).toBe("NOT_VERIFIED");

    const accountId = created.account!.id;
    await svc.adminVerify(users.outsider!, accountId, { decision: "verified" });
    const applied = await svc.applyNetTerms(users.owner!, {
      terms: "net_60",
      requested_limit_fils: 2_500_000,
    });
    expect(applied.credit).toMatchObject({
      status: "applied",
      terms: "net_60",
      requested_limit_fils: 2_500_000,
    });

    const list = await svc.adminList({ net_terms: "applied", q: "Qusais" });
    expect(list.items.some((r) => r.id === accountId)).toBe(true);

    const approved = await svc.adminDecideNetTerms(users.outsider!, accountId, {
      decision: "approved",
      terms: "net_30",
      credit_limit_fils: 2_000_000,
    });
    expect(approved.credit).toMatchObject({
      status: "approved",
      terms: "net_30",
      available_fils: 2_000_000,
    });

    // Editing the TRN sends the company back to review.
    const edited = await svc.update(users.owner!, { trn: "100445566770011" });
    expect(edited.account?.verification_status).toBe("pending");
  });
});
