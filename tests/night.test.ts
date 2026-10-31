import { describe, expect, it } from 'vitest';
import { expectError, ok, player, setupGame, skip, use } from './helpers';

describe('Seherin', () => {
  it('erhält das korrekte, private Untersuchungsergebnis (Test 3)', () => {
    const game = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    const result = ok(use(game, 'p2', 'seer.investigate', ['p1']));
    const seerEvent = result.ok ? result.events.find((e) => e.type === 'seer-result') : undefined;
    expect(seerEvent?.text).toBe('Anna gehört zu den Werwölfen.');
    expect(seerEvent?.visibility).toEqual({ kind: 'players', playerIds: ['p2'] });

    // Nur die Seherin sieht das Ergebnis.
    expect(game.viewFor('p2').events.some((e) => e.type === 'seer-result')).toBe(true);
    for (const id of ['p1', 'p3', 'p4', 'p5']) expect(game.viewFor(id).events.some((e) => e.type === 'seer-result')).toBe(false);
    expect(game.publicView().events.some((e) => e.type === 'seer-result')).toBe(false);
  });

  it('sieht Dorfbewohner als "nicht Werwolf" und optional die genaue Rolle', () => {
    const game = setupGame(['werewolf', 'seer', 'witch', 'villager', 'villager']);
    const result = ok(use(game, 'p2', 'seer.investigate', ['p3']));
    expect(result.ok && result.events.find((e) => e.type === 'seer-result')?.text).toBe('Clara gehört nicht zu den Werwölfen.');

    const roleMode = setupGame(['werewolf', 'seer', 'witch', 'villager', 'villager'], { options: { seer: { result: 'role' } } });
    const roleResult = ok(use(roleMode, 'p2', 'seer.investigate', ['p3']));
    expect(roleResult.ok && roleResult.events.find((e) => e.type === 'seer-result')?.text).toBe('Clara ist: Hexe.');
  });

  it('darf sich nicht selbst untersuchen', () => {
    const game = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    expectError(use(game, 'p2', 'seer.investigate', ['p2']), 'INVALID_TARGET');
  });
});

