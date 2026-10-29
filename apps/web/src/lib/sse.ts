export interface MessageStreamOptions {
  url: string;
  headers?: Record<string, string>;
  onMessage: (data: unknown) => void;
  signal: AbortSignal;
}

// Opens an SSE stream over fetch (so auth/guest headers can be attached) and
// invokes onMessage for each `data:` frame. Reconnect is handled by the caller.
export async function openMessageStream({ url, headers, onMessage, signal }: MessageStreamOptions): Promise<void> {
  const res = await fetch(url, {
    headers: { Accept: "text/event-stream", ...headers },
    credentials: "include",
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue; // heartbeat/comment
      const raw = dataLine.slice(5).trim();
      try {
        onMessage(JSON.parse(raw));
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
