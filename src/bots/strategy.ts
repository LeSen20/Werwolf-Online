/**
 * Entscheidungen der Bots: Nachtfähigkeiten, Abstimmung und was sie im Chat sagen.
 * Alles wird aus der eigenen Spieleransicht und öffentlichen Aussagen abgeleitet.
 *
 * Erweiterungspunkt: Für Fähigkeiten neuer Rollen registerBotAbility(abilityId, strategie)
 * aufrufen. Ohne Strategie entscheiden Bots per Zufall unter den gültigen Zielen.
 */
import type { DecisionPrompt, PlayerId, PlayerView, RoleId } from '../engine';
import { accusationsToday, assess, baseRate, ownChecks, roleClaims } from './brain';
import { pickRandom, shuffled, type Random } from './random';
import type { BotMemory, Claim, Reason, SpeechIntent, SpeechTrigger, Suspicion } from './types';

export interface BotContext {
  view: PlayerView;
  claims: readonly Claim[];
  memory: BotMemory;
  random: Random;
}

export interface BotAnswer {
  targets?: PlayerId[];
  choice?: string;
  skip?: boolean;
}

export type AbilityStrategy = (ctx: BotContext, prompt: DecisionPrompt) => BotAnswer;

const strategies = new Map<string, AbilityStrategy>();

/** Bot-Verhalten für eine Fähigkeit registrieren (auch für neue Rollen). */
export function registerBotAbility(abilityId: string, strategy: AbilityStrategy): void {
  strategies.set(abilityId, strategy);
}

export function newMemory(): BotMemory {
  return { claimedRole: null, messagesToday: 0, day: 0, plannedVote: null, counterClaimed: false };
}

export const isWerewolfBot = (view: PlayerView) => view.self.team === 'werewolves' || view.self.role?.faction === 'werewolves';
const isAlive = (view: PlayerView, id: PlayerId) => view.players.some((p) => p.id === id && p.alive);

/** Verbündete, die ein Bot nie belastet: Rudel, Liebespartner und Geschwister. */
export function alliesOf(view: PlayerView): Set<PlayerId> {
  return new Set(view.players.filter((p) => ['werewolf-pack', 'lover', 'siblings'].some((r) => p.relations.includes(r))).map((p) => p.id));
}

export const honestAssessment = (ctx: BotContext) => assess(ctx.view, ctx.claims, { usePrivate: true });
export const publicAssessment = (ctx: BotContext) => assess(ctx.view, ctx.claims, { usePrivate: false });

/**
 * Wen der Bot öffentlich belasten würde. Dorfbewohner nutzen ihr ganzes Wissen,
 * Werwölfe argumentieren nur mit öffentlichen Infos und schonen ihr Rudel.
 */
export function accusationRanking(ctx: BotContext): Suspicion[] {
  const allies = alliesOf(ctx.view);
  if (isWerewolfBot(ctx.view)) return publicAssessment(ctx).filter((s) => !allies.has(s.playerId));
  return honestAssessment(ctx).filter((s) => s.known !== 'ally' && s.known !== 'good');
}

/** Bester Kandidat; bei fast gleichen Werten entscheidet der Zufall (menschlicher). */
function topPick(ranked: Suspicion[], random: Random): Suspicion | undefined {
  if (ranked.length === 0) return undefined;
  const best = ranked[0].score;
  return pickRandom(random, ranked.filter((s) => s.score >= best - 0.04));
}

