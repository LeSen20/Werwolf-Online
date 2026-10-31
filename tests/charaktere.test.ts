import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { ok, player, setupGame, toVoting, use, voteAll } from './helpers';

const relations = (game: ReturnType<typeof setupGame>, viewer: string, target: string) =>
  game.viewFor(viewer).players.find((p) => p.id === target)?.relations ?? [];
const nobodyVotes = (game: ReturnType<typeof setupGame>) =>
  voteAll(game, Object.fromEntries(game.publicView().players.filter((p) => p.alive).map((p) => [p.id, null])));

describe('Geschwister', () => {
  it('kennen sich und gibt es nur in der richtigen Anzahl', () => {
    const game = setupGame(['werewolf', 'sister', 'sister', 'villager', 'villager', 'villager']);
    expect(relations(game, 'p2', 'p3')).toContain('siblings');
    expect(relations(game, 'p4', 'p3')).not.toContain('siblings');
    const issues = validateConfig({ players: ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name })), roles: { werewolf: 1, sister: 1, villager: 3 } }, createDefaultRegistry());
    expect(issues.join()).toContain('genau 2');
  });
});

describe('Wolfshund', () => {
  it('wird auf Wunsch ein Werwolf, auch für die Seherin', () => {
    const game = setupGame(['werewolf', 'wolfhound', 'seer', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'wolfhound.choose', [], 'werewolf'));
    const seen = ok(use(game, 'p3', 'seer.investigate', ['p2']));
    expect(seen.ok && seen.events.find((e) => e.type === 'seer-result')?.text).toContain('gehört zu den Werwölfen');
    expect(relations(game, 'p1', 'p2')).toContain('werewolf-pack');
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(use(game, 'p2', 'werewolf.kill', ['p4']));
    expect(player(game, 'p4').alive).toBe(false);
  });
});

describe('Wildes Kind', () => {
  it('wird zum Werwolf, wenn sein Vorbild stirbt', () => {
    const game = setupGame(['werewolf', 'wild-child', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'wild-child.model', ['p3']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(relations(game, 'p1', 'p2')).toContain('werewolf-pack');
    expect(game.viewFor('p2').events.some((e) => e.type === 'turned-werewolf')).toBe(true);
  });
});

describe('Fuchs', () => {
  it('wittert Werwölfe unter Nachbarn und verliert ohne Fund seine Nase', () => {
    const game = setupGame(['werewolf', 'fox', 'villager', 'villager', 'villager', 'villager']);
    const first = ok(use(game, 'p2', 'fox.sniff', ['p6']));
    expect(first.ok && first.events.find((e) => e.type === 'fox-result')?.data?.found).toBe(true);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    toVoting(game);
    nobodyVotes(game);
    const second = ok(use(game, 'p2', 'fox.sniff', ['p3']));
    expect(second.ok && second.events.find((e) => e.type === 'fox-result')?.data?.found).toBe(false);
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    toVoting(game);
    nobodyVotes(game);
    expect(game.publicView().nightStep?.id).toBe('werewolves');
  });
});

describe('Bärenführer', () => {
  it('sein Bär brummt, wenn ein Nachbar ein Werwolf ist', () => {
    const game = setupGame(['werewolf', 'bear-tamer', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    expect(game.publicView().events.some((e) => e.type === 'bear-growl')).toBe(true);
  });
});

describe('Ritter mit dem rostigen Schwert', () => {
  it('der nächste Werwolf links von ihm stirbt in der folgenden Nacht', () => {
    const game = setupGame(['werewolf', 'knight', 'villager', 'villager', 'villager', 'werewolf', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    ok(use(game, 'p6', 'werewolf.kill', ['p2']));
    expect(player(game, 'p6').alive).toBe(true);
    toVoting(game);
    nobodyVotes(game);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p6', 'werewolf.kill', ['p3']));
    expect(player(game, 'p6').death?.cause).toBe('rusty-sword');
  });
});

describe('Stotternder Richter', () => {
  it('kann einmal eine zweite Abstimmung am selben Tag verlangen', () => {
    const game = setupGame(['werewolf', 'judge', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p7']));
    toVoting(game);
    ok(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p3', requestSecondVote: true }));
    voteAll(game, { p1: 'p3', p3: 'p1', p4: 'p3', p5: 'p3', p6: 'p3' });
    expect(player(game, 'p3').alive).toBe(false);
    expect(game.phase).toBe('DAY_VOTING');
    voteAll(game, { p1: 'p4', p2: 'p1', p4: 'p1', p5: 'p1', p6: 'p1' });
    expect(player(game, 'p1').alive).toBe(false);
    expect(game.phase).toBe('GAME_OVER');
  });
});

describe('Engel', () => {
  it('gewinnt allein, wenn er bei der ersten Abstimmung verbannt wird', () => {
    const game = setupGame(['werewolf', 'angel', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    toVoting(game);
    voteAll(game, { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p2' });
    expect(game.snapshot().result).toMatchObject({ team: 'angel', winners: ['p2'] });
  });
});

describe('Besondere Werwölfe', () => {
  it('Urwolf steckt das Opfer an, statt es zu fressen', () => {
    const game = setupGame(['urwolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p1', 'urwolf.infect'));
    expect(player(game, 'p3').alive).toBe(true);
    expect(relations(game, 'p1', 'p3')).toContain('werewolf-pack');
  });

  it('Großer böser Wolf frisst ein zweites Opfer', () => {
    const game = setupGame(['big-bad-wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p2', 'werewolf.kill', ['p3']));
    ok(use(game, 'p1', 'big-bad-wolf.kill', ['p4']));
    expect(player(game, 'p3').alive || player(game, 'p4').alive).toBe(false);
  });

  it('Weißer Werwolf tötet in jeder zweiten Nacht einen Werwolf', () => {
    const game = setupGame(['white-werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p2', 'werewolf.kill', ['p3']));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    toVoting(game);
    nobodyVotes(game);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(use(game, 'p2', 'werewolf.kill', ['p4']));
    ok(use(game, 'p1', 'white-werewolf.kill', ['p2']));
    expect(player(game, 'p2').death?.cause).toBe('white-werewolf');
  });
});

describe('Heiler gegen Zusatzopfer', () => {
  it('schützt auch vor dem zweiten Opfer des großen bösen Wolfs', () => {
    const game = setupGame(['big-bad-wolf', 'healer', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'healer.protect', ['p4']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p1', 'big-bad-wolf.kill', ['p4']));
    expect(player(game, 'p4').alive).toBe(true);
  });
});
