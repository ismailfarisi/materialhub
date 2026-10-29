import { config } from "@materialhub/config";
import { AppDataSource, Product, SavedSearch } from "@materialhub/database";
import { Queue, Worker } from "bullmq";

const QUEUE_NAME = "saved-search-notify";

let savedSearchNotifyQueue: Queue | null = null;

export function getSavedSearchNotifyQueue(): Queue {
  if (!savedSearchNotifyQueue) {
    savedSearchNotifyQueue = new Queue(QUEUE_NAME, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    });
  }
  return savedSearchNotifyQueue;
}

export function createSavedSearchNotifyWorker(notificationQueue: Queue) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const searchRepo = AppDataSource.getRepository(SavedSearch);
      const productRepo = AppDataSource.getRepository(Product);

      const searches = await searchRepo.find({
        where: { notify_on_match: true },
        relations: ["user"],
      });

      for (const search of searches) {
        const since = search.last_notified_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

        const qb = productRepo
          .createQueryBuilder("p")
          .where("p.status = :status", { status: "published" })
          .andWhere("p.created_at > :since", { since })
          .andWhere("p.deleted_at IS NULL")
          .andWhere("p.name ILIKE :query", { query: `%${search.query}%` });

        if (search.filters?.category_id) {
          qb.andWhere("p.category_id = :catId", { catId: search.filters.category_id });
        }

        const matches = await qb.take(5).getMany();

        if (matches.length > 0) {
          await notificationQueue.add("notification-event", {
            type: "saved_search_match",
            userId: search.user_id,
            email: (search.user as any)?.email,
            searchName: search.name ?? search.query,
            matchCount: matches.length,
            products: matches.map((p) => ({ id: p.id, name: p.name, price: p.price })),
          });

          search.last_notified_at = new Date();
          await searchRepo.save(search);
        }
      }
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}

export async function scheduleSavedSearchNotify(queue: Queue) {
  await queue.upsertJobScheduler(
    "check-saved-search-matches",
    { pattern: "0 */6 * * *" },
    { name: "notify-saved-search-matches" },
  );
}