/** Meistbeschuldigter Spieler des Tages (mindestens zwei Ankläger). */
function currentWagon(ctx: BotContext, allowed: PlayerId[]): PlayerId | null {
  let best: PlayerId | null = null;
  let bestCount = 1;
  for (const id of allowed) {
    const count = accusationsToday(ctx.view, ctx.claims, id);
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------- Nachtfähigkeiten

const candidateIds = (prompt: DecisionPrompt) => prompt.candidates.map((c) => c.id);

function genericAnswer(ctx: BotContext, prompt: DecisionPrompt): BotAnswer {
  if (prompt.kind === 'confirm') return {};
  if (prompt.optional && ctx.random() < 0.4) return { skip: true };
  if (prompt.kind === 'choice') return { choice: pickRandom(ctx.random, prompt.choices)?.id };
  return { targets: shuffled(ctx.random, candidateIds(prompt)).slice(0, prompt.min) };
}

registerBotAbility('seer.investigate', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const checked = new Set(ownChecks(ctx.view).map((c) => c.targetId));
  const ranked = honestAssessment(ctx).filter((s) => ids.includes(s.playerId) && !checked.has(s.playerId) && s.known === null);
  const target = topPick(ranked, ctx.random)?.playerId ?? pickRandom(ctx.random, ids);
  return { targets: target ? [target] : [] };
});

registerBotAbility('werewolf.kill', (ctx, prompt) => {
  const allies = alliesOf(ctx.view);
  const pack = new Set([ctx.view.self.id, ...ctx.view.players.filter((p) => p.relations.includes('werewolf-pack')).map((p) => p.id)]);
  const trust = new Map(publicAssessment(ctx).map((s) => [s.playerId, s.score]));
  const claimed = roleClaims(ctx.claims);
  const base = baseRate(ctx.view);
  let best: PlayerId | undefined;
  let bestScore = -Infinity;
  for (const id of candidateIds(prompt)) {
    if (allies.has(id)) continue;
    let score = ctx.random() * 0.5;
    const role = claimed.get(id);
    // Gefährliche Rollen zuerst, den Jäger lieber nicht nachts (er schießt zurück).
    if (role === 'seer') score += 6;
    else if (role === 'witch') score += 4;
    else if (role === 'hunter') score -= 3;
    const threats = ctx.claims.filter((c) => c.speakerId === id && c.targetId && pack.has(c.targetId) && c.kind !== 'defend').length;
    score += 2 * Math.min(2, threats);
    // Wem das Dorf vertraut, der ist für das Rudel gefährlich.
    score += 1.5 * (1 - (trust.get(id) ?? base));
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  const target = best ?? pickRandom(ctx.random, candidateIds(prompt));
  return { targets: target ? [target] : [] };
});

registerBotAbility('witch.heal', (ctx, prompt) => {
  const victim = candidateIds(prompt)[0];
  if (!victim) return { skip: true };
  const heal = { targets: [victim] };
  if (victim === ctx.view.self.id || alliesOf(ctx.view).has(victim)) return heal;
  const claimed = roleClaims(ctx.claims).get(victim);
  if (claimed === 'seer' || claimed === 'witch') return heal;
  const suspicion = honestAssessment(ctx).find((s) => s.playerId === victim);
  if (suspicion?.known === 'wolf') return { skip: true };
  if (ctx.view.round === 1) return ctx.random() < 0.5 ? heal : { skip: true };
  return suspicion && suspicion.score < baseRate(ctx.view) && ctx.random() < 0.7 ? heal : { skip: true };
});

registerBotAbility('witch.poison', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const top = honestAssessment(ctx).filter((s) => ids.includes(s.playerId) && s.known !== 'ally' && s.known !== 'good')[0];
  if (!top) return { skip: true };
  const alive = ctx.view.players.filter((p) => p.alive).length;
  // Gift nur bei (fast) sicherem Werwolf, im Endspiel auch bei starkem Verdacht.
  if (top.known === 'wolf' || top.score >= 0.85 || (alive <= 5 && top.score >= 0.6)) return { targets: [top.playerId] };
  return { skip: true };
});

registerBotAbility('hunter.shoot', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const ranked = honestAssessment(ctx).filter((s) => ids.includes(s.playerId) && s.known !== 'ally' && s.known !== 'good');
  const target = topPick(ranked, ctx.random)?.playerId ?? pickRandom(ctx.random, ids);
  return target ? { targets: [target] } : { skip: true };
});

registerBotAbility('cupid.link', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const me = ctx.view.self.id;
  const others = shuffled(ctx.random, ids.filter((id) => id !== me));
  if (ids.includes(me) && ctx.random() < 0.3 && others.length > 0) return { targets: [me, others[0]] };
  return { targets: others.slice(0, 2) };
});

registerBotAbility('thief.steal', (ctx, prompt) => {
  const ids = prompt.choices.map((c) => c.id);
  if (!ids.includes('keep')) return { choice: pickRandom(ctx.random, ids) };
  for (const roleId of ['seer', 'witch', 'hunter', 'cupid']) if (ids.includes(roleId)) return { choice: roleId };
  if (ids.includes('werewolf') && ctx.random() < 0.3) return { choice: 'werewolf' };
  return { choice: 'keep' };
});

registerBotAbility('cupid.lovers', () => ({}));

/** Vertrauenswürdigste Kandidaten zuerst (niedrigster Verdacht, keine bekannten Werwölfe). */
function mostTrusted(ctx: BotContext, ids: PlayerId[]): PlayerId[] {
  const ranked = honestAssessment(ctx).filter((s) => ids.includes(s.playerId) && s.known !== 'wolf');
  return [...ranked].reverse().map((s) => s.playerId);
}

