/**
 * Death Resolver: zentrale Verarbeitung aller Todesfälle.
 *
 * Tode werden mit ctx.kill(playerId, cause) vorgemerkt und hier gesammelt verarbeitet:
 * - bereits tote Spieler werden ignoriert (kein doppelter Tod, keine Endlosschleife),
 * - Spieler wird als tot markiert, Todesursache gespeichert,
 * - globale Todes-Hooks (z.B. Liebespaar) dürfen weitere Tode vormerken,
 * - Todesfähigkeiten (z.B. Jäger) erzeugen offene Entscheidungen.
 * Erst wenn die Warteschlange leer ist und keine Entscheidung mehr offen ist,
 * folgt die Siegprüfung. So wird nie mitten in einer Todeskette ausgewertet.
 */
import { candidatesOf, minTargetsOf, usesLeft } from './actions';
import { MARK_SILENCED, type EngineContext } from './context';
import { GameError } from './errors';
import { FACTION_LABELS } from './labels';
import type { DeathInfo, PlayerState } from './types';

const MAX_CHAIN_LENGTH = 1000;

/** Öffentlich aufgedeckte Information eines Toten laut Regel revealRoleOnDeath. */
export function revealText(ctx: EngineContext, player: PlayerState): string {
  switch (ctx.rules.revealRoleOnDeath) {
    case 'role':
      return ctx.role(player).name;
    case 'faction':
      return FACTION_LABELS[ctx.faction(player)];
    default:
      return '';
  }
}

export function processDeathQueue(ctx: EngineContext): 'done' | 'waiting' {
  const deaths = ctx.state.deaths;
  let processed = 0;
  while (deaths.queue.length > 0) {
    if (++processed > MAX_CHAIN_LENGTH) {
      throw new GameError('INTERNAL_ERROR', 'Die Todeskette bricht nicht ab (Endlosschleife verhindert).');
    }
    const request = deaths.queue.shift()!;
    const player = ctx.player(request.playerId);
    if (!player.alive) {
      ctx.debug(`${player.name} ist bereits tot, Todesursache "${ctx.registry.causeLabel(request.cause)}" wird ignoriert.`);
      continue;
    }
    const death: DeathInfo = {
      cause: request.cause,
      sourceId: request.sourceId,
      round: ctx.state.round,
      time: ctx.state.time ?? 'night',
    };
    player.alive = false;
    player.death = death;
    const revealed = revealText(ctx, player);
    ctx.publicEvent('death', `${player.name} ist gestorben.${revealed ? ` (${revealed})` : ''}`, {
      playerId: player.id,
      revealed: revealed || null,
    });
    ctx.debug(`Tod: ${player.name}, Ursache: ${ctx.registry.causeLabel(death.cause)}`);

    for (const rule of ctx.registry.rules) rule.onDeath?.(ctx, player, death);

    for (const ability of [...(ctx.role(player).abilities ?? []), ...ctx.registry.ruleAbilities()]) {
      if (ability.trigger !== 'death' || usesLeft(ability, player) === 0) continue;
      if (player.marks[MARK_SILENCED] === true && !ctx.registry.isRuleAbility(ability.id)) continue;
      if (ctx.registry.isRuleAbility(ability.id) && !ability.shouldTrigger) continue;
      if (ability.shouldTrigger && !ability.shouldTrigger(ctx, player, death)) continue;
      deaths.pending.push({ abilityId: ability.id, playerId: player.id });
      ctx.debug(`Todesfähigkeit ausgelöst: ${ability.name} (${player.name})`);
    }
  }

  // Entscheidungen ohne mögliches Ziel verfallen (z.B. Jäger, wenn niemand mehr lebt).
  deaths.pending = deaths.pending.filter((pending) => {
    const ability = ctx.registry.getAbility(pending.abilityId);
    const actor = ctx.player(pending.playerId);
    const feasible = ability.input.kind !== 'players' || candidatesOf(ctx, ability, actor).length >= Math.max(1, minTargetsOf(ctx, ability, actor));
    if (!feasible) ctx.debug(`"${ability.name}" von ${actor.name} verfällt: kein gültiges Ziel.`);
    return feasible;
  });
  return deaths.pending.length > 0 ? 'waiting' : 'done';
}
