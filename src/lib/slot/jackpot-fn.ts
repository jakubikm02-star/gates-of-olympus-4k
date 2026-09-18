import { createServerFn } from "@tanstack/react-start";
import { fetchParkPool, postParkSpin } from "./jackpot-api";
import type { PoolSnap } from "./jackpot";

export const getParkPool = createServerFn({ method: "GET" }).handler(async (): Promise<PoolSnap> => {
  return fetchParkPool();
});

export const spinParkPool = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const stake = Number(o.stake ?? 0);
    if (!Number.isFinite(stake) || stake < 0 || stake > 20000) throw new Error("bad stake");
    return {
      stake,
      ante: Boolean(o.ante),
      eligible: Boolean(o.eligible),
      force: Boolean(o.force),
      skip: Boolean(o.skip),
    };
  })
  .handler(async ({ data }): Promise<PoolSnap> => {
    return postParkSpin(data);
  });
