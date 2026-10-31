import { describe, expect, it } from 'vitest';
import { ok, player, setupGame, toVoting, use, voteAll } from './helpers';

const withCaptain = { options: { captain: { enabled: true } } };
const badges = (game: ReturnType<typeof setupGame>, id: string) => game.publicView().players.find((p) => p.id === id)?.badges ?? [];

describe('Hauptmann', () => {
  it('wird am ersten Tag gewählt, seine Stimme zählt doppelt', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], withCaptain);
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    toVoting(game);
    expect(game.publicView().vote?.kind).toBe('election');
    voteAll(game, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p2', p5: 'p2' });
    expect(badges(game, 'p2')).toEqual(['Hauptmann']);
    expect(game.publicView().vote?.kind).toBe('lynch');
    // Ohne doppelte Stimme stünde es 2:2 zwischen Anna und David.
    voteAll(game, { p2: 'p1', p1: 'p3', p3: 'p4', p4: 'p1', p5: 'p4' });
    expect(player(game, 'p1').alive).toBe(false);
    expect(game.snapshot().result?.team).toBe('village');
  });

  it('entscheidet bei Gleichstand und bestimmt beim Tod einen Nachfolger', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager'], withCaptain);
    ok(use(game, 'p1', 'werewolf.kill', ['p7']));
    toVoting(game);
    voteAll(game, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p2', p5: 'p2', p6: 'p2' });
    voteAll(game, { p2: 'p3', p1: 'p4', p5: 'p4', p3: null, p4: null, p6: null });
    expect(player(game, 'p3').alive).toBe(false);
    expect(game.publicView().events.some((e) => e.type === 'captain-decides')).toBe(true);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(game.phase).toBe('DEATH_RESOLUTION');
    ok(use(game, 'p2', 'captain.successor', ['p4']));
    expect(badges(game, 'p4')).toEqual(['Hauptmann']);
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
  });

  it('Stichwahl bei Gleichstand der Wahl, danach entscheidet das Los', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager'], withCaptain);
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    toVoting(game);
    voteAll(game, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    expect(game.publicView().vote).toMatchObject({ kind: 'election', round: 2 });
    voteAll(game, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    expect(game.publicView().players.filter((p) => p.badges.includes('Hauptmann'))).toHaveLength(1);
    expect(game.publicView().vote?.kind).toBe('lynch');
  });

  it('der Sündenbock geht dem Hauptmann bei Gleichstand vor', () => {
    const game = setupGame(['werewolf', 'scapegoat', 'villager', 'villager', 'villager', 'villager', 'villager'], withCaptain);
    ok(use(game, 'p1', 'werewolf.kill', ['p7']));
    toVoting(game);
    voteAll(game, { p1: 'p3', p2: 'p3', p3: 'p4', p4: 'p3', p5: 'p3', p6: 'p3' });
    voteAll(game, { p3: 'p4', p1: 'p5', p6: 'p5', p2: null, p4: null, p5: null });
    expect(player(game, 'p2').alive).toBe(false);
    expect(player(game, 'p4').alive && player(game, 'p5').alive).toBe(true);
  });
});
