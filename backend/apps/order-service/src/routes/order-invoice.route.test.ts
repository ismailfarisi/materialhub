import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

function appWith(resolveDownload: any, user = { id: "user-1", role: "customer" }) {
  return new Elysia()
    .decorate("invoiceService", { resolveDownload } as any)
    .decorate("user", user)
    .get("/buyer/orders/:id/invoice.pdf", async ({ params, user, invoiceService, set }: any) => {
      const result = await invoiceService.resolveDownload(params.id, user.id, user.role);
      if ("notFound" in result) {
        set.status = 404;
        return { statusCode: 404, message: "Receipt not found" };
      }
      if ("forbidden" in result) {
        set.status = 403;
        return { statusCode: 403, message: "Forbidden" };
      }
      set.status = 302;
      set.headers.location = result.url;
      return null;
    })
    .get("/admin/orders/:id/invoice.pdf", async ({ params, user, invoiceService, set }: any) => {
      const result = await invoiceService.resolveDownload(params.id, user.id, user.role);
      if ("notFound" in result) {
        set.status = 404;
        return { statusCode: 404, message: "Receipt not found" };
      }
      if ("forbidden" in result) {
        set.status = 403;
        return { statusCode: 403, message: "Forbidden" };
      }
      set.status = 302;
      set.headers.location = result.url;
      return null;
    });
}

describe("GET /buyer/orders/:id/invoice.pdf", () => {
  test("302-redirects to the presigned url", async () => {
    const app = appWith(mock(async () => ({ url: "https://signed/x.pdf" })));
    const res = await app.handle(new Request("http://localhost/buyer/orders/ord-1/invoice.pdf"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed/x.pdf");
  });

  test("404 when not found", async () => {
    const app = appWith(mock(async () => ({ notFound: true })));
    const res = await app.handle(new Request("http://localhost/buyer/orders/ord-9/invoice.pdf"));
    expect(res.status).toBe(404);
  });

  test("403 when forbidden", async () => {
    const app = appWith(mock(async () => ({ forbidden: true })));
    const res = await app.handle(new Request("http://localhost/buyer/orders/ord-1/invoice.pdf"));
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/orders/:id/invoice.pdf", () => {
  test("302-redirects to the presigned url for admin", async () => {
    const app = appWith(
      mock(async () => ({ url: "https://signed/x.pdf" })),
      {
        id: "admin-1",
        role: "admin",
      },
    );
    const res = await app.handle(new Request("http://localhost/admin/orders/ord-1/invoice.pdf"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed/x.pdf");
  });
});
