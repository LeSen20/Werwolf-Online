/**
 * Öffentliche Aussagen aus dem Chat, erkannt über Schlüsselwörter (Deutsch und
 * Englisch). Nachrichten in anderen Sprachen übersetzt der Controller vorher ins
 * Englische (src/translation).
 */
import type { PlayerId, RoleId } from '../engine';
import { detectGermanOrEnglish } from '../translation';
import { nameAliases } from './names';
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

interface MentionForm {
  id: PlayerId;
  form: string;
}

/**
 * Eindeutige Nennformen: jeder volle Name und jede Kurzform, die nur zu einem Spieler passt.
 * Längste zuerst, damit "le_sen1" vor "le_sen" ersetzt wird.
 */
function mentionForms(players: readonly Named[]): MentionForm[] {
  const fullNames = new Map(players.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const owners = new Map<string, Set<PlayerId>>();
  for (const player of players) {
    for (const form of nameAliases(player.name)) owners.set(form, (owners.get(form) ?? new Set()).add(player.id));
  }
  const forms: MentionForm[] = [];
  for (const [form, ids] of owners) {
    const id = fullNames.get(form) ?? (ids.size === 1 ? [...ids][0] : undefined);
    if (id) forms.push({ id, form });
  }
  return forms.sort((a, b) => b.form.length - a.form.length);
}

/** Name als ganzes Wort; Unterstrich und Ziffern gehören zum Namen ("max" passt nicht auf "max_99"). */
const mentionPattern = (form: string, flags = 'u') => new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegex(form)}(?=$|[^\\p{L}\\p{N}_])`, flags);

function mentionsIn(lower: string, forms: readonly MentionForm[], players: readonly Named[], excludeId?: PlayerId): PlayerId[] {
  const found = new Set(forms.filter((f) => f.id !== excludeId && mentionPattern(f.form).test(lower)).map((f) => f.id));
  return players.filter((p) => found.has(p.id)).map((p) => p.id);
}

/** Ersetzt Namen durch "#", damit Namen wie "Wolfgang" keine Schlüsselwörter auslösen. */
function maskNames(lower: string, forms: readonly MentionForm[]): string {
  return forms.reduce((text, f) => text.replace(mentionPattern(f.form, 'gu'), '$1#'), lower);
}

/** Spieler, die im Text mit vollem Namen oder eindeutiger Kurzform genannt werden. */
export function findMentions(text: string, players: readonly Named[], excludeId?: PlayerId): PlayerId[] {
  return mentionsIn(text.toLowerCase(), mentionForms(players), players, excludeId);
}

/** Kurzform je Spieler, wie Mitspieler ihn im Chat nennen würden (nur wenn eindeutig, z.B. le_sen1 -> lesen). */
export function shortNames(players: readonly Named[]): Map<PlayerId, string> {
  const forms = mentionForms(players);
  const result = new Map<PlayerId, string>();
  for (const player of players) {
    const full = player.name.trim().toLowerCase();
    const best = forms
      .filter((f) => f.id === player.id && f.form.length <= full.length - 2)
      .sort((a, b) => a.form.length - b.form.length)[0];
    if (best) result.set(player.id, best.form);
  }
  return result;
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
  const forms = mentionForms(players);
  const masked = maskNames(lower, forms);
  const claims: ClaimDraft[] = [];

  let claimedRole: RoleId | null = null;
  for (const match of masked.matchAll(ROLE_CLAIM)) {
    const roleId = roleFromWord(match[1], roles);
    if (roleId) {
      claimedRole = roleId;
      claims.push({ kind: 'role', targetId: null, roleId, result: null });
    }
  }
  const seerTalk = claimedRole === 'seer' || SEEN.test(masked);

  for (const clause of lower.split(/[.!?;\n]|,|\bund\b|\band\b|\baber\b|\bbut\b/u)) {
    const bare = maskNames(clause, forms);
    for (const targetId of mentionsIn(clause, forms, players, speakerId)) {
      const negated = NEGATION.test(bare);
      const wolfWord = WOLF.test(bare);
      if (seerTalk && (wolfWord || INNOCENT.test(bare))) {
        claims.push({ kind: 'investigation', targetId, roleId: null, result: wolfWord && !negated ? 'werewolf' : 'not-werewolf' });
        continue;
      }
      if (VOTE.test(bare)) claims.push({ kind: 'vote', targetId, roleId: null, result: null });
      if ((wolfWord && !negated) || (SUSPECT.test(bare) && !negated)) claims.push({ kind: 'accuse', targetId, roleId: null, result: null });
      else if (INNOCENT.test(bare) || (wolfWord && negated)) claims.push({ kind: 'defend', targetId, roleId: null, result: null });
    }
  }

  return {
    language: detectGermanOrEnglish(text),
    claims,
    addressed: mentionsIn(lower, forms, players, speakerId),
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
