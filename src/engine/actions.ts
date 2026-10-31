/**
 * Action Resolver: validiert und verarbeitet Entscheidungen zu Fähigkeiten
 * (Nachtfähigkeiten und Todesfähigkeiten) anhand ihrer Definitionen.
 */
import { MARK_SILENCED, type EngineContext } from './context';
import type { AbilityDefinition, Choice } from './definitions';
import { GameError } from './errors';
import type { DecisionInput, PendingDecision, PlayerId, PlayerState, UseAbilityCommand } from './types';

export function usesLeft(ability: AbilityDefinition, actor: PlayerState): number | null {
  if (ability.maxUses === undefined) return null;
  return Math.max(0, ability.maxUses - (actor.abilityUses[ability.id] ?? 0));
}

/** Lebende Spieler, die diese Fähigkeit gerade einsetzen können. */
export function actorsOf(ctx: EngineContext, ability: AbilityDefinition): PlayerId[] {
  if (ability.actors) return ability.actors(ctx).filter((id) => ctx.player(id).alive);
  const group = ability.group;
  if (group) return ctx.alivePlayers().filter((p) => ctx.hasTag(p, group.tag)).map((p) => p.id);
  return ctx.alivePlayers().filter((p) => ctx.registry.roleHasAbility(p.roleId, ability.id)).map((p) => p.id);
}

/** Mindestzahl an Zielen (kann von der Lage abhängen, z.B. Flötenspieler). */
export function minTargetsOf(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState): number {
  return ability.input.kind === 'players' ? (ability.minTargets?.(ctx, actor) ?? ability.input.min) : 0;
}

export function candidatesOf(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState): PlayerId[] {
  if (ability.candidates) return ability.candidates(ctx, actor);
  return ctx.alivePlayers().filter((p) => p.id !== actor.id).map((p) => p.id);
}

export function choicesOf(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState): Choice[] {
  return ability.choices?.(ctx, actor) ?? [];
}

function isInputFeasible(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState): boolean {
  switch (ability.input.kind) {
    case 'players':
      return candidatesOf(ctx, ability, actor).length >= Math.max(1, minTargetsOf(ctx, ability, actor));
    case 'choice':
      return choicesOf(ctx, ability, actor).length > 0;
    default:
      return true;
  }
}

/** Ressourcen übrig, eigene Bedingung erfüllt und mindestens eine gültige Eingabe möglich. */
export function isAbilityAvailable(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState): boolean {
  if (usesLeft(ability, actor) === 0) return false;
  if (actor.marks[MARK_SILENCED] === true && !ability.group) return false;
  if (ability.isAvailable && !ability.isAvailable(ctx, actor)) return false;
  return isInputFeasible(ctx, ability, actor);
}

/** Offene Entscheidungen der aktuellen Phase. */
export function currentPending(ctx: EngineContext): PendingDecision[] {
  switch (ctx.state.phase) {
    case 'NIGHT_ACTIONS':
      return ctx.state.night?.pending ?? [];
    case 'DEATH_RESOLUTION':
      return ctx.state.deaths.pending;
    default:
      return [];
  }
}

function removePending(ctx: EngineContext, abilityId: string, playerIds: PlayerId[]): void {
  const keep = (p: PendingDecision) => !(p.abilityId === abilityId && playerIds.includes(p.playerId));
  if (ctx.state.phase === 'NIGHT_ACTIONS' && ctx.state.night) ctx.state.night.pending = ctx.state.night.pending.filter(keep);
  else ctx.state.deaths.pending = ctx.state.deaths.pending.filter(keep);
}

function recordNightAction(ctx: EngineContext, ability: AbilityDefinition, actorIds: PlayerId[], input: DecisionInput | null): void {
  if (ability.trigger !== 'night' || !ctx.state.night) return;
  ctx.state.night.actions.push({
    abilityId: ability.id,
    actorIds: [...actorIds],
    targets: input ? [...input.targets] : [],
    choice: input?.choice ?? null,
    skipped: input === null,
  });
}

const names = (ctx: EngineContext, ids: PlayerId[]) => ids.map((id) => ctx.name(id)).join(', ');

// ------------------------------------------------------------------ Abgabe

export function submitDecision(ctx: EngineContext, command: UseAbilityCommand): void {
  const ability = ctx.registry.getAbility(command.abilityId);
  const actor = ctx.player(command.playerId);
  const isPending = currentPending(ctx).some((p) => p.abilityId === ability.id && p.playerId === actor.id);
  if (!isPending) throw notPendingError(ctx, ability, actor);
  if (command.skip) {
    skipDecision(ctx, ability, actor, false);
    return;
  }
  const targets = command.targets ?? [];
  if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
    throw new GameError('INVALID_COMMAND', 'Ungültige Zielangabe.');
  }
  const input: DecisionInput = { targets: [...targets], choice: command.choice ?? null };
  validateInput(ctx, ability, actor, input);
  if (ability.group) castGroupVote(ctx, ability, actor, input);
  else applyDecision(ctx, ability, actor, input);
}

