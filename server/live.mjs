/**
 * Live updates over server-sent events: GET /api/events.
 *
 * One stream per open app/browser tab. Signed-in streams are keyed by user id
 * so wallet, order and personal notifications reach only their owner; guests
 * (key 0) still receive store-wide notices and offers.
 *
 * Single server process, so the registry lives in memory.
 */
import express from "express";

const streams = new Map();
const HEARTBEAT_MS = 25_000;

const frame = (event, payload) => `event: ${event}\ndata: ${JSON.stringify(payload ?? {})}\n\n`;

/** Send `event` to every open stream of one signed-in user. */
export function publish(userId, event, payload) {
  const set = streams.get(Number(userId));
  if (!set) return;
  const data = frame(event, payload);
  for (const res of set) res.write(data);
}

/** Send `event` to every open stream, signed in or not. */
export function publishAll(event, payload) {
  const data = frame(event, payload);
  for (const set of streams.values()) for (const res of set) res.write(data);
}

export function liveConnectionCount() {
  let n = 0;
  for (const set of streams.values()) n += set.size;
  return n;
}

export function createLiveRouter() {
  const router = express.Router();

  // Read with fetch() rather than EventSource so the packaged app can
  // authenticate with its X-Session-Token header.
  router.get("/api/events", (req, res) => {
    const key = req.user?.id ?? 0;
    req.socket.setTimeout(0);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: 5000\n${frame("ready", { user: req.user?.id ?? null })}`);

    if (!streams.has(key)) streams.set(key, new Set());
    streams.get(key).add(res);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      const set = streams.get(key);
      set?.delete(res);
      if (set && !set.size) streams.delete(key);
    });
  });

  return router;
}
