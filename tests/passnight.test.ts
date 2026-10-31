import { describe, expect, it } from 'vitest';
import { Game, buildAutoDeck, validateConfig, type GameConfigInput } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { NAMES, ok, player, playRandomGame, setupGame, skip, use } from './helpers';

const pass = { rules: { nightMode: 'pass' as const } };
const pendingIds = (game: Game) => game.pendingDecisions().map((p) => `${p.playerId}:${p.abilityId}`);

describe('Nachtrunde reihum (Nachtmodus "pass")', () => {
  it('öffnet alle Entscheidungen gleichzeitig, die Hexe erst nach den Werwölfen', () => {
    const game = setupGame(['werewolf', 'seer', 'healer', 'witch', 'villager', 'villager'], pass);
    expect(pendingIds(game)).toEqual(expect.arrayContaining(['p2:seer.investigate', 'p3:healer.protect', 'p1:werewolf.kill']));
    expect(pendingIds(game).some((id) => id.startsWith('p4:'))).toBe(false);
    expect(game.publicView().events.some((e) => e.type === 'night-step')).toBe(false);
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    expect(pendingIds(game)).toEqual(expect.arrayContaining(['p4:witch.heal', 'p4:witch.poison']));
    ok(use(game, 'p3', 'healer.protect', ['p6']));
    ok(skip(game, 'p4', 'witch.heal'));
    ok(skip(game, 'p4', 'witch.poison'));
    expect(game.phase).toBe('NIGHT_ACTIONS');
    ok(use(game, 'p2', 'seer.investigate', ['p1']));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    expect(player(game, 'p5').alive).toBe(false);
  });

  it('Werwölfe stimmen einmal ab, danach entscheidet die Mehrheit', () => {
    const game = setupGame(['werewolf', 'werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], pass);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(use(game, 'p2', 'werewolf.kill', ['p5']));
    expect(game.phase).toBe('NIGHT_ACTIONS');
    ok(use(game, 'p3', 'werewolf.kill', ['p4']));
    expect(player(game, 'p4').alive).toBe(false);
    expect(player(game, 'p5').alive).toBe(true);
  });

  it('der Dieb handelt in derselben Runde schon als neue Rolle', () => {
    const game = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager'], { ...pass, extraCards: ['seer', 'villager'] });
    ok(use(game, 'p1', 'thief.steal', [], 'seer'));
    expect(pendingIds(game)).toContain('p1:seer.investigate');
    ok(use(game, 'p1', 'seer.investigate', ['p2']));
    ok(use(game, 'p2', 'werewolf.kill', ['p3']));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
  });

  it('Zufallspartien mit allen Rollen enden auch in diesem Modus regelkonform', { timeout: 60_000 }, () => {
    const registry = createDefaultRegistry();
    const specials = registry.listRoles().map((r) => r.id).filter((id) => id !== 'villager' && id !== 'werewolf');
    for (let seed = 1; seed <= 120; seed++) {
      const playerCount = 6 + (seed % 9);
      let chosen = specials.filter((_, i) => ((seed * 7 + i * 13) % 5) === 0);
      const makeConfig = (): GameConfigInput => ({
        players: NAMES.concat(['Mia', 'Nils', 'Ole']).slice(0, playerCount).map((name) => ({ name })),
        roles: buildAutoDeck(registry, { playerCount, werewolves: 1 + (seed % 2), specialRoles: chosen }),
        seed,
        rules: { nightMode: 'pass' },
        options: { captain: { enabled: seed % 2 === 0 } },
      });
      while (chosen.length > 0 && validateConfig(makeConfig(), registry).length > 0) chosen = chosen.slice(1);
      const game = Game.create(makeConfig(), registry);
      playRandomGame(game, seed * 31);
      expect(game.phase, `Seed ${seed}`).toBe('GAME_OVER');
    }
  });
});
