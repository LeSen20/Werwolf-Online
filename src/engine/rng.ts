/**
 * Deterministischer Zufallsgenerator (mulberry32). Der Zustand liegt im GameState,
 * damit Partien reproduzierbar sind (Tests, Wiederholungen, Server-Replays).
 */
export interface RngHolder {
  rngState: number;
}

export function nextRandom(holder: RngHolder): number {
  holder.rngState = (holder.rngState + 0x6d2b79f5) | 0;
  let t = holder.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(nextRandom(holder) * maxExclusive);
}

export function shuffle<T>(holder: RngHolder, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() auf leerer Liste');
  return items[randomInt(holder, items.length)];
}

export function createSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) return cryptoApi.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32);
}
