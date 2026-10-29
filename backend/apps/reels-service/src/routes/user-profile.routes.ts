import { AppDataSource, User } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const userProfileRoutes = new Elysia({ prefix: "/users" })
  .use(container)
  .use(jwtAuth)
  .get(
    "/:userId",
    async ({ params, user }: any) => {
      // The User entity has no `username` column — resolve by UUID only.
      // Future: add username / handle lookup when creator handles land.
      if (!UUID_RE.test(params.userId)) {
        return {
          statusCode: 404,
          error: "user_not_found",
          timestamp: new Date().toISOString(),
        };
      }
      const repo = AppDataSource.getRepository(User);
      const profile = await repo.findOne({
        where: { id: params.userId },
        select: [
          "id",
          "first_name",
          "last_name",
          "avatar_url",
          "follower_count",
          "following_count",
          "published_reel_count",
        ],
      });
      if (!profile) {
        return {
          statusCode: 404,
          error: "user_not_found",
          timestamp: new Date().toISOString(),
        };
      }
      const isSelf = user?.id === profile.id;
      const displayName =
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "User";
      return {
        statusCode: 200,
        data: {
          id: profile.id,
          displayName,
          avatarUrl: profile.avatar_url,
          followerCount: profile.follower_count,
          followingCount: profile.following_count,
          publishedReelCount: profile.published_reel_count,
          isSelf,
        },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ userId: t.String() }) },
  );
