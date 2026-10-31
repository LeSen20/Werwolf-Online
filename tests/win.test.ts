import { describe, expect, it } from 'vitest';
import { expectError, ok, setupGame, toVoting, use, voteAll } from './helpers';

describe('Siegbedingungen (Test 12)', () => {
  it('Dorf gewinnt, sobald der letzte Werwolf verbannt ist', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(game.result).toBeNull();
    toVoting(game);
    voteAll(game, { p1: 'p3', p3: 'p1', p4: 'p1', p5: 'p1' }).forEach(ok);
    expect(game.phase).toBe('GAME_OVER');
    expect(game.result).toMatchObject({ team: 'village', conditionId: 'village', winners: ['p2', 'p3', 'p4', 'p5'] });
  });

  it('Werwölfe gewinnen bei Gleichstand (Parität)', () => {
    const game = setupGame(['werewolf', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(game.result).toMatchObject({ team: 'werewolves', winners: ['p1'] });
  });

  it('Regel "elimination": Werwölfe gewinnen erst, wenn alle Gegner tot sind', () => {
    const game = setupGame(['werewolf', 'villager', 'villager'], { rules: { werewolfWin: 'elimination', tieBreak: 'none' } });
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(game.result).toBeNull();
    toVoting(game);
    voteAll(game, { p1: 'p3', p3: 'p1' }).forEach(ok);
    expect(game.phase).toBe('NIGHT_ACTIONS');
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(game.result?.team).toBe('werewolves');
  });

  it('gemischtes Liebespaar gewinnt mit Sonderregel, sonst gewinnen die Werwölfe', () => {
    const play = (enabled: boolean) => {
      const game = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager'], {
        options: { 'mixed-lovers': { enabled } },
      });
      ok(use(game, 'p2', 'cupid.link', ['p1', 'p3']));
      ok(use(game, 'p1', 'cupid.lovers'));
      ok(use(game, 'p3', 'cupid.lovers'));
      ok(use(game, 'p1', 'werewolf.kill', ['p2']));
      if (game.result) return game;
      toVoting(game);
      voteAll(game, { p1: 'p4', p3: 'p4', p4: 'p1', p5: 'p4' }).forEach(ok);
      if (game.result) return game;
      ok(use(game, 'p1', 'werewolf.kill', ['p5']));
      return game;
    };
    const withRule = play(true);
    expect(withRule.result).toMatchObject({ team: 'lovers', winners: ['p1', 'p3'] });
    expect(withRule.viewFor('p3').self.teamName).toBe('Liebespaar');

    const withoutRule = play(false);
    // Ohne Sonderregel behält die Verliebte p3 ihr Team (Dorf): nach Nacht 1 steht es 1 Werwolf gegen 3.
    expect(withoutRule.result?.team).toBe('werewolves');
    expect(withoutRule.result?.winners).toEqual(['p1']);
  });

  it('Unentschieden, wenn niemand überlebt', () => {
    const game = setupGame(['werewolf', 'hunter', 'cupid', 'villager']);
    ok(use(game, 'p3', 'cupid.link', ['p1', 'p2']));
    ok(use(game, 'p1', 'cupid.lovers'));
    ok(use(game, 'p2', 'cupid.lovers'));
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    toVoting(game);
    voteAll(game, { p1: 'p3', p2: 'p1', p3: 'p1' }).forEach(ok);
    // Werwolf verbannt -> Jäger stirbt vor Kummer -> erschießt Amor.
    ok(use(game, 'p2', 'hunter.shoot', ['p3']));
    expect(game.result).toMatchObject({ team: null, conditionId: 'draw-no-survivors' });
  });

  it('eine beendete Partie kann nicht erneut beendet oder fortgesetzt werden', () => {
    const game = setupGame(['werewolf', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(game.phase).toBe('GAME_OVER');
    const result = game.result;
    expectError(game.dispatch({ type: 'ABORT' }), 'GAME_OVER');
    expectError(game.dispatch({ type: 'ADVANCE' }), 'GAME_OVER');
    expect(game.result).toEqual(result);
    expect(game.allEvents().filter((e) => e.type === 'game-over')).toHaveLength(1);
  });

  it('Abbruch beendet die Partie ohne Sieger', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager']);
    ok(game.dispatch({ type: 'ABORT', reason: 'Test' }));
    expect(game.result).toMatchObject({ aborted: true, team: null });
  });
});
