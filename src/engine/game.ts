/**
 * Game Engine: öffentliche Schnittstelle einer Partie.
 *
 * Alle spielrelevanten Aktionen laufen über dispatch(command). Jeder Befehl wird auf
 * einer Kopie des Zustands ausgeführt und nur bei Erfolg übernommen. Ein ungültiger
 * Befehl verändert also nie den Zustand und bringt das Spiel nicht zum Absturz.
 */
import { currentPending } from './actions';
import { resolveConfig, validateConfig } from './config';
import { EngineContext } from './context';
import { ConfigError, GameError } from './errors';
import { advance, handleCommand } from './phases';
import type { Registry } from './registry';
import type { Command, DispatchResult, GameConfigInput, GameEvent, GameResult, GameState, PendingDecision, Phase, PlayerId } from './types';
import { buildPlayerView, buildPublicView, type PlayerView, type PublicView } from './views';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}

export interface GameOptions {
  /** Empfängt Debug-Meldungen, z.B. abgewiesene Befehle (Standard: keine Ausgabe). */
  logger?: (entry: LogEntry) => void;
}

function createInitialState(input: GameConfigInput): GameState {
  const config = resolveConfig(input);
  return {
    version: 1,
    phase: 'SETUP',
    round: 0,
    time: null,
    config,
    players: config.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      seat,
      roleId: '',
      originalRoleId: '',
      alive: true,
      death: null,
      abilityUses: {},
      marks: {},
    })),
    extraCards: [],
    rngState: config.seed,
    night: null,
    vote: null,
    deaths: { queue: [], pending: [] },
    continuation: null,
    events: [],
    nextEventId: 1,
    result: null,
  };
}

export class Game {
  readonly registry: Registry;
  private state: GameState;
  private readonly logger?: (entry: LogEntry) => void;

  private constructor(state: GameState, registry: Registry, options: GameOptions) {
    this.state = state;
    this.registry = registry;
    this.logger = options.logger;
  }

  /** Neue Partie in der Phase SETUP. Wirft ConfigError mit allen Problemen. */
  static create(input: GameConfigInput, registry: Registry, options: GameOptions = {}): Game {
    const issues = validateConfig(input, registry);
    if (issues.length > 0) throw new ConfigError(issues);
    return new Game(createInitialState(input), registry, options);
  }

  /** Setzt eine gespeicherte Partie (snapshot()) fort. */
  static restore(state: GameState, registry: Registry, options: GameOptions = {}): Game {
    if (!state || state.version !== 1) throw new GameError('INVALID_CONFIG', 'Unbekanntes Spielstand-Format.');
    for (const player of state.players) {
      if (player.roleId && !registry.hasRole(player.roleId)) {
        throw new GameError('UNKNOWN_ROLE', `Die Rolle "${player.roleId}" existiert nicht im Rollenkatalog.`);
      }
    }
    return new Game(structuredClone(state), registry, options);
  }

  get phase(): Phase {
    return this.state.phase;
  }

  get result(): GameResult | null {
    return this.state.result;
  }

  /** Vollständiger Zustand als Kopie (zum Speichern; enthält geheime Informationen). */
  snapshot(): GameState {
    return structuredClone(this.state);
  }

  dispatch(command: Command): DispatchResult {
    const draft = structuredClone(this.state);
    const ctx = new EngineContext(draft, this.registry);
    const firstEventId = draft.nextEventId;
    try {
      handleCommand(ctx, command);
      advance(ctx);
    } catch (error) {
      const known = error instanceof GameError;
      const result: DispatchResult = {
        ok: false,
        error: known
          ? { code: error.code, message: error.message }
          : { code: 'INTERNAL_ERROR', message: `Interner Fehler: ${error instanceof Error ? error.message : String(error)}` },
      };
      this.logger?.({ level: known ? 'warn' : 'error', message: `Befehl abgewiesen: ${result.error.message}`, data: { command, error } });
      return result;
    }
    this.state = draft;
    const events = draft.events.filter((e) => e.id >= firstEventId);
    this.logger?.({ level: 'info', message: `Befehl ausgeführt: ${command.type}`, data: { command, phase: draft.phase } });
    return { ok: true, events };
  }

  /** Ansicht eines Spielers: nur Informationen, die er sehen darf. */
  viewFor(playerId: PlayerId): PlayerView {
    return buildPlayerView(this.readContext(), playerId);
  }

  /** Öffentliche Ansicht (Erzähler, Zuschauer). */
  publicView(): PublicView {
    return buildPublicView(this.readContext());
  }

  /** Host-Ansicht: wer gerade eine Entscheidung treffen muss (geheim, nicht an Spieler senden). */
  pendingDecisions(): PendingDecision[] {
    return structuredClone(currentPending(this.readContext()));
  }

  /** Vollständiges Protokoll inklusive privater und Debug-Ereignisse (nur für Entwicklung/Host). */
  allEvents(): GameEvent[] {
    return structuredClone(this.state.events);
  }

  /** Ansichten arbeiten auf einer Kopie, damit Rollen-Hooks den Zustand nie verändern können. */
  private readContext(): EngineContext {
    return new EngineContext(structuredClone(this.state), this.registry);
  }
}
