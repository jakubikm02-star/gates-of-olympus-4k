/** Spine-subset sampling and two-bone IK. No Pixi imports, so tests and the editor can share it. */

export interface CurveKey {
  time: number;
  curve?: number[] | "stepped";
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Unit-square cubic. `c` is Spine's cx1,cy1,cx2,cy2. Returns the eased y for time fraction u. */
export function spineBezier(u: number, c: number[]): number {
  const [cx1, cy1, cx2, cy2] = c;
  let t = clamp(u, 0, 1);
  for (let i = 0; i < 6; i++) {
    const x = bez(t, cx1, cx2);
    const dx = dbez(t, cx1, cx2);
    if (Math.abs(dx) < 1e-4) break;
    t = clamp(t - (x - u) / dx, 0, 1);
  }
  return bez(t, cy1, cy2);
}

function bez(t: number, c1: number, c2: number) {
  const it = 1 - t;
  return 3 * it * it * t * c1 + 3 * it * t * t * c2 + t * t * t;
}

function dbez(t: number, c1: number, c2: number) {
  const it = 1 - t;
  return 3 * it * it * c1 + 6 * it * t * (c2 - c1) + 3 * t * t * (1 - c2);
}

export function sample(keys: ({ time: number; value: number } & CurveKey)[], time: number, fallback: number) {
  if (!keys.length) return fallback;
  if (time <= keys[0].time) return keys[0].value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (time > b.time) continue;
    const span = b.time - a.time || 1e-6;
    const u = (time - a.time) / span;
    if (a.curve === "stepped") return a.value;
    const cu = Array.isArray(a.curve) ? spineBezier(u, a.curve) : u;
    return a.value + (b.value - a.value) * cu;
  }
  return keys[keys.length - 1].value;
}

/** Rotate a y-down vector by Pixi's clockwise-positive degrees, via the CCW matrix at θ = pixi. */
export function rotVec(x: number, y: number, pixiDeg: number) {
  const a = (pixiDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/**
 * Two-bone IK in y-up space. Bone +x aims along the limb.
 * Returns world rotation of bone A and the local rotation of bone B, in spine degrees.
 */
export function solveTwoBone(l1: number, l2: number, tx: number, ty: number, bendPositive: boolean) {
  const reach = Math.hypot(tx, ty);
  const max = l1 + l2 - 1e-3;
  const min = Math.abs(l1 - l2) + 1e-3;
  const d = clamp(reach, min, max);
  const cos1 = clamp((d * d + l1 * l1 - l2 * l2) / (2 * d * l1), -1, 1);
  const cos2 = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1);
  const bend = bendPositive ? 1 : -1;
  const theta = Math.atan2(ty, tx);
  const a = theta - bend * Math.acos(cos1);
  const b = Math.PI - Math.acos(cos2);
  return { a: (a * 180) / Math.PI, b: (bend * b * 180) / Math.PI };
}
