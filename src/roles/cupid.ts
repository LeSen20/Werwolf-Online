import { defineRole, type AbilityDefinition, type KnownInfo, type PlayerId, type PlayerState, type RuleModule } from '../engine';

export const LOVER_GRIEF = 'lover';
const LOVER_MARK = 'loverId';
const COUPLE_MARK = 'cupid.couple';

interface CupidOptions {
  canChooseSelf: boolean;
}

export function getLoverId(player: PlayerState): PlayerId | null {
  const value = player.marks[LOVER_MARK];
  return typeof value === 'string' ? value : null;
}

const link: AbilityDefinition = {
  id: 'cupid.link',
  name: 'Liebespaar bestimmen',
  trigger: 'night',
  step: 'cupid',
  stepLabel: 'Amor',
  order: 20,
  nights: 'first',
  maxUses: 1,
  input: { kind: 'players', min: 2, max: 2 },
  candidates(ctx, actor) {
    const options = ctx.options<CupidOptions>('cupid');
    return ctx
      .alivePlayers()
      .filter((p) => options.canChooseSelf || p.id !== actor.id)
      .map((p) => p.id);
  },
  describe: () => ({ title: 'Wähle zwei Spieler, die sich ineinander verlieben' }),
  validate: (ctx, _actor, input) =>
    input.targets.some((id) => getLoverId(ctx.player(id))) ? 'Ein gewählter Spieler ist bereits verliebt.' : null,
  onSubmit(ctx, actor, input) {
    const [a, b] = input.targets.map((id) => ctx.player(id));
    a.marks[LOVER_MARK] = b.id;
    b.marks[LOVER_MARK] = a.id;
    actor.marks[COUPLE_MARK] = [a.id, b.id];
    ctx.privateEvent([actor.id], 'cupid-linked', `${a.name} und ${b.name} sind jetzt ein Liebespaar.`);
    for (const [lover, partner] of [
      [a, b],
      [b, a],
    ]) {
      ctx.privateEvent([lover.id], 'lover-info', `Du bist in ${partner.name} verliebt. Stirbt ${partner.name}, stirbst du vor Kummer ebenfalls.`, {
        partnerId: partner.id,
      });
    }
  },
};

/** Die Verliebten wachen kurz auf und erkennen sich (in der Online-Version nur eine Bestätigung). */
const meet: AbilityDefinition = {
  id: 'cupid.lovers',
  name: 'Partner erkennen',
  trigger: 'night',
  after: ['cupid'],
  step: 'lovers',
  stepLabel: 'Die Verliebten',
  order: 30,
  nights: 'first',
  input: { kind: 'confirm' },
  actors: (ctx) => ctx.alivePlayers().filter((p) => getLoverId(p)).map((p) => p.id),
  describe(ctx, actor) {
    const partnerId = getLoverId(actor);
    return { title: 'Ihr seid verliebt', info: partnerId ? [`Du bist in ${ctx.name(partnerId)} verliebt.`] : [] };
  },
  onTimeout: () => ({ targets: [], choice: null }),
};

/** Liebespaar-Mechanik: Todesverknüpfung und gegenseitiges Wissen. */
const loversRule: RuleModule = {
  id: 'lovers',
  deathCauses: { [LOVER_GRIEF]: 'Liebeskummer' },
  onDeath(ctx, dead) {
    const partnerId = getLoverId(dead);
    // Bereits tote Partner werden übersprungen, dadurch kann keine Endlosschleife entstehen.
    if (partnerId && ctx.player(partnerId).alive) {
      ctx.publicEvent('lover-grief', `${ctx.name(partnerId)} stirbt vor Kummer.`, { playerId: partnerId });
      ctx.kill(partnerId, LOVER_GRIEF, dead.id);
    }
  },
  knowledge(_ctx, viewer) {
    const known: KnownInfo[] = [];
    const partnerId = getLoverId(viewer);
    if (partnerId) known.push({ playerId: partnerId, label: 'Dein Partner (verliebt)', kind: 'lover' });
    const couple = viewer.marks[COUPLE_MARK];
    if (Array.isArray(couple)) {
      for (const id of couple) if (typeof id === 'string') known.push({ playerId: id, label: 'Verliebt', kind: 'couple' });
    }
    return known;
  },
};

export const cupid = defineRole({
  id: 'cupid',
  name: 'Amor',
  description: 'Bestimmt in der ersten Nacht zwei Spieler, die sich ineinander verlieben. Stirbt einer der beiden, stirbt der andere vor Kummer.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [link, meet],
  defaultOptions: { canChooseSelf: true } satisfies CupidOptions,
  rules: [loversRule],
});
