/**
 * Game Configuration: Standardregeln, Validierung und Hilfen zur Zusammenstellung
 * des Kartenstapels. Ein Kartenstapel ist immer eine Zuordnung Rolle -> Anzahl;
 * "Rolle deaktivieren" bedeutet Anzahl 0.
 */
import { createSeed } from './rng';
import type { Registry } from './registry';
import type { GameConfig, GameConfigInput, GameRules, PlayerId, RoleId, Timers } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 40;
export const MAX_NAME_LENGTH = 24;

export const DEFAULT_RULES: GameRules = {
  revealRoleOnDeath: 'role',
  werewolfWin: 'parity',
  tieBreak: 'runoff',
  runoffTieBreak: 'none',
  allowAbstain: true,
  allowVoteChange: false,
  allowSelfVote: false,
  revealBallots: false,
  requireWerewolves: true,
  allowNeutralRoles: true,
};

export const DEFAULT_TIMERS: Timers = {
  roleReveal: 0,
  nightStep: 0,
  discussion: 180,
  voting: 0,
  deathDecision: 0,
};

const RULE_VALUES: { [K in keyof GameRules]: readonly GameRules[K][] } = {
  revealRoleOnDeath: ['role', 'faction', 'none'],
  werewolfWin: ['parity', 'elimination'],
  tieBreak: ['none', 'runoff', 'random'],
  runoffTieBreak: ['none', 'random'],
  allowAbstain: [true, false],
  allowVoteChange: [true, false],
  allowSelfVote: [true, false],
  revealBallots: [true, false],
  requireWerewolves: [true, false],
  allowNeutralRoles: [true, false],
};

const defaultPlayerId = (index: number): PlayerId => `p${index + 1}`;

/** Prüft eine Konfiguration und liefert alle Probleme als verständliche Meldungen. */
export function validateConfig(input: GameConfigInput, registry: Registry): string[] {
  const issues: string[] = [];
  const players = Array.isArray(input?.players) ? input.players : [];
  if (!Array.isArray(input?.players)) issues.push('Die Spielerliste fehlt.');
  if (players.length < MIN_PLAYERS) issues.push(`Mindestens ${MIN_PLAYERS} Spieler sind nötig (aktuell ${players.length}).`);
  if (players.length > MAX_PLAYERS) issues.push(`Höchstens ${MAX_PLAYERS} Spieler sind möglich.`);

  const names = new Set<string>();
  players.forEach((player, index) => {
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    if (!name) issues.push(`Spieler ${index + 1} hat keinen Namen.`);
    else if (name.length > MAX_NAME_LENGTH) issues.push(`Der Name "${name}" ist zu lang (max. ${MAX_NAME_LENGTH} Zeichen).`);
    else if (names.has(name.toLowerCase())) issues.push(`Der Name "${name}" ist doppelt vergeben.`);
    names.add(name.toLowerCase());
  });
  const ids = players.map((p, i) => p?.id ?? defaultPlayerId(i));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) issues.push('Die Spieler-IDs müssen eindeutig sein.');

  const rules = { ...DEFAULT_RULES, ...(input?.rules ?? {}) } as GameRules;
  for (const key of Object.keys(rules) as (keyof GameRules)[]) {
    const allowed = RULE_VALUES[key] as readonly unknown[] | undefined;
    if (!allowed) issues.push(`Unbekannte Regel "${key}".`);
    else if (!allowed.includes(rules[key])) issues.push(`Ungültiger Wert für die Regel "${key}": ${String(rules[key])}.`);
  }

  const deck = input?.roles ?? {};
  let total = 0;
  let wolves = 0;
  let extraCards = 0;
  for (const [roleId, count] of Object.entries(deck)) {
    if (!Number.isInteger(count) || count < 0) {
      issues.push(`Ungültige Anzahl für die Rolle "${roleId}".`);
      continue;
    }
    if (count === 0) continue;
    if (!registry.hasRole(roleId)) {
      issues.push(`Die Rolle "${roleId}" existiert nicht im Rollenkatalog.`);
      continue;
    }
    const role = registry.getRole(roleId);
    if (!registry.getTeam(role.team)) issues.push(`Die Rolle "${role.name}" verweist auf das unbekannte Team "${role.team}".`);
    if (role.unique && count > 1) issues.push(`"${role.name}" darf höchstens einmal im Spiel sein.`);
    if (role.copies && count !== role.copies) issues.push(`"${role.name}" gibt es nur genau ${role.copies}-mal.`);
    if (role.faction === 'neutral' && !rules.allowNeutralRoles) issues.push(`Neutrale Rollen sind nicht zugelassen ("${role.name}").`);
    total += count;
    if (role.faction === 'werewolves') wolves += count;
    extraCards = Math.max(extraCards, role.extraCards ?? 0);
  }
  const needed = players.length + extraCards;
  if (total !== needed) {
    issues.push(
      extraCards > 0
        ? `Benötigt werden ${needed} Rollenkarten (${players.length} Spieler + ${extraCards} Zusatzkarten), ausgewählt sind ${total}.`
        : `Benötigt werden ${needed} Rollenkarten (eine pro Spieler), ausgewählt sind ${total}.`,
    );
  }
  if (rules.requireWerewolves && wolves === 0) issues.push('Es muss mindestens ein Werwolf im Spiel sein.');
  if (players.length > 0 && wolves * 2 >= players.length) {
    issues.push(`Zu viele Werwölfe (${wolves} bei ${players.length} Spielern): Es müssen weniger als die Hälfte sein, sonst hätten sie sofort gewonnen.`);
  }

  const fixedCounts: Record<RoleId, number> = {};
  for (const [playerId, roleId] of Object.entries(input?.fixedRoles ?? {})) {
    if (!ids.includes(playerId)) issues.push(`Feste Rolle für den unbekannten Spieler "${playerId}".`);
    if (!registry.hasRole(roleId)) {
      issues.push(`Die feste Rolle "${roleId}" existiert nicht im Rollenkatalog.`);
      continue;
    }
    fixedCounts[roleId] = (fixedCounts[roleId] ?? 0) + 1;
  }
  for (const [roleId, count] of Object.entries(fixedCounts)) {
    if (count > (deck[roleId] ?? 0)) {
      issues.push(`Feste Rollen: "${registry.getRole(roleId).name}" ist ${count}x vergeben, aber nur ${deck[roleId] ?? 0}x im Stapel.`);
    }
  }

  for (const ownerId of Object.keys(input?.options ?? {})) {
    if (!registry.isOptionsOwner(ownerId)) issues.push(`Optionen für die unbekannte Rolle oder Regel "${ownerId}".`);
  }
  for (const [step, order] of Object.entries(input?.nightOrder ?? {})) {
    if (typeof order !== 'number' || !Number.isFinite(order)) issues.push(`Ungültige Nachtreihenfolge für "${step}".`);
  }
  for (const [key, value] of Object.entries(input?.timers ?? {})) {
    if (!(key in DEFAULT_TIMERS) || typeof value !== 'number' || !(value >= 0)) issues.push(`Ungültiges Zeitlimit "${key}".`);
  }
  if (input?.seed !== undefined && !Number.isFinite(input.seed)) issues.push('Ungültiger Seed.');
  return issues;
}

