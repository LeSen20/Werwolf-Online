/** Rollen, die mit der Sitzordnung arbeiten (Spielerliste im Kreis): Fuchs, Bärenführer, Ritter. */
import { MARK_SILENCED, defineRole } from '../engine';
import { WEREWOLF_ATTACK, WEREWOLF_PACK_TAG } from './werewolf';

const FOX_LOST = 'fox.lost';

export const fox = defineRole({
  id: 'fox',
  name: 'Fuchs',
  description: 'Wittert nachts an einem Spieler und dessen zwei Sitznachbarn, ob ein Werwolf darunter ist. Findet er keinen, verliert er seine Nase.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [
    {
      id: 'fox.sniff',
      name: 'Wittern',
      trigger: 'night',
      step: 'fox',
      stepLabel: 'Der Fuchs',
      order: 42,
      optional: true,
      input: { kind: 'players', min: 1, max: 1 },
      candidates: (ctx) => ctx.alivePlayers().map((p) => p.id),
      isAvailable: (_ctx, actor) => actor.marks[FOX_LOST] !== true,
      describe: () => ({ title: 'An wem witterst du?', info: ['Geprüft werden der Spieler und seine beiden lebenden Sitznachbarn.'] }),
      onSubmit(ctx, actor, input) {
        const center = ctx.player(input.targets[0]);
        const group = [center, ...ctx.neighbors(center.id)];
        const names = group.map((p) => p.name).join(', ');
        if (group.some((p) => ctx.apparentFaction(p) === 'werewolves')) {
          ctx.privateEvent([actor.id], 'fox-result', `Unter ${names} ist mindestens ein Werwolf.`, { playerIds: group.map((p) => p.id), found: true });
        } else {
          actor.marks[FOX_LOST] = true;
          ctx.privateEvent([actor.id], 'fox-result', `Unter ${names} ist kein Werwolf. Du verlierst deine Spürnase.`, {
            playerIds: group.map((p) => p.id),
            found: false,
          });
        }
      },
    },
  ],
});

export const bearTamer = defineRole({
  id: 'bear-tamer',
  name: 'Bärenführer',
  description: 'Sitzt morgens ein Werwolf direkt neben ihm, brummt sein Bär, und alle hören es.',
  faction: 'village',
  team: 'village',
  unique: true,
  rules: [
    {
      id: 'bear-tamer-rules',
      onDayStart(ctx) {
        for (const tamer of ctx.alivePlayers()) {
          if (tamer.roleId !== 'bear-tamer' || tamer.marks[MARK_SILENCED] === true) continue;
          if (ctx.neighbors(tamer.id).some((p) => ctx.apparentFaction(p) === 'werewolves')) {
            ctx.publicEvent('bear-growl', `Der Bär von ${tamer.name} brummt: Neben ${tamer.name} sitzt ein Werwolf.`, { playerId: tamer.id });
          } else {
            ctx.publicEvent('bear-quiet', `Der Bär von ${tamer.name} bleibt ruhig.`, { playerId: tamer.id });
          }
        }
      },
    },
  ],
});

export const RUSTY_SWORD = 'rusty-sword';
/** Runde, in deren Nacht der vom Ritter verwundete Werwolf stirbt. */
const DOOMED = 'knight.doomedRound';

export const knight = defineRole({
  id: 'knight',
  name: 'Ritter mit dem rostigen Schwert',
  description: 'Fressen ihn die Werwölfe, verwundet er den nächsten Werwolf links von ihm. Dieser stirbt in der folgenden Nacht.',
  faction: 'village',
  team: 'village',
  unique: true,
  deathCauses: { [RUSTY_SWORD]: 'Rostiges Schwert' },
  rules: [
    {
      id: 'knight-rules',
      onDeath(ctx, dead, death) {
        if (dead.roleId !== 'knight' || death.cause !== WEREWOLF_ATTACK || dead.marks[MARK_SILENCED] === true) return;
        const wolf = ctx.nextToLeft(dead.id, (p) => ctx.hasTag(p, WEREWOLF_PACK_TAG));
        if (!wolf) return;
        wolf.marks[DOOMED] = ctx.state.round + 1;
        ctx.debug(`Der Ritter verwundet ${wolf.name}.`);
      },
      onNightResolution(ctx, night) {
        for (const wolf of ctx.alivePlayers()) {
          if (wolf.marks[DOOMED] === ctx.state.round) night.attack(wolf.id, RUSTY_SWORD);
        }
      },
    },
  ],
});
