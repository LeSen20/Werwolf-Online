/** Öffentliche Einstiegsdatei für Engine + Grundrollen (z.B. für einen späteren Server). */
import { Game, type GameConfigInput, type GameOptions } from './engine';
import { createDefaultRegistry } from './roles';

export * from './engine';
export { BASE_ROLES, BASE_RULES, createDefaultRegistry } from './roles';

/** Partie mit den Grundrollen erzeugen. */
export function createGame(config: GameConfigInput, options?: GameOptions): Game {
  return Game.create(config, createDefaultRegistry(), options);
}
