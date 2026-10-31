import type { RoleDefinition } from './definitions';
import { GameError } from './errors';
import type { Registry } from './registry';
import { nextRandom, pick, randomInt, shuffle } from './rng';
import type {
  DeathCause,
  Faction,
  GameConfig,
  GameEvent,
  GameRules,
  GameState,
  NightState,
  PlayerId,
  PlayerState,
  RoleId,
  TeamId,
  Visibility,
} from './types';

/** Marks für Effekte, die eine Rolle verändern, ohne die Karte zu tauschen. */
export const MARK_TAGS = 'tags';
export const MARK_FACTION = 'faction';
export const MARK_TEAM = 'team';
/** Verliert alle Fähigkeiten (z.B. Dorfbewohner nach dem Tod des Alten durch das Dorf). */
export const MARK_SILENCED = 'silenced';
/** Darf nicht mehr abstimmen (z.B. aufgedeckter Dorfdepp). */
export const MARK_NO_VOTE = 'noVote';

/**
 * Zugriff auf Spielzustand und Registry für Engine-Module und Rollen.
 * Rollen sollen den Zustand nur über diese Hilfsfunktionen verändern
 * (kill, changeRole, emit ...), damit Protokoll und Regeln konsistent bleiben.
 */
export class EngineContext {
  readonly state: GameState;
  readonly registry: Registry;

  constructor(state: GameState, registry: Registry) {
    this.state = state;
    this.registry = registry;
  }

  // ---------------------------------------------------------------- Abfragen

  get config(): GameConfig {
    return this.state.config;
  }

  get rules(): GameRules {
    return this.state.config.rules;
  }

  get players(): PlayerState[] {
    return this.state.players;
  }

  /** Nachtzustand der aktuellen bzw. letzten Nacht. */
  get night(): NightState {
    if (!this.state.night) throw new GameError('INTERNAL_ERROR', 'Es gibt keinen Nachtzustand.');
    return this.state.night;
  }

  /** Optionen einer Rolle oder eines Regelmoduls (Standardwerte + Spielkonfiguration). */
  options<T extends object = Record<string, unknown>>(ownerId: string): T {
    return { ...this.registry.defaultOptions(ownerId), ...(this.config.options[ownerId] ?? {}) } as T;
  }

  player(id: PlayerId): PlayerState {
    const player = this.state.players.find((p) => p.id === id);
    if (!player) throw new GameError('UNKNOWN_PLAYER', `Unbekannter Spieler "${id}".`);
    return player;
  }

  alivePlayers(): PlayerState[] {
    return this.state.players.filter((p) => p.alive);
  }

  name(id: PlayerId): string {
    return this.player(id).name;
  }

  role(player: PlayerState): RoleDefinition {
    return this.registry.getRole(player.roleId);
  }

  roleName(roleId: RoleId): string {
    return this.registry.getRole(roleId).name;
  }

  /** Gesinnung: Rolle, außer ein Effekt hat sie geändert (z.B. Ansteckung durch den Urwolf). */
  faction(player: PlayerState): Faction {
    const override = player.marks[MARK_FACTION];
    return override === 'village' || override === 'werewolves' || override === 'neutral' ? override : this.role(player).faction;
  }

  /** Was Untersuchungen (Seherin, Fuchs) sehen. */
  apparentFaction(player: PlayerState): Faction {
    if (typeof player.marks[MARK_FACTION] === 'string') return this.faction(player);
    const role = this.role(player);
    return role.appearsAs?.(this, player) ?? role.faction;
  }

  /** Siegteam laut Rolle (oder durch einen Effekt geändert), ohne Regelmodifikationen. */
  baseTeam(player: PlayerState): TeamId {
    const override = player.marks[MARK_TEAM];
    return typeof override === 'string' ? override : this.role(player).team;
  }

  /** Tatsächliches Siegteam inklusive Regelmodifikationen (z.B. gemischtes Liebespaar). */
  team(player: PlayerState): TeamId {
    let team = this.baseTeam(player);
    for (const rule of this.registry.rules) {
      if (rule.teamModifier) team = rule.teamModifier(this, player, team);
    }
    return team;
  }

  teamName(teamId: TeamId): string {
    return this.registry.getTeam(teamId)?.name ?? teamId;
  }