registerBotAbility('healer.protect', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const seer = [...roleClaims(ctx.claims)].find(([id, role]) => (role === 'seer' || role === 'witch') && ids.includes(id))?.[0];
  if (seer) return { targets: [seer] };
  if (ids.includes(ctx.view.self.id) && ctx.random() < 0.4) return { targets: [ctx.view.self.id] };
  const target = mostTrusted(ctx, ids)[0] ?? pickRandom(ctx.random, ids);
  return target ? { targets: [target] } : { skip: true };
});

registerBotAbility('fox.sniff', (ctx, prompt) => {
  const ids = candidateIds(prompt).filter((id) => id !== ctx.view.self.id);
  const top = honestAssessment(ctx).find((s) => ids.includes(s.playerId) && s.known === null);
  const target = top?.playerId ?? pickRandom(ctx.random, ids);
  return target ? { targets: [target] } : { skip: true };
});

registerBotAbility('piper.enchant', (ctx, prompt) => ({ targets: shuffled(ctx.random, candidateIds(prompt)).slice(0, 2) }));

registerBotAbility('wolfhound.choose', (ctx) => ({ choice: ctx.random() < 0.35 ? 'werewolf' : 'village' }));

registerBotAbility('wild-child.model', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  return { targets: [mostTrusted(ctx, ids)[0] ?? pickRandom(ctx.random, ids)!] };
});

registerBotAbility('urwolf.infect', (ctx) => {
  const victim = ctx.view.players.find((p) => roleClaims(ctx.claims).get(p.id) === 'seer' || roleClaims(ctx.claims).get(p.id) === 'witch');
  return ctx.random() < (victim ? 0.8 : 0.4) ? {} : { skip: true };
});

registerBotAbility('big-bad-wolf.kill', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const target = publicAssessment(ctx)
    .filter((s) => ids.includes(s.playerId))
    .at(-1)?.playerId ?? pickRandom(ctx.random, ids);
  return target ? { targets: [target] } : { skip: true };
});

registerBotAbility('white-werewolf.kill', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  return ids.length > 0 && ctx.random() < 0.6 ? { targets: [pickRandom(ctx.random, ids)!] } : { skip: true };
});

registerBotAbility('scapegoat.choose', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const suspects = new Set(honestAssessment(ctx).slice(0, 2).map((s) => s.playerId));
  const voters = ids.filter((id) => !suspects.has(id));
  return voters.length > 0 ? { targets: voters } : { skip: true };
});

registerBotAbility('captain.successor', (ctx, prompt) => {
  const ids = candidateIds(prompt);
  const allies = [...alliesOf(ctx.view)].filter((id) => ids.includes(id));
  const target = (isWerewolfBot(ctx.view) ? allies[0] : undefined) ?? mostTrusted(ctx, ids)[0] ?? pickRandom(ctx.random, ids);
  return { targets: [target!] };
});

/** Hauptmannswahl: Werwölfe wählen einen Wolf, das Dorf den Vertrauenswürdigsten. */
export function chooseCaptain(ctx: BotContext, options: PlayerId[]): PlayerId | null {
  if (isWerewolfBot(ctx.view)) {
    const ally = [...alliesOf(ctx.view)].find((id) => options.includes(id));
    if (ally) return ally;
    return publicAssessment(ctx).filter((s) => options.includes(s.playerId)).at(-1)?.playerId ?? pickRandom(ctx.random, options) ?? null;
  }
  return mostTrusted(ctx, options)[0] ?? pickRandom(ctx.random, options) ?? null;
}

export function decideAbility(ctx: BotContext, prompt: DecisionPrompt): BotAnswer {
  return (strategies.get(prompt.abilityId) ?? genericAnswer)(ctx, prompt);
}

// ---------------------------------------------------------------- Abstimmung

