import { describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { AppDataSource, CollabApplication } from "@materialhub/database";
import { Elysia } from "elysia";
import { collabCreatorRoutes } from "./collab-creator.routes.ts";

/**
 * Signs a real access token with the same plugin/secret jwtAuth verifies
 * against, via a throwaway app — @elysiajs/jwt only exposes `sign` through
 * a plugin-derived handler context, not as a standalone export.
 */
async function signTestToken(userId: string): Promise<string> {
  const signer = new Elysia()
    .use(jwt({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }))
    .get("/sign", ({ accessJwt }) =>
      accessJwt.sign({ sub: userId, email: "creator@test.com", role: "customer" }),
    );
  const res = await signer.handle(new Request("http://local/sign"));
  return res.text();
}

describe("collab creator routes wire user.id (not user.sub) to the service", () => {
  it("threads the JWT's sub claim through as creator_id when listing collabs", async () => {
    // Regression test for a bug where every handler in this file read
    // `user.sub` — a property that does not exist on AuthUser (it's
    // `user.id`) — so every creator-scoped call silently ran with an
    // undefined/null creator id. Applying to a collab crashed with a
    // NOT NULL constraint violation; listing always came back empty.
    const userId = "11111111-1111-1111-1111-111111111111";
    const token = await signTestToken(userId);

    let capturedWhere: unknown;
    const originalGetRepository = AppDataSource.getRepository;
    (AppDataSource as unknown as { getRepository: unknown }).getRepository = (entity: unknown) => {
      if (entity === CollabApplication) {
        return {
          // biome-ignore lint/suspicious/noExplicitAny: test mock matches TypeORM's find() signature loosely
          find: async ({ where }: any) => {
            capturedWhere = where;
            return [];
          },
        };
      }
      throw new Error(`unexpected repository request: ${String(entity)}`);
    };

    try {
      const res = await collabCreatorRoutes.handle(
        new Request("http://local/me/creator/collabs", {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(res.status).toBe(200);
      expect(capturedWhere).toEqual({ creator_id: userId });
    } finally {
      (AppDataSource as unknown as { getRepository: unknown }).getRepository =
        originalGetRepository;
    }
  });
});
