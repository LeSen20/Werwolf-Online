import { describe, expect, it } from 'vitest';
import { Game, buildAutoDeck, validateConfig, type GameConfigInput } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { NAMES, playRandomGame } from './helpers';

describe('Alle Rollen zusammen', () => {
  it('Zufallspartien mit allen Rollen und dem Hauptmann enden regelkonform', { timeout: 60_000 }, () => {
    const registry = createDefaultRegistry();
    const specials = registry.listRoles().map((r) => r.id).filter((id) => id !== 'villager' && id !== 'werewolf');
    const names = [...NAMES, 'Mia', 'Nils', 'Ole', 'Pia', 'Rolf', 'Sara'];
    let finished = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let state = seed * 2654435761;
      const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
      const playerCount = 6 + (seed % 13);
      const werewolves = 1 + (seed % 2);
      let chosen = specials.filter(() => random() < 0.35);
      const makeConfig = (): GameConfigInput => ({
        players: names.slice(0, playerCount).map((name) => ({ name })),
        roles: buildAutoDeck(registry, { playerCount, werewolves, specialRoles: chosen }),
        seed,
        options: { captain: { enabled: seed % 2 === 0 } },
      });
      while (chosen.length > 0 && validateConfig(makeConfig(), registry).length > 0) chosen = chosen.slice(1);
      const config = makeConfig();
      expect(validateConfig(config, registry), `Seed ${seed}`).toEqual([]);
      const game = Game.create(config, registry);
      const { commands, state: end } = playRandomGame(game, seed * 7919);
      expect(game.phase, `Seed ${seed} (${chosen.join(', ')}) nach ${commands} Befehlen`).toBe('GAME_OVER');
      for (const p of end.players) expect(p.alive === (p.death === null)).toBe(true);
      finished += 1;
    }
    expect(finished).toBe(200);
  });
});
