/**
 * Öffentliche Aussagen aus dem Chat, erkannt über Schlüsselwörter (Deutsch und
 * Englisch). Nachrichten in anderen Sprachen übersetzt der Controller vorher ins
 * Englische (src/translation).
 */
import type { PlayerId, RoleId } from '../engine';
import { detectGermanOrEnglish } from '../translation';
import type { Claim, ClaimDraft, QuestionTopic } from './types';

export interface Named {
  id: string;
  name: string;
}

export class ClaimStore {
  private readonly items: Claim[] = [];

  add(...claims: Claim[]): void {
    for (const claim of claims) {
      const duplicate = this.items.some(
        (c) =>
          c.kind === claim.kind &&
          c.speakerId === claim.speakerId &&
          c.targetId === claim.targetId &&
          c.roleId === claim.roleId &&
          c.result === claim.result &&
          c.round === claim.round,
      );
      if (!duplicate) this.items.push(claim);
    }
  }

  all(): readonly Claim[] {
    return this.items;
  }
}

export interface ExtractedMessage {
  language: string | null;
  claims: ClaimDraft[];
  addressed: PlayerId[];
  isQuestion: boolean;
}

/** Bekannte Wörter je Rolle (zusätzlich zu den Rollennamen aus dem Katalog). */
const ROLE_WORDS: Record<string, string[]> = {
  seer: ['seherin', 'seher', 'seer'],
  witch: ['hexe', 'witch'],
  hunter: ['jäger', 'jaeger', 'hunter'],
  cupid: ['amor', 'cupid'],
  thief: ['dieb', 'thief'],
  villager: ['dorfbewohner', 'dorfbewohnerin', 'villager'],
  werewolf: ['werwolf', 'werewolf'],
};

const WOLF = /(werwolf|werewolf|wolf|wölfe|wolves)/u;
const NEGATION = /\b(kein|keine|nicht|not|no|isn't|isnt|never|nie)\b/u;
const SUSPECT = /(verdächtig|verdaechtig|\bsus\b|suspicious|komisch|seltsam|lügt|luegt|lügner|liar|lying|\blies\b)/u;
const INNOCENT = /(unschuldig|innocent|vertrau|\btrust\b|sauber|\bclean\b|\bsafe\b)/u;
const VOTE = /(stimme für|stimme fuer|wähle|waehle|vote for|voting for|\bvote\b|lynch|raus mit|weg mit)/u;
const SEEN = /(gesehen|geprüft|geprueft|angeschaut|untersucht|checked|\bsaw\b|\bseen\b|inspected|looked at)/u;
const ROLE_CLAIM = /\b(?:ich bin|bin ich|i am|i'm|im)\s+(?:der |die |das |ein |eine |the |a |an )?(\p{L}+)/gu;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Spieler, deren Name als ganzes Wort im Text vorkommt. */
export function findMentions(text: string, players: readonly Named[]): PlayerId[] {
  const lower = text.toLowerCase();
  return players
    .filter((p) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(p.name.toLowerCase())}($|[^\\p{L}\\p{N}])`, 'u').test(lower))
    .map((p) => p.id);
}

function roleFromWord(word: string, roles: readonly Named[]): RoleId | null {
  const lower = word.toLowerCase();
  for (const [roleId, words] of Object.entries(ROLE_WORDS)) {
    if (words.includes(lower)) return roleId;
  }
  return roles.find((r) => r.name.toLowerCase() === lower)?.id ?? null;
}

export function extractClaimsOffline(text: string, speakerId: PlayerId, players: readonly Named[], roles: readonly Named[]): ExtractedMessage {
  const lower = text.toLowerCase();
  const others = players.filter((p) => p.id !== speakerId);
  const claims: ClaimDraft[] = [];

  let claimedRole: RoleId | null = null;
  for (const match of lower.matchAll(ROLE_CLAIM)) {
    const roleId = roleFromWord(match[1], roles);
    if (roleId) {
      claimedRole = roleId;
      claims.push({ kind: 'role', targetId: null, roleId, result: null });
    }
  }
  const seerTalk = claimedRole === 'seer' || SEEN.test(lower);

  for (const clause of lower.split(/[.!?;\n]|,|\bund\b|\band\b|\baber\b|\bbut\b/u)) {
    for (const targetId of findMentions(clause, others)) {
      const negated = NEGATION.test(clause);
      const wolfWord = WOLF.test(clause);
      if (seerTalk && (wolfWord || INNOCENT.test(clause))) {
        claims.push({ kind: 'investigation', targetId, roleId: null, result: wolfWord && !negated ? 'werewolf' : 'not-werewolf' });
        continue;
      }
      if (VOTE.test(clause)) claims.push({ kind: 'vote', targetId, roleId: null, result: null });
      if ((wolfWord && !negated) || (SUSPECT.test(clause) && !negated)) claims.push({ kind: 'accuse', targetId, roleId: null, result: null });
      else if (INNOCENT.test(clause) || (wolfWord && negated)) claims.push({ kind: 'defend', targetId, roleId: null, result: null });
    }
  }

  return {
    language: detectGermanOrEnglish(text),
    claims,
    addressed: findMentions(text, others),
    isQuestion: text.includes('?'),
  };
}

/** Worum es in einer Frage geht (Deutsch oder Englisch). */
export function questionTopic(text: string): QuestionTopic {
  const t = text.toLowerCase();
  if (/(warum|wieso|weshalb|\bwhy\b)/u.test(t)) return 'why';
  if (/(für wen stimmst|fuer wen stimmst|wen wählst|wen waehlst|stimmst du|who (are you|do you) vot|vote for who|your vote)/u.test(t)) return 'vote';
  if (/(verdächtig|verdaechtig|verdacht|wer ist (der|ein|eine|es)|wer war es|\bsuspect|who('s| is) (the |a )?(wolf|werewolf)|who is it)/u.test(t)) return 'suspect';
  if (/(rolle|\brole\b|was bist du|wer bist du|bist du|are you|what are you)/u.test(t)) return 'role';
  return 'other';
}
