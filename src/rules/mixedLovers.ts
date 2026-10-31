/**
 * Optionale Sonderregel (Standard: aus), unabhängig vom restlichen Liebessystem:
 * Ein gemischtes Liebespaar (unterschiedliche Siegteams, z.B. Dorf + Werwolf)
 * bildet ein eigenes Team und gewinnt, wenn nur noch die beiden leben.
 * Aktivieren: GameConfig.options['mixed-lovers'] = { enabled: true }
 */
import { defineRule, isOpponentOf, type EngineContext, type PlayerState } from '../engine';
import { getLoverId } from '../roles/cupid';

export const LOVERS_TEAM = 'lovers';

function isEnabled(ctx: EngineContext): boolean {
  return ctx.options<{ enabled: boolean }>('mixed-lovers').enabled === true;
}

function isMixedLover(ctx: EngineContext, player: PlayerState): boolean {
  const partnerId = getLoverId(player);
  return partnerId !== null && ctx.baseTeam(player) !== ctx.baseTeam(ctx.player(partnerId));
}

export const mixedLoversRule = defineRule({
  id: 'mixed-lovers',
  defaultOptions: { enabled: false },
  teams: [{ id: LOVERS_TEAM, name: 'Liebespaar' }],
  teamModifier: (ctx, player, team) => (isEnabled(ctx) && isMixedLover(ctx, player) ? LOVERS_TEAM : team),
  winConditions: [
    {
      id: 'mixed-lovers',
      priority: 10,
      check(ctx) {
        if (!isEnabled(ctx)) return null;
        const alive = ctx.alivePlayers();
        const lovers = alive.filter((p) => ctx.team(p) === LOVERS_TEAM);
        if (lovers.length !== 2 || alive.some((p) => isOpponentOf(ctx, p, LOVERS_TEAM))) return null;
        return { team: LOVERS_TEAM, reason: 'Das Liebespaar hat als Einziges überlebt.' };
      },
    },
  ],
});
