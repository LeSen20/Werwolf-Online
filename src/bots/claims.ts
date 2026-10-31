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
  healer: ['heiler', 'healer', 'beschützer', 'protector', 'bodyguard'],
  elder: ['alte', 'elder'],
  idiot: ['dorfdepp', 'idiot'],
  scapegoat: ['sündenbock', 'scapegoat'],
  piper: ['flötenspieler', 'piper'],
  sister: ['schwester', 'sister'],
  brother: ['bruder', 'brother'],
  wolfhound: ['wolfshund', 'wolfhound'],
  'wild-child': ['kind', 'child'],
  fox: ['fuchs', 'fox'],
  'bear-tamer': ['bärenführer', 'baerenfuehrer', 'tamer'],
  knight: ['ritter', 'knight'],
  judge: ['richter', 'judge'],
  angel: ['engel', 'angel'],
};

const WOLF = /(werwolf|werewolf|wolf|wölfe|wolves)/u;
const NEGATION = /\b(kein|keine|nicht|not|no|isn't|isnt|never|nie)\b/u;
const SUSPECT = /(verdächtig|verdaechtig|\bsus\b|suspicious|komisch|seltsam|lügt|luegt|lügner|liar|lying|\blies\b)/u;
const INNOCENT = /(unschuldig|innocent|vertrau|\btrust\b|sauber|\bclean\b|\bsafe\b)/u;
const VOTE = /(stimme für|stimme fuer|wähle|waehle|vote for|voting for|\bvote\b|lynch|raus mit|weg mit)/u;
const SEEN = /(gesehen|geprüft|geprueft|angeschaut|untersucht|checked|\bsaw\b|\bseen\b|inspected|looked at)/u;
const ROLE_CLAIM = /\b(?:ich bin|bin ich|i am|i'm|im)\s+(?:der |die |das |ein |eine |the |a |an )?(\p{L}+)/gu;

const CLAIM_WORDS = [WOLF, SUSPECT, INNOCENT, VOTE, SEEN];
const CLAUSES = /[.!?;\n]|,|\bund\b|\band\b|\baber\b|\bbut\b/u;
/** Stellen, an denen ein Wort sicher ein Name ist: Anrede am Anfang oder Ende, @name, "hey name". */
const VOCATIVES = [/^\s*@?([\p{L}\p{N}_]+)\s*[,:]/gu, /,\s*@?([\p{L}\p{N}_]+)\s*[?!.]*\s*$/gu, /@([\p{L}\p{N}_]+)/gu, /\b(?:hey|hi|hallo|hello|yo)\s+([\p{L}\p{N}_]+)/gu];
/** Häufige Wörter, die nie als vertippter Name gelten. */
const COMMON_WORDS = new Set(
  (
    'aber alle allem allen aller alles also anders andere anderen auch bald beim bist bitte bleib bleibt damit dann danke dass davon dein deine deinen ' +
    'denn dich dies diese diesem diesen dieser dieses doch dort durch eben echt eher eigentlich einen einem einer eines ende erst etwas euch euer eure ' +
    'fast finde finden frage fragen frust ganz gegen geht gehen gerade gern gerne gesagt gestern gestorben gibt glaube glauben gleich grund habe haben ' +
    'hast hatte heute hier hilft immer jede jeder jemand jetzt kann kannst kein keine keinen klar komm kommt lass lasst leben lesen leute lieber ' +
    'macht machen mehr mein meine meinen mich morgen muss musst nach nacht nachteil nachteile nein nicht nichts noch nochmal oder ohne okay recht ruhig ' +
    'runde sagen sagt schon sehr sein seine selbst sich sicher sind soll sollen sonst spiel spieler still stimme stimmen stimmt total tote toten ' +
    'ueber über unser unsere viel viele vielleicht voll vorher wahr wann warum warst weil weiss weiß wenn werde werden wieder wieso will wird wirklich ' +
    'wohl wollen wurde ziemlich zwei zusammen ' +
    'about after again also always anyone anything because been before being believe both came come could dead does done down each even every ' +
    'everyone feel find first from give good guess have help here honest just keep kill killed know last like look made make many maybe more most ' +
    'much must need never nice night nine nobody nothing only other over people player please pretty quiet really right said same says seems should ' +
    'since some someone something sorry still sure take talk tell than thank thanks that their them then there these they thing think this those ' +
    'though today told true trust very vote voted want wait well were what when where which while will with without would yeah your yours'
  ).split(' '),
);

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Editierdistanz mit Vertauschung benachbarter Zeichen ("jonsa" -> "jonas" = 1). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

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

/** Erlaubte Tippfehler je Länge der Nennform; kurze Namen nur exakt. */
const allowedTypos = (length: number) => (length >= 7 ? 2 : length >= 4 ? 1 : 0);

/** Spieler, den ein vertipptes Wort meint: gleicher Anfangsbuchstabe, wenige Fehler, eindeutig. */
function typoTarget(token: string, forms: readonly MentionForm[]): PlayerId | null {
  if (token.length < 4 || COMMON_WORDS.has(token) || Object.values(ROLE_WORDS).some((words) => words.includes(token))) return null;
  let best = Infinity;
  const ids = new Set<PlayerId>();
  for (const { id, form } of forms) {
    const max = allowedTypos(form.length);
    if (max === 0 || form[0] !== token[0] || Math.abs(form.length - token.length) > max) continue;
    const distance = editDistance(token, form);
    if (distance === 0 || distance > max || distance > best) continue;
    if (distance < best) ids.clear();
    best = distance;
    ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * Vertippte Namen ("lesne" für le_sen1) als zusätzliche Nennformen. Nur an Stellen, an denen
 * ein Name sicher gemeint ist (Anrede) oder in Sätzen mit Anschuldigung, Verteidigung oder
 * Stimme, damit gewöhnliche Wörter nicht zu Namen werden.
 */
function typoForms(lower: string, forms: readonly MentionForm[], speakerId: PlayerId): MentionForm[] {
  const exact = maskNames(lower, forms);
  const vocatives = new Set(VOCATIVES.flatMap((pattern) => [...exact.matchAll(pattern)].map((match) => match[1])));
  const result: MentionForm[] = [];
  for (const clause of exact.split(CLAUSES)) {
    for (const token of new Set(clause.match(/[\p{L}\p{N}_]+/gu) ?? [])) {
      if (result.some((r) => r.form === token)) continue;
      const rest = clause.replace(mentionPattern(token, 'gu'), '$1#');
      if (!vocatives.has(token) && !CLAIM_WORDS.some((pattern) => pattern.test(rest))) continue;
      const id = typoTarget(token, forms);
      if (id && id !== speakerId) result.push({ id, form: token });
    }
  }
  return result;
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
  const exactForms = mentionForms(players);
  const forms = [...exactForms, ...typoForms(lower, exactForms, speakerId)].sort((a, b) => b.form.length - a.form.length);
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

  for (const clause of lower.split(CLAUSES)) {
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
