import { describe, expect, it } from 'vitest';
import { expectError, ok, player, setupGame, skip, toVoting, use, voteAll } from './helpers';

const deathsOf = (game: ReturnType<typeof setupGame>, id: string) =>
  game.allEvents().filter((e) => e.type === 'death' && e.data?.playerId === id).length;

describe('Jäger', () => {
  it('nimmt beim nächtlichen Tod einen Spieler mit (Test 7)', () => {
    const game = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    // Todesauflösung wartet auf die Entscheidung des Jägers.
    expect(game.phase).toBe('DEATH_RESOLUTION');
    expect(game.publicView().deathDecisions).toEqual([{ playerId: 'p2', name: 'Ben', abilityName: 'Letzter Schuss' }]);
    expect(game.viewFor('p2').pending[0].candidates.map((c) => c.id)).toEqual(['p1', 'p3', 'p4', 'p5']);
    ok(use(game, 'p2', 'hunter.shoot', ['p1']));
    expect(player(game, 'p1').death?.cause).toBe('hunter');
    // Letzter Werwolf erschossen -> Dorf gewinnt.
    expect(game.phase).toBe('GAME_OVER');
    expect(game.result?.team).toBe('village');
  });

  it('schießt auch nach einer Abstimmung, aber nicht auf Tote', () => {
    const game = setupGame(['werewolf', 'werewolf', 'hunter', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(use(game, 'p2', 'werewolf.kill', ['p4']));
    toVoting(game);
    voteAll(game, { p1: 'p3', p2: 'p3', p3: 'p1', p5: 'p3', p6: 'p3', p7: 'p3' }).forEach(ok);
    expect(game.phase).toBe('DEATH_RESOLUTION');
    expectError(use(game, 'p3', 'hunter.shoot', ['p4']), 'INVALID_TARGET');
    ok(use(game, 'p3', 'hunter.shoot', ['p2']));
    expect(player(game, 'p2').alive).toBe(false);
    expect(game.phase).toBe('NIGHT_ACTIONS');
  });

  it('löst nur einmal aus, auch wenn er mehrfach getroffen wird', () => {
    const game = setupGame(['werewolf', 'witch', 'hunter', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(skip(game, 'p2', 'witch.heal'));
    ok(use(game, 'p2', 'witch.poison', ['p3']));
    expect(game.pendingDecisions()).toEqual([{ abilityId: 'hunter.shoot', playerId: 'p3' }]);
    expect(deathsOf(game, 'p3')).toBe(1);
    expect(player(game, 'p3').death?.cause).toBe('werewolves');
    ok(skip(game, 'p3', 'hunter.shoot'));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    expect(game.publicView().events.some((e) => e.type === 'hunter-skip')).toBe(true);
  });

  it('verzichtet bei Zeitablauf (Standard) oder schießt zufällig (Option)', () => {
    const skipGame = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
    ok(use(skipGame, 'p1', 'werewolf.kill', ['p2']));
    ok(skipGame.dispatch({ type: 'TIMEOUT' }));
    expect(skipGame.snapshot().players.filter((p) => !p.alive).map((p) => p.id)).toEqual(['p2']);

    const randomGame = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager'], { options: { hunter: { timeoutRule: 'random' } } });
    ok(use(randomGame, 'p1', 'werewolf.kill', ['p2']));
    ok(randomGame.dispatch({ type: 'TIMEOUT' }));
    expect(randomGame.snapshot().players.filter((p) => !p.alive)).toHaveLength(2);
  });

  it('kann für bestimmte Todesursachen deaktiviert werden', () => {
    const game = setupGame(['werewolf', 'witch', 'hunter', 'villager', 'villager', 'villager'], {
      options: { hunter: { ignoredCauses: ['poison'] } },
    });
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(skip(game, 'p2', 'witch.heal'));
    ok(use(game, 'p2', 'witch.poison', ['p3']));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
  });

  it('wird vor der Siegprüfung abgewartet', () => {
    // Nach dem Tod des Jägers stünde es 1:1 (Werwolfsieg), sein Schuss dreht das Ergebnis.
    const game = setupGame(['werewolf', 'hunter', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    expect(game.phase).toBe('DEATH_RESOLUTION');
    ok(use(game, 'p2', 'hunter.shoot', ['p1']));
    expect(game.result?.team).toBe('village');
    expect(game.result?.winners).toEqual(['p2', 'p3']);
  });
});

describe('Liebespaar', () => {
  it('der Tod eines Liebenden tötet den Partner (Test 8)', () => {
    const game = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager', 'villager']);
    expect(game.publicView().nightStep?.id).toBe('cupid');
    ok(use(game, 'p2', 'cupid.link', ['p3', 'p4']));
    expect(game.publicView().nightStep?.id).toBe('lovers');
    expect(game.viewFor('p3').pending[0].info).toEqual(['Du bist in David verliebt.']);
    ok(use(game, 'p3', 'cupid.lovers'));
    ok(use(game, 'p4', 'cupid.lovers'));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(player(game, 'p3').death?.cause).toBe('werewolves');
    expect(player(game, 'p4').death?.cause).toBe('lover');
    expect(deathsOf(game, 'p3')).toBe(1);
    expect(deathsOf(game, 'p4')).toBe(1);
  });

  it('wissen voneinander, andere nicht', () => {
    const game = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'cupid.link', ['p3', 'p4']));
    expect(game.viewFor('p3').players.find((p) => p.id === 'p4')?.labels).toEqual(['Dein Partner (verliebt)']);
    expect(game.viewFor('p2').players.find((p) => p.id === 'p3')?.labels).toEqual(['Verliebt']);
    expect(game.viewFor('p5').players.every((p) => p.labels.length === 0)).toBe(true);
  });

  it('Amor darf nicht zweimal denselben Spieler wählen', () => {
    const game = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager']);
    expectError(use(game, 'p2', 'cupid.link', ['p3', 'p3']), 'INVALID_TARGET');
    expectError(use(game, 'p2', 'cupid.link', ['p3']), 'INVALID_TARGET');
  });

  it('Kettenreaktion Liebespaar + Jäger ohne Endlosschleife', () => {
    const game = setupGame(['werewolf', 'cupid', 'hunter', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'cupid.link', ['p3', 'p4']));
    ok(use(game, 'p3', 'cupid.lovers'));
    ok(use(game, 'p4', 'cupid.lovers'));
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    // p4 stirbt -> Jäger p3 stirbt vor Kummer -> Jäger darf schießen (einmal)
    expect(game.phase).toBe('DEATH_RESOLUTION');
    expect(player(game, 'p3').death?.cause).toBe('lover');
    expect(game.viewFor('p3').pending[0].candidates.map((c) => c.id)).toEqual(['p1', 'p2', 'p5', 'p6']);
    ok(use(game, 'p3', 'hunter.shoot', ['p1']));
    expect(game.result?.team).toBe('village');
    for (const id of ['p1', 'p3', 'p4']) expect(deathsOf(game, id)).toBe(1);
  });
});

describe('Todesverarbeitung', () => {
  it('ein Spieler kann nicht mehrfach sterben (Test 10)', () => {
    const game = setupGame(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(skip(game, 'p2', 'witch.heal'));
    ok(use(game, 'p2', 'witch.poison', ['p3']));
    expect(deathsOf(game, 'p3')).toBe(1);
    expect(player(game, 'p3').death?.cause).toBe('werewolves');
    expect(game.allEvents().some((e) => e.type === 'debug' && e.text.includes('bereits tot'))).toBe(true);
  });

  it('Heiltrank schützt nur vor Werwölfen, nicht vor Gift', () => {
    const game = setupGame(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p2', 'witch.heal', ['p3']));
    ok(use(game, 'p2', 'witch.poison', ['p3']));
    expect(player(game, 'p3').death?.cause).toBe('poison');
  });

  it('deckt Rollen beim Tod gemäß Konfiguration auf', () => {
    const run = (reveal: 'role' | 'faction' | 'none') => {
      const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager'], { rules: { revealRoleOnDeath: reveal } });
      ok(use(game, 'p1', 'werewolf.kill', ['p2']));
      return { summary: game.viewFor('p3').players.find((p) => p.id === 'p2')!, text: game.publicView().events.at(-1)!.text };
    };
    expect(run('role').summary.role?.name).toBe('Dorfbewohner');
    expect(run('role').text).toContain('Ben (Dorfbewohner)');
    expect(run('faction').summary.role).toBeNull();
    expect(run('faction').summary.faction).toBe('village');
    expect(run('none').summary.faction).toBeNull();
    expect(run('none').text).toContain('starb: Ben.');
  });
});
