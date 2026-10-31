import { defineRole, type AbilityDefinition, type DeathCause } from '../engine';

export const HUNTER_SHOT = 'hunter';

interface HunterOptions {
  /** Todesursachen, bei denen der Jäger nicht schießen darf (Standard: keine). */
  ignoredCauses: DeathCause[];
  /** Ersatzregel bei Zeitablauf: nicht schießen oder zufälliges Ziel. */
  timeoutRule: 'skip' | 'random';
}

const shoot: AbilityDefinition = {
  id: 'hunter.shoot',
  name: 'Letzter Schuss',
  trigger: 'death',
  maxUses: 1,
  optional: true,
  input: { kind: 'players', min: 1, max: 1 },
  shouldTrigger: (ctx, _self, death) => !ctx.options<HunterOptions>('hunter').ignoredCauses.includes(death.cause),
  describe: (_ctx, actor) => ({
    title: 'Wen nimmst du mit in den Tod?',
    info: [`${actor.name}, du bist gestorben. Als Jäger darfst du einen lebenden Spieler mitnehmen.`],
  }),
  onSubmit(ctx, actor, input) {
    const target = input.targets[0];
    ctx.publicEvent('hunter-shot', `Der Jäger ${actor.name} reißt ${ctx.name(target)} mit in den Tod.`, {
      hunterId: actor.id,
      targetId: target,
    });
    ctx.kill(target, HUNTER_SHOT, actor.id);
  },
  onSkip(ctx, actor) {
    ctx.publicEvent('hunter-skip', `Der Jäger ${actor.name} verzichtet auf seinen letzten Schuss.`, { hunterId: actor.id });
  },
  onTimeout(ctx, actor) {
    if (ctx.options<HunterOptions>('hunter').timeoutRule !== 'random') return null;
    const targets = ctx.alivePlayers().filter((p) => p.id !== actor.id);
    return targets.length > 0 ? { targets: [ctx.pick(targets).id], choice: null } : null;
  },
};

export const hunter = defineRole({
  id: 'hunter',
  name: 'Jäger',
  description: 'Stirbt der Jäger, darf er sofort einen anderen lebenden Spieler mit in den Tod nehmen.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [shoot],
  defaultOptions: { ignoredCauses: [], timeoutRule: 'skip' } satisfies HunterOptions,
  deathCauses: { [HUNTER_SHOT]: 'Schuss des Jägers' },
});
