/**
 * Voting System: Tagesabstimmung mit geheimer Stimmabgabe, Enthaltungen,
 * optionaler Stimmänderung und konfigurierbarer Gleichstandsregel.
 */
import { MARK_NO_VOTE, type EngineContext } from './context';
import { GameError } from './errors';
import type { PlayerId, VoteCommand, VoteState } from './types';

export type VoteOutcome =
  | { kind: 'eliminate'; playerId: PlayerId }
  | { kind: 'elect'; playerId: PlayerId }
  | { kind: 'runoff'; candidates: PlayerId[] }
  | { kind: 'none' };

function requireVote(ctx: EngineContext): VoteState {
  if (!ctx.state.vote) throw new GameError('INTERNAL_ERROR', 'Es läuft keine Abstimmung.');
  return ctx.state.vote;
}

const names = (ctx: EngineContext, ids: PlayerId[]) => ids.map((id) => ctx.name(id)).join(', ');

export function startVote(ctx: EngineContext, candidates: PlayerId[], round: number, kind: 'lynch' | 'election' = 'lynch'): void {
  const voters = ctx
    .alivePlayers()
    .filter((p) => p.marks[MARK_NO_VOTE] !== true && ctx.registry.rules.every((rule) => rule.canVote?.(ctx, p) ?? true))
    .map((p) => p.id);
  ctx.state.vote = { kind, round, candidates: [...candidates], voters, ballots: {} };
  const text =
    round > 1
      ? `Stichwahl zwischen ${names(ctx, candidates)}.`
      : kind === 'election'
        ? 'Das Dorf wählt einen Hauptmann. Jeder lebende Spieler hat eine Stimme.'
        : 'Die Abstimmung beginnt. Jeder lebende Spieler hat eine Stimme.';
  ctx.publicEvent('vote-start', text, { round, candidates, kind });
}

/** Ziele, für die ein Spieler stimmen darf. */
export function ballotOptions(ctx: EngineContext, voterId: PlayerId): PlayerId[] {
  const vote = ctx.state.vote;
  if (!vote) return [];
  return vote.candidates.filter((id) => ctx.rules.allowSelfVote || id !== voterId);
}

/** Gibt true zurück, wenn alle Stimmberechtigten abgestimmt haben. */
export function castVote(ctx: EngineContext, command: VoteCommand): boolean {
  const vote = requireVote(ctx);
  const voter = ctx.player(command.playerId);
  if (!voter.alive) throw new GameError('PLAYER_DEAD', `${voter.name} ist tot und darf nicht abstimmen.`);
  if (!vote.voters.includes(voter.id)) throw new GameError('NOT_ALLOWED', `${voter.name} ist in dieser Abstimmung nicht stimmberechtigt.`);
  const changed = Object.hasOwn(vote.ballots, voter.id);
  if (changed && !ctx.rules.allowVoteChange) throw new GameError('ALREADY_VOTED', `${voter.name} hat bereits abgestimmt.`);

  const targetId = command.targetId ?? null;
  if (targetId === null) {
    if (!ctx.rules.allowAbstain) throw new GameError('NOT_ALLOWED', 'Enthaltungen sind in dieser Partie nicht erlaubt.');
  } else {
    const target = ctx.player(targetId);
    if (!vote.candidates.includes(target.id)) throw new GameError('INVALID_TARGET', `${target.name} steht nicht zur Wahl.`);
    if (target.id === voter.id && !ctx.rules.allowSelfVote) throw new GameError('INVALID_TARGET', 'Man darf nicht für sich selbst stimmen.');
  }

  if (command.requestSecondVote) {
    const rule = ctx.registry.rules.find((r) => r.canRequestSecondVote?.(ctx, voter));
    if (!rule) throw new GameError('NOT_ALLOWED', `${voter.name} kann keine zweite Abstimmung verlangen.`);
    rule.onSecondVoteRequest?.(ctx, voter);
  }
  vote.ballots[voter.id] = targetId;
  ctx.privateEvent(
    [voter.id],
    'ballot',
    `${changed ? 'Stimme geändert: ' : ''}${targetId ? `Du stimmst für ${ctx.name(targetId)}.` : 'Du enthältst dich.'}`,
    { targetId },
  );
  return vote.voters.every((id) => Object.hasOwn(vote.ballots, id));
}

/** Abstimmung schließen (Host oder Zeitablauf): fehlende Stimmen zählen als Enthaltung. */
export function closeVote(ctx: EngineContext): void {
  const vote = requireVote(ctx);
  const missing = vote.voters.filter((id) => !Object.hasOwn(vote.ballots, id));
  for (const id of missing) vote.ballots[id] = null;
  if (missing.length > 0) ctx.debug(`Abstimmung geschlossen, ohne Stimme: ${names(ctx, missing)}`);
}

