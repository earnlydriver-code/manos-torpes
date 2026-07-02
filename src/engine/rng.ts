/**
 * RNG determinista (mulberry32). Todo el motor lo usa en lugar de Math.random
 * para que entrenamientos y tests sean reproducibles con una semilla.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero uniforme en [lo, hi], ambos inclusive. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Elige un elemento con probabilidad proporcional a su peso. */
export function weightedPick<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = rng() * total;
  for (const [value, w] of items) {
    r -= w;
    if (r <= 0) return value;
  }
  return items[items.length - 1][0];
}
