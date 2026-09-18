import { createServerFn } from "@tanstack/react-start";
import { fetchParkPool, postParkSpin } from "./jackpot-api";
import type { BoardSnap } from "./jackpot";

export const getParkPool = createServerFn({ method: "GET" }).handler(async (): Promise<BoardSnap> => {
  return fetchParkPool();
});

export const spinParkPool = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const stake = Number(o.stake ?? 0);
    if (!Number.isFinite(stake) || stake < 0 || stake > 20000) throw new Error("bad stake");
    return {
      stake,
      eligible: Boolean(o.eligible),
      skip: Boolean(o.skip),
      player: String(o.player ?? "").slice(0, 64),
    };
  })
  .handler(async ({ data }): Promise<BoardSnap> => {
    return postParkSpin(data);
  });
