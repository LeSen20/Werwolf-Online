import { describe, expect, it } from 'vitest';
import { ConfigError, Game, buildAutoDeck, suggestWerewolfCount, validateConfig, type GameConfigInput } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { NAMES, ok, setupGame } from './helpers';

const registry = createDefaultRegistry();
const players = (n: number) => NAMES.slice(0, n).map((name) => ({ name }));

describe('Spielkonfiguration und Rollenverteilung', () => {
  it('startet eine Partie mit gültiger Konfiguration (Test 1)', () => {
    const game = Game.create({ players: players(6), roles: { werewolf: 1, seer: 1, witch: 1, villager: 3 }, seed: 7 }, registry);
    expect(game.phase).toBe('SETUP');
    ok(game.dispatch({ type: 'START_GAME' }));
    expect(game.phase).toBe('ROLE_DISTRIBUTION');
    ok(game.dispatch({ type: 'ADVANCE' }));
    expect(game.phase).toBe('NIGHT_ACTIONS');
    expect(game.publicView().round).toBe(1);
  });

  it('gibt jedem Spieler genau eine Rolle, Stapel bleibt konsistent (Test 2)', () => {
    const deck = { werewolf: 2, seer: 1, witch: 1, hunter: 1, thief: 1, villager: 4 };
    for (let seed = 1; seed <= 30; seed++) {
      const game = Game.create({ players: players(8), roles: deck, seed }, registry);
      ok(game.dispatch({ type: 'START_GAME' }));
      const state = game.snapshot();
      expect(state.players.every((p) => registry.hasRole(p.roleId) && p.roleId === p.originalRoleId)).toBe(true);
      expect(state.extraCards).toHaveLength(2);
      const dealt = [...state.players.map((p) => p.roleId), ...state.extraCards].sort();
      const expected = Object.entries(deck).flatMap(([roleId, n]) => Array<string>(n).fill(roleId)).sort();
      expect(dealt).toEqual(expected);
      // Jeder Spieler sieht nur seine eigene Rolle.
      for (const p of state.players) {
        const view = game.viewFor(p.id);
        expect(view.self.role?.id).toBe(p.roleId);
        const otherRoles = view.players.filter((x) => x.id !== p.id && x.role !== null);
        expect(otherRoles).toHaveLength(0);
      }
    }
  });

  it('verteilt zufällig, aber reproduzierbar über den Seed', () => {
    const config: GameConfigInput = { players: players(8), roles: { werewolf: 2, seer: 1, villager: 5 }, seed: 123 };
    const deal = (input: GameConfigInput) => {
      const game = Game.create(input, registry);
      ok(game.dispatch({ type: 'START_GAME' }));
      return game.snapshot().players.map((p) => p.roleId).join(',');
    };
    expect(deal(config)).toBe(deal(config));
    const variants = new Set(Array.from({ length: 10 }, (_, i) => deal({ ...config, seed: i + 1 })));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('legt nie alle Werwölfe zu den Dieb-Karten', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const game = Game.create({ players: players(5), roles: { werewolf: 1, thief: 1, villager: 5 }, seed }, registry);
      ok(game.dispatch({ type: 'START_GAME' }));
      expect(game.snapshot().players.some((p) => p.roleId === 'werewolf')).toBe(true);
    }
  });

  it('weist ungültige Konfigurationen mit verständlichen Meldungen ab', () => {
    const issues = (input: Partial<GameConfigInput>) =>
      validateConfig({ players: players(6), roles: { werewolf: 1, villager: 5 }, ...input }, registry);

    expect(issues({})).toEqual([]);
    expect(issues({ roles: { werewolf: 1, villager: 4, magier: 1 } }).join()).toContain('existiert nicht im Rollenkatalog');
    expect(issues({ roles: { werewolf: 1, seer: 2, villager: 3 } }).join()).toContain('höchstens einmal');
    expect(issues({ roles: { werewolf: 1, villager: 4 } }).join()).toContain('Benötigt werden 6 Rollenkarten');
    expect(issues({ roles: { villager: 6 } }).join()).toContain('mindestens ein Werwolf');
    expect(issues({ roles: { villager: 6 }, rules: { requireWerewolves: false } })).toEqual([]);
    expect(issues({ roles: { werewolf: 3, villager: 3 } }).join()).toContain('Zu viele Werwölfe');
    expect(issues({ roles: { werewolf: 1, thief: 1, villager: 4 } }).join()).toContain('2 Zusatzkarten');
    expect(issues({ players: [{ name: 'Anna' }, { name: 'anna' }, { name: 'Ben' }], roles: { werewolf: 1, villager: 2 } }).join()).toContain('doppelt');
    expect(issues({ players: players(2), roles: { werewolf: 1, villager: 1 } }).join()).toContain('Mindestens 3 Spieler');
    expect(issues({ rules: { tieBreak: 'würfeln' as never } }).join()).toContain('tieBreak');
    expect(issues({ options: { magier: {} } }).join()).toContain('unbekannte Rolle oder Regel');
    expect(issues({ fixedRoles: { p1: 'seer' } }).join()).toContain('Feste Rollen');
  });

  it('Game.create wirft ConfigError mit allen Problemen', () => {
    expect(() => Game.create({ players: players(2), roles: { villager: 2 } }, registry)).toThrow(ConfigError);
    try {
      Game.create({ players: players(2), roles: { villager: 2 } }, registry);
    } catch (error) {
      expect((error as ConfigError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('stellt automatisch einen gültigen Stapel zusammen', () => {
    expect(suggestWerewolfCount(8)).toBe(2);
    const deck = buildAutoDeck(registry, { playerCount: 8, werewolves: 2, specialRoles: ['seer', 'witch', 'thief'] });
    expect(deck).toEqual({ werewolf: 2, seer: 1, witch: 1, thief: 1, villager: 5 });
    expect(validateConfig({ players: players(8), roles: deck }, registry)).toEqual([]);
  });

  it('erlaubt in SETUP und ROLE_DISTRIBUTION keine Fähigkeiten', () => {
    const game = setupGame(['werewolf', 'seer', 'villager', 'villager'], { stopBeforeNight: true });
    const result = game.dispatch({ type: 'USE_ABILITY', playerId: 'p2', abilityId: 'seer.investigate', targets: ['p1'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WRONG_PHASE');
  });
});
