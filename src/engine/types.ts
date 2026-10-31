/**
 * Datentypen der Spiel-Engine.
 *
 * Der komplette Spielzustand (GameState) besteht nur aus serialisierbaren Daten
 * (keine Funktionen, Maps oder Sets). Eine Partie kann deshalb gespeichert,
 * über das Netzwerk übertragen und mit Game.restore() fortgesetzt werden.
 */
import type { ErrorCode } from './errors';

export type PlayerId = string;
export type RoleId = string;
export type TeamId = string;
export type AbilityId = string;
/** Todesursache, z.B. 'werewolves', 'vote', 'poison'. Neue Rollen dürfen eigene Ursachen einführen. */
export type DeathCause = string;

/** Gesinnung einer Rolle. Bestimmt z.B., was die Seherin sieht. */
export type Faction = 'village' | 'werewolves' | 'neutral';

export const PHASES = [
  'SETUP',
  'ROLE_DISTRIBUTION',
  'NIGHT_START',
  'NIGHT_ACTIONS',
  'NIGHT_RESOLUTION',
  'DAY_ANNOUNCEMENT',
  'DAY_DISCUSSION',
  'DAY_VOTING',
  'VOTE_RESOLUTION',
  'DEATH_RESOLUTION',
  'WIN_CHECK',
  'GAME_OVER',
] as const;
export type Phase = (typeof PHASES)[number];

export type TimeOfDay = 'night' | 'day';

// ------------------------------------------------------------------ Konfiguration

/** Globale Spielregeln. Rollenspezifische Einstellungen liegen in GameConfig.options. */
export interface GameRules {
  /** Was beim Tod eines Spielers öffentlich aufgedeckt wird. */
  revealRoleOnDeath: 'role' | 'faction' | 'none';
  /** Werwolf-Sieg: Gleichstand mit den Gegnern (parity) oder alle Gegner tot (elimination). */
  werewolfWin: 'parity' | 'elimination';
  /** Gleichstand bei der Abstimmung: niemand stirbt, Stichwahl oder Zufall. */
  tieBreak: 'none' | 'runoff' | 'random';
  /** Gleichstand in der Stichwahl. */
  runoffTieBreak: 'none' | 'random';
  allowAbstain: boolean;
  allowVoteChange: boolean;
  allowSelfVote: boolean;
  /** Nach der Abstimmung veröffentlichen, wer für wen gestimmt hat. */
  revealBallots: boolean;
  /** Partien ohne Werwolf verbieten. */
  requireWerewolves: boolean;
  allowNeutralRoles: boolean;
}

/** Zeitlimits in Sekunden (0 = unbegrenzt). Die Engine misst keine Zeit: Server/UI senden TIMEOUT. */
export interface Timers {
  roleReveal: number;
  nightStep: number;
  discussion: number;
  voting: number;
  deathDecision: number;
}

export interface PlayerConfig {
  id?: PlayerId;
  name: string;
}

export interface GameConfigInput {
  players: PlayerConfig[];
  /** Kartenstapel: Rolle -> Anzahl. Mit Dieb werden 2 Karten mehr als Spieler benötigt. */
  roles: Record<RoleId, number>;
  /** Startwert des Zufallsgenerators (für reproduzierbare Partien). */
  seed?: number;
  /** Feste Rollenzuweisung (Tests, Debugging). Nicht zugewiesene Karten werden zufällig verteilt. */
  fixedRoles?: Record<PlayerId, RoleId>;
  rules?: Partial<GameRules>;
  /** Optionen für Rollen und Regelmodule, Schlüssel = Rollen-/Regel-ID. */
  options?: Record<string, Record<string, unknown>>;
  /** Überschreibt die Weckreihenfolge einzelner Nachtschritte. */
  nightOrder?: Record<string, number>;
  timers?: Partial<Timers>;
}

export interface GameConfig {
  players: Array<{ id: PlayerId; name: string }>;
  roles: Record<RoleId, number>;
  seed: number;
  fixedRoles: Record<PlayerId, RoleId>;
  rules: GameRules;
  options: Record<string, Record<string, unknown>>;
  nightOrder: Record<string, number>;
  timers: Timers;
}

// ------------------------------------------------------------------ Spielzustand

export interface DeathInfo {
  cause: DeathCause;
  sourceId: PlayerId | null;
  round: number;
  time: TimeOfDay;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  seat: number;
  /** Aktuelle Rolle (kann sich ändern, z.B. durch den Dieb). Leer vor der Verteilung. */
  roleId: RoleId;
  /** Ursprünglich ausgeteilte Rolle. */
  originalRoleId: RoleId;
  alive: boolean;
  death: DeathInfo | null;
  /** Verbrauchte Einsätze je Fähigkeit (Ressourcen wie Tränke). */
  abilityUses: Record<AbilityId, number>;
  /** Generische Markierungen, z.B. Liebespartner. Bleiben bei Rollenwechsel erhalten. */
  marks: Record<string, unknown>;
}

