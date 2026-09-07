export function formatMoney(n: number): string {
  const v = Math.max(0, n);
  if (v >= 1000) {
    return v.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return v.toFixed(2);
}

export function formatX(n: number): string {
  if (n >= 100) return `${Math.round(n)}×`;
  if (n >= 10) return `${n.toFixed(1)}×`;
  return `${n.toFixed(2)}×`;
}