export function chooseVote(ctx: BotContext, options: PlayerId[], allowAbstain: boolean): PlayerId | null {
  if (ctx.memory.plannedVote && options.includes(ctx.memory.plannedVote)) return ctx.memory.plannedVote;
  const allies = alliesOf(ctx.view);
  const allowed = options.filter((id) => !allies.has(id));
  if (allowed.length === 0) return allowAbstain ? null : (options[0] ?? null);
  const wagon = currentWagon(ctx, allowed);
  if (isWerewolfBot(ctx.view)) {
    // Werwölfe schwimmen mit der Mehrheit, solange sie kein Rudelmitglied trifft.
    if (wagon) return wagon;
    return topPick(publicAssessment(ctx).filter((s) => allowed.includes(s.playerId)), ctx.random)?.playerId ?? pickRandom(ctx.random, allowed) ?? null;
  }
  const ranked = honestAssessment(ctx).filter((s) => allowed.includes(s.playerId) && s.known !== 'good');
  const top = ranked[0];
  if (top && (top.known === 'wolf' || top.score >= baseRate(ctx.view) + 0.1)) return top.playerId;
  if (wagon && ranked.some((s) => s.playerId === wagon)) return wagon;
  return top?.playerId ?? pickRandom(ctx.random, allowed) ?? null;
}

// ---------------------------------------------------------------- Chat

function lastNightVictims(view: PlayerView): PlayerId[] {
  const dayStart = [...view.events].reverse().find((e) => e.type === 'day-start' && e.round === view.round);
  return Array.isArray(dayStart?.data?.deaths) ? (dayStart!.data!.deaths as PlayerId[]) : [];
}

function otherSeerClaimant(ctx: BotContext): PlayerId | null {
  for (const [speaker, roleId] of roleClaims(ctx.claims)) {
    if (roleId === 'seer' && speaker !== ctx.view.self.id && isAlive(ctx.view, speaker)) return speaker;
  }
  return null;
}

/** Was der Bot sagen will, oder null, wenn er schweigt. */
export function planSpeech(ctx: BotContext, trigger: SpeechTrigger): SpeechIntent | null {
  const view = ctx.view;
  const me = view.self.id;
  const role = view.self.role?.id;
  const wolf = isWerewolfBot(view);
  const pressure = accusationsToday(view, ctx.claims, me);
  const allies = alliesOf(view);

  // Seherin: deckt sich auf, wenn sie einen lebenden Werwolf kennt, jemand ihre Rolle stiehlt oder es eng wird.
  if (!wolf && role === 'seer' && ctx.memory.claimedRole !== 'seer') {
    const checks = ownChecks(view);
    const livingWolf = checks.find((c) => c.werewolf && isAlive(view, c.targetId));
    const impostor = otherSeerClaimant(ctx);
    if (livingWolf || impostor || pressure >= 2) {
      const reasons: Reason[] = impostor ? [{ code: 'false-claim', subjectId: impostor, relatedId: me, roleId: 'seer', weight: 0.7 }] : [];
      return { kind: 'claim', roleId: 'seer', checks: checks.slice(-3), accuseId: livingWolf?.targetId ?? impostor, reasons };
    }
  }
  // Hexe und Jäger outen sich nur unter Druck.
  if (!wolf && (role === 'witch' || role === 'hunter') && pressure >= 2 && ctx.memory.claimedRole !== role) {
    return { kind: 'claim', roleId: role, checks: [], accuseId: null, reasons: [] };
  }
  // Werwolf: Wird das Rudel von einer "Seherin" belastet, behauptet er manchmal selbst, Seherin zu sein.
  if (wolf && (trigger.kind === 'heard' || trigger.kind === 'accused') && !ctx.memory.counterClaimed) {
    const pack = new Set([me, ...view.players.filter((p) => p.relations.includes('werewolf-pack')).map((p) => p.id)]);
    const exposed = trigger.claims.some((c) => c.kind === 'investigation' && c.result === 'werewolf' && c.targetId !== null && pack.has(c.targetId));
    if (exposed && ctx.random() < 0.4) {
      return {
        kind: 'claim',
        roleId: 'seer',
        checks: [{ targetId: trigger.byId, werewolf: true }],
        accuseId: trigger.byId,
        reasons: [{ code: 'counter-claim', subjectId: trigger.byId, relatedId: me, roleId: 'seer', weight: 0.25 }],
      };
    }
  }

  const ranking = accusationRanking(ctx);
  const top = ranking[0];
  const strong = top && (top.known === 'wolf' || top.score >= baseRate(view) + 0.12) ? top : undefined;

  switch (trigger.kind) {
    case 'accused':
      return { kind: 'defend-self', accuserId: trigger.byId, counterId: top?.playerId ?? null, reasons: top?.reasons ?? [] };
    case 'addressed': {
      if (trigger.topic) {
        const suspect = trigger.topic === 'vote' && ctx.memory.plannedVote ? ranking.find((s) => s.playerId === ctx.memory.plannedVote) : (strong ?? top);
        return { kind: 'answer', askedById: trigger.byId, topic: trigger.topic, suspectId: suspect?.playerId ?? null, reasons: suspect?.reasons ?? [] };
      }
      return strong ? { kind: 'accuse', targetId: strong.playerId, reasons: strong.reasons } : { kind: 'unsure' };
    }
    case 'heard': {
      for (const claim of trigger.claims) {
        const target = claim.targetId;
        const accusing = claim.kind === 'accuse' || claim.kind === 'vote' || (claim.kind === 'investigation' && claim.result === 'werewolf');
        if (!target || target === me || !accusing) continue;
        if (allies.has(target)) {
          const lover = view.players.find((p) => p.id === target)?.relations.includes('lover');
          if (lover || ctx.random() < 0.3) return { kind: 'defend', targetId: target };
          continue;
        }
        const opinion = ranking.find((s) => s.playerId === target);
        if (opinion && opinion.score >= baseRate(view) + 0.05) return { kind: 'agree', speakerId: trigger.byId, targetId: target };
        if (!wolf && honestAssessment(ctx).find((s) => s.playerId === target)?.known === 'good') return { kind: 'defend', targetId: target };
      }
      return null;
    }
    case 'vote-start':
      return null;
    case 'opening': {
      const victims = lastNightVictims(view);
      const todaysChat = view.events.filter((e) => e.type === 'chat' && e.round === view.round);
      // Nur wer als Erstes spricht, reagiert auf die Toten; danach eigene Gedanken.
      const othersSpoke = todaysChat.some((e) => e.data?.playerId !== me);
      if (victims.length > 0 && !othersSpoke && ctx.random() < 0.6) return { kind: 'react-deaths', victims, suspectId: strong?.playerId ?? null };
      if (strong) return { kind: 'accuse', targetId: strong.playerId, reasons: strong.reasons };
      const speakers = new Set(todaysChat.map((e) => String(e.data?.playerId)));
      const quiet = view.players.filter((p) => p.alive && p.id !== me && !speakers.has(p.id) && !allies.has(p.id));
      const asked = pickRandom(ctx.random, quiet);
      if (asked && ctx.random() < 0.6) return { kind: 'ask', targetId: asked.id, topic: ctx.random() < 0.7 ? 'suspect' : 'role' };
      return victims.length > 0 && !othersSpoke ? { kind: 'react-deaths', victims, suspectId: null } : { kind: 'unsure' };
    }
  }
}

