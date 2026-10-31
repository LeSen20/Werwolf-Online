import { defineRole, type KnownInfo, type PlayerState } from '../engine';

const ENCHANTED = 'piper.enchanted';
export const PIPER_TEAM = 'piper';

const isEnchanted = (player: PlayerState) => player.marks[ENCHANTED] === true;

export const piper = defineRole({
  id: 'piper',
  name: 'Flötenspieler',
  description: 'Verzaubert jede Nacht zwei Spieler. Er gewinnt allein, sobald alle anderen Lebenden verzaubert sind.',
  faction: 'neutral',
  team: PIPER_TEAM,
  unique: true,
  abilities: [
    {
      id: 'piper.enchant',
      name: 'Verzaubern',
      trigger: 'night',
      step: 'piper',
      stepLabel: 'Der Flötenspieler',
      order: 70,
      input: { kind: 'players', min: 1, max: 2 },
      candidates: (ctx, actor) => ctx.alivePlayers().filter((p) => p.id !== actor.id && !isEnchanted(p)).map((p) => p.id),
      describe: () => ({ title: 'Wen verzauberst du heute Nacht?', info: ['Wähle zwei Spieler, die noch nicht verzaubert sind.'] }),
      // Zwei pro Nacht, nur wenn bloß noch einer übrig ist, einer.
      minTargets: (ctx, actor) => Math.min(2, ctx.alivePlayers().filter((p) => p.id !== actor.id && !isEnchanted(p)).length),
      onSubmit(ctx, actor, input) {
        for (const id of input.targets) ctx.player(id).marks[ENCHANTED] = true;
        ctx.privateEvent([actor.id], 'piper-enchant', `Du verzauberst ${input.targets.map((id) => ctx.name(id)).join(' und ')}.`);
        ctx.privateEvent(input.targets, 'enchanted', 'Du wurdest vom Flötenspieler verzaubert.');
      },
    },
  ],
  rules: [
    {
      id: 'piper-rules',
      teams: [{ id: PIPER_TEAM, name: 'Flötenspieler' }],
      winConditions: [
        {
          id: 'piper',
          priority: 10,
          check(ctx) {
            const piper = ctx.alivePlayers().find((p) => p.roleId === 'piper');
            if (!piper) return null;
            const others = ctx.alivePlayers().filter((p) => p.id !== piper.id);
            return others.length > 0 && others.every(isEnchanted)
              ? { team: PIPER_TEAM, winners: [piper.id], reason: 'Alle Überlebenden sind verzaubert. Der Flötenspieler führt sie aus dem Dorf.' }
              : null;
          },
        },
      ],
      // Verzauberte erkennen sich gegenseitig, der Flötenspieler kennt sie alle.
      knowledge(ctx, viewer) {
        if (!isEnchanted(viewer) && viewer.roleId !== 'piper') return [];
        return ctx.players
          .filter((p) => p.id !== viewer.id && isEnchanted(p))
          .map((p): KnownInfo => ({ playerId: p.id, label: 'Verzaubert', kind: 'enchanted' }));
      },
    },
  ],
});
