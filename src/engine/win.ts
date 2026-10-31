/**
 * Win Condition Evaluator: alle Siegbedingungen laufen hier zentral zusammen.
 * Grundbedingungen (Dorf, Werwölfe, Unentschieden) sind unten definiert,
 * weitere (Liebespaar, neutrale Rollen) werden über Regelmodule registriert.
 * Die Prüfung erfolgt in der Phase WIN_CHECK, also erst nachdem alle Todesfälle
 * eines Abschnitts inklusive Kettenreaktionen aufgelöst sind.
 */
import type { EngineContext } from './context';
import type { RuleModule, WinCondition } from './definitions';
import type { GameResult, PlayerState, TeamId } from './types';

export const VILLAGE: TeamId = 'village';
export const WEREWOLVES: TeamId = 'werewolves';

/** Ob ein Spieler den Sieg eines Teams noch verhindert. */
export function isOpponentOf(ctx: EngineContext, player: PlayerState, teamId: TeamId): boolean {
  const team = ctx.team(player);
  if (team === teamId) return false;
  return ctx.registry.getTeam(team)?.blocksOtherTeams !== false;
}

export function teamMembers(ctx: EngineContext, teamId: TeamId): PlayerState[] {
  return ctx.players.filter((p) => ctx.team(p) === teamId);
}

const noSurvivors: WinCondition = {
  id: 'draw-no-survivors',
  priority: 0,
  check: (ctx) =>
    ctx.alivePlayers().length === 0
      ? { team: null, winners: [], reason: 'Niemand hat überlebt.' }
      : null,
};

const villageWins: WinCondition = {
  id: 'village',
  priority: 20,
  check(ctx) {
    const alive = ctx.alivePlayers();
    const villagersAlive = alive.some((p) => ctx.team(p) === VILLAGE);
    if (!villagersAlive || alive.some((p) => isOpponentOf(ctx, p, VILLAGE))) return null;
    return { team: VILLAGE, reason: 'Alle Werwölfe und anderen Gegner des Dorfes sind ausgeschaltet.' };
  },
};

/**
 * Paritätsregel (zentral, über rules.werewolfWin umschaltbar):
 * - 'parity': Werwölfe gewinnen, sobald sie mindestens so viele sind wie alle
 *   lebenden Spieler, die ihnen den Sieg noch verwehren können.
 * - 'elimination': Werwölfe gewinnen erst, wenn kein Gegner mehr lebt.
 */
const werewolvesWin: WinCondition = {
  id: 'werewolves',
  priority: 30,
  check(ctx) {
    const alive = ctx.alivePlayers();
    const wolves = alive.filter((p) => ctx.team(p) === WEREWOLVES).length;
    if (wolves === 0) return null;
    const opponents = alive.filter((p) => isOpponentOf(ctx, p, WEREWOLVES)).length;
    if (ctx.rules.werewolfWin === 'elimination') {
      return opponents === 0 ? { team: WEREWOLVES, reason: 'Die Werwölfe haben alle Gegner gefressen.' } : null;
    }
    return wolves >= opponents
      ? { team: WEREWOLVES, reason: 'Die Werwölfe sind mindestens so zahlreich wie ihre Gegner und beherrschen das Dorf.' }
      : null;
  },
};

/** Auffangregel: nur noch Spieler von Teams am Leben, die niemanden blockieren. */
const stalemate: WinCondition = {
  id: 'draw-stalemate',
  priority: 1000,
  check(ctx) {
    const alive = ctx.alivePlayers();
    const nobodyCanWin = alive.every((p) => ctx.registry.getTeam(ctx.team(p))?.blocksOtherTeams === false);
    return nobodyCanWin ? { team: null, winners: [], reason: 'Keine Partei kann mehr gewinnen.' } : null;
  },
};

export const CORE_RULES: RuleModule = {
  id: 'core',
  teams: [
    { id: VILLAGE, name: 'Dorf' },
    { id: WEREWOLVES, name: 'Werwölfe' },
  ],
  winConditions: [noSurvivors, villageWins, werewolvesWin, stalemate],
  deathCauses: { vote: 'Abstimmung' },
};

/** Prüft alle registrierten Siegbedingungen nach Priorität. Die erste erfüllte entscheidet. */
export function evaluateWin(ctx: EngineContext): GameResult | null {
  for (const condition of ctx.registry.winConditions()) {
    const result = condition.check(ctx);
    if (!result) continue;
    const winners = result.winners ?? (result.team ? teamMembers(ctx, result.team).map((p) => p.id) : []);
    ctx.debug(`Siegbedingung erfüllt: ${condition.id}`);
    return { conditionId: condition.id, team: result.team, winners, reason: result.reason, aborted: false };
  }
  return null;
}
