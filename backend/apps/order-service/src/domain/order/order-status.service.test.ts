import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CommissionStatus } from "@materialhub/database";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { In } from "typeorm";
import { OrderStatusService } from "./order-status.service.ts";

/**
 * cancelOrder locks the order row through a query builder and reads/closes
 * inventory reservations with raw SQL. Give a test's fake transaction manager
 * both: the locking `getOne` returns whatever that repo's `findOne` returns,
 * and `query` returns no reservations (an order created before reservation
 * rows were recorded, which takes the per-order-item release path).
 */
function withLocking(tx: any) {
  const wrap = (repo: any) => {
    if (!repo || repo.createQueryBuilder) return repo;
    const qb: any = {
      setLock: () => qb,
      where: () => qb,
      getOne: () => (repo.findOne ? repo.findOne() : Promise.resolve(null)),
    };
    return { ...repo, createQueryBuilder: () => qb };
  };
  const getRepository = tx.getRepository;
  return {
    ...tx,
    query:
      tx.query ??
      mock((sql: string) => Promise.resolve(sql.includes("count(*)") ? [{ count: 0 }] : [])),
    getRepository: getRepository ? (name: string) => wrap(getRepository(name)) : undefined,
  };
}

describe("OrderStatusService", () => {
  const mockOrderRepo = {
    findOne: mock(() => Promise.resolve(null)),
    save: mock((entity: any) => Promise.resolve(entity)),
    manager: {
      transaction: mock(async (cb: any) =>
        cb(
          withLocking({
            findOne: mock(() => Promise.resolve(null)),
            save: mock((entity: any) => Promise.resolve(entity)),
            create: mock((_Entity: any, data: any) => data),
            getRepository: mock(() => ({
              findOne: mock(() => Promise.resolve(null)),
              save: mock((e: any) => Promise.resolve(e)),
              find: mock(() => Promise.resolve([])),
              create: mock((data: any) => data),
            })),
          }),
        ),
      ),
    },
  };
  const mockVendorOrderRepo = {
    findOne: mock(() => Promise.resolve(null)),
    find: mock(() => Promise.resolve([])),
    save: mock((entity: any) => Promise.resolve(entity)),
  };
  const mockHistoryRepo = {
    create: mock((data: any) => data),
    save: mock((entity: any) => Promise.resolve(entity)),
  };
  const mockQueue = {
    add: mock(() => Promise.resolve()),
  };
  const mockCommissionService = {
    getSettlementWindowDays: mock(() => Promise.resolve(7)),
  };

  let service: OrderStatusService;

  beforeEach(() => {
    Object.values(mockOrderRepo).forEach(
      (m) => typeof m === "function" && "mockClear" in m && m.mockClear(),
    );
    Object.values(mockVendorOrderRepo).forEach(
      (m) => typeof m === "function" && "mockClear" in m && m.mockClear(),
    );
    Object.values(mockHistoryRepo).forEach(
      (m) => typeof m === "function" && "mockClear" in m && m.mockClear(),
    );
    mockQueue.add.mockClear();
    mockCommissionService.getSettlementWindowDays.mockClear();
    service = new OrderStatusService(
      mockOrderRepo as any,
      mockVendorOrderRepo as any,
      mockHistoryRepo as any,
      mockQueue as any,
      undefined,
      undefined,
      undefined,
      mockCommissionService as any,
    );
  });

  describe("cancelOrder", () => {
    it("throws if order not found", async () => {
      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock(() => ({
            findOne: mock(() => Promise.resolve(null)),
          })),
        };
        return cb(withLocking(txManager));
      });
      await expect(
        service.cancelOrder("order-1", { userId: "u1", role: "buyer" as const }, "changed mind"),
      ).rejects.toThrow("Order not found");
    });

    it("throws if order status is not cancellable by buyer", async () => {
      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock(() => ({
            findOne: mock(() =>
              Promise.resolve({
                id: "order-1",
                user_id: "u1",
                status: OrderStatus.processing,
                vendorOrders: [],
              }),
            ),
            find: mock(() => Promise.resolve([])),
            save: mock((e: any) => Promise.resolve(e)),
            create: mock((data: any) => data),
          })),
        };
        return cb(withLocking(txManager));
      });
      await expect(
        service.cancelOrder("order-1", { userId: "u1", role: "buyer" as const }, "changed mind"),
      ).rejects.toThrow("Invalid transition");
    });

    it("lets an admin cancel an order whose vendor sub-orders are past confirmed", async () => {
      // Admin has a "cancel from anywhere" bypass on the master order. The
      // vendor sub-orders must inherit it — otherwise cancelling a processing/
      // shipped order throws "Invalid transition ... by system".
      const savedVendorOrders: any[] = [];
      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "Order") {
              return {
                findOne: mock(() =>
                  Promise.resolve({
                    id: "order-1",
                    status: OrderStatus.processing,
                    vendorOrders: [{ id: "vo-1", status: OrderStatus.processing }],
                  }),
                ),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "VendorOrder") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => {
                  savedVendorOrders.push({ ...e });
                  return Promise.resolve(e);
                }),
              };
            }
            if (name === "OrderStatusHistory") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
                create: mock((data: any) => data),
              };
            }
            if (name === "Commission") {
              return { update: mock(() => Promise.resolve({ affected: 0 })) };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await expect(
        service.cancelOrder("order-1", { userId: "admin-1", role: "admin" as const }, "Support"),
      ).resolves.toBeDefined();

      expect(savedVendorOrders).toHaveLength(1);
      expect(savedVendorOrders[0].status).toBe(OrderStatus.cancelled);
    });

    it("voids the order's held AND pending commissions when cancelled, clearing settle_after", async () => {
      // Commissions are created 'held' (settle_after stamped on delivery)
      // and later promoted to 'pending' by the settlement job once that
      // matures. Cancelling must void BOTH statuses — voiding only
      // 'pending' (the old, pre-settlement-rework behaviour) misses the
      // common case where the order is cancelled before the settlement
      // window elapses, leaving a 'held' commission with a live clock that
      // the settlement job later promotes and a payout later pays out.
      // settle_after is cleared too so nothing can mature after the void.
      const commissionUpdate = mock(() => Promise.resolve({ affected: 1 }));
      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "Order") {
              return {
                findOne: mock(() =>
                  Promise.resolve({
                    id: "order-1",
                    user_id: "u1",
                    status: OrderStatus.confirmed,
                    vendorOrders: [{ id: "vo-1", status: OrderStatus.confirmed }],
                  }),
                ),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "VendorOrder") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "OrderStatusHistory") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
                create: mock((data: any) => data),
              };
            }
            if (name === "Commission") {
              return { update: commissionUpdate };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await service.cancelOrder(
        "order-1",
        { userId: "u1", role: "buyer" as const },
        "changed mind",
      );

      expect(commissionUpdate).toHaveBeenCalledWith(
        { order_id: "order-1", status: In([CommissionStatus.held, CommissionStatus.pending]) },
        { status: CommissionStatus.cancelled, settle_after: null },
      );
    });

    it("voids a delivered order's held commission on admin cancel-with-refund — the case that silently stopped working", async () => {
      // End-to-end regression for C4: a vendor order delivered day 0 leaves
      // its commission 'held' with a live settle_after clock. An admin
      // cancels the (delivered) order on day 2, permitted via the admin
      // bypass. Before the fix, the void query only matched
      // status='pending' and never touched this 'held' row — the clock kept
      // running, the settlement job promoted it days later, and a payout
      // paid a vendor for goods the customer was refunded for.
      const settleAfter = new Date("2026-07-29T00:00:00.000Z");
      const commissionRows = [
        {
          id: "comm-1",
          order_id: "order-1",
          vendor_order_id: "vo-1",
          status: CommissionStatus.held,
          settle_after: settleAfter,
        },
      ];
      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "Order") {
              return {
                findOne: mock(() =>
                  Promise.resolve({
                    id: "order-1",
                    status: OrderStatus.delivered,
                    vendorOrders: [{ id: "vo-1", status: OrderStatus.delivered }],
                  }),
                ),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "VendorOrder") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "OrderStatusHistory") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
                create: mock((data: any) => data),
              };
            }
            if (name === "Commission") {
              return {
                update: mock((where: any, patch: any) => {
                  // Simulate the DB-side WHERE match against our fixture rows
                  // and apply the patch in place, so the test can assert on
                  // the resulting row state (status + settle_after) rather
                  // than just the call shape. Read the In() operator's
                  // matched values via either the real FindOperator's
                  // `.value` getter or `._value` directly — some sibling
                  // test files in this same directory-wide run (e.g.
                  // payout.service.test.ts) mock.module("typeorm") with a
                  // bare {_type, _value} stand-in for In() for the duration
                  // of their own file, which can still be active here
                  // depending on bun's cross-file execution order.
                  const inValues: string[] = where.status.value ?? where.status._value ?? [];
                  const matches = commissionRows.filter(
                    (r) => r.order_id === where.order_id && inValues.includes(r.status),
                  );
                  for (const row of matches) Object.assign(row, patch);
                  return Promise.resolve({ affected: matches.length });
                }),
              };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await service.cancelOrder(
        "order-1",
        { userId: "admin-1", role: "admin" as const },
        "Refunded — item never shipped",
      );

      expect(commissionRows[0]!.status).toBe(CommissionStatus.cancelled);
      expect(commissionRows[0]!.settle_after).toBeNull();
    });

    /* ================================================================ */
    /*  CRITICAL 1 — a stale draft claim on a cancelled commission        */
    /* ================================================================ */
    describe("CRITICAL 1 — releases a draft claim on the commission being voided", () => {
      it("invalidates a pending draft that claimed a commission this cancel just voided", async () => {
        // A commission a nightly draft already claimed (payout_id stamped,
        // still 'pending') matures into 'cancelled' by this same cancel.
        // Left with `payout_id` still set, approving that draft would still
        // transfer money for it. cancelOrder must route the claim through
        // the same invalidateDraftForReversal PayoutService already
        // exposes to CommissionReversalService.
        const invalidateDraftForReversal = mock(() =>
          Promise.resolve({ invalidated: true, payoutStatus: "pending" }),
        );
        const writeAudit = mock(() => Promise.resolve());
        const draftInvalidator = { invalidateDraftForReversal, writeAudit };

        const wiredService = new OrderStatusService(
          mockOrderRepo as any,
          mockVendorOrderRepo as any,
          mockHistoryRepo as any,
          mockQueue as any,
          undefined,
          undefined,
          undefined,
          mockCommissionService as any,
          draftInvalidator as any,
        );

        mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
          const txManager = {
            getRepository: mock((name: string) => {
              if (name === "Order") {
                return {
                  findOne: mock(() =>
                    Promise.resolve({
                      id: "order-1",
                      status: OrderStatus.confirmed,
                      vendorOrders: [{ id: "vo-1", status: OrderStatus.confirmed }],
                    }),
                  ),
                  save: mock((e: any) => Promise.resolve(e)),
                };
              }
              if (name === "VendorOrder") {
                return {
                  findOne: mock(() => Promise.resolve(null)),
                  save: mock((e: any) => Promise.resolve(e)),
                };
              }
              if (name === "OrderStatusHistory") {
                return {
                  findOne: mock(() => Promise.resolve(null)),
                  save: mock((e: any) => Promise.resolve(e)),
                  create: mock((data: any) => data),
                };
              }
              if (name === "Commission") {
                return {
                  update: mock(() => Promise.resolve({ affected: 1 })),
                  // Reflects the just-voided commission: 'cancelled' but
                  // still carrying the draft's `payout_id`.
                  find: mock(() =>
                    Promise.resolve([{ id: "comm-1", order_id: "order-1", payout_id: "draft-9" }]),
                  ),
                };
              }
              throw new Error(`Unexpected repo ${name}`);
            }),
          };
          return cb(withLocking(txManager));
        });

        await wiredService.cancelOrder(
          "order-1",
          { userId: "admin-1", role: "admin" as const },
          "Refunded — item never shipped",
        );

        expect(invalidateDraftForReversal).toHaveBeenCalledWith(
          expect.anything(),
          "draft-9",
          expect.stringContaining("order-1"),
        );
      });

      it("R3-C2: writes a compensating clawback + audit row (not just a log) when the claiming payout has already transferred", async () => {
        // The branch used to be a bare console.error justified by "the
        // payout's own reconciliation backstop may now legitimately fail".
        // It could not: that backstop summed vendor_earning with NO status
        // filter, and cancelling a commission changes only `status` — the sum
        // was byte-identical, so it always passed and the 61_550 went out for
        // a refunded sale with no ledger trace at all. The claim now routes
        // through the SAME shared sink CommissionReversalService uses.
        const invalidateDraftForReversal = mock(() =>
          Promise.resolve({ invalidated: false, payoutStatus: "processing" }),
        );
        const writeAudit = mock(() => Promise.resolve());
        const recordUnreleasableClaim = mock(() =>
          Promise.resolve({ clawedBack: true, amount: 61_550, moneyLeftThePlatform: true }),
        );
        const draftInvalidator = {
          invalidateDraftForReversal,
          writeAudit,
          recordUnreleasableClaim,
        };

        const wiredService = new OrderStatusService(
          mockOrderRepo as any,
          mockVendorOrderRepo as any,
          mockHistoryRepo as any,
          mockQueue as any,
          undefined,
          undefined,
          undefined,
          mockCommissionService as any,
          draftInvalidator as any,
        );

        mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
          const txManager = {
            getRepository: mock((name: string) => {
              if (name === "Order") {
                return {
                  findOne: mock(() =>
                    Promise.resolve({
                      id: "order-1",
                      status: OrderStatus.confirmed,
                      vendorOrders: [{ id: "vo-1", status: OrderStatus.confirmed }],
                    }),
                  ),
                  save: mock((e: any) => Promise.resolve(e)),
                };
              }
              if (name === "VendorOrder") {
                return {
                  findOne: mock(() => Promise.resolve(null)),
                  save: mock((e: any) => Promise.resolve(e)),
                };
              }
              if (name === "OrderStatusHistory") {
                return {
                  findOne: mock(() => Promise.resolve(null)),
                  save: mock((e: any) => Promise.resolve(e)),
                  create: mock((data: any) => data),
                };
              }
              if (name === "Commission") {
                return {
                  update: mock(() => Promise.resolve({ affected: 1 })),
                  find: mock(() =>
                    Promise.resolve([
                      {
                        id: "comm-1",
                        order_id: "order-1",
                        vendor_id: "v1",
                        payout_id: "draft-9",
                        vendor_earning: 61_550,
                      },
                    ]),
                  ),
                };
              }
              throw new Error(`Unexpected repo ${name}`);
            }),
          };
          return cb(withLocking(txManager));
        });

        await expect(
          wiredService.cancelOrder(
            "order-1",
            { userId: "admin-1", role: "admin" as const },
            "Refunded — item never shipped",
          ),
        ).resolves.toBeDefined();

        expect(invalidateDraftForReversal).toHaveBeenCalled();
        // The whole order is cancelled and refunded, so the correct earning
        // for this line is 0 — claw back everything the payout included for
        // it, through the shared sink (which decides money-sent vs not and
        // skips a zero-fils row).
        expect(recordUnreleasableClaim).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            commissionId: "comm-1",
            vendorId: "v1",
            payoutId: "draft-9",
            payoutStatus: "processing",
            clawbackAmount: 61_550,
            sourceType: "order_cancellation",
            sourceId: "order-1",
          }),
        );
      });

      it("does nothing when no draftInvalidator is wired (backward compatible)", async () => {
        // The default `service` fixture never passes a draftInvalidator.
        // Its Commission repo mock has no `find` at all — proving the new
        // logic is fully skipped, not merely a no-op query.
        const commissionUpdate = mock(() => Promise.resolve({ affected: 1 }));
        mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
          const txManager = {
            getRepository: mock((name: string) => {
              if (name === "Order") {
                return {
                  findOne: mock(() =>
                    Promise.resolve({
                      id: "order-1",
                      status: OrderStatus.confirmed,
                      vendorOrders: [{ id: "vo-1", status: OrderStatus.confirmed }],
                    }),
                  ),
                  save: mock((e: any) => Promise.resolve(e)),
                };
              }
              if (name === "VendorOrder") {
                return {
                  findOne: mock(() => Promise.resolve(null)),
                  save: mock((e: any) => Promise.resolve(e)),
                };
              }
              if (name === "OrderStatusHistory") {
                return {
                  findOne: mock(() => Promise.resolve(null)),
                  save: mock((e: any) => Promise.resolve(e)),
                  create: mock((data: any) => data),
                };
              }
              if (name === "Commission") {
                // No `find` on purpose — if the service called it despite
                // having no draftInvalidator wired, this throws.
                return { update: commissionUpdate };
              }
              throw new Error(`Unexpected repo ${name}`);
            }),
          };
          return cb(withLocking(txManager));
        });

        await expect(
          service.cancelOrder(
            "order-1",
            { userId: "admin-1", role: "admin" as const },
            "changed mind",
          ),
        ).resolves.toBeDefined();
      });
    });
  });

  describe("transitionVendorOrder parent aggregation", () => {
    // When transitionVendorOrder aggregates the MASTER order status (e.g. all
    // vendor orders delivered -> master delivered) the parent-level side
    // effects (COD capture, integration events) must fire. The shipment
    // delivery path runs through transitionVendorOrder, not transitionOrder.

    // A transaction manager that serves a different repository mock per
    // entity name (VendorOrder / Order / OrderStatusHistory). Lets us drive
    // the aggregation branch deterministically.
    function buildTxManager(opts: {
      vendorOrder: any;
      allVendorOrders: any[];
      parentOrder: any;
      codPayment?: any;
    }) {
      const voRepo = {
        findOne: mock(() => Promise.resolve(opts.vendorOrder)),
        find: mock(() => Promise.resolve(opts.allVendorOrders)),
        save: mock((e: any) => Promise.resolve(e)),
        create: mock((data: any) => data),
      };
      const orderRepo = {
        findOne: mock(() => Promise.resolve(opts.parentOrder)),
        save: mock((e: any) => Promise.resolve(e)),
        create: mock((data: any) => data),
      };
      const historyRepo = {
        findOne: mock(() => Promise.resolve(null)),
        save: mock((e: any) => Promise.resolve(e)),
        create: mock((data: any) => data),
      };
      // Payment repo — serves the COD capture-on-delivery lookup. Defaults to
      // no COD payment (non-COD orders), so the capture path no-ops.
      const paymentRepo = {
        findOne: mock(() => Promise.resolve(opts.codPayment ?? null)),
        save: mock((e: any) => Promise.resolve(e)),
      };
      // Commission repo — serves the delivery settlement-clock stamp. These
      // aggregation-focused tests don't assert on it; default to a no-op.
      const commissionRepo = {
        update: mock(() => Promise.resolve({ affected: 0 })),
      };

      return {
        getRepository: mock((name: string) => {
          if (name === "VendorOrder") return voRepo;
          if (name === "Order") return orderRepo;
          if (name === "OrderStatusHistory") return historyRepo;
          if (name === "Payment") return paymentRepo;
          if (name === "Commission") return commissionRepo;
          throw new Error(`Unexpected repo ${name}`);
        }),
      };
    }

    it("captures the COD payment when delivery aggregates the master order to delivered", async () => {
      const vendorOrder = {
        id: "vo-1",
        order_id: "o-cod",
        vendor_id: "vendor-1",
        status: OrderStatus.out_for_delivery,
      };
      const allVendorOrders = [{ id: "vo-1", order_id: "o-cod", status: OrderStatus.delivered }];
      const parentOrder = {
        id: "o-cod",
        status: OrderStatus.out_for_delivery,
        user_id: "u1",
        payment_status: "pending",
      };
      const codPayment = { id: "pay-1", order_id: "o-cod", gateway: "cod", status: "pending" };
      const savedPayments: any[] = [];
      const savedOrders: any[] = [];

      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "VendorOrder") {
              return {
                findOne: mock(() => Promise.resolve(vendorOrder)),
                find: mock(() => Promise.resolve(allVendorOrders)),
                save: mock((e: any) => Promise.resolve(e)),
                create: mock((d: any) => d),
              };
            }
            if (name === "Order") {
              return {
                findOne: mock(() => Promise.resolve(parentOrder)),
                save: mock((e: any) => {
                  savedOrders.push({ ...e });
                  return Promise.resolve(e);
                }),
                create: mock((d: any) => d),
              };
            }
            if (name === "OrderStatusHistory") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
                create: mock((d: any) => d),
              };
            }
            if (name === "Payment") {
              return {
                findOne: mock(() => Promise.resolve(codPayment)),
                save: mock((e: any) => {
                  savedPayments.push({ ...e });
                  return Promise.resolve(e);
                }),
              };
            }
            if (name === "Commission") {
              return { update: mock(() => Promise.resolve({ affected: 0 })) };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await service.transitionVendorOrder(
        "vo-1",
        OrderStatus.delivered,
        { userId: "system", role: "system" as const },
        "Shipment delivered",
      );
      await Promise.resolve();

      // COD payment flips to captured (cash collected at the door).
      expect(savedPayments).toHaveLength(1);
      expect(savedPayments[0].status).toBe("captured");
      expect(savedPayments[0].captured_at).toBeInstanceOf(Date);
      // The order's payment_status is captured too.
      expect(savedOrders.some((o) => o.payment_status === "captured")).toBe(true);
    });

    it("enqueues a vendor_order.status_changed integration event when flag is on", async () => {
      // Verifies the producer wiring (Task 29): on a successful vendor-order
      // transition, the gated emit helper is called and the integration job
      // is enqueued onto the integration-events queue when the
      // vendor_integrations_outbound_enabled site setting is "true".
      const integrationQueue = { add: mock(() => Promise.resolve()) };
      const siteSettingRepoOn = {
        findOne: mock(() => Promise.resolve({ value: "true" })),
      };

      const flaggedService = new OrderStatusService(
        mockOrderRepo as any,
        mockVendorOrderRepo as any,
        mockHistoryRepo as any,
        mockQueue as any,
        integrationQueue as any,
        siteSettingRepoOn as any,
      );

      const vendorOrder = {
        id: "vo-emit",
        order_id: "o-emit",
        vendor_id: "vendor-emit",
        status: OrderStatus.confirmed,
      };
      const allVendorOrders = [
        { id: "vo-emit", order_id: "o-emit", status: OrderStatus.processing },
      ];
      const parentOrder = { id: "o-emit", status: OrderStatus.confirmed, user_id: "u-buyer" };

      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) =>
        cb(buildTxManager({ vendorOrder, allVendorOrders, parentOrder })),
      );

      await flaggedService.transitionVendorOrder(
        "vo-emit",
        OrderStatus.processing,
        { userId: "vendor-emit", role: "vendor" as const },
        "Accepting order",
      );

      expect(integrationQueue.add).toHaveBeenCalledWith(
        "emit",
        expect.objectContaining({
          event_type: "vendor_order.status_changed",
          vendor_id: "vendor-emit",
          schema_version: 1,
        }),
      );
    });

    it("does NOT enqueue an integration event when flag is off", async () => {
      const integrationQueue = { add: mock(() => Promise.resolve()) };
      const siteSettingRepoOff = {
        // findOne returns null = flag row missing/off → emitIfEnabled skips.
        findOne: mock(() => Promise.resolve(null)),
      };

      const flaggedService = new OrderStatusService(
        mockOrderRepo as any,
        mockVendorOrderRepo as any,
        mockHistoryRepo as any,
        mockQueue as any,
        integrationQueue as any,
        siteSettingRepoOff as any,
      );

      const vendorOrder = {
        id: "vo-off",
        order_id: "o-off",
        vendor_id: "vendor-off",
        status: OrderStatus.confirmed,
      };
      const allVendorOrders = [{ id: "vo-off", order_id: "o-off", status: OrderStatus.processing }];
      const parentOrder = { id: "o-off", status: OrderStatus.confirmed, user_id: "u-buyer" };

      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) =>
        cb(buildTxManager({ vendorOrder, allVendorOrders, parentOrder })),
      );

      await flaggedService.transitionVendorOrder(
        "vo-off",
        OrderStatus.processing,
        { userId: "vendor-off", role: "vendor" as const },
        "Accepting order",
      );

      expect(integrationQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("delivery settlement clock", () => {
    // Isolated fixture: a single-vendor-order tx manager whose Order lookup
    // returns null, so the parent-aggregation / publish side effects (already
    // covered above) never engage — these tests exercise only the
    // delivered_at / settle_after stamping added inside the transaction.
    function makeService(opts: {
      fromStatus: OrderStatus;
      windowDays: number;
      deliveredAt?: Date;
      /** R5-I3: claimed commissions the un-delivery path should route to the invalidator. */
      claimedCommissions?: any[];
      draftInvalidator?: any;
    }) {
      const vendorOrder: any = {
        id: "vo-clock-1",
        order_id: "order-clock-1",
        vendor_id: "vendor-clock-1",
        status: opts.fromStatus,
        delivered_at: opts.deliveredAt ?? null,
      };
      const commissionUpdates: [any, any][] = [];

      const voRepoTx = {
        findOne: mock(() => Promise.resolve(vendorOrder)),
        find: mock(() => Promise.resolve([vendorOrder])),
        save: mock((e: any) => Promise.resolve(e)),
        create: mock((data: any) => data),
      };
      const orderRepoTx = {
        findOne: mock(() => Promise.resolve(null)),
        save: mock((e: any) => Promise.resolve(e)),
        create: mock((data: any) => data),
      };
      const historyRepoTx = {
        findOne: mock(() => Promise.resolve(null)),
        save: mock((e: any) => Promise.resolve(e)),
        create: mock((data: any) => data),
      };
      const commissionRepoTx = {
        update: mock((where: any, set: any) => {
          commissionUpdates.push([where, set]);
          return Promise.resolve({ affected: 1 });
        }),
        find: mock(() => Promise.resolve(opts.claimedCommissions ?? [])),
      };

      const localOrderRepo = {
        manager: {
          transaction: mock(async (cb: any) =>
            cb({
              getRepository: mock((name: string) => {
                if (name === "VendorOrder") return voRepoTx;
                if (name === "Order") return orderRepoTx;
                if (name === "OrderStatusHistory") return historyRepoTx;
                if (name === "Commission") return commissionRepoTx;
                throw new Error(`Unexpected repo ${name}`);
              }),
            }),
          ),
        },
      };
      const localQueue = { add: mock(() => Promise.resolve()) };
      const commissionServiceMock = {
        getSettlementWindowDays: mock(() => Promise.resolve(opts.windowDays)),
      };

      const localService = new OrderStatusService(
        localOrderRepo as any,
        {} as any,
        {} as any,
        localQueue as any,
        undefined,
        undefined,
        undefined,
        commissionServiceMock as any,
        opts.draftInvalidator,
      );

      return { service: localService, vendorOrder, commissionUpdates, commissionServiceMock };
    }

    it("stamps delivered_at and settle_after when a vendor order is delivered", async () => {
      const {
        service: clockService,
        vendorOrder,
        commissionUpdates,
      } = makeService({
        fromStatus: OrderStatus.shipped,
        windowDays: 7,
      });

      await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.delivered, {
        userId: "system",
        role: "system" as const,
      });

      expect(vendorOrder.delivered_at).toBeInstanceOf(Date);
      expect(commissionUpdates).toHaveLength(1);
      const [where, set] = commissionUpdates[0]!;
      expect(where).toMatchObject({ vendor_order_id: vendorOrder.id, status: "held" });
      const expected = vendorOrder.delivered_at.getTime() + 7 * 86_400_000;
      expect(Math.abs(set.settle_after.getTime() - expected)).toBeLessThan(2000);
    });

    it("R4-I2: un-delivering demotes an ALREADY-PROMOTED pending commission back to held, not just clearing the clock on held rows", async () => {
      // "returned" isn't a modelled OrderStatus; refunded is the real
      // admin-bypass target reachable from delivered and exercises the same
      // "leaving delivered" branch.
      //
      // This assertion CHANGED in round 4. It used to require exactly
      // `status: 'held'` in the WHERE, which is what made this transition a
      // complete no-op for the money whenever the settlement job had already
      // promoted the row to `pending`: `settle_after` is not consulted for a
      // `pending` row, so the earning stayed fully payable for goods the
      // customer had returned. The update now targets held AND pending rows
      // that no draft has claimed, and writes `status: held` as well as a
      // null clock.
      const {
        service: clockService,
        vendorOrder,
        commissionUpdates,
      } = makeService({
        fromStatus: OrderStatus.delivered,
        windowDays: 7,
      });

      await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.refunded, {
        userId: "admin-1",
        role: "admin" as const,
      });

      expect(commissionUpdates).toHaveLength(1);
      const [where, set] = commissionUpdates[0]!;
      expect(where.vendor_order_id).toBe(vendorOrder.id);
      expect(where.status._type).toBe("in");
      expect(where.status._value).toEqual(["held", "pending"]);
      // Claimed rows are left to the invalidation paths — demoting one
      // behind its draft's back is exactly the drift reconciliation exists
      // to catch.
      expect(where.payout_id._type).toBe("isNull");
      expect(set.status).toBe("held");
      expect(set.settle_after).toBeNull();
    });

    it("does not re-stamp delivered_at on a second delivered transition", async () => {
      const first = new Date("2026-07-01T00:00:00Z");
      const { service: clockService, vendorOrder } = makeService({
        fromStatus: OrderStatus.delivered,
        windowDays: 7,
        deliveredAt: first,
      });

      await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.delivered, {
        userId: "system",
        role: "system" as const,
      });

      expect(vendorOrder.delivered_at).toEqual(first);
    });

    // R5-I2. `ADMIN_BYPASS_TARGETS` lets an admin move a delivered
    // vendor_order straight to `partially_refunded`. Demoting there forfeited
    // the vendor's entire earning on the items the customer KEPT, with no way
    // back: nothing re-stamps `settle_after` for a vendor_order that is no
    // longer `delivered`, and the settlement job skips a null clock.
    describe("R5-I2 partial reversal must not strand the whole vendor order", () => {
      it("does NOT demote commissions when a delivered order is marked partially_refunded", async () => {
        const {
          service: clockService,
          vendorOrder,
          commissionUpdates,
        } = makeService({
          fromStatus: OrderStatus.delivered,
          windowDays: 7,
          deliveredAt: new Date("2026-07-01T00:00:00Z"),
        });

        await clockService.transitionVendorOrder(
          vendorOrder.id,
          OrderStatus.partially_refunded,
          { userId: "admin-1", role: "admin" as const },
          "kept two of three items",
        );

        // Proportional reversal is CommissionReversalService's job; zeroing
        // the clock here is what made the surviving earning unpayable forever.
        expect(commissionUpdates).toHaveLength(0);
      });

      it("still demotes on a full reversal", async () => {
        const {
          service: clockService,
          vendorOrder,
          commissionUpdates,
        } = makeService({
          fromStatus: OrderStatus.delivered,
          windowDays: 7,
          deliveredAt: new Date("2026-07-01T00:00:00Z"),
        });

        await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.refunded, {
          userId: "admin-1",
          role: "admin" as const,
        });

        expect(commissionUpdates).toHaveLength(1);
        const [, set] = commissionUpdates[0]!;
        expect(set.status).toBe("held");
        expect(set.settle_after).toBeNull();
      });
    });

    // R5-I3. The demotion deliberately skips commissions a draft already
    // claimed — but nothing else handled them on this path either. cancelOrder
    // routes its claimed rows through the invalidator and
    // CommissionReversalService covers Return/Dispute; a bare admin
    // delivered -> refunded went through neither, so the claimed earning
    // stayed inside an approvable draft. assertClaimedSetReconciles cannot
    // catch it: status and vendor_earning are both unchanged, so the sum still
    // matches and the transfer goes out for a refunded sale.
    describe("R5-I3 claimed commissions on un-delivery", () => {
      const makeInvalidator = (invalidated: boolean, payoutStatus = "pending") => ({
        invalidateDraftForReversal: mock(() => Promise.resolve({ invalidated, payoutStatus })),
        recordUnreleasableClaim: mock(() => Promise.resolve(undefined)),
      });

      it("invalidates the claiming draft when a delivered order is refunded", async () => {
        const draftInvalidator = makeInvalidator(true);
        const { service: clockService, vendorOrder } = makeService({
          fromStatus: OrderStatus.delivered,
          windowDays: 7,
          deliveredAt: new Date("2026-07-01T00:00:00Z"),
          draftInvalidator,
          claimedCommissions: [
            { id: "c1", vendor_id: "vendor-clock-1", payout_id: "p1", vendor_earning: 12_000 },
          ],
        });

        await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.refunded, {
          userId: "admin-1",
          role: "admin" as const,
        });

        expect(draftInvalidator.invalidateDraftForReversal).toHaveBeenCalledTimes(1);
        // Released cleanly — no clawback needed, the draft rebuilds correctly.
        expect(draftInvalidator.recordUnreleasableClaim).not.toHaveBeenCalled();
      });

      it("records a clawback when the claiming payout's money already left", async () => {
        const draftInvalidator = makeInvalidator(false, "paid");
        const { service: clockService, vendorOrder } = makeService({
          fromStatus: OrderStatus.delivered,
          windowDays: 7,
          deliveredAt: new Date("2026-07-01T00:00:00Z"),
          draftInvalidator,
          claimedCommissions: [
            { id: "c1", vendor_id: "vendor-clock-1", payout_id: "p1", vendor_earning: 12_000 },
          ],
        });

        await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.refunded, {
          userId: "admin-1",
          role: "admin" as const,
        });

        expect(draftInvalidator.recordUnreleasableClaim).toHaveBeenCalledTimes(1);
        const [, arg] = (draftInvalidator.recordUnreleasableClaim as any).mock.calls[0];
        expect(arg.clawbackAmount).toBe(12_000);
        expect(arg.payoutStatus).toBe("paid");
      });

      it("clamps a negative legacy vendor_earning to 0 rather than clawing back money never paid", async () => {
        const draftInvalidator = makeInvalidator(false, "paid");
        const { service: clockService, vendorOrder } = makeService({
          fromStatus: OrderStatus.delivered,
          windowDays: 7,
          deliveredAt: new Date("2026-07-01T00:00:00Z"),
          draftInvalidator,
          claimedCommissions: [
            { id: "c1", vendor_id: "vendor-clock-1", payout_id: "p1", vendor_earning: -500 },
          ],
        });

        await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.refunded, {
          userId: "admin-1",
          role: "admin" as const,
        });

        const [, arg] = (draftInvalidator.recordUnreleasableClaim as any).mock.calls[0];
        expect(arg.clawbackAmount).toBe(0);
      });

      it("does not touch claims on a partial reversal — the surviving earning is still owed", async () => {
        const draftInvalidator = makeInvalidator(true);
        const { service: clockService, vendorOrder } = makeService({
          fromStatus: OrderStatus.delivered,
          windowDays: 7,
          deliveredAt: new Date("2026-07-01T00:00:00Z"),
          draftInvalidator,
          claimedCommissions: [
            { id: "c1", vendor_id: "vendor-clock-1", payout_id: "p1", vendor_earning: 12_000 },
          ],
        });

        await clockService.transitionVendorOrder(vendorOrder.id, OrderStatus.partially_refunded, {
          userId: "admin-1",
          role: "admin" as const,
        });

        expect(draftInvalidator.invalidateDraftForReversal).not.toHaveBeenCalled();
        expect(draftInvalidator.recordUnreleasableClaim).not.toHaveBeenCalled();
      });
    });
  });

  // `order_status_history.changed_by` is a uuid FK to users, but system actors
  // (the pending-order reaper, carrier webhooks, payment webhooks) identify
  // themselves as the literal string "system". Writing that through made
  // Postgres reject the INSERT with `invalid input syntax for type uuid:
  // "system"`, rolling back the enclosing transaction and freezing abandoned
  // orders in pending_payment forever.
  describe("status history changed_by for non-uuid actors", () => {
    it("stores NULL changed_by when the system actor cancels an order", async () => {
      const historyRows: any[] = [];
      const vendorOrder = { id: "vo-1", status: OrderStatus.confirmed };

      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "Order") {
              return {
                findOne: mock(() =>
                  Promise.resolve({
                    id: "order-1",
                    status: OrderStatus.pending_payment,
                    vendorOrders: [vendorOrder],
                  }),
                ),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "VendorOrder") {
              return { findOne: mock(() => Promise.resolve(null)), save: mock((e: any) => e) };
            }
            if (name === "OrderStatusHistory") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                create: mock((data: any) => data),
                save: mock((e: any) => {
                  historyRows.push(e);
                  return Promise.resolve(e);
                }),
              };
            }
            if (name === "OrderItem") return { find: mock(() => Promise.resolve([])) };
            if (name === "Commission") {
              return { update: mock(() => Promise.resolve({ affected: 0 })) };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await service.cancelOrder(
        "order-1",
        { userId: "system", role: "system" as const },
        "Payment not completed within 60 minutes",
      );

      expect(historyRows.length).toBeGreaterThan(0);
      for (const row of historyRows) {
        expect(row.changed_by).toBeNull();
      }
    });

    it("stores NULL changed_by when the system actor transitions a vendor order", async () => {
      const historyRows: any[] = [];
      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "VendorOrder") {
              return {
                findOne: mock(() =>
                  Promise.resolve({
                    id: "vo-1",
                    order_id: "order-1",
                    vendor_id: "v1",
                    status: OrderStatus.ready_to_ship,
                  }),
                ),
                find: mock(() => Promise.resolve([])),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "Order") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "OrderStatusHistory") {
              return {
                create: mock((data: any) => data),
                save: mock((e: any) => {
                  historyRows.push(e);
                  return Promise.resolve(e);
                }),
              };
            }
            // Merge with fix/payout-correctness: transitionVendorOrder now
            // resolves the Commission repo unconditionally (the settlement
            // clock lives above the delivered check), so this ready_to_ship ->
            // shipped transition touches it even though it demotes nothing.
            if (name === "Commission") {
              return {
                update: mock(() => Promise.resolve({ affected: 0 })),
                find: mock(() => Promise.resolve([])),
              };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await service.transitionVendorOrder("vo-1", OrderStatus.shipped, {
        userId: "system",
        role: "system" as const,
      });

      expect(historyRows.length).toBeGreaterThan(0);
      for (const row of historyRows) {
        expect(row.changed_by).toBeNull();
      }
    });

    it("preserves a real uuid actor id", async () => {
      const userId = "11111111-2222-4333-8444-555555555555";
      const historyRows: any[] = [];

      mockOrderRepo.manager.transaction.mockImplementationOnce(async (cb: any) => {
        const txManager = {
          getRepository: mock((name: string) => {
            if (name === "Order") {
              return {
                findOne: mock(() =>
                  Promise.resolve({
                    id: "order-1",
                    user_id: "11111111-2222-4333-8444-555555555555",
                    status: OrderStatus.pending_payment,
                    vendorOrders: [],
                  }),
                ),
                save: mock((e: any) => Promise.resolve(e)),
              };
            }
            if (name === "VendorOrder") {
              return { findOne: mock(() => Promise.resolve(null)), save: mock((e: any) => e) };
            }
            if (name === "OrderStatusHistory") {
              return {
                findOne: mock(() => Promise.resolve(null)),
                create: mock((data: any) => data),
                save: mock((e: any) => {
                  historyRows.push(e);
                  return Promise.resolve(e);
                }),
              };
            }
            if (name === "OrderItem") return { find: mock(() => Promise.resolve([])) };
            if (name === "Commission") {
              return { update: mock(() => Promise.resolve({ affected: 0 })) };
            }
            throw new Error(`Unexpected repo ${name}`);
          }),
        };
        return cb(withLocking(txManager));
      });

      await service.cancelOrder("order-1", { userId, role: "buyer" as const }, "changed mind");

      expect(historyRows.length).toBeGreaterThan(0);
      for (const row of historyRows) {
        expect(row.changed_by).toBe(userId);
      }
    });
  });
});
