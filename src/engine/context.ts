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

  faction(player: PlayerState): Faction {
    return this.role(player).faction;
  }

  /** Siegteam laut Rolle, ohne Regelmodifikationen. */
  baseTeam(player: PlayerState): TeamId {
    return this.role(player).team;
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

  hasTag(player: PlayerState, tag: string): boolean {
    return this.role(player).tags?.includes(tag) ?? false;
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
