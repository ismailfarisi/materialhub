import { config } from "@materialhub/config";
import { type RedisClientType, createClient } from "redis";

export function ticketChannel(ticketId: string): string {
  return `support:ticket:${ticketId}`;
}

function makeClient(): RedisClientType {
  const client: RedisClientType = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
  });
  // Attach an error handler so a transient Redis error never surfaces as an
  // unhandled 'error' event and crashes the process (matches rate-limiter.ts).
  client.on("error", () => {});
  return client;
}

// One shared publisher connection (lazy — connects on first publish).
let publisher: RedisClientType | null = null;
async function getPublisher(): Promise<RedisClientType> {
  if (publisher?.isOpen) return publisher;
  publisher = makeClient();
  await publisher.connect();
  return publisher;
}

// Best-effort: a live SSE fan-out is not worth failing a message write over. The
// message is already persisted, so a dropped real-time event just means the
// client sees it on its next fetch/reconnect.
export async function publishTicketMessage(ticketId: string, payload: unknown): Promise<void> {
  try {
    const client = await getPublisher();
    await client.publish(ticketChannel(ticketId), JSON.stringify(payload));
  } catch {
    publisher = null;
  }
}

// Returns true the FIRST time an eventId is seen (process it), false on a duplicate
// (skip). Fail-OPEN: if Redis is unavailable we return true so a real event is
// never dropped — the cost is a possible duplicate during a Redis outage.
export async function markSlackEventSeen(eventId: string, ttlSeconds = 600): Promise<boolean> {
  try {
    const client = await getPublisher();
    const res = await client.set(`slack:evt:${eventId}`, "1", { NX: true, EX: ttlSeconds });
    return res === "OK"; // "OK" = newly set (first time); null = already existed (duplicate)
  } catch {
    return true; // fail-open
  }
}

// Redis requires a DEDICATED connection in subscribe mode — one per open stream.
// Returns a cleanup fn that unsubscribes and closes the connection.
export async function subscribeTicket(
  ticketId: string,
  onMessage: (payload: string) => void,
): Promise<() => Promise<void>> {
  const sub = makeClient();
  await sub.connect();
  const channel = ticketChannel(ticketId);
  try {
    await sub.subscribe(channel, (message) => onMessage(message));
  } catch (err) {
    await sub.quit().catch(() => {});
    throw err;
  }
  return async () => {
    try {
      await sub.unsubscribe(channel);
    } finally {
      await sub.quit().catch(() => {});
    }
  };
}