  /** Tag der Rolle oder per Effekt verliehen (z.B. Wildes Kind wird Teil des Rudels). */
  hasTag(player: PlayerState, tag: string): boolean {
    if (this.role(player).tags?.includes(tag)) return true;
    const extra = player.marks[MARK_TAGS];
    return Array.isArray(extra) && extra.includes(tag);
  }

  /** Lebende Sitznachbarn (Sitzordnung = Spielerliste im Kreis): [links, rechts], links = nächster Platz. */
  neighbors(playerId: PlayerId): PlayerState[] {
    const seated = [...this.state.players].sort((a, b) => a.seat - b.seat);
    const index = seated.findIndex((p) => p.id === playerId);
    const result: PlayerState[] = [];
    for (const step of [1, -1]) {
      for (let k = 1; k < seated.length; k++) {
        const candidate = seated[(index + step * k + seated.length * k) % seated.length];
        if (candidate.alive && candidate.id !== playerId) {
          if (!result.includes(candidate)) result.push(candidate);
          break;
        }
      }
    }
    return result;
  }

  /** Nächster lebender Spieler links (in Sitzrichtung), für den gilt: test. */
  nextToLeft(playerId: PlayerId, test: (player: PlayerState) => boolean): PlayerState | null {
    const seated = [...this.state.players].sort((a, b) => a.seat - b.seat);
    const index = seated.findIndex((p) => p.id === playerId);
    for (let k = 1; k < seated.length; k++) {
      const candidate = seated[(index + k) % seated.length];
      if (candidate.alive && test(candidate)) return candidate;
    }
    return null;
  }

  isFirstNight(): boolean {
    return this.state.round === 1;
  }

  // ---------------------------------------------------------------- Zufall

  random(): number {
    return nextRandom(this.state);
  }

  randomInt(maxExclusive: number): number {
    return randomInt(this.state, maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return pick(this.state, items);
  }

  shuffle<T>(items: readonly T[]): T[] {
    return shuffle(this.state, items);
  }

  // ---------------------------------------------------------------- Ereignisse

  emit(type: string, text: string, visibility: Visibility, data?: Record<string, unknown>): GameEvent {
    const event: GameEvent = {
      id: this.state.nextEventId++,
      round: this.state.round,
      phase: this.state.phase,
      type,
      text,
      visibility,
      ...(data ? { data } : {}),
    };
    this.state.events.push(event);
    return event;
  }

  publicEvent(type: string, text: string, data?: Record<string, unknown>): GameEvent {
    return this.emit(type, text, { kind: 'public' }, data);
  }

  privateEvent(playerIds: PlayerId[], type: string, text: string, data?: Record<string, unknown>): GameEvent {
    return this.emit(type, text, { kind: 'players', playerIds: [...playerIds] }, data);
  }

  /** Nachvollziehbares Debug-Protokoll (für Spieler unsichtbar). */
  debug(text: string, data?: Record<string, unknown>): GameEvent {
    return this.emit('debug', text, { kind: 'debug' }, data);
  }

  // ---------------------------------------------------------------- Veränderungen

  /**
   * Merkt einen Todesfall vor. Verarbeitet wird gesammelt im Death Resolver
   * (Kettenreaktionen, Todesfähigkeiten, danach Siegprüfung).
   */
  kill(playerId: PlayerId, cause: DeathCause, sourceId: PlayerId | null = null): void {
    this.player(playerId);
    this.state.deaths.queue.push({ playerId, cause, sourceId });
  }

  /** Verleiht einen Tag dauerhaft (z.B. Rudelzugehörigkeit). */
  addTag(player: PlayerState, tag: string): void {
    const extra = Array.isArray(player.marks[MARK_TAGS]) ? (player.marks[MARK_TAGS] as string[]) : [];
    if (!extra.includes(tag)) player.marks[MARK_TAGS] = [...extra, tag];
  }

  /** Vollständiger Rollenwechsel: neue Fähigkeiten und Siegbedingung, verbrauchte Einsätze zurückgesetzt. */
  changeRole(playerId: PlayerId, roleId: RoleId): void {
    const role = this.registry.getRole(roleId);
    const player = this.player(playerId);
    const previous = player.roleId;
    player.roleId = role.id;
    player.abilityUses = {};
    this.debug(`Rollenwechsel: ${player.name} ${previous} -> ${role.id}`);
  }
}
