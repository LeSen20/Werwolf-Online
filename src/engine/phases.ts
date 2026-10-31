/**
 * Zentraler Zustandsautomat.
 *
 * Wartende Phasen (brauchen Eingaben): SETUP, ROLE_DISTRIBUTION, NIGHT_ACTIONS,
 * DEATH_RESOLUTION (nur solange z.B. der Jäger entscheidet), DAY_ANNOUNCEMENT,
 * DAY_DISCUSSION, DAY_VOTING, GAME_OVER.
 * Durchlaufphasen (werden innerhalb eines Befehls automatisch abgearbeitet):
 * NIGHT_START, NIGHT_RESOLUTION, VOTE_RESOLUTION, WIN_CHECK.
 *
 * DEATH_RESOLUTION und WIN_CHECK werden von Nacht und Tag aus erreicht; wohin es danach
 * weitergeht, steht in state.continuation.
 */
import { submitDecision, timeoutAllPending } from './actions';
import { postChat } from './chat';
import type { EngineContext } from './context';
import { processDeathQueue, revealText } from './deaths';
import { dealRoles } from './distribution';
import { GameError } from './errors';
import { PHASE_LABELS } from './labels';
import { advanceNight, resolveNight, startNight } from './night';
import type { Command, CommandType, GameResult, Phase } from './types';
import { castVote, closeVote, resolveVote, startVote } from './voting';
import { evaluateWin } from './win';

interface PhaseSpec {
  /** Befehle, die in dieser Phase angenommen werden. */
  commands: readonly CommandType[];
  /** Erlaubte Folgephasen (GAME_OVER per Abbruch ist immer erlaubt). */
  next: readonly Phase[];
}

export const PHASE_SPECS: Record<Phase, PhaseSpec> = {
  SETUP: { commands: ['START_GAME', 'ABORT'], next: ['ROLE_DISTRIBUTION'] },
  ROLE_DISTRIBUTION: { commands: ['ADVANCE', 'TIMEOUT', 'ABORT'], next: ['NIGHT_START'] },
  NIGHT_START: { commands: [], next: ['NIGHT_ACTIONS'] },
  NIGHT_ACTIONS: { commands: ['USE_ABILITY', 'TIMEOUT', 'ABORT'], next: ['NIGHT_RESOLUTION'] },
  NIGHT_RESOLUTION: { commands: [], next: ['DEATH_RESOLUTION'] },
  DEATH_RESOLUTION: { commands: ['USE_ABILITY', 'TIMEOUT', 'ABORT'], next: ['WIN_CHECK'] },
  WIN_CHECK: { commands: [], next: ['DAY_ANNOUNCEMENT', 'NIGHT_START', 'DAY_VOTING'] },
  DAY_ANNOUNCEMENT: { commands: ['ADVANCE', 'TIMEOUT', 'CHAT', 'ABORT'], next: ['DAY_DISCUSSION'] },
  DAY_DISCUSSION: { commands: ['ADVANCE', 'TIMEOUT', 'CHAT', 'ABORT'], next: ['DAY_VOTING'] },
  DAY_VOTING: { commands: ['VOTE', 'CHAT', 'ADVANCE', 'TIMEOUT', 'ABORT'], next: ['VOTE_RESOLUTION'] },
  VOTE_RESOLUTION: { commands: [], next: ['DAY_VOTING', 'DEATH_RESOLUTION'] },
  GAME_OVER: { commands: [], next: [] },
};

export function transition(ctx: EngineContext, to: Phase): void {
  const from = ctx.state.phase;
  const allowed = from !== 'GAME_OVER' && (to === 'GAME_OVER' || PHASE_SPECS[from].next.includes(to));
  if (!allowed) throw new GameError('INTERNAL_ERROR', `Unzulässiger Phasenwechsel ${from} -> ${to}.`);
  ctx.state.phase = to;
  ctx.debug(`Phase: ${from} -> ${to}`);
  switch (to) {
    case 'ROLE_DISTRIBUTION':
      dealRoles(ctx);
      break;
    case 'NIGHT_START':
      startNight(ctx);
      break;
    case 'DAY_ANNOUNCEMENT':
      announceDay(ctx);
      break;
    case 'DAY_DISCUSSION':
      ctx.publicEvent('discussion', 'Die Diskussion beginnt.');
      break;
  }
}

function announceDay(ctx: EngineContext): void {
  ctx.state.time = 'day';
  const dead = ctx.players.filter((p) => p.death && p.death.round === ctx.state.round && p.death.time === 'night');
  const list = dead.map((p) => {
    const revealed = revealText(ctx, p);
    return revealed ? `${p.name} (${revealed})` : p.name;
  });
  ctx.publicEvent(
    'day-start',
    dead.length > 0
      ? `Tag ${ctx.state.round}: Der Morgen graut. In der Nacht ${dead.length === 1 ? 'starb' : 'starben'}: ${list.join(', ')}.`
      : `Tag ${ctx.state.round}: Der Morgen graut. In dieser Nacht ist niemand gestorben.`,
    { deaths: dead.map((p) => p.id) },
  );
  for (const rule of ctx.registry.rules) rule.onDayStart?.(ctx);
}

function finishGame(ctx: EngineContext, result: GameResult): void {
  if (ctx.state.result) throw new GameError('GAME_OVER', 'Die Partie ist bereits beendet.');
  ctx.state.result = result;
  ctx.state.deaths = { queue: [], pending: [] };
  if (ctx.state.night) ctx.state.night.pending = [];
  transition(ctx, 'GAME_OVER');
  if (result.aborted) {
    ctx.publicEvent('game-over', `Die Partie wurde abgebrochen. ${result.reason}`.trim(), { result });
  } else {
    const headline = result.team ? `Sieger: ${ctx.teamName(result.team)}.` : 'Unentschieden.';
    ctx.publicEvent('game-over', `Spielende - ${headline} ${result.reason}`, { result, teamName: result.team ? ctx.teamName(result.team) : null });
  }
  if (ctx.players.every((p) => p.roleId !== '')) {
    ctx.publicEvent('roles-revealed', `Rollen: ${ctx.players.map((p) => `${p.name} – ${ctx.roleName(p.roleId)}`).join(', ')}.`);
  }
}

