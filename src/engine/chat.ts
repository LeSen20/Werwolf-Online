/**
 * Öffentlicher Tages-Chat. Nachrichten sind normale öffentliche Ereignisse und
 * erscheinen dadurch automatisch in allen Ansichten (Menschen und Bots).
 */
import type { EngineContext } from './context';
import { GameError } from './errors';
import type { ChatCommand } from './types';

export const MAX_CHAT_LENGTH = 500;

export function postChat(ctx: EngineContext, command: ChatCommand): void {
  const speaker = ctx.player(command.playerId);
  if (!speaker.alive) throw new GameError('PLAYER_DEAD', `${speaker.name} ist tot und darf nicht mehr mitreden.`);
  const text = typeof command.text === 'string' ? command.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new GameError('INVALID_COMMAND', 'Leere Nachricht.');
  if (text.length > MAX_CHAT_LENGTH) throw new GameError('INVALID_COMMAND', `Nachricht zu lang (max. ${MAX_CHAT_LENGTH} Zeichen).`);
  ctx.publicEvent('chat', `${speaker.name}: ${text}`, { playerId: speaker.id, message: text });
}
