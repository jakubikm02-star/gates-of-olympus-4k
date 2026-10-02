import { canTier } from "@/lib/slot/symbols";

/** Multiplier printed on the PARKVOLT can face. Size steps down for 3-digit values. */
export function CanValue({ mult }: { mult: number }) {
  const digits = String(mult).length;
  return (
    <span className={`can-val is-d${Math.min(3, digits)}`}>
      <small>x</small>
      {mult}
    </span>
  );
}

/** Glow behind high cans (static), plus flickering arcs on the top tier. Transform/opacity only. */
export function CanFx({ mult }: { mult: number }) {
  const tier = canTier(mult);
  if (tier < 3) return null;
  return (
    <span className="can-fx" aria-hidden="true">
      {tier === 4 ? (
        <>
          <i />
          <i />
        </>
      ) : null}
    </span>
  );
}
