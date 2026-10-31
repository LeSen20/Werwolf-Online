import { defineRole, type AbilityDefinition, type RoleDefinition } from '../engine';

/** Geschwister wachen in der ersten Nacht auf und erkennen sich (wie die Verliebten). */
function siblings(id: string, name: string, plural: string, copies: number, description: string): RoleDefinition {
  const meet: AbilityDefinition = {
    id: `${id}.meet`,
    name: 'Geschwister erkennen',
    trigger: 'night',
    step: id,
    stepLabel: plural,
    order: 32,
    nights: 'first',
    input: { kind: 'confirm' },
    describe(ctx, actor) {
      const others = ctx.players.filter((p) => p.id !== actor.id && p.roleId === id).map((p) => p.name);
      return { title: `${plural} erkennen sich`, info: [`${others.join(' und ')} ${others.length === 1 ? 'gehört' : 'gehören'} zu euch.`] };
    },
    onTimeout: () => ({ targets: [], choice: null }),
  };
  return defineRole({
    id,
    name,
    description,
    faction: 'village',
    team: 'village',
    copies,
    abilities: [meet],
    rules: [
      {
        id: `${id}-knowledge`,
        knowledge: (ctx, viewer) =>
          viewer.roleId !== id ? [] : ctx.players.filter((p) => p.id !== viewer.id && p.roleId === id).map((p) => ({ playerId: p.id, label: name, kind: 'siblings' })),
      },
    ],
  });
}

export const sisters = siblings('sister', 'Schwester', 'Die Schwestern', 2, 'Die zwei Schwestern kennen sich und können einander vertrauen. Es gibt sie nur zu zweit.');
export const brothers = siblings('brother', 'Bruder', 'Die Brüder', 3, 'Die drei Brüder kennen sich und können einander vertrauen. Es gibt sie nur zu dritt.');
