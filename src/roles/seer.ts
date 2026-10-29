import { defineRole, type AbilityDefinition } from '../engine';

interface SeerOptions {
  /** 'faction' = nur Werwolf ja/nein, 'role' = genaue Rolle (Originalregel). */
  result: 'faction' | 'role';
  canInspectSelf: boolean;
}

const investigate: AbilityDefinition = {
  id: 'seer.investigate',
  name: 'Spieler untersuchen',
  trigger: 'night',
  step: 'seer',
  stepLabel: 'Die Seherin',
  order: 40,
  input: { kind: 'players', min: 1, max: 1 },
  candidates(ctx, actor) {
    const options = ctx.options<SeerOptions>('seer');
    return ctx
      .alivePlayers()
      .filter((p) => options.canInspectSelf || p.id !== actor.id)
      .map((p) => p.id);
  },
  describe: () => ({ title: 'Wessen Gesinnung möchtest du sehen?' }),
  onSubmit(ctx, actor, input) {
    const target = ctx.player(input.targets[0]);
    const role = ctx.role(target);
    const options = ctx.options<SeerOptions>('seer');
    const apparent = role.appearsAs?.(ctx, target) ?? role.faction;
    const text =
      options.result === 'role'
        ? `${target.name} ist: ${role.name}.`
        : apparent === 'werewolves'
          ? `${target.name} gehört zu den Werwölfen.`
          : `${target.name} gehört nicht zu den Werwölfen.`;
    // Nur die Seherin sieht das Ergebnis.
    ctx.privateEvent([actor.id], 'seer-result', text, {
      targetId: target.id,
      isWerewolf: apparent === 'werewolves',
      ...(options.result === 'role' ? { roleId: role.id } : {}),
    });
  },
};

export const seer = defineRole({
  id: 'seer',
  name: 'Seherin',
  description: 'Untersucht jede Nacht einen Spieler und erfährt, ob er zu den Werwölfen gehört. Sie kann ihr Wissen tagsüber teilen.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [investigate],
  defaultOptions: { result: 'faction', canInspectSelf: false } satisfies SeerOptions,
});
