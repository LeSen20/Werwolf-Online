import { defineRole, pluralityTargets, type AbilityDefinition, type EngineContext, type PlayerId } from '../engine';

/** Todesursache eines Werwolfangriffs. */
export const WEREWOLF_ATTACK = 'werewolves';
/** Rollen mit diesem Tag wachen mit dem Rudel auf, kennen sich und wählen gemeinsam. */
export const WEREWOLF_PACK_TAG = 'werewolf-pack';
export const WEREWOLF_KILL = 'werewolf.kill';

interface WerewolfOptions {
  /** Dürfen Rudelmitglieder gewählt werden? */
  canTargetPack: boolean;
  /** Ersatzregel bei Zeitablauf ohne Einigung. */
  timeoutRule: 'plurality' | 'random' | 'none';
}

/** Opfer, auf das sich das Rudel in der aktuellen Nacht geeinigt hat (für Hexe & Co.). */
export function getWerewolfTargets(ctx: EngineContext): PlayerId[] {
  const night = ctx.state.night;
  if (!night) return [];
  return night.actions.filter((a) => a.abilityId === WEREWOLF_KILL && !a.skipped).flatMap((a) => a.targets);
}

const kill: AbilityDefinition = {
  id: WEREWOLF_KILL,
  name: 'Opfer wählen',
  trigger: 'night',
  step: 'werewolves',
  stepLabel: 'Die Werwölfe',
  order: 50,
  priority: 100,
  group: { tag: WEREWOLF_PACK_TAG },
  input: { kind: 'players', min: 1, max: 1 },
  candidates(ctx) {
    const options = ctx.options<WerewolfOptions>('werewolf');
    return ctx
      .alivePlayers()
      .filter((p) => options.canTargetPack || !ctx.hasTag(p, WEREWOLF_PACK_TAG))
      .map((p) => p.id);
  },
  describe: () => ({
    title: 'Wählt gemeinsam ein Opfer',
    info: ['Alle lebenden Werwölfe müssen dasselbe Opfer wählen.'],
  }),
  onGroupTimeout(ctx, votes) {
    const rule = ctx.options<WerewolfOptions>('werewolf').timeoutRule;
    if (rule === 'none') return null;
    if (rule === 'random') {
      const all = Object.values(votes);
      return all.length > 0 ? ctx.pick(all) : null;
    }
    return pluralityTargets(ctx, votes);
  },
  resolve(_ctx, action, night) {
    for (const target of action.targets) night.attack(target, WEREWOLF_ATTACK);
  },
};

export const werewolf = defineRole({
  id: 'werewolf',
  name: 'Werwolf',
  description: 'Wacht nachts mit den anderen Werwölfen auf. Gemeinsam wählt das Rudel ein Opfer. Tagsüber tarnt er sich als Dorfbewohner.',
  faction: 'werewolves',
  team: 'werewolves',
  tags: [WEREWOLF_PACK_TAG],
  abilities: [kill],
  defaultOptions: { canTargetPack: false, timeoutRule: 'plurality' } satisfies WerewolfOptions,
  deathCauses: { [WEREWOLF_ATTACK]: 'Werwölfe' },
  rules: [
    {
      id: 'werewolf-pack',
      // Werwölfe erkennen sich gegenseitig.
      knowledge(ctx, viewer) {
        if (!ctx.hasTag(viewer, WEREWOLF_PACK_TAG)) return [];
        return ctx.players
          .filter((p) => p.id !== viewer.id && p.roleId && ctx.hasTag(p, WEREWOLF_PACK_TAG))
          .map((p) => ({ playerId: p.id, label: 'Werwolf', kind: WEREWOLF_PACK_TAG }));
      },
    },
  ],
});
