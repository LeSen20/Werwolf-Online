import type { PlayerId, RoleId } from '../engine';

/**
 * Öffentliche Aussage aus dem Chat (von Menschen oder Bots). Enthält nur, was
 * jemand öffentlich gesagt hat, und darf deshalb von allen Bots genutzt werden.
 */
export type ClaimKind = 'role' | 'investigation' | 'accuse' | 'defend' | 'vote';

export interface Claim {
  kind: ClaimKind;
  speakerId: PlayerId;
  targetId: PlayerId | null;
  roleId: RoleId | null;
  /** Nur bei 'investigation'. */
  result: 'werewolf' | 'not-werewolf' | null;
  round: number;
  eventId: number;
}

export type ClaimDraft = Omit<Claim, 'speakerId' | 'round' | 'eventId'>;

/** Sprechstil eines Bots (macht Vorlagen menschlicher und abwechslungsreicher). */
export interface Voice {
  /** Schreibt locker: Kleinschreibung am Anfang, oft ohne Schlusspunkt. */
  casual: boolean;
  /** Füllwörter wie "hm" oder "ehrlich gesagt". */
  fillers: boolean;
  /** Unsicher, Auslassungspunkte, rechtfertigt sich schnell. */
  nervous: boolean;
  /** Kurz angebunden, lässt Begründungen öfter weg. */
  terse: boolean;
}

export interface Persona {
  id: string;
  name: string;
  /** Beschreibung des Charakters (Anzeige). */
  style: string;
  voice: Voice;
}

/** Worum es in einer Frage an einen Bot geht. */
export type QuestionTopic = 'role' | 'suspect' | 'why' | 'vote' | 'other';

/** Maschinenlesbare Begründung für einen Verdacht oder eine Entlastung. */
export type ReasonCode =
  | 'own-check-wolf'
  | 'own-check-good'
  | 'claimed-check-wolf'
  | 'claimed-check-good'
  | 'wrong-check'
  | 'counter-claim'
  | 'false-claim'
  | 'accused-me'
  | 'defended-wolf'
  | 'accused-wolf'
  | 'voted-innocent'
  | 'voted-wolf'
  | 'quiet'
  | 'bandwagon';

export interface Reason {
  code: ReasonCode;
  /** Wen die Begründung be- oder entlastet. */
  subjectId: PlayerId;
  /** Beteiligter Spieler, z.B. wer etwas behauptet hat. */
  relatedId?: PlayerId;
  roleId?: RoleId;
  /** Positiv = verdächtiger, negativ = vertrauenswürdiger. */
  weight: number;
}

export interface Suspicion {
  playerId: PlayerId;
  /** Geschätzte Wahrscheinlichkeit, dass der Spieler ein Werwolf ist (0..1). */
  score: number;
  /** Sicheres Wissen: Werwolf, unschuldig oder Verbündeter (Rudel, Liebespartner). */
  known: 'wolf' | 'good' | 'ally' | null;
  reasons: Reason[];
}

/** Was ein Bot sagen will. Die Entscheidung trifft der Code, das Sprachmodell formuliert sie nur. */
export type SpeechIntent =
  | { kind: 'accuse'; targetId: PlayerId; reasons: Reason[] }
  | {
      kind: 'claim';
      roleId: RoleId;
      checks: Array<{ targetId: PlayerId; werewolf: boolean }>;
      accuseId: PlayerId | null;
      reasons: Reason[];
    }
  | { kind: 'defend-self'; accuserId: PlayerId | null; counterId: PlayerId | null; reasons: Reason[] }
  | { kind: 'defend'; targetId: PlayerId }
  | { kind: 'agree'; speakerId: PlayerId; targetId: PlayerId }
  | { kind: 'react-deaths'; victims: PlayerId[]; suspectId: PlayerId | null }
  | { kind: 'vote'; targetId: PlayerId }
  | { kind: 'answer'; askedById: PlayerId; topic: QuestionTopic; suspectId: PlayerId | null; reasons: Reason[] }
  /** Eine Frage an einen (meist stillen) Mitspieler. */
  | { kind: 'ask'; targetId: PlayerId; topic: 'suspect' | 'role' }
  | { kind: 'unsure' };

/** Anlass, zu dem ein Bot etwas sagen könnte. */
export type SpeechTrigger =
  | { kind: 'opening' }
  | { kind: 'accused'; byId: PlayerId; claims: Claim[] }
  | { kind: 'addressed'; byId: PlayerId; topic: QuestionTopic | null }
  | { kind: 'heard'; byId: PlayerId; claims: Claim[] }
  | { kind: 'vote-start' };

/** Persönliches Gedächtnis eines Bots (nur Bot-intern). */
export interface BotMemory {
  /** Öffentlich behauptete Rolle (echt oder vorgetäuscht). */
  claimedRole: string | null;
  messagesToday: number;
  day: number;
  plannedVote: PlayerId | null;
  counterClaimed: boolean;
}
