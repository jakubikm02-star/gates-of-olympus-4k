export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  outBack: (t: number) => {
    const c = 1.70158;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    const c = (2 * Math.PI) / 3;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  },
};
