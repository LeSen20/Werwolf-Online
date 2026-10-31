/**
 * Rollen, die im Spiel zu Werwölfen werden können, ohne ihre Karte zu tauschen:
 * Wolfshund (wählt in der ersten Nacht), Wildes Kind (wenn sein Vorbild stirbt).
 */
import { MARK_FACTION, MARK_TEAM, defineRole, type EngineContext, type PlayerState } from '../engine';
import { WEREWOLF_PACK_TAG } from './werewolf';

/** Macht einen Spieler zum Werwolf: wacht mit dem Rudel, gewinnt mit ihm, gilt bei Untersuchungen als Werwolf. */
export function turnWerewolf(ctx: EngineContext, player: PlayerState, reason: string): void {
  ctx.addTag(player, WEREWOLF_PACK_TAG);
  player.marks[MARK_FACTION] = 'werewolves';
  player.marks[MARK_TEAM] = 'werewolves';
  ctx.privateEvent([player.id], 'turned-werewolf', `${reason} Du gehörst jetzt zu den Werwölfen und wachst nachts mit dem Rudel auf.`);
  const pack = ctx.players.filter((p) => p.alive && p.id !== player.id && ctx.hasTag(p, WEREWOLF_PACK_TAG)).map((p) => p.id);
  if (pack.length > 0) ctx.privateEvent(pack, 'pack-joined', `${player.name} gehört jetzt zum Rudel.`, { playerId: player.id });
}

export const wolfhound = defineRole({
  id: 'wolfhound',
  name: 'Wolfshund',
  description: 'Entscheidet in der ersten Nacht, ob er Dorfbewohner bleibt oder ein Werwolf wird.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [
    {
      id: 'wolfhound.choose',
      name: 'Seite wählen',
      trigger: 'night',
      step: 'wolfhound',
      stepLabel: 'Der Wolfshund',
      order: 12,
      nights: 'first',
      maxUses: 1,
      input: { kind: 'choice' },
      choices: () => [
        { id: 'village', label: 'Dorfbewohner bleiben' },
        { id: 'werewolf', label: 'Werwolf werden' },
      ],
      describe: () => ({ title: 'Wolf oder Hund?', info: ['Als Werwolf wachst du ab sofort mit dem Rudel auf und gewinnst mit ihm.'] }),
      onSubmit(ctx, actor, input) {
        if (input.choice === 'werewolf') turnWerewolf(ctx, actor, 'Du hast dich für die Wölfe entschieden.');
        else ctx.privateEvent([actor.id], 'wolfhound-village', 'Du bleibst ein treuer Hund des Dorfes.');
      },
      onTimeout: () => ({ targets: [], choice: 'village' }),
    },
  ],
});

const ROLE_MODEL = 'wildChild.model';

export const wildChild = defineRole({
  id: 'wild-child',
  name: 'Wildes Kind',
  description: 'Wählt in der ersten Nacht ein Vorbild. Solange es lebt, gehört das Kind zum Dorf. Stirbt das Vorbild, wird es ein Werwolf.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [
    {
      id: 'wild-child.model',
      name: 'Vorbild wählen',
      trigger: 'night',
      step: 'wild-child',
      stepLabel: 'Das wilde Kind',
      order: 14,
      nights: 'first',
      maxUses: 1,
      input: { kind: 'players', min: 1, max: 1 },
      describe: () => ({ title: 'Wer ist dein Vorbild?', info: ['Stirbt dein Vorbild, wirst du ein Werwolf.'] }),
      onSubmit(ctx, actor, input) {
        actor.marks[ROLE_MODEL] = input.targets[0];
        ctx.privateEvent([actor.id], 'wild-child-model', `${ctx.name(input.targets[0])} ist dein Vorbild.`, { targetId: input.targets[0] });
      },
      onTimeout(ctx, actor) {
        const others = ctx.alivePlayers().filter((p) => p.id !== actor.id);
        return others.length > 0 ? { targets: [ctx.pick(others).id], choice: null } : null;
      },
    },
  ],
  rules: [
    {
      id: 'wild-child-rules',
      onDeath(ctx, dead) {
        for (const child of ctx.alivePlayers()) {
          if (child.roleId === 'wild-child' && child.marks[ROLE_MODEL] === dead.id && ctx.faction(child) !== 'werewolves') {
            turnWerewolf(ctx, child, `Dein Vorbild ${dead.name} ist tot.`);
          }
        }
      },
      knowledge: (ctx, viewer) => {
        const model = viewer.marks[ROLE_MODEL];
        return viewer.roleId === 'wild-child' && typeof model === 'string' ? [{ playerId: model, label: 'Dein Vorbild', kind: 'role-model' }] : [];
      },
    },
  ],
});