function notPendingError(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState): GameError {
  const phase = ctx.state.phase;
  if (ability.trigger === 'night' && phase !== 'NIGHT_ACTIONS') {
    return new GameError('WRONG_PHASE', `"${ability.name}" kann nur nachts eingesetzt werden.`);
  }
  if (ability.trigger === 'death' && phase !== 'DEATH_RESOLUTION') {
    return new GameError('WRONG_PHASE', `"${ability.name}" kann nur beim eigenen Tod eingesetzt werden.`);
  }
  if (ability.trigger === 'night' && !actor.alive) {
    return new GameError('PLAYER_DEAD', `${actor.name} ist tot und kann keine Fähigkeiten mehr einsetzen.`);
  }
  if (usesLeft(ability, actor) === 0) {
    return new GameError('ABILITY_USED_UP', `"${ability.name}" wurde bereits verbraucht.`);
  }
  const owns = ability.group
    ? ctx.hasTag(actor, ability.group.tag)
    : ability.actors !== undefined || ctx.registry.roleHasAbility(actor.roleId, ability.id) || ctx.registry.isRuleAbility(ability.id);
  if (!owns) return new GameError('NOT_ALLOWED', `${actor.name} besitzt die Fähigkeit "${ability.name}" nicht.`);
  return new GameError('NOT_PENDING', `"${ability.name}" ist für ${actor.name} gerade nicht an der Reihe.`);
}

export function validateInput(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState, input: DecisionInput): void {
  const spec = ability.input;
  if (spec.kind === 'players') {
    if (new Set(input.targets).size !== input.targets.length) {
      throw new GameError('INVALID_TARGET', 'Jedes Ziel darf nur einmal gewählt werden.');
    }
    const min = minTargetsOf(ctx, ability, actor);
    if (input.targets.length < min || input.targets.length > spec.max) {
      const amount = min === spec.max ? `${min}` : `${min} bis ${spec.max}`;
      throw new GameError('INVALID_TARGET', `Für "${ability.name}" müssen ${amount} Ziel(e) gewählt werden.`);
    }
    const allowed = candidatesOf(ctx, ability, actor);
    for (const id of input.targets) {
      const target = ctx.player(id);
      if (!allowed.includes(id)) throw new GameError('INVALID_TARGET', `${target.name} ist kein gültiges Ziel für "${ability.name}".`);
    }
  } else if (spec.kind === 'choice') {
    if (!choicesOf(ctx, ability, actor).some((c) => c.id === input.choice)) {
      throw new GameError('INVALID_CHOICE', `Ungültige Auswahl für "${ability.name}".`);
    }
  }
  const message = ability.validate?.(ctx, actor, input);
  if (message) throw new GameError('NOT_ALLOWED', message);
}

function applyDecision(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState, input: DecisionInput): void {
  removePending(ctx, ability.id, [actor.id]);
  recordNightAction(ctx, ability, [actor.id], input);
  actor.abilityUses[ability.id] = (actor.abilityUses[ability.id] ?? 0) + 1;
  const detail = input.targets.length ? ` -> ${names(ctx, input.targets)}` : input.choice ? ` -> ${input.choice}` : '';
  ctx.debug(`${actor.name} nutzt "${ability.name}"${detail}`);
  ability.onSubmit?.(ctx, actor, input);
}

function skipDecision(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState, forced: boolean): void {
  if (!ability.optional && !forced) throw new GameError('NOT_OPTIONAL', `"${ability.name}" darf nicht übersprungen werden.`);
  removePending(ctx, ability.id, [actor.id]);
  recordNightAction(ctx, ability, [actor.id], null);
  ctx.debug(`${actor.name} verzichtet auf "${ability.name}"${forced ? ' (Zeitablauf)' : ''}`);
  ability.onSkip?.(ctx, actor);
}

/** Nachtentscheidungen, die durch andere Entscheidungen unmöglich wurden, verfallen automatisch. */
export function dropUnavailableNightDecisions(ctx: EngineContext): void {
  for (const pending of [...(ctx.state.night?.pending ?? [])]) {
    const ability = ctx.registry.getAbility(pending.abilityId);
    const actor = ctx.player(pending.playerId);
    if (ability.group || (actor.alive && isAbilityAvailable(ctx, ability, actor))) continue;
    removePending(ctx, ability.id, [actor.id]);
    recordNightAction(ctx, ability, [actor.id], null);
    ctx.debug(`"${ability.name}" von ${actor.name} verfällt in dieser Nacht.`);
  }
}

