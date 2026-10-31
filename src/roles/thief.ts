import { defineRole, type AbilityDefinition, type Choice, type EngineContext } from '../engine';

export const KEEP_THIEF = 'keep';

interface ThiefOptions {
  /** Originalregel: Sind beide Karten Werwölfe, muss der Dieb eine davon nehmen. */
  mustTakeWerewolf: boolean;
}

function mustTakeWerewolf(ctx: EngineContext): boolean {
  const extras = ctx.state.extraCards;
  return (
    ctx.options<ThiefOptions>('thief').mustTakeWerewolf &&
    extras.length > 0 &&
    extras.every((roleId) => ctx.registry.getRole(roleId).faction === 'werewolves')
  );
}

const steal: AbilityDefinition = {
  id: 'thief.steal',
  name: 'Karte tauschen',
  trigger: 'night',
  step: 'thief',
  stepLabel: 'Der Dieb',
  order: 10,
  nights: 'first',
  maxUses: 1,
  input: { kind: 'choice' },
  choices(ctx, actor) {
    const choices: Choice[] = [];
    for (const roleId of ctx.state.extraCards) {
      if (roleId === actor.roleId || choices.some((c) => c.id === roleId)) continue;
      choices.push({ id: roleId, label: ctx.roleName(roleId) });
    }
    // Ersatzregel: Ohne gültige Karte (oder freiwillig) bleibt der Dieb Dieb und spielt wie ein Dorfbewohner.
    if (!mustTakeWerewolf(ctx)) choices.push({ id: KEEP_THIEF, label: 'Dieb bleiben (spielt als Dorfbewohner)' });
    return choices;
  },
  describe(ctx) {
    const info = [`Die übrigen Karten: ${ctx.state.extraCards.map((r) => ctx.roleName(r)).join(' und ')}.`];
    if (mustTakeWerewolf(ctx)) info.push('Beide Karten sind Werwölfe – du musst eine davon nehmen.');
    return { title: 'Willst du deine Karte tauschen?', info };
  },
  onSubmit(ctx, actor, input) {
    const roleId = input.choice;
    if (!roleId || roleId === KEEP_THIEF) {
      ctx.privateEvent([actor.id], 'thief-kept', 'Du bleibst Dieb und spielst als einfacher Dorfbewohner.');
      return;
    }
    // Karten tauschen: Die Diebkarte kommt zu den übrigen Karten, der Stapel bleibt konsistent.
    const index = ctx.state.extraCards.indexOf(roleId);
    ctx.state.extraCards[index] = actor.roleId;
    ctx.changeRole(actor.id, roleId);
    ctx.privateEvent([actor.id], 'thief-swapped', `Du hast die Karte genommen und bist jetzt: ${ctx.roleName(roleId)}.`, { roleId });
  },
  onTimeout(ctx) {
    if (mustTakeWerewolf(ctx)) return { targets: [], choice: ctx.pick(ctx.state.extraCards) };
    return { targets: [], choice: KEEP_THIEF };
  },
};

export const thief = defineRole({
  id: 'thief',
  name: 'Dieb',
  description: 'Darf in der ersten Nacht seine Karte gegen eine der zwei übrigen Karten tauschen und spielt dann diese Rolle. Ohne Tausch spielt er als Dorfbewohner.',
  faction: 'village',
  team: 'village',
  unique: true,
  extraCards: 2,
  abilities: [steal],
  defaultOptions: { mustTakeWerewolf: true } satisfies ThiefOptions,
});
