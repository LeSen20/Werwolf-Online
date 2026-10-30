/**
 * Spielernamen: zufällige Benutzernamen für Bots, wie Menschen sie sich ausdenken
 * (le_na3, nachteule7, ShadowFox92), und Kurzformen, unter denen Spieler im Chat
 * genannt werden (le_sen1 -> lesen, jonas2003 -> jonas).
 */
import { pickRandom, type Random } from './random';

const FIRST_NAMES = [
  'lena', 'jonas', 'mia', 'finn', 'emma', 'paul', 'lea', 'ben', 'hannah', 'luis', 'sophie', 'elias', 'marie', 'noah',
  'anna', 'felix', 'laura', 'tim', 'julia', 'leon', 'sarah', 'nico', 'lisa', 'jan', 'tom', 'ella', 'luca', 'nele',
  'kai', 'ida', 'moritz', 'clara', 'jakob', 'nina', 'david', 'lara', 'simon', 'jana', 'tobi', 'lukas', 'alex', 'sam',
  'robin', 'jule', 'emil', 'greta', 'theo', 'mila', 'lina', 'paula', 'leni', 'ole', 'malte', 'svenja',
];
/** Weibliche Nomen, passend zu den Adjektiven auf -e ("die müde Katze"). */
const NOUNS = ['katze', 'eule', 'gurke', 'brezel', 'waffel', 'nudel', 'moewe', 'maus', 'biene', 'wolke', 'rakete', 'banane', 'ente', 'schnecke', 'zitrone'];
const ADJECTIVES = ['muede', 'wilde', 'kleine', 'flinke', 'stille', 'schlaue', 'bunte', 'freche', 'coole', 'verpeilte'];
const NICKNAMES = [
  'nachteule', 'keksmonster', 'schokokeks', 'zimtschnecke', 'sternschnuppe', 'gummibaer', 'pfannkuchen', 'nudelsuppe',
  'schlafmuetze', 'sockenmonster', 'toastbrot', 'eisbaer', 'kaesebrot', 'pixelpanda', 'kakaobohne', 'wirbelwind',
];
const EN_ADJECTIVES = ['sleepy', 'lazy', 'crazy', 'happy', 'tiny', 'silent', 'lucky', 'fluffy', 'grumpy', 'sneaky'];
const EN_NOUNS = ['panda', 'cookie', 'pancake', 'potato', 'otter', 'muffin', 'penguin', 'koala', 'noodle', 'pickle', 'waffle', 'bean'];
const TAG_FIRST = ['Shadow', 'Night', 'Ice', 'Storm', 'Dark', 'Ghost', 'Frost', 'Iron', 'Silver', 'Thunder', 'Neon', 'Crimson'];
const TAG_SECOND = ['Fox', 'Owl', 'Hawk', 'Knight', 'Dragon', 'Ninja', 'Tiger', 'Viper', 'Raven', 'Falcon', 'Blade', 'Rider'];
const INITIALS = [...'abcdefghjklmnprstwz'];

/** Rollenwörter würden Mitspieler verwirren, "bot" verriete den Bot. */
const FORBIDDEN = /(wolf|wölf|woelf|werw|hexe|witch|seher|seer|jäger|jaeger|hunter|amor|cupid|dieb|thief|dorf|villag|bot)/u;
/** Einschlägige Zahlencodes (14, 18, 28, 88) und Anzügliches. */
const BAD_NUMBER = /14|18|28|69|88|420|666/;
const NAME_SHAPE = /^[A-Za-z0-9_]{3,16}$/;
/** Kurzformen, die im Chat eher gewöhnliche Wörter sind als Namen. */
const NOT_A_NAME = new Set(['spieler', 'player', 'bot', 'mensch', 'human', 'der', 'die', 'das', 'und', 'the', 'and', 'you', 'ich', 'wer', 'who', 'nacht', 'night', 'tag', 'day']);

const pick = <T>(random: Random, items: readonly T[]): T => pickRandom(random, items) as T;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function numberSuffix(random: Random): string {
  const roll = random();
  if (roll < 0.45) return String(1 + Math.floor(random() * 9));
  if (roll < 0.8) return String(10 + Math.floor(random() * 90));
  return String(1995 + Math.floor(random() * 18));
}

const maybe = (random: Random, chance: number, text: () => string) => (random() < chance ? text() : '');

