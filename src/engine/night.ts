/**
 * Nachtphase in zwei Stufen:
 * 1. NIGHT_ACTIONS: Nachtschritte werden in Weckreihenfolge (order) aufgerufen,
 *    Entscheidungen werden gesammelt. Sofortige Effekte (Informationen, Rollentausch)
 *    laufen über onSubmit, weil spätere Schritte davon abhängen können.
 * 2. NIGHT_RESOLUTION: Alle gesammelten Entscheidungen werden nach priority
 *    aufgelöst. Angriffe und Schutzeffekte werden erst am Ende verrechnet, daher
 *    ist das Ergebnis unabhängig davon, in welcher Reihenfolge Eingaben eintreffen.
 */
import { actorsOf, dropUnavailableNightDecisions, isAbilityAvailable } from './actions';
import type { EngineContext } from './context';
import type { AbilityDefinition } from './definitions';
import { GameError } from './errors';
import type { DeathCause, PendingDecision, PlayerId } from './types';

const DEFAULT_ORDER = 100;
const DEFAULT_PRIORITY = 100;

export interface NightStep {
  id: string;
  label: string;
  order: number;
  abilities: AbilityDefinition[];
}

/** Alle Nachtschritte aus der Registry, sortiert nach Weckreihenfolge. */
export function listNightSteps(ctx: EngineContext): NightStep[] {
  const steps = new Map<string, NightStep>();
  for (const ability of ctx.registry.nightAbilities()) {
    const id = ability.step ?? ability.id;
    const order = ability.order ?? DEFAULT_ORDER;
    const step = steps.get(id);
    if (step) {
      step.order = Math.min(step.order, order);
      step.abilities.push(ability);
    } else {
      steps.set(id, { id, label: ability.stepLabel ?? ability.name, order, abilities: [ability] });
    }
  }
  for (const step of steps.values()) {
    const override = ctx.config.nightOrder[step.id];
    if (override !== undefined) step.order = override;
  }
  return [...steps.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function activeInNight(ability: AbilityDefinition, round: number): boolean {
  switch (ability.nights ?? 'all') {
    case 'first':
      return round === 1;
    case 'after-first':
      return round > 1;
    default:
      return true;
  }
}

function pendingForStep(ctx: EngineContext, step: NightStep): PendingDecision[] {
  const pending: PendingDecision[] = [];
  for (const ability of step.abilities) {
    if (!activeInNight(ability, ctx.state.round)) continue;
    for (const actorId of actorsOf(ctx, ability)) {
      if (isAbilityAvailable(ctx, ability, ctx.player(actorId))) pending.push({ abilityId: ability.id, playerId: actorId });
    }
  }
  return pending;
}

/** Spieler, die für diese Fähigkeit in dieser Nacht noch eine Entscheidung schulden. */
function actorsOwing(ctx: EngineContext, ability: AbilityDefinition): PlayerId[] {
  if (!activeInNight(ability, ctx.state.round)) return [];
  const recorded = ctx.night.actions.filter((a) => a.abilityId === ability.id);
  if (ability.group && recorded.length > 0) return [];
  const acted = new Set(recorded.flatMap((a) => a.actorIds));
  return actorsOf(ctx, ability).filter((id) => !acted.has(id) && isAbilityAvailable(ctx, ability, ctx.player(id)));
}

/**
 * Nachtmodus 'pass': Alle Entscheidungen sind gleichzeitig offen, in beliebiger Reihenfolge.
 * Nur Fähigkeiten mit after warten, bis die genannten Schritte erledigt sind (Hexe nach den Werwölfen).
 * Rückgabe true = nichts mehr offen, die Nacht wird aufgelöst.
 */
function advancePassNight(ctx: EngineContext): boolean {
  const steps = listNightSteps(ctx);
  const done = (stepId: string, depth = 0): boolean => {
    const step = steps.find((s) => s.id === stepId);
    return !step || (depth < 10 && step.abilities.every((a) => ready(a, depth + 1) && actorsOwing(ctx, a).length === 0));
  };
  const ready = (ability: AbilityDefinition, depth = 0): boolean => (ability.after ?? []).every((id) => done(id, depth));
  ctx.night.pending = steps.flatMap((step) =>
    step.abilities.filter((a) => ready(a)).flatMap((a) => actorsOwing(ctx, a).map((playerId) => ({ abilityId: a.id, playerId }))),
  );
  return ctx.night.pending.length === 0;
}

export function startNight(ctx: EngineContext): void {
  ctx.state.round += 1;
  ctx.state.time = 'night';
  ctx.state.night = { round: ctx.state.round, step: null, completedSteps: [], pending: [], groupVotes: {}, actions: [] };
  ctx.publicEvent('night-start', `Nacht ${ctx.state.round} bricht herein. Alle schließen die Augen.`);
}

/**
 * Schließt fertige Schritte ab und startet den nächsten Schritt mit Akteuren.
 * Rückgabe true = alle Schritte erledigt, false = es wird auf Entscheidungen gewartet.
 * Schritte werden erst bei Beginn ausgewertet, damit z.B. ein Dieb, der in Schritt 1
 * die Seherin nimmt, im selben Durchgang als Seherin aufgerufen wird.
 */
export function advanceNight(ctx: EngineContext): boolean {
  if (ctx.rules.nightMode === 'pass') return advancePassNight(ctx);
  const night = ctx.night;
  for (let guard = 0; guard < 1000; guard++) {
    if (night.step) {
      dropUnavailableNightDecisions(ctx);
      if (night.pending.length > 0) return false;
      night.completedSteps.push(night.step.id);
      ctx.debug(`Nachtschritt beendet: ${night.step.id}`);
      night.step = null;
    }
    const next = listNightSteps(ctx).find((s) => !night.completedSteps.includes(s.id));
    if (!next) return true;
    const pending = pendingForStep(ctx, next);
    if (pending.length === 0) {
      night.completedSteps.push(next.id);
      continue;
    }
    night.step = { id: next.id, label: next.label, order: next.order };
    night.pending = pending;
    ctx.publicEvent('night-step', `An der Reihe: ${next.label}.`, { stepId: next.id });
    return false;
  }
  throw new GameError('INTERNAL_ERROR', 'Der Nachtablauf hängt (Endlosschleife verhindert).');
}

export interface Attack {
  targetId: PlayerId;
  cause: DeathCause;
  sourceId: PlayerId | null;
}

export interface Protection {
  targetId: PlayerId;
  /** Gegen welche Todesursachen geschützt wird. */
  against: DeathCause[] | 'all';
  sourceId: PlayerId | null;
}

/** Sammelt Angriffe und Schutzeffekte einer Nacht. Wird an AbilityDefinition.resolve übergeben. */
export class NightResolution {
  readonly attacks: Attack[] = [];
  readonly protections: Protection[] = [];

  attack(targetId: PlayerId, cause: DeathCause, sourceId: PlayerId | null = null): void {
    this.attacks.push({ targetId, cause, sourceId });
  }

  protect(targetId: PlayerId, against: DeathCause[] | 'all', sourceId: PlayerId | null = null): void {
    this.protections.push({ targetId, against, sourceId });
  }

  protectionFor(attack: Attack): Protection | undefined {
    return this.protections.find(
      (p) => p.targetId === attack.targetId && (p.against === 'all' || p.against.includes(attack.cause)),
    );
  }
}

/** NIGHT_RESOLUTION: verzögerte Effekte nach priority anwenden und Tode vormerken. */
export function resolveNight(ctx: EngineContext): void {
  const resolution = new NightResolution();
  const ordered = ctx.night.actions
    .map((action, index) => ({ action, index, ability: ctx.registry.getAbility(action.abilityId) }))
    .filter((entry) => !entry.action.skipped)
    .sort((a, b) => (a.ability.priority ?? DEFAULT_PRIORITY) - (b.ability.priority ?? DEFAULT_PRIORITY) || a.index - b.index);
  for (const { action, ability } of ordered) ability.resolve?.(ctx, action, resolution);
  for (const rule of ctx.registry.rules) rule.onNightResolution?.(ctx, resolution);

  for (const attack of resolution.attacks) {
    const protection = resolution.protectionFor(attack);
    if (protection) {
      ctx.debug(`Angriff auf ${ctx.name(attack.targetId)} (${ctx.registry.causeLabel(attack.cause)}) wurde abgewehrt.`);
      continue;
    }
    ctx.kill(attack.targetId, attack.cause, attack.sourceId);
  }
}