/** Wahl (z.B. Hauptmann): Mehrheit gewinnt, bei Gleichstand Stichwahl, danach entscheidet das Los. */
function resolveElection(ctx: EngineContext, vote: VoteState, leaders: PlayerId[]): VoteOutcome {
  const pool = leaders.length > 0 ? leaders : vote.candidates;
  if (pool.length > 1 && vote.round === 1 && leaders.length > 1) {
    ctx.publicEvent('vote-tie', `Gleichstand zwischen ${names(ctx, pool)}. Es folgt eine Stichwahl.`, { leaders: pool });
    return { kind: 'runoff', candidates: pool };
  }
  const chosen = pool.length === 1 ? pool[0] : ctx.pick(pool);
  if (pool.length > 1 || leaders.length === 0) ctx.publicEvent('vote-lot', `Keine Mehrheit. Das Los entscheidet: ${ctx.name(chosen)}.`, { playerId: chosen });
  return { kind: 'elect', playerId: chosen };
}

/** Gewicht einer Stimme laut Regelmodulen (z.B. Hauptmann zählt doppelt). */
export function voteWeight(ctx: EngineContext, voterId: PlayerId): number {
  const voter = ctx.player(voterId);
  return ctx.registry.rules.reduce((weight, rule) => weight * (rule.voteWeight?.(ctx, voter) ?? 1), 1);
}

export function resolveVote(ctx: EngineContext): VoteOutcome {
  const vote = requireVote(ctx);
  const election = vote.kind === 'election';
  const counts = new Map<PlayerId, number>();
  let abstentions = 0;
  for (const voterId of vote.voters) {
    const ballot = vote.ballots[voterId];
    if (ballot === undefined || ballot === null) abstentions += 1;
    else counts.set(ballot, (counts.get(ballot) ?? 0) + (election ? 1 : voteWeight(ctx, voterId)));
  }

  const tally = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const summary = tally.map(([id, n]) => `${ctx.name(id)}: ${n}`).join(', ') || 'keine Stimmen';
  ctx.publicEvent('vote-result', `Ergebnis: ${summary}${abstentions ? `, Enthaltungen: ${abstentions}` : ''}.`, {
    round: vote.round,
    counts: Object.fromEntries(counts),
    abstentions,
    ...(ctx.rules.revealBallots ? { ballots: { ...vote.ballots } } : {}),
  });
  if (ctx.rules.revealBallots) {
    const lines = vote.voters.map((id) => `${ctx.name(id)} -> ${vote.ballots[id] ? ctx.name(vote.ballots[id]!) : 'Enthaltung'}`);
    ctx.publicEvent('vote-ballots', `Stimmen: ${lines.join('; ')}.`);
  }

  if (election) return resolveElection(ctx, vote, tally.filter(([, n]) => n === tally[0]?.[1]).map(([id]) => id));
  if (tally.length === 0) {
    ctx.publicEvent('vote-none', 'Niemand erhält eine Stimme. Heute wird niemand verbannt.');
    return { kind: 'none' };
  }
  const max = tally[0][1];
  const leaders = tally.filter(([, n]) => n === max).map(([id]) => id);
  if (leaders.length === 1) {
    ctx.publicEvent('vote-elimination', `${ctx.name(leaders[0])} wird vom Dorf verbannt.`, { playerId: leaders[0] });
    return { kind: 'eliminate', playerId: leaders[0] };
  }

  for (const module of ctx.registry.rules) {
    const chosen = module.onVoteTie?.(ctx, leaders);
    if (chosen) return { kind: 'eliminate', playerId: chosen };
  }
  const rule = vote.round === 1 ? ctx.rules.tieBreak : ctx.rules.runoffTieBreak;
  if (rule === 'runoff') {
    ctx.publicEvent('vote-tie', `Gleichstand zwischen ${names(ctx, leaders)}. Es folgt eine Stichwahl.`, { leaders });
    return { kind: 'runoff', candidates: leaders };
  }
  if (rule === 'random') {
    const chosen = ctx.pick(leaders);
    ctx.publicEvent('vote-elimination', `Gleichstand zwischen ${names(ctx, leaders)}. Das Los trifft ${ctx.name(chosen)}.`, {
      playerId: chosen,
      leaders,
    });
    return { kind: 'eliminate', playerId: chosen };
  }
  ctx.publicEvent('vote-none', `Gleichstand zwischen ${names(ctx, leaders)}. Heute wird niemand verbannt.`, { leaders });
  return { kind: 'none' };
}