/** Namensmuster mit Gewicht. */
const PATTERNS: ReadonlyArray<readonly [number, (random: Random) => string]> = [
  // lena2007, finn_7
  [3, (r) => pick(r, FIRST_NAMES) + maybe(r, 0.3, () => '_') + numberSuffix(r)],
  // le_na3, jo_nas7
  [2, (r) => {
    const name = pick(r, FIRST_NAMES.filter((n) => n.length >= 4));
    const cut = 2 + Math.floor(r() * (name.length - 3));
    return `${name.slice(0, cut)}_${name.slice(cut)}${1 + Math.floor(r() * 9)}`;
  }],
  // tim_b
  [1, (r) => `${pick(r, FIRST_NAMES)}_${pick(r, INITIALS)}`],
  // muede_katze, flinke_eule3
  [2, (r) => `${pick(r, ADJECTIVES)}_${pick(r, NOUNS)}` + maybe(r, 0.3, () => numberSuffix(r))],
  // nachteule, keksmonster12
  [2, (r) => pick(r, NICKNAMES) + maybe(r, 0.4, () => numberSuffix(r))],
  // sleepy_panda, lazycookie
  [1, (r) => pick(r, EN_ADJECTIVES) + maybe(r, 0.5, () => '_') + pick(r, EN_NOUNS)],
  // ShadowFox, IceDragon92
  [2, (r) => pick(r, TAG_FIRST) + pick(r, TAG_SECOND) + maybe(r, 0.4, () => numberSuffix(r))],
  // xXFrostXx
  [1, (r) => `xX${pick(r, TAG_FIRST)}Xx`],
  // TheRealPaula, MrBrezel
  [1, (r) => (r() < 0.5 ? `TheReal${capitalize(pick(r, FIRST_NAMES))}` : `${r() < 0.5 ? 'Mr' : 'Miss'}${capitalize(pick(r, [...NOUNS, ...EN_NOUNS]))}`)],
];
const TOTAL_WEIGHT = PATTERNS.reduce((sum, [weight]) => sum + weight, 0);

function acceptable(name: string): boolean {
  const lower = name.toLowerCase();
  return NAME_SHAPE.test(name) && !FORBIDDEN.test(lower) && !(lower.match(/\d+/g) ?? []).some((digits) => BAD_NUMBER.test(digits));
}

/**
 * Neuer Benutzername für einen Bot. Er unterscheidet sich von allen vergebenen Namen
 * auch in den Kurzformen, damit Nennungen im Chat eindeutig bleiben.
 */
export function generateBotName(random: Random, taken: readonly string[]): string {
  const blocked = new Set(taken.flatMap((name) => nameAliases(name)));
  for (let attempt = 0; attempt < 100; attempt++) {
    let roll = random() * TOTAL_WEIGHT;
    const make = PATTERNS.find(([weight]) => (roll -= weight) < 0)?.[1] ?? PATTERNS[0][1];
    let name = make(random);
    if (name === name.toLowerCase() && random() < 0.15) name = capitalize(name);
    if (acceptable(name) && !nameAliases(name).some((alias) => blocked.has(alias))) return name;
  }
  return `gast_${taken.length + 1}`;
}

/** Voller Name (klein geschrieben) und die Kurzformen, unter denen Menschen den Spieler nennen. */
export function nameAliases(name: string): string[] {
  const full = name.trim().toLowerCase();
  const base = full.replace(/[\s_\d]+$/u, '');
  const parts = base.split(/[\s_]+/u).filter(Boolean);
  const last = parts.at(-1) ?? '';
  const candidates = [
    base, // jonas2003 -> jonas, le_sen1 -> le_sen
    parts.join(''), // le_sen -> lesen
    /^xx+_*(.+?)_*xx+$/u.exec(base)?.[1], // xxfrostxx -> frost
    /^(?:thereal|mr|miss)_?(.+)$/u.exec(base)?.[1], // therealpaula -> paula
    parts.length > 1 && last.length <= 2 ? parts.slice(0, -1).join('_') : undefined, // tim_b -> tim
    parts.length > 1 && last.length >= 4 ? last : undefined, // muede_katze -> katze
  ];
  const aliases = new Set([full]);
  for (const alias of candidates) {
    if (alias && alias.length >= 3 && /\p{L}/u.test(alias) && !NOT_A_NAME.has(alias)) aliases.add(alias);
  }
  return [...aliases];
}
