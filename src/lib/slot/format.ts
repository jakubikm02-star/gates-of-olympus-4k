// Number#toLocaleString with options builds a fresh NumberFormat per call; the HUD formats dozens of amounts per render.
let moneyFmt: Intl.NumberFormat | null = null;

export function formatMoney(n: number): string {
  const v = Math.max(0, n);
  if (v >= 1000) {
    moneyFmt ??= new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return moneyFmt.format(v);
  }
  return v.toFixed(2);
}

export function formatX(n: number): string {
  if (n >= 100) return `${Math.round(n)}×`;
  if (n >= 10) return `${n.toFixed(1)}×`;
  return `${n.toFixed(2)}×`;
}