// ------------------------------------------------------------------ Gruppen

function groupMembers(ctx: EngineContext, ability: AbilityDefinition): PlayerId[] {
  return currentPending(ctx).filter((p) => p.abilityId === ability.id).map((p) => p.playerId);
}

const sameTargets = (a: PlayerId[], b: PlayerId[]) => a.length === b.length && a.every((id) => b.includes(id));

/** Gruppenstimme (z.B. Werwölfe). Abgeschlossen erst, wenn alle Mitglieder dasselbe Ziel gewählt haben. */
function castGroupVote(ctx: EngineContext, ability: AbilityDefinition, actor: PlayerState, input: DecisionInput): void {
  const votes = (ctx.night.groupVotes[ability.id] ??= {});
  votes[actor.id] = [...input.targets];
  const members = groupMembers(ctx, ability);
  ctx.privateEvent(members, 'group-vote', `${actor.name} stimmt für ${names(ctx, input.targets)}.`, {
    abilityId: ability.id,
    voterId: actor.id,
    targets: input.targets,
  });
  const first = votes[members[0]];
  const agreed = first !== undefined && members.every((id) => votes[id] !== undefined && sameTargets(votes[id], first));
  if (agreed) finishGroup(ctx, ability, members, first);
}

function finishGroup(ctx: EngineContext, ability: AbilityDefinition, members: PlayerId[], targets: PlayerId[] | null): void {
  removePending(ctx, ability.id, members);
  recordNightAction(ctx, ability, members, targets ? { targets, choice: null } : null);
  ctx.privateEvent(
    members,
    'group-decision',
    targets ? `Entscheidung gefallen: ${names(ctx, targets)}.` : 'Keine Einigung: In dieser Nacht wird niemand gewählt.',
    { abilityId: ability.id, targets },
  );
}

/** Standard bei Zeitablauf: Ziel mit den meisten Stimmen, Gleichstand per Zufall, keine Stimmen = niemand. */
export function pluralityTargets(ctx: EngineContext, votes: Record<PlayerId, PlayerId[]>): PlayerId[] | null {
  const tally = new Map<string, { targets: PlayerId[]; count: number }>();
  for (const targets of Object.values(votes)) {
    const key = [...targets].sort().join(',');
    const entry = tally.get(key) ?? { targets, count: 0 };
    entry.count += 1;
    tally.set(key, entry);
  }
  if (tally.size === 0) return null;
  const max = Math.max(...[...tally.values()].map((e) => e.count));
  return ctx.pick([...tally.values()].filter((e) => e.count === max)).targets;
}

// ------------------------------------------------------------------ Zeitablauf

/** Löst eine offene Entscheidung per Ersatzregel auf. */
function applyTimeout(ctx: EngineContext, pending: PendingDecision): void {
  const ability = ctx.registry.getAbility(pending.abilityId);
  const actor = ctx.player(pending.playerId);
  if (ability.group) {
    const members = groupMembers(ctx, ability);
    if (members.length === 0) return;
    const votes = ctx.night.groupVotes[ability.id] ?? {};
    let targets = ability.onGroupTimeout ? ability.onGroupTimeout(ctx, votes) : pluralityTargets(ctx, votes);
    if (targets) {
      try {
        validateInput(ctx, ability, ctx.player(members[0]), { targets, choice: null });
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
        targets = null;
      }
    }
    ctx.debug(`Zeitablauf "${ability.name}": ${targets ? names(ctx, targets) : 'keine Entscheidung'}`);
    finishGroup(ctx, ability, members, targets);
    return;
  }
  const fallback = ability.onTimeout?.(ctx, actor) ?? null;
  if (fallback) {
    try {
      validateInput(ctx, ability, actor, fallback);
      ctx.debug(`Zeitablauf: Ersatzentscheidung für "${ability.name}" (${actor.name})`);
      applyDecision(ctx, ability, actor, fallback);
      return;
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
      ctx.debug(`Ersatzentscheidung ungültig (${error.message}), wird übersprungen.`);
    }
  }
  skipDecision(ctx, ability, actor, true);
}

/** Alle offenen Entscheidungen der aktuellen Phase per Ersatzregel auflösen. */
export function timeoutAllPending(ctx: EngineContext): void {
  for (const pending of [...currentPending(ctx)]) {
    const stillOpen = currentPending(ctx).some((p) => p.abilityId === pending.abilityId && p.playerId === pending.playerId);
    if (stillOpen) applyTimeout(ctx, pending);
  }
}