describe('Werwölfe', () => {
  it('müssen sich auf ein gemeinsames Opfer einigen (Test 4)', () => {
    const game = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    expect(game.publicView().nightStep?.id).toBe('werewolves');
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(use(game, 'p2', 'werewolf.kill', ['p4']));
    // Keine Einigung: Nacht läuft weiter.
    expect(game.phase).toBe('NIGHT_ACTIONS');
    const prompt = game.viewFor('p1').pending[0];
    expect(prompt.group?.map((m) => m.targets)).toEqual([['p3'], ['p4']]);
    // Stimme ändern bis zur Einigung.
    ok(use(game, 'p2', 'werewolf.kill', ['p3']));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    expect(player(game, 'p3').alive).toBe(false);
    expect(player(game, 'p3').death?.cause).toBe('werewolves');
    expect(player(game, 'p4').alive).toBe(true);
  });

  it('kennen sich, dürfen aber keine Werwölfe wählen', () => {
    const game = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    expect(game.viewFor('p1').players.find((p) => p.id === 'p2')?.labels).toContain('Werwolf');
    expect(game.viewFor('p3').players.find((p) => p.id === 'p1')?.labels).toEqual([]);
    expectError(use(game, 'p1', 'werewolf.kill', ['p2']), 'INVALID_TARGET');
  });

  it('nutzen bei Zeitablauf die Mehrheit bzw. keine Tötung ohne Stimmen', () => {
    const game = setupGame(['werewolf', 'werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(use(game, 'p2', 'werewolf.kill', ['p4']));
    ok(use(game, 'p3', 'werewolf.kill', ['p5']));
    ok(game.dispatch({ type: 'TIMEOUT' }));
    expect(player(game, 'p4').alive).toBe(false);

    const silent = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    ok(silent.dispatch({ type: 'TIMEOUT' }));
    expect(silent.phase).toBe('DAY_ANNOUNCEMENT');
    expect(silent.snapshot().players.every((p) => p.alive)).toBe(true);
  });
});

describe('Hexe', () => {
  const roles = ['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager'];

  it('verhindert mit dem Heiltrank den Tod des Opfers (Test 5)', () => {
    const game = setupGame(roles);
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    const prompt = game.viewFor('p2').pending.find((p) => p.abilityId === 'witch.heal');
    expect(prompt?.info).toContain('Die Werwölfe haben Clara gewählt.');
    expect(prompt?.candidates.map((c) => c.id)).toEqual(['p3']);
    ok(use(game, 'p2', 'witch.heal', ['p3']));
    ok(skip(game, 'p2', 'witch.poison'));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    expect(player(game, 'p3').alive).toBe(true);
    expect(game.publicView().events.at(-1)?.text).toContain('niemand gestorben');
  });

  it('kann den Heiltrank nur für das Werwolfopfer und nur einmal einsetzen', () => {
    const game = setupGame(roles, { rules: { tieBreak: 'none' } });
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expectError(use(game, 'p2', 'witch.heal', ['p4']), 'INVALID_TARGET');
    ok(use(game, 'p2', 'witch.heal', ['p3']));
    ok(skip(game, 'p2', 'witch.poison'));
    // Tag 1 ohne Verbannung, Nacht 2: Heiltrank ist verbraucht.
    ok(game.dispatch({ type: 'ADVANCE' }));
    ok(game.dispatch({ type: 'ADVANCE' }));
    ok(game.dispatch({ type: 'ADVANCE' }));
    expect(game.phase).toBe('NIGHT_ACTIONS');
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    expect(game.viewFor('p2').pending.map((p) => p.abilityId)).toEqual(['witch.poison']);
    expectError(use(game, 'p2', 'witch.heal', ['p4']), 'ABILITY_USED_UP');
  });

  it('setzt den Gifttrank nur gemäß den Nutzungsregeln ein (Test 6)', () => {
    const game = setupGame(roles, { rules: { tieBreak: 'none' } });
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expectError(use(game, 'p2', 'witch.poison', ['p2']), 'INVALID_TARGET');
    ok(skip(game, 'p2', 'witch.heal'));
    ok(use(game, 'p2', 'witch.poison', ['p1']));
    // Werwolf vergiftet -> Dorf gewinnt.
    expect(game.phase).toBe('GAME_OVER');
    expect(game.result?.team).toBe('village');
    expect(player(game, 'p1').death?.cause).toBe('poison');
  });

  it('kann den Gifttrank nicht ein zweites Mal einsetzen', () => {
    const game = setupGame(['werewolf', 'werewolf', 'witch', 'villager', 'villager', 'villager', 'villager'], { rules: { tieBreak: 'none' } });
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(use(game, 'p2', 'werewolf.kill', ['p4']));
    ok(skip(game, 'p3', 'witch.heal'));
    ok(use(game, 'p3', 'witch.poison', ['p5']));
    for (let i = 0; i < 3; i++) ok(game.dispatch({ type: 'ADVANCE' }));
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    ok(use(game, 'p2', 'werewolf.kill', ['p6']));
    expectError(use(game, 'p3', 'witch.poison', ['p1']), 'ABILITY_USED_UP');
  });

  it('beachtet die Regel "nur ein Trank pro Nacht"', () => {
    const game = setupGame(roles, { options: { witch: { canUseBothSameNight: false } } });
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    expect(game.viewFor('p2').pending.map((p) => p.abilityId)).toEqual(['witch.heal', 'witch.poison']);
    ok(use(game, 'p2', 'witch.heal', ['p3']));
    // Der Gifttrank verfällt für diese Nacht, die Nacht endet sofort.
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    expectError(use(game, 'p2', 'witch.poison', ['p1']), 'WRONG_PHASE');
    // In der nächsten Nacht ist der Gifttrank wieder verfügbar.
    for (let i = 0; i < 3; i++) ok(game.dispatch({ type: 'ADVANCE' }));
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    expect(game.viewFor('p2').pending.map((p) => p.abilityId)).toEqual(['witch.poison']);
    ok(use(game, 'p2', 'witch.poison', ['p1']));
    expect(game.result?.team).toBe('village');
  });

  it('darf sich selbst retten, wenn die Option es erlaubt', () => {
    const game = setupGame(roles);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    ok(use(game, 'p2', 'witch.heal', ['p2']));
    ok(skip(game, 'p2', 'witch.poison'));
    expect(player(game, 'p2').alive).toBe(true);

    const noSelf = setupGame(roles, { options: { witch: { canSelfHeal: false } } });
    ok(use(noSelf, 'p1', 'werewolf.kill', ['p2']));
    expect(noSelf.viewFor('p2').pending.map((p) => p.abilityId)).toEqual(['witch.poison']);
  });
});

describe('Ungültige Nachtaktionen (Test 13)', () => {
  const roles = ['werewolf', 'seer', 'witch', 'villager', 'villager', 'villager'];

  it('werden kontrolliert abgewiesen, ohne den Zustand zu verändern', () => {
    const game = setupGame(roles);
    const before = JSON.stringify(game.snapshot());
    expectError(use(game, 'p4', 'seer.investigate', ['p1']), 'NOT_ALLOWED');
    expectError(use(game, 'p3', 'witch.poison', ['p1']), 'NOT_PENDING');
    expectError(use(game, 'p1', 'werewolf.kill', ['p2']), 'NOT_PENDING');
    expectError(use(game, 'p2', 'seer.investigate', ['p99']), 'UNKNOWN_PLAYER');
    expectError(use(game, 'p2', 'seer.investigate', ['p1', 'p3']), 'INVALID_TARGET');
    expectError(use(game, 'p2', 'zauber.blitz', ['p1']), 'UNKNOWN_ABILITY');
    expectError(skip(game, 'p2', 'seer.investigate'), 'NOT_OPTIONAL');
    expectError(game.dispatch({ type: 'VOTE', playerId: 'p2', targetId: 'p1' }), 'WRONG_PHASE');
    expectError(game.dispatch({ type: 'ADVANCE' }), 'WRONG_PHASE');
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it('lehnt Fähigkeiten toter Spieler und am Tag ab', () => {
    const game = setupGame(roles);
    ok(use(game, 'p2', 'seer.investigate', ['p1']));
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    ok(skip(game, 'p3', 'witch.heal'));
    ok(skip(game, 'p3', 'witch.poison'));
    expect(game.phase).toBe('DAY_ANNOUNCEMENT');
    expectError(use(game, 'p3', 'witch.poison', ['p1']), 'WRONG_PHASE');
    for (let i = 0; i < 3; i++) ok(game.dispatch({ type: 'ADVANCE' }));
    expect(game.phase).toBe('NIGHT_ACTIONS');
    expectError(use(game, 'p2', 'seer.investigate', ['p1']), 'PLAYER_DEAD');
  });

  it('erlaubt eine konfigurierbare Weckreihenfolge', () => {
    const game = setupGame(roles, { nightOrder: { seer: 55 } });
    expect(game.publicView().nightStep?.id).toBe('werewolves');
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    expect(game.publicView().nightStep?.id).toBe('seer');
  });
});
