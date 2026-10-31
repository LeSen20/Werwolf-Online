/**
 * Hauptmann (Grundspiel): Das Dorf wählt am ersten Tag vor der Abstimmung einen Hauptmann.
 * Seine Stimme zählt doppelt, bei Gleichstand entscheidet seine Stimme (falls er für einen der
 * Gleichplatzierten gestimmt hat). Stirbt er, bestimmt er seinen Nachfolger. Ohne lebenden
 * Hauptmann wird am nächsten Tag neu gewählt. In der Engine standardmäßig aus (Option enabled),
 * die Oberfläche schaltet ihn standardmäßig ein.
 */
import { defineRule, type EngineContext, type PlayerState } from '../engine';

const CAPTAIN = 'captain';

interface CaptainOptions {
  enabled: boolean;
}

const isCaptain = (player: PlayerState) => player.marks[CAPTAIN] === true;
const enabled = (ctx: EngineContext) => ctx.options<CaptainOptions>(CAPTAIN).enabled;

export const captainRule = defineRule({
  id: CAPTAIN,
  defaultOptions: { enabled: false } satisfies CaptainOptions,
  holdElection: (ctx) => enabled(ctx) && !ctx.alivePlayers().some(isCaptain),
  onElected(ctx, playerId) {
    for (const player of ctx.players) delete player.marks[CAPTAIN];
    ctx.player(playerId).marks[CAPTAIN] = true;
    ctx.publicEvent('captain-elected', `${ctx.name(playerId)} ist der Hauptmann. Seine Stimme zählt doppelt, und bei Gleichstand entscheidet er.`, {
      playerId,
    });
  },
  voteWeight: (_ctx, voter) => (isCaptain(voter) && voter.alive ? 2 : 1),
  onVoteTie(ctx, leaders) {
    const captain = ctx.alivePlayers().find(isCaptain);
    const choice = captain ? ctx.state.vote?.ballots[captain.id] : null;
    if (!captain || !choice || !leaders.includes(choice)) return null;
    ctx.publicEvent('captain-decides', `Gleichstand. Hauptmann ${captain.name} entscheidet: ${ctx.name(choice)} wird verbannt.`, {
      playerId: choice,
      leaders,
    });
    return choice;
  },
  badges: (_ctx, player) => (isCaptain(player) && player.alive ? ['Hauptmann'] : []),
  abilities: [
    {
      id: 'captain.successor',
      name: 'Nachfolger bestimmen',
      trigger: 'death',
      input: { kind: 'players', min: 1, max: 1 },
      shouldTrigger: (ctx, self) => enabled(ctx) && isCaptain(self),
      describe: (_ctx, actor) => ({ title: 'Wer wird der neue Hauptmann?', info: [`${actor.name}, du warst Hauptmann und bestimmst deinen Nachfolger.`] }),
      onSubmit(ctx, actor, input) {
        delete actor.marks[CAPTAIN];
        ctx.player(input.targets[0]).marks[CAPTAIN] = true;
        ctx.publicEvent('captain-successor', `${actor.name} übergibt das Amt: ${ctx.name(input.targets[0])} ist der neue Hauptmann.`, {
          playerId: input.targets[0],
        });
      },
      onTimeout(ctx, actor) {
        const others = ctx.alivePlayers().filter((p) => p.id !== actor.id);
        return others.length > 0 ? { targets: [ctx.pick(others).id], choice: null } : null;
      },
    },
  ],
});
