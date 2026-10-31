/** Besondere Werwölfe: Urwolf, Großer böser Wolf, Weißer Werwolf. Alle wachen mit dem Rudel auf. */
import { defineRole, type EngineContext } from '../engine';
import { turnWerewolf } from './converts';
import { WEREWOLF_ATTACK, WEREWOLF_PACK_TAG, getWerewolfTargets } from './werewolf';

const INFECT = 'urwolf.infect';
/** Ein Spieler mit Werwolf-Gesinnung ist gestorben (der große böse Wolf verliert dann seine Kraft). */
const wolfHasDied = (ctx: EngineContext) => ctx.players.some((p) => !p.alive && ctx.faction(p) === 'werewolves');

export const urwolf = defineRole({
  id: 'urwolf',
  name: 'Urwolf',
  description: 'Jagt mit dem Rudel. Einmal pro Partie kann er das Opfer der Werwölfe anstecken statt es zu fressen: Es wird heimlich selbst ein Werwolf.',
  faction: 'werewolves',
  team: 'werewolves',
  unique: true,
  tags: [WEREWOLF_PACK_TAG],
  abilities: [
    {
      id: INFECT,
      name: 'Anstecken',
      trigger: 'night',
      after: ['werewolves'],
      step: 'urwolf',
      stepLabel: 'Der Urwolf',
      order: 51,
      priority: 90,
      maxUses: 1,
      optional: true,
      input: { kind: 'confirm' },
      isAvailable: (ctx) => getWerewolfTargets(ctx).some((id) => !ctx.hasTag(ctx.player(id), WEREWOLF_PACK_TAG)),
      describe: (ctx) => ({
        title: 'Opfer anstecken?',
        info: [`Statt ${getWerewolfTargets(ctx).map((id) => ctx.name(id)).join(', ')} zu fressen, wird es ein Werwolf. Nur einmal pro Partie.`],
      }),
      resolve(ctx, action, night) {
        for (const id of getWerewolfTargets(ctx)) {
          const victim = ctx.player(id);
          if (!victim.alive || ctx.hasTag(victim, WEREWOLF_PACK_TAG)) continue;
          night.protect(id, [WEREWOLF_ATTACK], action.actorIds[0] ?? null);
          turnWerewolf(ctx, victim, 'Der Urwolf hat dich angesteckt. Deine bisherige Fähigkeit behältst du.');
        }
      },
    },
  ],
});

export const bigBadWolf = defineRole({
  id: 'big-bad-wolf',
  name: 'Großer böser Wolf',
  description: 'Jagt mit dem Rudel und frisst danach allein ein zweites Opfer, solange noch kein Werwolf gestorben ist.',
  faction: 'werewolves',
  team: 'werewolves',
  unique: true,
  tags: [WEREWOLF_PACK_TAG],
  abilities: [
    {
      id: 'big-bad-wolf.kill',
      name: 'Zweites Opfer',
      trigger: 'night',
      after: ['werewolves'],
      step: 'big-bad-wolf',
      stepLabel: 'Der große böse Wolf',
      order: 55,
      optional: true,
      input: { kind: 'players', min: 1, max: 1 },
      isAvailable: (ctx) => !wolfHasDied(ctx),
      candidates: (ctx) =>
        ctx
          .alivePlayers()
          .filter((p) => !ctx.hasTag(p, WEREWOLF_PACK_TAG) && !getWerewolfTargets(ctx).includes(p.id))
          .map((p) => p.id),
      describe: () => ({ title: 'Wen frisst du zusätzlich?', info: ['Das geht, solange noch kein Werwolf gestorben ist.'] }),
      resolve: (_ctx, action, night) => night.attack(action.targets[0], WEREWOLF_ATTACK, action.actorIds[0] ?? null),
    },
  ],
});

export const WHITE_WOLF_TEAM = 'white-werewolf';
export const WHITE_WOLF_ATTACK = 'white-werewolf';

export const whiteWerewolf = defineRole({
  id: 'white-werewolf',
  name: 'Weißer Werwolf',
  description: 'Jagt mit dem Rudel, will aber allein überleben: In jeder zweiten Nacht darf er heimlich einen Werwolf töten. Er gewinnt nur als letzter Überlebender.',
  faction: 'werewolves',
  team: WHITE_WOLF_TEAM,
  unique: true,
  tags: [WEREWOLF_PACK_TAG],
  deathCauses: { [WHITE_WOLF_ATTACK]: 'Weißer Werwolf' },
  abilities: [
    {
      id: 'white-werewolf.kill',
      name: 'Werwolf töten',
      trigger: 'night',
      step: 'white-werewolf',
      stepLabel: 'Der weiße Werwolf',
      order: 56,
      optional: true,
      input: { kind: 'players', min: 1, max: 1 },
      isAvailable: (ctx) => ctx.state.round % 2 === 0,
      candidates: (ctx, actor) => ctx.alivePlayers().filter((p) => p.id !== actor.id && ctx.hasTag(p, WEREWOLF_PACK_TAG)).map((p) => p.id),
      describe: () => ({ title: 'Welchen Werwolf tötest du?', info: ['Nur in jeder zweiten Nacht.'] }),
      resolve: (_ctx, action, night) => night.attack(action.targets[0], WHITE_WOLF_ATTACK, action.actorIds[0] ?? null),
    },
  ],
  rules: [
    {
      id: 'white-werewolf-rules',
      teams: [{ id: WHITE_WOLF_TEAM, name: 'Weißer Werwolf' }],
      winConditions: [
        {
          id: 'white-werewolf',
          priority: 6,
          check(ctx) {
            const alive = ctx.alivePlayers();
            return alive.length === 1 && alive[0].roleId === 'white-werewolf'
              ? { team: WHITE_WOLF_TEAM, winners: [alive[0].id], reason: 'Der weiße Werwolf hat als Letzter überlebt.' }
              : null;
          },
        },
      ],
    },
  ],
});

export const ANGEL_TEAM = 'angel';

export const angel = defineRole({
  id: 'angel',
  name: 'Engel',
  description: 'Will sterben: Wird er bei der ersten Abstimmung verbannt, gewinnt er allein. Danach spielt er als Dorfbewohner.',
  faction: 'neutral',
  team: ANGEL_TEAM,
  unique: true,
  rules: [
    {
      id: 'angel-rules',
      teams: [{ id: ANGEL_TEAM, name: 'Engel' }],
      // Nach der ersten Abstimmung ist der Engel ein gewöhnlicher Dorfbewohner.
      teamModifier: (ctx, player, team) =>
        team === ANGEL_TEAM && (ctx.state.round > 1 || ctx.state.events.some((e) => e.type === 'vote-result')) ? 'village' : team,
      winConditions: [
        {
          id: 'angel',
          priority: 5,
          check(ctx) {
            const angel = ctx.players.find((p) => p.roleId === 'angel' && p.death?.cause === 'vote' && p.death.round === 1);
            return angel ? { team: ANGEL_TEAM, winners: [angel.id], reason: 'Der Engel wurde gleich am ersten Tag verbannt und kehrt in den Himmel zurück.' } : null;
          },
        },
      ],
    },
  ],
});
