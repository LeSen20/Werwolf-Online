import { MARK_SILENCED, defineRole } from '../engine';

/** Runde, für die der Richter eine zweite Abstimmung verlangt hat. */
const REQUESTED = 'judge.requested';
const USED = 'judge.used';

export const judge = defineRole({
  id: 'judge',
  name: 'Stotternder Richter',
  description: 'Kann einmal pro Partie mit seiner Stimme heimlich eine zweite Abstimmung verlangen. Sie folgt direkt nach der ersten, noch am selben Tag.',
  faction: 'village',
  team: 'village',
  unique: true,
  rules: [
    {
      id: 'judge-rules',
      canRequestSecondVote: (_ctx, player) => player.roleId === 'judge' && player.alive && player.marks[USED] !== true && player.marks[MARK_SILENCED] !== true,
      onSecondVoteRequest(ctx, player) {
        player.marks[USED] = true;
        player.marks[REQUESTED] = ctx.state.round;
        ctx.privateEvent([player.id], 'judge-request', 'Nach dieser Abstimmung folgt eine zweite.');
      },
      takeSecondVote(ctx) {
        const judge = ctx.players.find((p) => p.marks[REQUESTED] === ctx.state.round);
        if (!judge) return false;
        delete judge.marks[REQUESTED];
        ctx.publicEvent('second-vote', 'Der Richter verlangt eine zweite Abstimmung. Das Dorf stimmt heute noch einmal ab.');
        return true;
      },
    },
  ],
});
