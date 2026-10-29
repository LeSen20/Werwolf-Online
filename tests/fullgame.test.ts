import { describe, expect, it } from 'vitest';
import { Game, buildAutoDeck, validateConfig, type GameConfigInput, type GameRules, type RoleId } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { NAMES, alive, ok, playRandomGame, setupGame, skip, toVoting, use, voteAll } from './helpers';

describe('Komplette Partien (Test 15)', () => {
  it('endet nach mehreren Nacht- und Tagphasen korrekt', () => {
    const game = setupGame(['werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'cupid', 'villager', 'villager']);

    // Nacht 1
    ok(use(game, 'p6', 'cupid.link', ['p7', 'p8']));
    ok(use(game, 'p7', 'cupid.lovers'));
    ok(use(game, 'p8', 'cupid.lovers'));
    ok(use(game, 'p3', 'seer.investigate', ['p1']));
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    ok(use(game, 'p2', 'werewolf.kill', ['p5']));
    ok(skip(game, 'p4', 'witch.heal'));
    ok(skip(game, 'p4', 'witch.poison'));
    expect(game.phase).toBe('DEATH_RESOLUTION');
    ok(use(game, 'p5', 'hunter.shoot', ['p2']));
    expect(game.publicView().events.at(-1)?.text).toBe('Tag 1: Der Morgen graut. In der Nacht starben: Ben (Werwolf), Emil (Jäger).');

    // Tag 1: Das Dorf verbannt eine Verliebte, ihr Partner stirbt mit.
    toVoting(game);
    voteAll(game, { p1: 'p7', p3: 'p7', p4: 'p7', p6: 'p7', p7: 'p1', p8: 'p1' }).forEach(ok);
    expect(alive(game)).toEqual(['p1', 'p3', 'p4', 'p6']);

    // Nacht 2: Die Hexe rettet das Opfer.
    expect(game.phase).toBe('NIGHT_ACTIONS');
    ok(use(game, 'p3', 'seer.investigate', ['p4']));
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    ok(use(game, 'p4', 'witch.heal', ['p6']));
    ok(skip(game, 'p4', 'witch.poison'));
    expect(alive(game)).toEqual(['p1', 'p3', 'p4', 'p6']);

    // Tag 2: Der letzte Werwolf wird verbannt.
    toVoting(game);
    voteAll(game, { p1: 'p3', p3: 'p1', p4: 'p1', p6: 'p1' }).forEach(ok);
    expect(game.phase).toBe('GAME_OVER');
    expect(game.result).toMatchObject({ team: 'village', winners: ['p3', 'p4', 'p5', 'p6', 'p7', 'p8'] });
    expect(game.publicView().round).toBe(2);
    // Am Spielende sind alle Rollen sichtbar.
    expect(game.viewFor('p3').players.every((p) => p.role !== null)).toBe(true);
  });

  it('übersteht hunderte zufällige Partien ohne Fehler und Hänger', { timeout: 60_000 }, () => {
    const registry = createDefaultRegistry();
    const specials: RoleId[] = ['seer', 'witch', 'hunter', 'cupid', 'thief'];
    const pickOne = <T>(items: T[], n: number): T => items[n % items.length];
    for (let seed = 1; seed <= 250; seed++) {
      const playerCount = 4 + (seed % 9);
      const werewolves = 1 + (seed % Math.max(1, Math.floor((playerCount - 1) / 2)));
      let chosen = specials.filter((_, i) => (seed >> i) & 1);
      const rules: Partial<GameRules> = {
        tieBreak: pickOne(['none', 'runoff', 'random'] as const, seed),
        runoffTieBreak: pickOne(['none', 'random'] as const, seed >> 1),
        revealRoleOnDeath: pickOne(['role', 'faction', 'none'] as const, seed >> 2),
        werewolfWin: pickOne(['parity', 'elimination'] as const, seed >> 3),
        allowVoteChange: seed % 4 === 0,
        allowAbstain: seed % 5 !== 0,
      };
      const makeConfig = (): GameConfigInput => ({
        players: NAMES.slice(0, playerCount).map((name) => ({ name })),
        roles: buildAutoDeck(registry, { playerCount, werewolves, specialRoles: chosen }),
        seed,
        rules,
        options: { 'mixed-lovers': { enabled: seed % 3 === 0 }, witch: { canUseBothSameNight: seed % 2 === 0 } },
      });
      // Zu viele Sonderrollen für kleine Runden: so lange eine entfernen, bis der Stapel passt.
      while (chosen.length > 0 && validateConfig(makeConfig(), registry).length > 0) chosen = chosen.slice(1);
      const config = makeConfig();
      expect(validateConfig(config, registry)).toEqual([]);

      const game = Game.create(config, registry);
      const { commands, state } = playRandomGame(game, seed * 7919);
      expect(game.phase, `Seed ${seed} nach ${commands} Befehlen`).toBe('GAME_OVER');
      expect(state.result?.aborted).toBe(false);
      for (const p of state.players) {
        const deaths = state.events.filter((e) => e.type === 'death' && e.data?.playerId === p.id).length;
        expect(deaths).toBe(p.alive ? 0 : 1);
        expect(p.alive === (p.death === null)).toBe(true);
      }
      for (const id of state.result!.winners) expect(state.players.some((p) => p.id === id)).toBe(true);
      // Jede Spieleransicht enthält nur öffentliche oder an den Spieler gerichtete Ereignisse.
      for (const p of state.players) {
        for (const event of game.viewFor(p.id).events) {
          expect(event.visibility.kind === 'public' || (event.visibility.kind === 'players' && event.visibility.playerIds.includes(p.id))).toBe(true);
        }
      }
    }
  });

  it('lässt sich speichern, wiederherstellen und identisch fortsetzen', () => {
    const registry = createDefaultRegistry();
    const config: GameConfigInput = {
      players: NAMES.slice(0, 9).map((name) => ({ name })),
      roles: { werewolf: 2, seer: 1, witch: 1, hunter: 1, cupid: 1, thief: 1, villager: 4 },
      seed: 99,
    };
    const original = Game.create(config, registry);
    ok(original.dispatch({ type: 'START_GAME' }));
    ok(original.dispatch({ type: 'ADVANCE' }));
    const saved = JSON.parse(JSON.stringify(original.snapshot()));
    const restored = Game.restore(saved, registry);
    playRandomGame(original, 5);
    playRandomGame(restored, 5);
    expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(original.snapshot()));
    expect(restored.phase).toBe('GAME_OVER');
  });

  it('zeigt Spielern keine fremden geheimen Informationen', () => {
    const game = setupGame(['werewolf', 'werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p3', 'seer.investigate', ['p1']));
    const villagerView = game.viewFor('p4');
    expect(villagerView.players.filter((p) => p.role !== null).map((p) => p.id)).toEqual(['p4']);
    expect(villagerView.players.every((p) => p.labels.length === 0)).toBe(true);
    expect(villagerView.pending).toEqual([]);
    // Die Werwölfe sehen ihre Entscheidungen, andere nicht.
    const wolfView = game.viewFor('p1');
    expect(wolfView.pending[0].abilityId).toBe('werewolf.kill');
    expect(wolfView.players.find((p) => p.id === 'p2')?.labels).toEqual(['Werwolf']);
    expect(game.publicView().players.every((p) => p.role === null)).toBe(true);
  });
});
