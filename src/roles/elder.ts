import { MARK_SILENCED, defineRole } from '../engine';
import { HUNTER_SHOT } from './hunter';
import { WEREWOLF_ATTACK } from './werewolf';
import { POISON } from './witch';

const SURVIVED = 'elder.survived';
/** Tötet das Dorf den Alten (Abstimmung, Gift, Jäger), verlieren alle Dorfbewohner ihre Fähigkeiten. */
const VILLAGE_CAUSES = ['vote', POISON, HUNTER_SHOT];

export const elder = defineRole({
  id: 'elder',
  name: 'Der Alte',
  description: 'Übersteht den ersten Angriff der Werwölfe. Tötet ihn aber das Dorf (Abstimmung, Hexe oder Jäger), verlieren alle Dorfbewohner ihre besonderen Fähigkeiten.',
  faction: 'village',
  team: 'village',
  unique: true,
  rules: [
    {
      id: 'elder-rules',
      onNightResolution(ctx, night) {
        for (const attack of night.attacks) {
          const target = ctx.player(attack.targetId);
          if (target.roleId !== 'elder' || attack.cause !== WEREWOLF_ATTACK || target.marks[SURVIVED] === true) continue;
          if (night.protectionFor(attack)) continue; // schon anderweitig geschützt: Extraleben bleibt erhalten
          night.protect(target.id, [WEREWOLF_ATTACK], target.id);
          target.marks[SURVIVED] = true;
          ctx.privateEvent([target.id], 'elder-survived', 'Die Werwölfe haben dich angegriffen, doch du hast überlebt. Ein zweites Mal geht das nicht.');
        }
      },
      onDeath(ctx, dead, death) {
        if (dead.roleId !== 'elder' || !VILLAGE_CAUSES.includes(death.cause)) return;
        const silenced = ctx.alivePlayers().filter((p) => ctx.faction(p) === 'village' && (ctx.role(p).abilities?.length ?? 0) > 0);
        for (const player of silenced) player.marks[MARK_SILENCED] = true;
        ctx.publicEvent('elder-curse', 'Das Dorf hat den Alten getötet. Alle Dorfbewohner verlieren ihre besonderen Fähigkeiten.', {
          playerIds: silenced.map((p) => p.id),
        });
      },
    },
  ],
});
