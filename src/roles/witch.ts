import { defineRole, type AbilityDefinition, type EngineContext, type PlayerState } from '../engine';
import { WEREWOLF_ATTACK, getWerewolfTargets } from './werewolf';

export const POISON = 'poison';
const HEAL = 'witch.heal';
const POISON_ABILITY = 'witch.poison';

interface WitchOptions {
  canSelfHeal: boolean;
  canUseBothSameNight: boolean;
}

function victimInfo(ctx: EngineContext): string[] {
  const victims = getWerewolfTargets(ctx);
  return [
    victims.length > 0
      ? `Die Werwölfe haben ${victims.map((id) => ctx.name(id)).join(', ')} gewählt.`
      : 'Die Werwölfe haben in dieser Nacht niemanden gewählt.',
  ];
}

function usedTonight(ctx: EngineContext, actor: PlayerState, abilityId: string): boolean {
  return ctx.night.actions.some((a) => a.abilityId === abilityId && !a.skipped && a.actorIds.includes(actor.id));
}

/** Regel "nur ein Trank pro Nacht": Nach einem Trank verfällt der andere für diese Nacht. */
function otherPotionUnused(other: string) {
  return (ctx: EngineContext, actor: PlayerState): boolean =>
    ctx.options<WitchOptions>('witch').canUseBothSameNight || !usedTonight(ctx, actor, other);
}

const heal: AbilityDefinition = {
  id: HEAL,
  name: 'Heiltrank',
  trigger: 'night',
  step: 'witch',
  stepLabel: 'Die Hexe',
  order: 60,
  priority: 200,
  maxUses: 1,
  optional: true,
  input: { kind: 'players', min: 1, max: 1 },
  // Nur das aktuelle Opfer der Werwölfe kann gerettet werden.
  candidates(ctx, actor) {
    const options = ctx.options<WitchOptions>('witch');
    return getWerewolfTargets(ctx).filter((id) => ctx.player(id).alive && (options.canSelfHeal || id !== actor.id));
  },
  describe: (ctx) => ({ title: 'Heiltrank einsetzen?', info: victimInfo(ctx) }),
  isAvailable: otherPotionUnused(POISON_ABILITY),
  resolve(_ctx, action, night) {
    for (const target of action.targets) night.protect(target, [WEREWOLF_ATTACK], action.actorIds[0] ?? null);
  },
};

const poison: AbilityDefinition = {
  id: POISON_ABILITY,
  name: 'Gifttrank',
  trigger: 'night',
  step: 'witch',
  stepLabel: 'Die Hexe',
  order: 60,
  priority: 110,
  maxUses: 1,
  optional: true,
  input: { kind: 'players', min: 1, max: 1 },
  describe: (ctx) => ({ title: 'Gifttrank einsetzen?', info: victimInfo(ctx) }),
  isAvailable: otherPotionUnused(HEAL),
  resolve(_ctx, action, night) {
    for (const target of action.targets) night.attack(target, POISON, action.actorIds[0] ?? null);
  },
};

export const witch = defineRole({
  id: 'witch',
  name: 'Hexe',
  description: 'Besitzt einen Heiltrank, der das Opfer der Werwölfe rettet, und einen Gifttrank, der einen Spieler tötet. Jeder Trank wirkt einmal pro Partie.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [heal, poison],
  defaultOptions: { canSelfHeal: true, canUseBothSameNight: true } satisfies WitchOptions,
  deathCauses: { [POISON]: 'Gifttrank' },
});
