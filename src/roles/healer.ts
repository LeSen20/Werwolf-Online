import { defineRole } from '../engine';
import { WEREWOLF_ATTACK } from './werewolf';

/** Wen der Heiler zuletzt beschützt hat (nie zweimal hintereinander denselben). */
const LAST_PROTECTED = 'healer.last';

export const healer = defineRole({
  id: 'healer',
  name: 'Heiler',
  description: 'Schützt jede Nacht einen Spieler vor den Werwölfen, auch sich selbst, aber nie zweimal hintereinander denselben. Gegen Gift hilft das nicht.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [
    {
      id: 'healer.protect',
      name: 'Beschützen',
      trigger: 'night',
      step: 'healer',
      stepLabel: 'Der Heiler',
      order: 45,
      priority: 150,
      input: { kind: 'players', min: 1, max: 1 },
      candidates: (ctx, actor) => ctx.alivePlayers().filter((p) => p.id !== actor.marks[LAST_PROTECTED]).map((p) => p.id),
      describe(ctx, actor) {
        const last = actor.marks[LAST_PROTECTED];
        return {
          title: 'Wen beschützt du heute Nacht?',
          info: typeof last === 'string' ? [`${ctx.name(last)} hast du letzte Nacht beschützt und darfst ihn heute nicht wählen.`] : [],
        };
      },
      onSubmit(_ctx, actor, input) {
        actor.marks[LAST_PROTECTED] = input.targets[0];
      },
      onSkip(_ctx, actor) {
        delete actor.marks[LAST_PROTECTED];
      },
      resolve: (_ctx, action, night) => night.protect(action.targets[0], [WEREWOLF_ATTACK], action.actorIds[0]),
    },
  ],
});