/** Eingabe einer Entscheidung: Spielerziele oder eine Auswahloption. */
export interface DecisionInput {
  targets: PlayerId[];
  choice: string | null;
}

/** Eine offene Entscheidung, auf die das Spiel wartet. */
export interface PendingDecision {
  abilityId: AbilityId;
  playerId: PlayerId;
}

/** Eine in der Nacht getroffene (oder übersprungene) Entscheidung. */
export interface RecordedAction {
  abilityId: AbilityId;
  actorIds: PlayerId[];
  targets: PlayerId[];
  choice: string | null;
  skipped: boolean;
}

export interface NightStepInfo {
  id: string;
  label: string;
  order: number;
}

export interface NightState {
  round: number;
  step: NightStepInfo | null;
  completedSteps: string[];
  pending: PendingDecision[];
  /** Stimmen von Gruppen (z.B. Werwölfe) je Fähigkeit und Spieler. */
  groupVotes: Record<AbilityId, Record<PlayerId, PlayerId[]>>;
  actions: RecordedAction[];
}

export interface VoteState {
  /** 1 = Hauptabstimmung, 2 = Stichwahl. */
  round: number;
  candidates: PlayerId[];
  voters: PlayerId[];
  /** null = Enthaltung. */
  ballots: Record<PlayerId, PlayerId | null>;
}

export interface DeathRequest {
  playerId: PlayerId;
  cause: DeathCause;
  sourceId: PlayerId | null;
}

export interface DeathState {
  queue: DeathRequest[];
  /** Offene Todesentscheidungen (z.B. Schuss des Jägers). */
  pending: PendingDecision[];
}

export type Visibility =
  | { kind: 'public' }
  | { kind: 'players'; playerIds: PlayerId[] }
  | { kind: 'debug' };

export interface GameEvent {
  id: number;
  round: number;
  phase: Phase;
  type: string;
  text: string;
  visibility: Visibility;
  data?: Record<string, unknown>;
}

export interface GameResult {
  conditionId: string;
  /** null = Unentschieden oder Abbruch. */
  team: TeamId | null;
  winners: PlayerId[];
  reason: string;
  aborted: boolean;
}

export interface GameState {
  version: 1;
  phase: Phase;
  /** Nacht N und Tag N gehören zur Runde N. */
  round: number;
  time: TimeOfDay | null;
  config: GameConfig;
  players: PlayerState[];
  /** Nicht verteilte Karten (Dieb). */
  extraCards: RoleId[];
  rngState: number;
  night: NightState | null;
  vote: VoteState | null;
  deaths: DeathState;
  /** Phase nach der Siegprüfung (DAY_ANNOUNCEMENT nach der Nacht, NIGHT_START nach dem Tag). */
  continuation: Phase | null;
  events: GameEvent[];
  nextEventId: number;
  result: GameResult | null;
}

// ------------------------------------------------------------------ Befehle

export interface UseAbilityCommand {
  type: 'USE_ABILITY';
  playerId: PlayerId;
  abilityId: AbilityId;
  targets?: PlayerId[];
  choice?: string;
  /** Optionale Fähigkeit bewusst nicht nutzen. */
  skip?: boolean;
}

export interface VoteCommand {
  type: 'VOTE';
  playerId: PlayerId;
  /** null = Enthaltung. */
  targetId: PlayerId | null;
  /** Heimlich eine zweite Abstimmung am selben Tag verlangen (z.B. Stotternder Richter). */
  requestSecondVote?: boolean;
}

export interface ChatCommand {
  type: 'CHAT';
  playerId: PlayerId;
  text: string;
}

export type Command =
  | { type: 'START_GAME' }
  /** Host/Erzähler: wartende Phase beenden (Rollen gesehen, Diskussion vorbei, Abstimmung schließen). */
  | { type: 'ADVANCE' }
  | UseAbilityCommand
  | VoteCommand
  /** Öffentliche Chatnachricht am Tag (Menschen und Bots). */
  | ChatCommand
  /** Zeitlimit abgelaufen: offene Entscheidungen werden per Ersatzregel aufgelöst. */
  | { type: 'TIMEOUT' }
  | { type: 'ABORT'; reason?: string };

export type CommandType = Command['type'];

export interface CommandError {
  code: ErrorCode;
  message: string;
}

export type DispatchResult = { ok: true; events: GameEvent[] } | { ok: false; error: CommandError };
