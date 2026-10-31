/**
 * Erweiterungs-API: So werden Rollen, Fähigkeiten, Teams, Siegbedingungen und
 * Regelmodule beschrieben. Neue Rollen brauchen nur eine eigene Datei mit
 * defineRole(...) und eine Zeile in src/roles/index.ts (siehe docs/neue-rolle.md).
 */
import type { EngineContext } from './context';
import type { NightResolution } from './night';
import type {
  AbilityId,
  DeathCause,
  DeathInfo,
  DecisionInput,
  Faction,
  PlayerId,
  PlayerState,
  RecordedAction,
  RoleId,
  TeamId,
} from './types';

/** Auswahlmöglichkeit für Fähigkeiten, die keine Spieler als Ziel haben (z.B. Dieb). */
export interface Choice {
  id: string;
  label: string;
}

/** Erwartete Eingabe einer Fähigkeit. */
export type AbilityInput =
  | { kind: 'players'; min: number; max: number }
  | { kind: 'choice' }
  | { kind: 'confirm' };

export interface PromptText {
  title?: string;
  info?: string[];
}

export interface AbilityDefinition {
  /** Global eindeutige ID, Konvention: "<rolle>.<fähigkeit>". */
  id: AbilityId;
  /** Anzeigename, z.B. "Heiltrank". */
  name: string;
  /** Auslöser: Nachtschritt oder eigener Tod. */
  trigger: 'night' | 'death';

  // ---- Nur für trigger 'night'
  /** Fähigkeiten mit gleicher Schritt-ID werden gemeinsam aufgerufen (Standard: id). */
  step?: string;
  /** Text für den Erzähler, z.B. "Die Hexe". */
  stepLabel?: string;
  /** Weckreihenfolge (kleiner = früher). Über GameConfig.nightOrder überschreibbar. */
  order?: number;
  /** Auflösungsreihenfolge in NIGHT_RESOLUTION (kleiner = früher). Unabhängig von order. */
  priority?: number;
  /** Aktive Nächte. Standard: 'all'. */
  nights?: 'first' | 'all' | 'after-first';
  /** Gruppenentscheidung: alle lebenden Spieler mit diesem Rollen-Tag müssen sich einigen. */
  group?: { tag: string };
  /** Nur Nachtmodus 'pass': erst offen, wenn diese Nachtschritte erledigt sind (z.B. Hexe nach den Werwölfen). */
  after?: string[];

  // ---- Allgemein
  /** Maximale Einsätze pro Partie (Ressource). Ohne Angabe unbegrenzt. */
  maxUses?: number;
  /** Darf bewusst übersprungen werden. Gruppenfähigkeiten können nicht optional sein. */
  optional?: boolean;
  input: AbilityInput;

  /** Wer handelt. Standard: lebende Spieler, deren Rolle diese Fähigkeit besitzt (bzw. Gruppen-Tag). */
  actors?(ctx: EngineContext): PlayerId[];
  /** Mindestzahl an Zielen, falls sie von der Lage abhängt (Standard: input.min). */
  minTargets?(ctx: EngineContext, actor: PlayerState): number;
  /** Zulässige Ziele. Standard: alle lebenden Spieler außer dem Akteur. */
  candidates?(ctx: EngineContext, actor: PlayerState): PlayerId[];
  /** Zulässige Optionen bei input.kind 'choice'. */
  choices?(ctx: EngineContext, actor: PlayerState): Choice[];
  /** Zusätzliche Verfügbarkeitsprüfung (Ressourcen werden automatisch geprüft). */
  isAvailable?(ctx: EngineContext, actor: PlayerState): boolean;
  /** Texte für die Entscheidungsanzeige. */
  describe?(ctx: EngineContext, actor: PlayerState): PromptText;
  /** Zusätzliche Regelprüfung. Rückgabe: Fehlermeldung oder null. */
  validate?(ctx: EngineContext, actor: PlayerState, input: DecisionInput): string | null;
  /** Sofortiger Effekt bei Abgabe (Information, Rollentausch, Verknüpfung, Todesfolge). Nicht für Gruppen. */
  onSubmit?(ctx: EngineContext, actor: PlayerState, input: DecisionInput): void;
  /** Wird aufgerufen, wenn die Fähigkeit übersprungen wird (bewusst oder durch Zeitablauf). */
  onSkip?(ctx: EngineContext, actor: PlayerState): void;
  /** Verzögerter Nachteffekt, aufgerufen in NIGHT_RESOLUTION nach priority. */
  resolve?(ctx: EngineContext, action: RecordedAction, night: NightResolution): void;
  /** Ersatzentscheidung bei Zeitablauf (null = überspringen). */
  onTimeout?(ctx: EngineContext, actor: PlayerState): DecisionInput | null;
  /** Ersatzentscheidung einer Gruppe bei Zeitablauf. Standard: Mehrheit, Gleichstand per Zufall. */
  onGroupTimeout?(ctx: EngineContext, votes: Record<PlayerId, PlayerId[]>): PlayerId[] | null;
  /** Nur trigger 'death': ob die Fähigkeit bei diesem Tod ausgelöst wird. */
  shouldTrigger?(ctx: EngineContext, self: PlayerState, death: DeathInfo): boolean;
}

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
  /** Gesinnung (was z.B. die Seherin sieht). */
  faction: Faction;
  /** Siegteam (mit wem die Rolle gewinnt). */
  team: TeamId;
  /** Höchstens einmal im Kartenstapel. */
  unique?: boolean;
  /** Gibt es nur genau so oft (z.B. zwei Schwestern). */
  copies?: number;
  /** Freie Markierungen, z.B. 'werewolf-pack' = wacht mit den Werwölfen auf. */
  tags?: string[];
  abilities?: AbilityDefinition[];
  /** Benötigte zusätzliche, nicht verteilte Karten (Dieb: 2). */
  extraCards?: number;
  /** Standardoptionen, überschreibbar über GameConfig.options[rollenId]. */
  defaultOptions?: Record<string, unknown>;
  /** Wie die Rolle bei Untersuchungen erscheint (Standard: faction). */
  appearsAs?(ctx: EngineContext, player: PlayerState): Faction;
  /** Anzeigenamen eigener Todesursachen. */
  deathCauses?: Record<DeathCause, string>;
  /** Zusätzliche Regelmodule (Hooks, Teams, Siegbedingungen), die mit der Rolle registriert werden. */
  rules?: RuleModule[];
}

