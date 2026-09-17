import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { sanitizePlayerSave, stampMs, type PlayerSave } from "./player-save";

type SaveRow = {
  balance: number;
  bet_index: number;
  muted: boolean;
  turbo: boolean;
  quick: boolean;
  ante: boolean;
  best_win: number;
  pity_by_bet: string;
  rp: number;
  rank_peak: number;
  rank_shield: boolean;
  updated_at: Date | string | number | null;
};

export const loadPlayerSave = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PlayerSave | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<SaveRow>`
      select balance, bet_index, muted, turbo, quick, ante, best_win, pity_by_bet, rp, rank_peak, rank_shield, updated_at
      from slot_saves
      where user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return sanitizePlayerSave({
      balance: row.balance,
      betIndex: row.bet_index,
      muted: row.muted,
      turbo: row.turbo,
      quick: row.quick,
      ante: row.ante,
      bestWin: row.best_win,
      pityByBet: row.pity_by_bet,
      rp: row.rp,
      rankPeak: row.rank_peak,
      rankShield: row.rank_shield,
      updatedAt: stampMs(row.updated_at),
    });
  });

export const savePlayerSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => sanitizePlayerSave(raw))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const pity = JSON.stringify(data.pityByBet ?? {});
    await sql`
      insert into slot_saves (
        user_id, balance, bet_index, muted, turbo, quick, ante, best_win, pity_by_bet, rp, rank_peak, rank_shield, updated_at
      ) values (
        ${context.userId},
        ${data.balance},
        ${data.betIndex},
        ${data.muted},
        ${data.turbo},
        ${data.quick},
        ${data.ante},
        ${data.bestWin},
        ${pity},
        ${data.rp},
        ${data.rankPeak},
        ${data.rankShield},
        now()
      )
      on conflict (user_id) do update set
        balance = excluded.balance,
        bet_index = excluded.bet_index,
        muted = excluded.muted,
        turbo = excluded.turbo,
        quick = excluded.quick,
        ante = excluded.ante,
        best_win = excluded.best_win,
        pity_by_bet = excluded.pity_by_bet,
        rp = excluded.rp,
        rank_peak = excluded.rank_peak,
        rank_shield = excluded.rank_shield,
        updated_at = now()
    `;
    return { ok: true as const };
  });
