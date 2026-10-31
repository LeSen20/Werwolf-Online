import { describe, expect, it } from 'vitest';
import { expectError, ok, player, setupGame, use } from './helpers';

describe('Dieb', () => {
  it('übernimmt die gewählte Rolle vollständig (Werwolf)', () => {
    const game = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager'], { extraCards: ['werewolf', 'seer'] });
    expect(game.publicView().nightStep?.id).toBe('thief');
    const prompt = game.viewFor('p1').pending[0];
    expect(prompt.choices.map((c) => c.id).sort()).toEqual(['keep', 'seer', 'werewolf']);
    ok(use(game, 'p1', 'thief.steal', [], 'werewolf'));
    const state = game.snapshot();
    expect(player(game, 'p1').roleId).toBe('werewolf');
    expect(player(game, 'p1').originalRoleId).toBe('thief');
    expect([...state.extraCards].sort()).toEqual(['seer', 'thief']);
    // Neuer Werwolf wacht mit dem Rudel auf und ist dem Rudel bekannt.
    expect(game.pendingDecisions().map((p) => p.playerId).sort()).toEqual(['p1', 'p2']);
    expect(game.viewFor('p2').players.find((p) => p.id === 'p1')?.labels).toContain('Werwolf');
    expect(game.viewFor('p1').self.team).toBe('werewolves');
  });

  it('muss einen Werwolf nehmen, wenn beide Karten Werwölfe sind', () => {
    const game = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], {
      extraCards: ['werewolf', 'werewolf'],
    });
    expect(game.viewFor('p1').pending[0].choices.map((c) => c.id)).toEqual(['werewolf']);
    expectError(use(game, 'p1', 'thief.steal', [], 'keep'), 'INVALID_CHOICE');
    ok(game.dispatch({ type: 'TIMEOUT' }));
    expect(player(game, 'p1').roleId).toBe('werewolf');
  });

  it('kann als Amor noch in derselben Nacht ein Liebespaar bestimmen', () => {
    const game = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager'], { extraCards: ['cupid', 'villager'] });
    ok(use(game, 'p1', 'thief.steal', [], 'cupid'));
    expect(game.publicView().nightStep?.id).toBe('cupid');
    ok(use(game, 'p1', 'cupid.link', ['p3', 'p4']));
    expect(game.publicView().nightStep?.id).toBe('lovers');
  });

  it('bleibt Dieb (spielt als Dorfbewohner) bei Verzicht oder Zeitablauf', () => {
    const game = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager'], { extraCards: ['seer', 'villager'] });
    ok(game.dispatch({ type: 'TIMEOUT' }));
    expect(player(game, 'p1').roleId).toBe('thief');
    expect(game.viewFor('p1').self.team).toBe('village');
    expect(game.publicView().nightStep?.id).toBe('werewolves');
    // Die Diebfähigkeit ist danach nicht mehr verfügbar.
    expectError(use(game, 'p1', 'thief.steal', [], 'seer'), 'ABILITY_USED_UP');
  });
});
