import { describe, expect, it } from 'vitest';
import type { GameRules } from '../src/engine';
import { alive, expectError, ok, player, setupGame, toVoting, use, voteAll } from './helpers';

/** 7 Spieler, Nacht 1: Werwolf p1 tötet p7. Danach Abstimmung mit p1..p6. */
function dayGame(rules: Partial<GameRules> = {}) {
  const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager'], { rules });
  ok(use(game, 'p1', 'werewolf.kill', ['p7']));
  toVoting(game);
  return game;
}

describe('Abstimmung', () => {
  it('tote Spieler dürfen nicht abstimmen (Test 9)', () => {
    const game = dayGame();
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p7', targetId: 'p1' }), 'PLAYER_DEAD');
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p7' }), 'INVALID_TARGET');
  });

  it('jeder lebende Spieler hat genau eine Stimme', () => {
    const game = dayGame();
    ok(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p1' }));
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p3' }), 'ALREADY_VOTED');
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p3', targetId: 'p3' }), 'INVALID_TARGET');
    expect(game.publicView().vote?.voted).toEqual(['p2']);
    // Geheime Abstimmung: andere sehen nicht, wofür p2 gestimmt hat.
    expect(game.viewFor('p3').events.some((e) => e.type === 'ballot')).toBe(false);
    expect(game.viewFor('p2').vote?.myBallot).toBe('p1');
  });

  it('erlaubt Stimmänderung und Enthaltung nur, wenn aktiviert', () => {
    const strict = dayGame({ allowAbstain: false });
    expectError(strict.dispatch({ type: 'VOTE', playerId: 'p2', targetId: null }), 'NOT_ALLOWED');

    const flexible = dayGame({ allowVoteChange: true });
    voteAll(flexible, { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p1', p5: 'p1', p6: 'p2' }).forEach(ok);
    // Bei erlaubter Stimmänderung schließt erst der Host die Abstimmung.
    expect(flexible.phase).toBe('DAY_VOTING');
    ok(flexible.dispatch({ type: 'VOTE', playerId: 'p3', targetId: 'p1' }));
    ok(flexible.dispatch({ type: 'ADVANCE' }));
    expect(player(flexible, 'p1').alive).toBe(false);
  });

  it('verbannt den Spieler mit den meisten Stimmen', () => {
    const game = dayGame();
    voteAll(game, { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p1', p5: null, p6: 'p2' }).forEach(ok);
    expect(player(game, 'p1').death?.cause).toBe('vote');
    const result = game.publicView().events.find((e) => e.type === 'vote-result');
    expect(result?.text).toBe('Ergebnis: Anna: 3, Ben: 2, Enthaltungen: 1.');
    expect(game.result?.team).toBe('village');
  });

  it('Host/Zeitablauf schließt die Abstimmung, fehlende Stimmen = Enthaltung', () => {
    const game = dayGame();
    ok(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p3' }));
    ok(game.dispatch({ type: 'TIMEOUT' }));
    expect(player(game, 'p3').alive).toBe(false);
    expect(game.phase).toBe('NIGHT_ACTIONS');
  });
});

describe('Gleichstand (Test 11)', () => {
  const tie = { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p2', p5: null, p6: null };

  it('Regel "none": niemand stirbt', () => {
    const game = dayGame({ tieBreak: 'none' });
    voteAll(game, tie).forEach(ok);
    expect(alive(game)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(game.phase).toBe('NIGHT_ACTIONS');
  });

  it('Regel "random": einer der Gleichplatzierten stirbt', () => {
    const game = dayGame({ tieBreak: 'random' });
    voteAll(game, tie).forEach(ok);
    const dead = ['p1', 'p2'].filter((id) => !player(game, id).alive);
    expect(dead).toHaveLength(1);
  });

  it('Regel "runoff": Stichwahl zwischen den Gleichplatzierten', () => {
    const game = dayGame({ tieBreak: 'runoff' });
    voteAll(game, tie).forEach(ok);
    expect(game.phase).toBe('DAY_VOTING');
    const vote = game.publicView().vote!;
    expect(vote.round).toBe(2);
    expect(vote.candidates.map((c) => c.id)).toEqual(['p2', 'p1']);
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p3', targetId: 'p4' }), 'INVALID_TARGET');
    voteAll(game, { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p2' }).forEach(ok);
    expect(player(game, 'p1').alive).toBe(false);
  });

  it('Stichwahl unentschieden: Folgeregel greift, keine Endlosschleife', () => {
    const game = dayGame({ tieBreak: 'runoff', runoffTieBreak: 'none' });
    voteAll(game, tie).forEach(ok);
    voteAll(game, tie).forEach(ok);
    expect(game.phase).toBe('NIGHT_ACTIONS');
    expect(alive(game)).toHaveLength(6);

    const random = dayGame({ tieBreak: 'runoff', runoffTieBreak: 'random' });
    voteAll(random, tie).forEach(ok);
    voteAll(random, tie).forEach(ok);
    expect(alive(random)).toHaveLength(5);
  });

  it('alle enthalten sich: niemand stirbt', () => {
    const game = dayGame();
    voteAll(game, { p1: null, p2: null, p3: null, p4: null, p5: null, p6: null }).forEach(ok);
    expect(alive(game)).toHaveLength(6);
  });

  it('veröffentlicht Einzelstimmen nur, wenn aktiviert', () => {
    const game = dayGame({ revealBallots: true, tieBreak: 'none' });
    voteAll(game, tie).forEach(ok);
    const ballots = game.publicView().events.find((e) => e.type === 'vote-ballots');
    expect(ballots?.text).toContain('Anna -> Ben');
  });
});
