import { expect } from 'vitest';
import { Game, Registry, type Command, type DispatchResult, type GameConfigInput, type GameState, type RoleId } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';

export const NAMES = ['Anna', 'Ben', 'Clara', 'David', 'Emil', 'Frieda', 'Greta', 'Hans', 'Ida', 'Jonas', 'Karl', 'Lena'];

export function ok(result: DispatchResult): DispatchResult {
  if (!result.ok) throw new Error(`Befehl abgewiesen: ${result.error.code} ${result.error.message}`);
  return result;
}

export function expectError(result: DispatchResult, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export interface SetupOptions extends Partial<Omit<GameConfigInput, 'players' | 'roles'>> {
  /** Zusätzliche, nicht verteilte Karten (Dieb). */
  extraCards?: RoleId[];
  registry?: Registry;
  /** In ROLE_DISTRIBUTION stehen bleiben statt die erste Nacht zu starten. */
  stopBeforeNight?: boolean;
}

/** Partie mit fester Rollenzuweisung: Spieler p1..pN erhalten roles[0..N-1]. */
export function setupGame(roles: RoleId[], options: SetupOptions = {}): Game {
  const { extraCards = [], registry = createDefaultRegistry(), stopBeforeNight, ...config } = options;
  const deck: Record<RoleId, number> = {};
  for (const roleId of [...roles, ...extraCards]) deck[roleId] = (deck[roleId] ?? 0) + 1;
  const game = Game.create(
    {
      players: roles.map((_, i) => ({ id: `p${i + 1}`, name: NAMES[i] })),
      roles: deck,
      fixedRoles: Object.fromEntries(roles.map((roleId, i) => [`p${i + 1}`, roleId])),
      seed: 42,
      ...config,
    },
    registry,
  );
  ok(game.dispatch({ type: 'START_GAME' }));
  if (!stopBeforeNight) ok(game.dispatch({ type: 'ADVANCE' }));
  return game;
}

export const use = (game: Game, playerId: string, abilityId: string, targets: string[] = [], choice?: string) =>
  game.dispatch({ type: 'USE_ABILITY', playerId, abilityId, targets, ...(choice !== undefined ? { choice } : {}) });

export const skip = (game: Game, playerId: string, abilityId: string) =>
  game.dispatch({ type: 'USE_ABILITY', playerId, abilityId, skip: true });

/** Vom Tagesanbruch bis zur Abstimmung weiterschalten. */
export function toVoting(game: Game): void {
  expect(game.phase).toBe('DAY_ANNOUNCEMENT');
  ok(game.dispatch({ type: 'ADVANCE' }));
  ok(game.dispatch({ type: 'ADVANCE' }));
  expect(game.phase).toBe('DAY_VOTING');
}

export function voteAll(game: Game, ballots: Record<string, string | null>): DispatchResult[] {
  return Object.entries(ballots).map(([playerId, targetId]) => game.dispatch({ type: 'VOTE', playerId, targetId }));
}

export const alive = (game: Game) =>
  game
    .snapshot()
    .players.filter((p) => p.alive)
    .map((p) => p.id);

export const player = (game: Game, id: string) => game.snapshot().players.find((p) => p.id === id)!;

/**
 * Zufallsbot für Simulationen: trifft gültige Entscheidungen ausschließlich
 * über die Spieleransichten (wie ein späterer KI-Spieler) und erzwingt gelegentlich Zeitabläufe.
 */
export function playRandomGame(game: Game, seed: number, maxCommands = 5000): { commands: number; state: GameState } {
  let state = seed >>> 0;
  // kleiner deterministischer Zufallsgenerator nur für den Bot
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  let commands = 0;
  while (game.phase !== 'GAME_OVER' && commands < maxCommands) {
    commands += 1;
    let command: Command;
    switch (game.phase) {
      case 'SETUP':
        command = { type: 'START_GAME' };
        break;
      case 'NIGHT_ACTIONS':
      case 'DEATH_RESOLUTION': {
        if (random() < 0.05) {
          command = { type: 'TIMEOUT' };
          break;
        }
        const pending = pick(game.pendingDecisions());
        const prompt = game.viewFor(pending.playerId).pending.find((p) => p.abilityId === pending.abilityId)!;
        if (prompt.optional && random() < 0.3) {
          command = { type: 'USE_ABILITY', playerId: pending.playerId, abilityId: pending.abilityId, skip: true };
        } else if (prompt.kind === 'players') {
          const firstVote = prompt.group?.find((m) => m.targets)?.targets;
          const shuffled = [...prompt.candidates].sort(() => random() - 0.5);
          const targets = firstVote && random() < 0.8 ? firstVote : shuffled.slice(0, prompt.min).map((c) => c.id);
          command = { type: 'USE_ABILITY', playerId: pending.playerId, abilityId: pending.abilityId, targets };
        } else if (prompt.kind === 'choice') {
          command = { type: 'USE_ABILITY', playerId: pending.playerId, abilityId: pending.abilityId, choice: pick(prompt.choices).id };
        } else {
          command = { type: 'USE_ABILITY', playerId: pending.playerId, abilityId: pending.abilityId };
        }
        break;
      }
      case 'DAY_VOTING': {
        const view = game.publicView();
        const open = view.vote!.voters.filter((v) => !view.vote!.voted.includes(v.id));
        if (open.length === 0 || random() < 0.03) {
          command = { type: 'ADVANCE' };
          break;
        }
        const voter = pick(open);
        const options = game.viewFor(voter.id).vote!.options;
        const abstain = view.rules.allowAbstain && (options.length === 0 || random() < 0.1);
        if (!abstain && options.length === 0) {
          command = { type: 'ADVANCE' };
          break;
        }
        command = { type: 'VOTE', playerId: voter.id, targetId: abstain ? null : pick(options).id };
        break;
      }
      default:
        command = random() < 0.1 ? { type: 'TIMEOUT' } : { type: 'ADVANCE' };
    }
    const result = game.dispatch(command);
    if (!result.ok) throw new Error(`Bot-Befehl abgewiesen (${game.phase}): ${result.error.message} ${JSON.stringify(command)}`);
  }
  return { commands, state: game.snapshot() };
}
