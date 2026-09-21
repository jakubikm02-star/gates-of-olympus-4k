import type { DuelMode } from "./duel";

export type DuelWire =
  | { t: "hello"; name: string }
  | { t: "go"; mode: DuelMode; bet: number; hostName: string; guestName: string }
  | { t: "tick"; have: number; score: number };

type Conn = {
  open: boolean;
  send: (data: unknown) => void;
  close: () => void;
  on: (ev: string, fn: (data?: unknown) => void) => void;
};

type PeerInst = {
  destroy: () => void;
  connect: (id: string) => Conn;
  on: (ev: string, fn: (arg?: unknown) => void) => void;
};

type PeerCtor = new (id?: string, opts?: { debug?: number }) => PeerInst;

export type DuelPipe = {
  send: (msg: DuelWire) => void;
  close: () => void;
};

function loadPeer(): Promise<PeerCtor> {
  const w = window as Window & { Peer?: PeerCtor };
  if (w.Peer) return Promise.resolve(w.Peer);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-peerjs]");
    const onReady = () => {
      if (w.Peer) resolve(w.Peer);
      else reject(new Error("PeerJS sa nenačítal"));
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("PeerJS zlyhal")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    s.async = true;
    s.dataset.peerjs = "1";
    s.onload = onReady;
    s.onerror = () => reject(new Error("PeerJS zlyhal"));
    document.head.appendChild(s);
  });
}

export function peerRoom(code: string): string {
  return `pkz${code.replace(/[^A-Z0-9]/g, "").slice(0, 4)}`;
}

export async function openDuelPeer(opts: {
  room: string;
  role: "host" | "guest";
  name: string;
  onPeer: (name: string) => void;
  onMsg: (msg: DuelWire) => void;
  onLive: (live: boolean) => void;
  onErr: (msg: string) => void;
}): Promise<DuelPipe> {
  const Peer = await loadPeer();
  const id = opts.role === "host" ? peerRoom(opts.room) : undefined;
  const peer = new Peer(id, { debug: 0 });
  let conn: Conn | null = null;
  let closed = false;
  let retry: number | null = null;

  const attach = (c: Conn) => {
    conn = c;
    c.on("open", () => {
      opts.onLive(true);
      c.send({ t: "hello", name: opts.name } satisfies DuelWire);
    });
    c.on("data", (raw) => {
      const msg = raw as DuelWire;
      if (!msg || typeof msg !== "object" || !("t" in msg)) return;
      if (msg.t === "hello" && msg.name) opts.onPeer(msg.name);
      opts.onMsg(msg);
    });
    c.on("close", () => {
      if (closed) return;
      opts.onLive(false);
    });
    c.on("error", () => opts.onErr("Spojenie spadlo."));
  };

  const connectGuest = () => {
    if (closed || conn?.open) return;
    try {
      attach(peer.connect(peerRoom(opts.room)));
    } catch {
      retry = window.setTimeout(connectGuest, 1200);
    }
  };

  peer.on("open", () => {
    if (opts.role === "guest") connectGuest();
  });
  peer.on("connection", (c) => attach(c as Conn));
  peer.on("error", (err) => {
    const type = err && typeof err === "object" && "type" in err ? String((err as { type: string }).type) : "";
    if (type === "peer-unavailable") {
      retry = window.setTimeout(connectGuest, 1200);
      return;
    }
    if (type === "unavailable-id") opts.onErr("Kód je obsadený. Vytvor nový.");
    else opts.onErr("Spojenie zlyhalo.");
  });

  return {
    send: (msg) => {
      try {
        if (conn?.open) conn.send(msg);
      } catch {
        /* drop */
      }
    },
    close: () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      try {
        conn?.close();
      } catch {
        /* ignore */
      }
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
