import { describe, expect, it } from 'vitest';
import { expectError, ok, player, setupGame, skip, toVoting, use, voteAll } from './helpers';

describe('Heiler', () => {
  it('schützt vor den Werwölfen, aber nie zweimal hintereinander denselben', () => {
    const game = setupGame(['werewolf', 'healer', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'healer.protect', ['p3']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(player(game, 'p3').alive).toBe(true);
    toVoting(game);
    voteAll(game, { p1: null, p2: null, p3: null, p4: null, p5: null, p6: null });
    expect(game.phase).toBe('NIGHT_ACTIONS');
    expectError(use(game, 'p2', 'healer.protect', ['p3']), 'INVALID_TARGET');
    ok(use(game, 'p2', 'healer.protect', ['p2']));
  });
});

describe('Der Alte', () => {
  it('übersteht den ersten Werwolfangriff, den zweiten nicht', () => {
    const game = setupGame(['werewolf', 'elder', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(player(game, 'p2').alive).toBe(true);
    expect(game.viewFor('p2').events.some((e) => e.type === 'elder-survived')).toBe(true);
    toVoting(game);
    voteAll(game, { p1: null, p2: null, p3: null, p4: null, p5: null, p6: null });
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(player(game, 'p2').alive).toBe(false);
  });

  it('nimmt dem Dorf die Fähigkeiten, wenn das Dorf ihn tötet', () => {
    const game = setupGame(['werewolf', 'elder', 'witch', 'seer', 'villager', 'villager']);
    ok(use(game, 'p4', 'seer.investigate', ['p1']));
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    ok(skip(game, 'p3', 'witch.heal'));
    ok(skip(game, 'p3', 'witch.poison'));
    toVoting(game);
    voteAll(game, { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p2', p6: 'p2' });
    expect(player(game, 'p2').alive).toBe(false);
    expect(game.publicView().events.some((e) => e.type === 'elder-curse')).toBe(true);
    // Nächste Nacht: Seherin und Hexe werden nicht mehr aufgerufen.
    expect(game.publicView().nightStep?.id).toBe('werewolves');
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
  });
});

describe('Dorfdepp', () => {
  it('wird bei der Verbannung verschont und verliert sein Stimmrecht', () => {
    const game = setupGame(['werewolf', 'idiot', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    toVoting(game);
    voteAll(game, { p1: 'p2', p2: 'p1', p4: 'p2', p5: 'p2', p6: 'p2' });
    expect(player(game, 'p2').alive).toBe(true);
    expect(game.publicView().events.some((e) => e.type === 'idiot-revealed')).toBe(true);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    toVoting(game);
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p1' }), 'NOT_ALLOWED');
  });
});

describe('Sündenbock', () => {
  it('stirbt bei Gleichstand und bestimmt die Wähler des nächsten Tages', () => {
    const game = setupGame(['werewolf', 'scapegoat', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p7']));
    toVoting(game);
    voteAll(game, { p1: 'p3', p2: 'p1', p3: 'p1', p4: 'p3', p5: null, p6: null });
    expect(player(game, 'p2').alive).toBe(false);
    expect(player(game, 'p1').alive && player(game, 'p3').alive).toBe(true);
    expect(game.phase).toBe('DEATH_RESOLUTION');
    ok(use(game, 'p2', 'scapegoat.choose', ['p3', 'p4']));
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    toVoting(game);
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p5', targetId: 'p1' }), 'NOT_ALLOWED');
    ok(game.dispatch({ type: 'VOTE', playerId: 'p3', targetId: 'p1' }));
    ok(game.dispatch({ type: 'VOTE', playerId: 'p4', targetId: 'p1' }));
    expect(player(game, 'p1').alive).toBe(false);
  });
});

describe('Flötenspieler', () => {
  it('gewinnt allein, wenn alle anderen Lebenden verzaubert sind', () => {
    const game = setupGame(['werewolf', 'piper', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    ok(use(game, 'p2', 'piper.enchant', ['p1', 'p3']));
    expect(game.viewFor('p3').players.find((p) => p.id === 'p1')?.relations).toContain('enchanted');
    toVoting(game);
    voteAll(game, { p1: null, p2: null, p3: null, p4: null });
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p2', 'piper.enchant', ['p4']));
    expect(game.phase).toBe('GAME_OVER');
    expect(game.snapshot().result).toMatchObject({ team: 'piper', winners: ['p2'] });
  });

  it('muss zwei Spieler wählen, solange zwei unverzaubert sind', () => {
    const game = setupGame(['werewolf', 'piper', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    expectError(use(game, 'p2', 'piper.enchant', ['p3']), 'INVALID_TARGET');
    expect(game.viewFor('p2').pending[0]).toMatchObject({ min: 2, max: 2 });
  });
});
