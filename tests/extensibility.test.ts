/**
 * Test 14: Neue Rollen werden nur definiert und registriert. Weder Zustandsautomat
 * noch Nacht-, Todes- oder Siegsystem werden dafür angepasst.
 */
import { describe, expect, it } from 'vitest';
import { defineRole, validateConfig } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { WEREWOLF_ATTACK } from '../src/roles/werewolf';
import { NAMES, expectError, ok, player, setupGame, toVoting, use, voteAll } from './helpers';

const LAST_TARGET = 'protector.lastTarget';

/** Beschützer: schützt nachts einen Spieler vor den Werwölfen, nicht zweimal hintereinander denselben. */
const protector = defineRole({
  id: 'protector',
  name: 'Beschützer',
  description: 'Schützt jede Nacht einen Spieler vor den Werwölfen, aber nie zweimal hintereinander denselben.',
  faction: 'village',
  team: 'village',
  unique: true,
  abilities: [
    {
      id: 'protector.protect',
      name: 'Beschützen',
      trigger: 'night',
      step: 'protector',
      stepLabel: 'Der Beschützer',
      order: 45,
      priority: 150,
      input: { kind: 'players', min: 1, max: 1 },
      candidates: (ctx, actor) =>
        ctx
          .alivePlayers()
          .filter((p) => p.id !== actor.marks[LAST_TARGET])
          .map((p) => p.id),
      onSubmit: (_ctx, actor, input) => {
        actor.marks[LAST_TARGET] = input.targets[0];
      },
      resolve: (_ctx, action, night) => night.protect(action.targets[0], [WEREWOLF_ATTACK], action.actorIds[0]),
    },
  ],
});

/** Narr: neutrale Rolle mit eigener Siegbedingung, blockiert die Siege anderer nicht. */
const jester = defineRole({
  id: 'jester',
  name: 'Narr',
  description: 'Gewinnt allein, wenn das Dorf ihn verbannt.',
  faction: 'neutral',
  team: 'jester',
  unique: true,
  rules: [
    {
      id: 'jester-rules',
      teams: [{ id: 'jester', name: 'Narr', blocksOtherTeams: false }],
      winConditions: [
        {
          id: 'jester',
          priority: 5,
          check(ctx) {
            const fool = ctx.players.find((p) => p.roleId === 'jester' && p.death?.cause === 'vote');
            return fool ? { team: 'jester', winners: [fool.id], reason: 'Der Narr wurde verbannt.' } : null;
          },
        },
      ],
    },
  ],
});

const extendedRegistry = () => createDefaultRegistry().registerRole(protector).registerRole(jester);

describe('Erweiterbarkeit (Test 14)', () => {
  it('Beschützer wird ohne Änderungen am Phasensystem in die Nacht eingebunden', () => {
    const game = setupGame(['werewolf', 'protector', 'villager', 'villager', 'villager'], {
      registry: extendedRegistry(),
      rules: { tieBreak: 'none' },
    });
    expect(game.publicView().nightStep).toEqual({ id: 'protector', label: 'Der Beschützer' });
    ok(use(game, 'p2', 'protector.protect', ['p3']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(player(game, 'p3').alive).toBe(true);
    // Nacht 2: Gleiches Ziel ist nicht erlaubt.
    for (let i = 0; i < 3; i++) ok(game.dispatch({ type: 'ADVANCE' }));
    expectError(use(game, 'p2', 'protector.protect', ['p3']), 'INVALID_TARGET');
    ok(use(game, 'p2', 'protector.protect', ['p2']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(player(game, 'p3').alive).toBe(false);
  });

  it('neutrale Rolle bringt eigene Siegbedingung mit', () => {
    const game = setupGame(['werewolf', 'jester', 'seer', 'villager', 'villager'], { registry: extendedRegistry() });
    const seerResult = ok(use(game, 'p3', 'seer.investigate', ['p2']));
    expect(seerResult.ok && seerResult.events.find((e) => e.type === 'seer-result')?.text).toBe('Ben gehört nicht zu den Werwölfen.');
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    toVoting(game);
    voteAll(game, { p1: 'p2', p2: 'p1', p3: 'p2', p5: 'p2' }).forEach(ok);
    expect(game.result).toMatchObject({ team: 'jester', winners: ['p2'], conditionId: 'jester' });
  });

  it('neutrale Rollen lassen sich in der Konfiguration verbieten', () => {
    const registry = extendedRegistry();
    const input = { players: NAMES.slice(0, 5).map((name) => ({ name })), roles: { werewolf: 1, jester: 1, villager: 3 } };
    expect(validateConfig(input, registry)).toEqual([]);
    expect(validateConfig({ ...input, rules: { allowNeutralRoles: false } }, registry).join()).toContain('Neutrale Rollen');
    // Im Standardkatalog existiert die Rolle nicht.
    expect(validateConfig(input, createDefaultRegistry()).join()).toContain('existiert nicht im Rollenkatalog');
  });

  it('doppelte IDs werden bei der Registrierung abgewiesen', () => {
    expect(() => extendedRegistry().registerRole(protector)).toThrow('bereits registriert');
  });
});