/** Was ein gesendeter Bot-Beitrag öffentlich behauptet (für alle Bots als Aussage sichtbar). */
export function claimsFromIntent(intent: SpeechIntent, speakerId: PlayerId, round: number, eventId: number): Claim[] {
  const claim = (kind: Claim['kind'], targetId: PlayerId | null, extra: Partial<Claim> = {}): Claim => ({
    kind,
    speakerId,
    targetId,
    roleId: null,
    result: null,
    round,
    eventId,
    ...extra,
  });
  switch (intent.kind) {
    case 'accuse':
      return [claim('accuse', intent.targetId)];
    case 'claim':
      return [
        claim('role', null, { roleId: intent.roleId }),
        ...intent.checks.map((c) => claim('investigation', c.targetId, { result: c.werewolf ? 'werewolf' : 'not-werewolf' })),
        ...(intent.accuseId ? [claim('accuse', intent.accuseId)] : []),
      ];
    case 'defend-self':
      return intent.counterId ? [claim('accuse', intent.counterId)] : [];
    case 'defend':
      return [claim('defend', intent.targetId)];
    case 'agree':
      return [claim('accuse', intent.targetId)];
    case 'react-deaths':
      return intent.suspectId ? [claim('accuse', intent.suspectId)] : [];
    case 'vote':
      return [claim('vote', intent.targetId)];
    default:
      return [];
  }
}

/** Merkt sich, was der Bot öffentlich festgelegt hat. */
export function rememberIntent(memory: BotMemory, intent: SpeechIntent, wolf: boolean): void {
  if (intent.kind === 'claim') {
    memory.claimedRole = intent.roleId;
    if (wolf) memory.counterClaimed = true;
  }
  if (intent.kind === 'vote') memory.plannedVote = intent.targetId;
}

/** Rolle, die der Bot öffentlich vertritt (Werwölfe und verdeckte Rollen: Dorfbewohner). */
export function presentedRole(memory: BotMemory): RoleId {
  return memory.claimedRole ?? 'villager';
}
