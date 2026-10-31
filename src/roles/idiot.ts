import { MARK_NO_VOTE, defineRole } from '../engine';

const REVEALED = 'idiot.revealed';

export const idiot = defineRole({
  id: 'idiot',
  name: 'Dorfdepp',
  description: 'Wird er vom Dorf verbannt, erkennt man ihn als Dorfdepp und verschont ihn. Danach darf er nicht mehr abstimmen, aber weiter mitreden.',
  faction: 'village',
  team: 'village',
  unique: true,
  rules: [
    {
      id: 'idiot-rules',
      preventVoteElimination(ctx, player) {
        if (player.roleId !== 'idiot' || player.marks[REVEALED] === true) return false;
        player.marks[REVEALED] = true;
        player.marks[MARK_NO_VOTE] = true;
        ctx.publicEvent('idiot-revealed', `${player.name} ist der Dorfdepp! Das Dorf verschont ihn, doch er darf nicht mehr abstimmen.`, {
          playerId: player.id,
        });
        return true;
      },
    },
  ],
});