function handleAdvance(ctx: EngineContext): void {
  switch (ctx.state.phase) {
    case 'ROLE_DISTRIBUTION':
      transition(ctx, 'NIGHT_START');
      break;
    case 'DAY_ANNOUNCEMENT':
      transition(ctx, 'DAY_DISCUSSION');
      break;
    case 'DAY_DISCUSSION': {
      const election = ctx.registry.rules.some((rule) => rule.holdElection?.(ctx));
      startVote(ctx, ctx.alivePlayers().map((p) => p.id), 1, election ? 'election' : 'lynch');
      transition(ctx, 'DAY_VOTING');
      break;
    }
    case 'DAY_VOTING':
      closeVote(ctx);
      transition(ctx, 'VOTE_RESOLUTION');
      break;
    default:
      throw new GameError('WRONG_PHASE', `In der Phase "${PHASE_LABELS[ctx.state.phase]}" kann nicht manuell weitergeschaltet werden.`);
  }
}

/** Prüft, ob der Befehl in der aktuellen Phase erlaubt ist, und führt ihn aus. */
export function handleCommand(ctx: EngineContext, command: Command): void {
  const phase = ctx.state.phase;
  if (phase === 'GAME_OVER') throw new GameError('GAME_OVER', 'Die Partie ist bereits beendet.');
  if (!command || typeof command !== 'object' || !('type' in command)) throw new GameError('INVALID_COMMAND', 'Ungültiger Befehl.');
  if (!PHASE_SPECS[phase].commands.includes(command.type)) {
    throw new GameError('WRONG_PHASE', `"${command.type}" ist in der Phase "${PHASE_LABELS[phase]}" nicht erlaubt.`);
  }
  switch (command.type) {
    case 'START_GAME':
      transition(ctx, 'ROLE_DISTRIBUTION');
      break;
    case 'ADVANCE':
      handleAdvance(ctx);
      break;
    case 'USE_ABILITY':
      submitDecision(ctx, command);
      break;
    case 'VOTE':
      if (castVote(ctx, command) && !ctx.rules.allowVoteChange) transition(ctx, 'VOTE_RESOLUTION');
      break;
    case 'CHAT':
      postChat(ctx, command);
      break;
    case 'TIMEOUT':
      ctx.debug(`Zeitablauf in Phase ${phase}`);
      if (phase === 'NIGHT_ACTIONS' || phase === 'DEATH_RESOLUTION') timeoutAllPending(ctx);
      else handleAdvance(ctx);
      break;
    case 'ABORT':
      finishGame(ctx, { conditionId: 'aborted', team: null, winners: [], reason: command.reason ?? '', aborted: true });
      break;
  }
}

/** Arbeitet Durchlaufphasen ab, bis das Spiel auf Eingaben wartet oder beendet ist. */
export function advance(ctx: EngineContext): void {
  const state = ctx.state;
  for (let guard = 0; guard < 200; guard++) {
    switch (state.phase) {
      case 'NIGHT_START':
        transition(ctx, 'NIGHT_ACTIONS');
        break;
      case 'NIGHT_ACTIONS':
        if (!advanceNight(ctx)) return;
        transition(ctx, 'NIGHT_RESOLUTION');
        break;
      case 'NIGHT_RESOLUTION':
        resolveNight(ctx);
        state.continuation = 'DAY_ANNOUNCEMENT';
        transition(ctx, 'DEATH_RESOLUTION');
        break;
      case 'DEATH_RESOLUTION':
        if (processDeathQueue(ctx) === 'waiting') return;
        transition(ctx, 'WIN_CHECK');
        break;
      case 'WIN_CHECK': {
        const result = evaluateWin(ctx);
        if (result) {
          finishGame(ctx, result);
          return;
        }
        const next = state.continuation ?? 'NIGHT_START';
        if (next === 'DAY_VOTING') startVote(ctx, ctx.alivePlayers().map((p) => p.id), 1);
        transition(ctx, next);
        break;
      }
      case 'VOTE_RESOLUTION': {
        const outcome = resolveVote(ctx);
        if (outcome.kind === 'runoff') {
          startVote(ctx, outcome.candidates, (state.vote?.round ?? 1) + 1, state.vote?.kind ?? 'lynch');
          transition(ctx, 'DAY_VOTING');
          return;
        }
        if (outcome.kind === 'elect') {
          for (const rule of ctx.registry.rules) rule.onElected?.(ctx, outcome.playerId);
          startVote(ctx, ctx.alivePlayers().map((p) => p.id), 1);
          transition(ctx, 'DAY_VOTING');
          return;
        }
        if (outcome.kind === 'eliminate') {
          const player = ctx.player(outcome.playerId);
          const spared = ctx.registry.rules.some((rule) => rule.preventVoteElimination?.(ctx, player));
          if (!spared) ctx.kill(outcome.playerId, 'vote');
        }
        state.continuation = ctx.registry.rules.some((rule) => rule.takeSecondVote?.(ctx)) ? 'DAY_VOTING' : 'NIGHT_START';
        transition(ctx, 'DEATH_RESOLUTION');
        break;
      }
      default:
        return;
    }
  }
  throw new GameError('INTERNAL_ERROR', 'Der Phasenablauf hängt (Endlosschleife verhindert).');
}