export interface TeamDefinition {
  id: TeamId;
  name: string;
  /** Lebende Mitglieder verhindern Siege anderer Teams. Standard: true. */
  blocksOtherTeams?: boolean;
}

export interface WinCheckResult {
  /** null = Unentschieden. */
  team: TeamId | null;
  /** Standard: alle Spieler (lebend und tot), die aktuell zum Team gehören. */
  winners?: PlayerId[];
  reason: string;
}

export interface WinCondition {
  id: string;
  /** Kleiner = wird zuerst geprüft. Sind mehrere Bedingungen erfüllt, zählt die erste. */
  priority: number;
  check(ctx: EngineContext): WinCheckResult | null;
}

/** Wissen eines Spielers über einen anderen (z.B. "Werwolf", "Verliebt"). */
export interface KnownInfo {
  playerId: PlayerId;
  label: string;
  /** Maschinenlesbare Art, z.B. 'werewolf-pack' oder 'lover' (für Bots und spätere Clients). */
  kind?: string;
}

/**
 * Regelmodul: bündelt rollenübergreifende Mechaniken. Hooks gelten global,
 * müssen also selbst prüfen, ob sie zuständig sind.
 */
export interface RuleModule {
  id: string;
  teams?: TeamDefinition[];
  winConditions?: WinCondition[];
  deathCauses?: Record<DeathCause, string>;
  defaultOptions?: Record<string, unknown>;
  /** Nach jedem Tod (Spieler ist bereits als tot markiert). Darf weitere Tode vormerken. */
  onDeath?(ctx: EngineContext, dead: PlayerState, death: DeathInfo): void;
  /** Verändert das Siegteam eines Spielers (z.B. gemischtes Liebespaar). */
  teamModifier?(ctx: EngineContext, player: PlayerState, team: TeamId): TeamId;
  /** Was ein Spieler über andere weiß (z.B. Werwölfe kennen sich). */
  knowledge?(ctx: EngineContext, viewer: PlayerState): KnownInfo[];
  /** Fähigkeiten, die an keine Rolle gebunden sind (z.B. Nachfolger des Hauptmanns, trigger 'death'). */
  abilities?: AbilityDefinition[];
  /** In NIGHT_RESOLUTION nach allen Fähigkeiten, bevor Angriffe verrechnet werden (Schutz, Zusatzangriffe). */
  onNightResolution?(ctx: EngineContext, night: NightResolution): void;
  /** Zu Tagesbeginn nach der Bekanntgabe der Toten (z.B. Bär brummt). */
  onDayStart?(ctx: EngineContext): void;
  /** Darf ein Spieler abstimmen? false schließt ihn von der Abstimmung aus. */
  canVote?(ctx: EngineContext, player: PlayerState): boolean;
  /** Gewicht einer Stimme (Standard 1, z.B. Hauptmann 2). */
  voteWeight?(ctx: EngineContext, voter: PlayerState): number;
  /** Gleichstand: einen Spieler bestimmen, der stattdessen ausscheidet (z.B. Sündenbock), sonst null. */
  onVoteTie?(ctx: EngineContext, leaders: PlayerId[]): PlayerId | null;
  /** Vom Dorf verbannt: true verhindert den Tod (z.B. Dorfdepp). */
  preventVoteElimination?(ctx: EngineContext, player: PlayerState): boolean;
  /** Darf dieser Spieler mit seiner Stimme eine zweite Abstimmung verlangen? (z.B. Stotternder Richter) */
  canRequestSecondVote?(ctx: EngineContext, player: PlayerState): boolean;
  /** Verlangen vermerken (nur aufgerufen, wenn canRequestSecondVote true war). */
  onSecondVoteRequest?(ctx: EngineContext, player: PlayerState): void;
  /** Nach der Abstimmung: true = heute folgt noch eine Abstimmung (Verlangen wird dabei verbraucht). */
  takeSecondVote?(ctx: EngineContext): boolean;
  /** Vor der Verbannungsabstimmung eine Wahl abhalten (z.B. Hauptmann)? */
  holdElection?(ctx: EngineContext): boolean;
  /** Ergebnis der Wahl. */
  onElected?(ctx: EngineContext, playerId: PlayerId): void;
  /** Öffentlich sichtbare Abzeichen eines Spielers (z.B. "Hauptmann"). */
  badges?(ctx: EngineContext, player: PlayerState): string[];
}

export const defineRole = (role: RoleDefinition): RoleDefinition => role;
export const defineRule = (rule: RuleModule): RuleModule => rule;
