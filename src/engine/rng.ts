/** Small deterministic PRNG (mulberry32). The whole state is one integer, so it saves trivially. */
export class Rng {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** integer in [a, b] inclusive */
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    const total = items.reduce((s, i) => s + Math.max(0, weight(i)), 0);
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const i of items) { r -= Math.max(0, weight(i)); if (r < 0) return i; }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

/** derive independent stream seeds from one run seed */
export function deriveSeed(seed: number, salt: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
