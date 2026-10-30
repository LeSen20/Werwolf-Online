import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH } from '../src/engine';
import { expectError, ok, setupGame, use } from './helpers';

describe('Tages-Chat (Engine)', () => {
  it('veröffentlicht Nachrichten lebender Spieler am Tag für alle', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager']);
    expectError(game.dispatch({ type: 'CHAT', playerId: 'p2', text: 'Hallo' }), 'WRONG_PHASE');
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    ok(game.dispatch({ type: 'CHAT', playerId: 'p2', text: '  Wer war   das?  ' }));
    const event = game.viewFor('p3').events.find((e) => e.type === 'chat');
    expect(event?.text).toBe('Ben: Wer war das?');
    expect(event?.data).toEqual({ playerId: 'p2', message: 'Wer war das?' });
    expect(game.publicView().events.some((e) => e.type === 'chat')).toBe(true);
  });

  it('weist Tote, leere und zu lange Nachrichten ab', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    expectError(game.dispatch({ type: 'CHAT', playerId: 'p4', text: 'Ich bin tot' }), 'PLAYER_DEAD');
    expectError(game.dispatch({ type: 'CHAT', playerId: 'p2', text: '   ' }), 'INVALID_COMMAND');
    expectError(game.dispatch({ type: 'CHAT', playerId: 'p2', text: 'x'.repeat(MAX_CHAT_LENGTH + 1) }), 'INVALID_COMMAND');
  });
});
