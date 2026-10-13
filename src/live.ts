import { useEffect, useRef } from "react";
import { sessionHeaders, type AppNotification, type OrderEvent, type WalletTxn } from "./api";
import { apiUrl } from "./lib";

export interface WalletEvent {
  source: "admin" | "customer";
  txn: WalletTxn;
  balance: number;
  held: number;
}

export interface OrderChangeEvent {
  id: string;
  status: string;
  events: OrderEvent[];
}

/** Payload of each server event. `ready` fires on every (re)connect: refetch, events may have been missed. */
export interface LiveEvents {
  ready: { user: number | null };
  wallet: WalletEvent;
  order: OrderChangeEvent;
  notification: AppNotification;
  "notifications-seen": Record<string, never>;
}

const PREFIX = "live:";

/** Subscribe to a server event re-broadcast on window. Returns the unsubscribe function. */
export function onLive<K extends keyof LiveEvents>(name: K, handler: (detail: LiveEvents[K]) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<LiveEvents[K]>).detail);
  window.addEventListener(PREFIX + name, listener);
  return () => window.removeEventListener(PREFIX + name, listener);
}

/** Run `handler` whenever any of `events` arrives (e.g. refetch a page's data). */
export function useLiveEvents(events: (keyof LiveEvents)[], handler: () => void) {
  const latest = useRef(handler);
  latest.current = handler;
  const key = events.join(",");
  useEffect(() => {
    const offs = key.split(",").map((name) => onLive(name as keyof LiveEvents, () => latest.current()));
    return () => offs.forEach((off) => off());
  }, [key]);
}

const emit = (name: string, detail: unknown) =>
  window.dispatchEvent(new CustomEvent(PREFIX + name, { detail }));

/** The server pings every 25s; silence beyond this means the socket is dead. */
const STALL_MS = 60_000;

/**
 * Keeps a server-sent-events connection to /api/events open and re-broadcasts
 * every event on window (see onLive). Call once per signed-in user; the
 * returned function closes the connection.
 */
export function connectLive(): () => void {
  let stopped = false;
  let ctrl: AbortController | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | null = null;
  let delay = 1000;

  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => ctrl?.abort(), STALL_MS);
  };

  const handleFrame = (frame: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (!data.length) return;
    if (event === "ready") delay = 1000;
    try {
      emit(event, JSON.parse(data.join("\n")));
    } catch {
      /* malformed frame */
    }
  };

  const run = async () => {
    while (!stopped) {
      ctrl = new AbortController();
      try {
        const res = await fetch(apiUrl("/api/events"), {
          headers: sessionHeaders(),
          credentials: "same-origin",
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        resetStall();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          resetStall();
          buffer += value.replace(/\r\n/g, "\n");
          let cut: number;
          while ((cut = buffer.indexOf("\n\n")) >= 0) {
            handleFrame(buffer.slice(0, cut));
            buffer = buffer.slice(cut + 2);
          }
        }
      } catch {
        /* network drop, abort or stall - reconnect below */
      }
      clearTimeout(stallTimer);
      if (stopped) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, delay);
      });
      wake = null;
      delay = Math.min(delay * 2, 30_000);
    }
  };

  // Mobile WebViews freeze sockets in the background; reconnect on return.
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    delay = 1000;
    ctrl?.abort();
    wake?.();
  };
  document.addEventListener("visibilitychange", onVisible);

  void run();
  return () => {
    stopped = true;
    clearTimeout(stallTimer);
    document.removeEventListener("visibilitychange", onVisible);
    ctrl?.abort();
    wake?.();
  };
}