/** Ergänzt Standardwerte. Setzt eine gültige Konfiguration voraus (validateConfig). */
export function resolveConfig(input: GameConfigInput): GameConfig {
  const roles: Record<RoleId, number> = {};
  for (const roleId of Object.keys(input.roles).sort()) {
    if (input.roles[roleId] > 0) roles[roleId] = input.roles[roleId];
  }
  return {
    players: input.players.map((p, i) => ({ id: p.id ?? defaultPlayerId(i), name: p.name.trim() })),
    roles,
    seed: (input.seed ?? createSeed()) >>> 0,
    fixedRoles: { ...(input.fixedRoles ?? {}) },
    rules: { ...DEFAULT_RULES, ...(input.rules ?? {}) },
    options: structuredClone(input.options ?? {}),
    nightOrder: { ...(input.nightOrder ?? {}) },
    timers: { ...DEFAULT_TIMERS, ...(input.timers ?? {}) },
  };
}

/** Faustregel: etwa ein Werwolf pro vier Spieler, mindestens einer. */
export function suggestWerewolfCount(playerCount: number): number {
  return Math.max(1, Math.floor(playerCount / 4));
}

export interface AutoDeckOptions {
  playerCount: number;
  werewolves: number;
  /** Sonderrollen, je eine Karte. */
  specialRoles: RoleId[];
  werewolfRoleId?: RoleId;
  /** Füllt den Rest auf (Standard: Dorfbewohner). */
  fillerRoleId?: RoleId;
}

/** Automatische Zusammenstellung: Werwölfe + je eine Sonderrolle + Dorfbewohner als Auffüllung. */
export function buildAutoDeck(registry: Registry, options: AutoDeckOptions): Record<RoleId, number> {
  const werewolfRoleId = options.werewolfRoleId ?? 'werewolf';
  const fillerRoleId = options.fillerRoleId ?? 'villager';
  const deck: Record<RoleId, number> = {};
  if (options.werewolves > 0) deck[werewolfRoleId] = options.werewolves;
  let extraCards = 0;
  for (const roleId of new Set(options.specialRoles)) {
    if (roleId === werewolfRoleId || roleId === fillerRoleId) continue;
    deck[roleId] = registry.hasRole(roleId) ? (registry.getRole(roleId).copies ?? 1) : 1;
    if (registry.hasRole(roleId)) extraCards = Math.max(extraCards, registry.getRole(roleId).extraCards ?? 0);
  }
  const used = Object.values(deck).reduce((sum, n) => sum + n, 0);
  const fill = options.playerCount + extraCards - used;
  if (fill > 0) deck[fillerRoleId] = fill;
  return deck;
}
