import { defineRole } from '../engine';

/** Runde, in der der Sündenbock wegen Gleichstands gestorben ist. */
const TIE_ROUND = 'scapegoat.tieRound';
/** Wer am nächsten Tag abstimmen darf: { round, ids }. */
const VOTERS = 'scapegoat.voters';

export const scapegoat = defineRole({
  id: 'scapegoat',
  name: 'Sündenbock',
  description: 'Endet eine Abstimmung im Gleichstand, stirbt statt der anderen der Sündenbock. Dafür bestimmt er, wer am nächsten Tag abstimmen darf.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [
    {
      id: 'scapegoat.choose',
      name: 'Stimmrecht vergeben',
      trigger: 'death',
      maxUses: 1,
      optional: true,
      input: { kind: 'players', min: 1, max: 99 },
      shouldTrigger: (ctx, self, death) => death.cause === 'vote' && self.marks[TIE_ROUND] === ctx.state.round,
      describe: () => ({
        title: 'Wer darf morgen abstimmen?',
        info: ['Nur die gewählten Spieler dürfen bei der nächsten Abstimmung ihre Stimme abgeben. Ohne Auswahl dürfen alle.'],
      }),
      onSubmit(ctx, actor, input) {
        actor.marks[VOTERS] = { round: ctx.state.round + 1, ids: [...input.targets] };
        ctx.publicEvent('scapegoat-voters', `Der Sündenbock bestimmt: Morgen stimmen nur ${input.targets.map((id) => ctx.name(id)).join(', ')} ab.`, {
          playerIds: input.targets,
        });
      },
    },
  ],
  rules: [
    {
      id: 'scapegoat-rules',
      onVoteTie(ctx, leaders) {
        const goat = ctx.alivePlayers().find((p) => p.roleId === 'scapegoat');
        if (!goat) return null;
        goat.marks[TIE_ROUND] = ctx.state.round;
        ctx.publicEvent('scapegoat-tie', `Gleichstand zwischen ${leaders.map((id) => ctx.name(id)).join(', ')}. Statt ihrer stirbt der Sündenbock ${goat.name}.`, {
          playerId: goat.id,
          leaders,
        });
        return goat.id;
      },
      canVote(ctx, player) {
        for (const goat of ctx.players) {
          const rule = goat.marks[VOTERS] as { round: number; ids: string[] } | undefined;
          if (rule && rule.round === ctx.state.round) return rule.ids.includes(player.id);
        }
        return true;
      },
    },
  ],
});
