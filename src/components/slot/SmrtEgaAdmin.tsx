import { useCallback, useEffect, useState } from "react";
import { readLocalSave } from "@/lib/slot/player-save";
import "./smrtega.css";

const TOKEN_KEY = "parkizmus-ego-admin-token";

interface Award {
  id: number;
  nick: string;
  score: number;
  status: string;
  delivered_at: string | null;
  expires_at: string | null;
  revealed_at: string | null;
  soft_flags: string[];
}
interface Slot {
  slot: number;
  status: "empty" | "ready" | "used";
  entered_at: string | null;
  award: Award | null;
  needs_removal: boolean;
}
interface AdminState {
  slots: Slot[];
  pending: { id: number; nick: string; score: number; soft_flags: string[] }[];
  admins: { player_id: string; label: string | null }[];
  week: { week_start: string; week_end: string; players: number } | null;
}

const when = (t: string | null) => (t ? new Date(t).toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" }) : "—");

export function SmrtEgaAdminPage() {
  const [token, setToken] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) ?? "" : ""));
  const [st, setSt] = useState<AdminState | null>(null);
  const [msg, setMsg] = useState("");
  const [codes, setCodes] = useState<Record<number, string>>({});

  const api = useCallback(
    async (body?: Record<string, unknown>) => {
      const res = await fetch("/api/smrtega-admin", {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...(token ? { "x-ego-admin-token": token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((j as { error?: string }).error ?? res.status));
      return j as Record<string, unknown>;
    },
    [token],
  );
  const load = useCallback(async () => {
    try {
      setSt((await api()) as unknown as AdminState);
      setMsg("");
    } catch (e) {
      setMsg(`Chyba: ${(e as Error).message}`);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>, ok: string) => {
    try {
      const r = await api(body);
      setMsg(r.ok === false ? `Nepodarilo sa: ${String(r.error)}` : ok);
      await load();
    } catch (e) {
      setMsg(`Chyba: ${(e as Error).message}`);
    }
  };
  const myId = typeof window !== "undefined" ? readLocalSave()?.playerId ?? "" : "";
  const badges =
    (st?.slots.filter((s) => s.needs_removal).length ?? 0) +
    (st?.pending.length ?? 0) +
    (st?.slots.filter((s) => s.award?.status === "awarded" && s.award.soft_flags.length).length ?? 0);

  return (
    <div className="ego-sheet" style={{ margin: "0 auto", borderRadius: 18, maxHeight: "none", minHeight: "100vh" }}>
      <h2 className="ego-logo">SMRŤ EGA · ADMIN {badges ? <em className="ego-badge">{badges}</em> : null}</h2>
      <p className="ego-sub">
        Týždeň {when(st?.week?.week_start ?? null)} → {when(st?.week?.week_end ?? null)} · hráči {st?.week?.players ?? 0}
      </p>
      <label className="ego-sub">
        Admin token (ak nejde prihlásenie):{" "}
        <input
          type="password"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            localStorage.setItem(TOKEN_KEY, e.target.value);
          }}
        />
      </label>
      {msg ? <p className="ego-err">{msg}</p> : null}

      {st?.pending.map((p) => (
        <p key={p.id} className="ego-err">
          VLOŽIŤ KÓD: {p.nick} ({p.score} RP) čaká na kód. Odstráň staré zariadenie a vlož nový kľúč do voľného slotu.
          {p.soft_flags.length ? ` SOFT FLAG: ${p.soft_flags.join(", ")}` : ""}
        </p>
      ))}

      {st?.slots.map((s) => (
        <div key={s.slot} className="ego-prize">
          <b>Kód {s.slot} · „Parkizmus kód {s.slot}“ · {s.status === "empty" ? "voľný" : s.status === "ready" ? "pripravený (čaká na výhercu)" : "obsadený"}</b>
          {s.award ? (
            <p>
              {s.award.nick} ({s.award.score} RP) · {s.award.status} · doručený {when(s.award.delivered_at)} · vyprší {when(s.award.expires_at)} ·{" "}
              {s.award.revealed_at ? "odkrytý" : "neodkrytý"}
              {s.award.soft_flags.length ? <em className="ego-badge">SOFT FLAG · {s.award.soft_flags.join(", ")}</em> : null}
            </p>
          ) : null}
          {s.needs_removal ? (
            <p>
              1. Odstráň v moja.4ka.tv zariadenie „Parkizmus kód {s.slot}“.{" "}
              <button type="button" className="ego-btn" onClick={() => void act({ action: "removed", slot: s.slot }, "Slot je voľný.")}>
                ODSTRÁNENÉ
              </button>
            </p>
          ) : null}
          {s.status === "empty" ? (
            <p>
              2. Pridaj zariadenie „Parkizmus kód {s.slot}“ a skopíruj párovací kľúč. 3. Vlož ho sem:{" "}
              <input value={codes[s.slot] ?? ""} onChange={(e) => setCodes({ ...codes, [s.slot]: e.target.value })} placeholder="párovací kľúč" />
              <button
                type="button"
                className="ego-btn"
                onClick={() => {
                  void act({ action: "code", slot: s.slot, code: codes[s.slot] ?? "" }, "Kľúč uložený (už ho neuvidíš).");
                  setCodes({ ...codes, [s.slot]: "" });
                }}
              >
                ULOŽIŤ
              </button>
            </p>
          ) : null}
          {s.award && (s.award.status === "awarded" || s.award.status === "pending") ? (
            <p>
              <button
                type="button"
                className="ego-btn is-ghost"
                onClick={() => {
                  if (confirm(`Zneplatniť kód pre ${s.award?.nick}?`)) void act({ action: "revoke", award: s.award?.id, reassign: false }, "Zneplatnené.");
                }}
              >
                ZNEPLATNIŤ
              </button>
              <button
                type="button"
                className="ego-btn is-ghost"
                onClick={() => {
                  if (confirm(`Zneplatniť a dať ďalšiemu oprávnenému?`)) void act({ action: "revoke", award: s.award?.id, reassign: true }, "Zneplatnené, ďalší čaká na kód.");
                }}
              >
                ZNEPLATNIŤ A DAŤ ĎALŠIEMU
              </button>
            </p>
          ) : null}
        </div>
      ))}

      <h3>Martinove zariadenia (bez nároku na cenu)</h3>
      <ul>
        {st?.admins.map((a) => (
          <li key={a.player_id}>
            {a.label ?? "Martin"} · {a.player_id}{" "}
            <button type="button" className="ego-btn is-ghost" onClick={() => void act({ action: "player", playerId: a.player_id, on: false }, "Odobraté.")}>
              odobrať
            </button>
          </li>
        ))}
      </ul>
      {myId ? (
        <button type="button" className="ego-btn" onClick={() => void act({ action: "player", playerId: myId, label: "Martin", on: true }, "Toto zariadenie je bez nároku na cenu.")}>
          TOTO ZARIADENIE JE MARTIN ({myId.slice(0, 8)}…)
        </button>
      ) : null}
    </div>
  );
}
