/**
 * Ansichten: Jeder Spieler bekommt nur die Informationen, die er laut Regeln
 * sehen darf. Die öffentliche Ansicht (Erzähler, Zuschauer) enthält nur
 * öffentliche Informationen. Ein Server schickt später einfach diese Objekte.
 */
import { candidatesOf, choicesOf, currentPending } from './actions';
import type { EngineContext } from './context';
import type { Choice } from './definitions';
import { FACTION_LABELS, PHASE_LABELS } from './labels';
import type {
  AbilityId,
  Faction,
  GameEvent,
  GameResult,
  GameRules,
  PendingDecision,
  Phase,
  PlayerId,
  PlayerState,
  RoleId,
  TeamId,
  TimeOfDay,
  Timers,
} from './types';
import { ballotOptions } from './voting';

export interface RoleInfo {
  id: RoleId;
  name: string;
  description: string;
  faction: Faction;
  factionName: string;
  team: TeamId;
  teamName: string;
}

export interface PlayerSummary {
  id: PlayerId;
  name: string;
  seat: number;
  alive: boolean;
  /** Bekannte Rolle (eigene, aufgedeckte oder am Spielende). */
  role: RoleInfo | null;
  /** Bekannte Fraktion (z.B. wenn beim Tod nur die Fraktion aufgedeckt wird). */
  faction: Faction | null;
  /** Wissen über den Spieler, z.B. "Werwolf" oder "Verliebt". */
  labels: string[];
  /** Dasselbe Wissen maschinenlesbar, z.B. 'werewolf-pack', 'lover', 'couple'. */
  relations: string[];
  /** Todesursache, erst am Spielende sichtbar. */
  deathCause: string | null;
  /** Öffentliche Abzeichen, z.B. "Hauptmann". */
  badges: string[];
}

export interface NamedPlayer {
  id: PlayerId;
  name: string;
}

export interface DecisionPrompt {
  abilityId: AbilityId;
  abilityName: string;
  title: string;
  info: string[];
  kind: 'players' | 'choice' | 'confirm';
  min: number;
  max: number;
  optional: boolean;
  candidates: NamedPlayer[];
  choices: Choice[];
  /** Nur Gruppenentscheidungen: aktuelle Stimmen aller Mitglieder. */
  group: Array<{ playerId: PlayerId; name: string; targets: PlayerId[] | null }> | null;
}

export interface VoteView {
  kind: 'lynch' | 'election';
  round: number;
  candidates: NamedPlayer[];
  voters: NamedPlayer[];
  /** Wer bereits abgestimmt hat (nicht wofür). */
  voted: PlayerId[];
}

export interface PlayerVoteView extends VoteView {
  canVote: boolean;
  /** Darf mit der Stimme eine zweite Abstimmung verlangen (Stotternder Richter). */
  canRequestSecondVote: boolean;
  hasVoted: boolean;
  myBallot: PlayerId | null;
  options: NamedPlayer[];
}

export interface PublicView {
  phase: Phase;
  phaseLabel: string;
  round: number;
  time: TimeOfDay | null;
  players: PlayerSummary[];
  /** Rollen im Spiel (öffentlich, wie beim Kartenspiel üblich). */
  deck: Array<{ roleId: RoleId; name: string; faction: Faction; count: number }>;
  nightStep: { id: string; label: string } | null;
  deathDecisions: Array<{ playerId: PlayerId; name: string; abilityName: string }>;
  vote: VoteView | null;
  result: GameResult | null;
  rules: GameRules;
  timers: Timers;
  events: GameEvent[];
}

export interface PlayerView extends Omit<PublicView, 'vote'> {
  self: { id: PlayerId; name: string; alive: boolean; role: RoleInfo | null; team: TeamId | null; teamName: string | null };
  pending: DecisionPrompt[];
  vote: PlayerVoteView | null;
}

const named = (ctx: EngineContext, ids: PlayerId[]): NamedPlayer[] => ids.map((id) => ({ id, name: ctx.name(id) }));

export function roleInfo(ctx: EngineContext, roleId: RoleId): RoleInfo {
  const role = ctx.registry.getRole(roleId);
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    faction: role.faction,
    factionName: FACTION_LABELS[role.faction],
    team: role.team,
    teamName: ctx.teamName(role.team),
  };
}

function isVisible(event: GameEvent, viewerId: PlayerId | null): boolean {
  if (event.visibility.kind === 'public') return true;
  if (event.visibility.kind === 'players') return viewerId !== null && event.visibility.playerIds.includes(viewerId);
  return false;
}

interface Known {
  labels: string[];
  relations: string[];
}

function collectKnowledge(ctx: EngineContext, viewer: PlayerState): Map<PlayerId, Known> {
  const known = new Map<PlayerId, Known>();
  for (const rule of ctx.registry.rules) {
    for (const info of rule.knowledge?.(ctx, viewer) ?? []) {
      if (info.playerId === viewer.id) continue;
      const entry = known.get(info.playerId) ?? { labels: [], relations: [] };
      if (!entry.labels.includes(info.label)) entry.labels.push(info.label);
      if (info.kind && !entry.relations.includes(info.kind)) entry.relations.push(info.kind);
      known.set(info.playerId, entry);
    }
  }
  return known;
}

function summarize(ctx: EngineContext, player: PlayerState, viewer: PlayerState | null, known: Map<PlayerId, Known>): PlayerSummary {
  const dealt = player.roleId !== '';
  let role: RoleInfo | null = null;
  let faction: Faction | null = null;
  if (dealt && (ctx.state.phase === 'GAME_OVER' || viewer?.id === player.id)) {
    role = roleInfo(ctx, player.roleId);
  } else if (dealt && !player.alive) {
    if (ctx.rules.revealRoleOnDeath === 'role') role = roleInfo(ctx, player.roleId);
    else if (ctx.rules.revealRoleOnDeath === 'faction') faction = ctx.faction(player);
  }
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    alive: player.alive,
    role,
    faction: role?.faction ?? faction,
    labels: known.get(player.id)?.labels ?? [],
    relations: known.get(player.id)?.relations ?? [],
    deathCause: ctx.state.phase === 'GAME_OVER' && player.death ? ctx.registry.causeLabel(player.death.cause) : null,
    badges: ctx.registry.rules.flatMap((rule) => rule.badges?.(ctx, player) ?? []),
  };
}

export function buildPrompt(ctx: EngineContext, pending: PendingDecision): DecisionPrompt {
  const ability = ctx.registry.getAbility(pending.abilityId);
  const actor = ctx.player(pending.playerId);
  const text = ability.describe?.(ctx, actor) ?? {};
  const input = ability.input;
  let group: DecisionPrompt['group'] = null;
  if (ability.group && ctx.state.night) {
    const votes = ctx.state.night.groupVotes[ability.id] ?? {};
    group = currentPending(ctx)
      .filter((p) => p.abilityId === ability.id)
      .map((p) => ({ playerId: p.playerId, name: ctx.name(p.playerId), targets: votes[p.playerId] ?? null }));
  }
  return {
    abilityId: ability.id,
    abilityName: ability.name,
    title: text.title ?? ability.name,
    info: (text.info ?? []).filter((line) => line.length > 0),
    kind: input.kind,
    min: input.kind === 'players' ? input.min : 0,
    max: input.kind === 'players' ? input.max : 0,
    optional: ability.optional === true,
    candidates: input.kind === 'players' ? named(ctx, candidatesOf(ctx, ability, actor)) : [],
    choices: input.kind === 'choice' ? choicesOf(ctx, ability, actor) : [],
    group,
  };
}

function buildBaseView(ctx: EngineContext, viewer: PlayerState | null): PublicView {
  const state = ctx.state;
  const known = viewer && viewer.roleId ? collectKnowledge(ctx, viewer) : new Map<PlayerId, Known>();
  const vote = state.phase === 'DAY_VOTING' ? state.vote : null;
  return {
    phase: state.phase,
    phaseLabel: PHASE_LABELS[state.phase],
    round: state.round,
    time: state.time,
    players: state.players.map((p) => summarize(ctx, p, viewer, known)),
    deck: Object.entries(state.config.roles).map(([roleId, count]) => ({
      roleId,
      name: ctx.roleName(roleId),
      faction: ctx.registry.getRole(roleId).faction,
      count,
    })),
    nightStep: state.phase === 'NIGHT_ACTIONS' && state.night?.step ? { id: state.night.step.id, label: state.night.step.label } : null,
    deathDecisions:
      state.phase === 'DEATH_RESOLUTION'
        ? state.deaths.pending.map((p) => ({ playerId: p.playerId, name: ctx.name(p.playerId), abilityName: ctx.registry.getAbility(p.abilityId).name }))
        : [],
    vote: vote
      ? {
          kind: vote.kind ?? 'lynch',
          round: vote.round,
          candidates: named(ctx, vote.candidates),
          voters: named(ctx, vote.voters),
          voted: vote.voters.filter((id) => Object.hasOwn(vote.ballots, id)),
        }
      : null,
    result: state.result,
    rules: state.config.rules,
    timers: state.config.timers,
    events: state.events.filter((e) => isVisible(e, viewer?.id ?? null)),
  };
}

export function buildPublicView(ctx: EngineContext): PublicView {
  return buildBaseView(ctx, null);
}

export function buildPlayerView(ctx: EngineContext, playerId: PlayerId): PlayerView {
  const viewer = ctx.player(playerId);
  const base = buildBaseView(ctx, viewer);
  const dealt = viewer.roleId !== '';
  const team = dealt ? ctx.team(viewer) : null;
  const vote = base.vote && ctx.state.vote;
  return {
    ...base,
    self: {
      id: viewer.id,
      name: viewer.name,
      alive: viewer.alive,
      role: dealt ? roleInfo(ctx, viewer.roleId) : null,
      team,
      teamName: team ? ctx.teamName(team) : null,
    },
    pending: currentPending(ctx)
      .filter((p) => p.playerId === viewer.id)
      .map((p) => buildPrompt(ctx, p)),
    vote:
      base.vote && vote
        ? {
            ...base.vote,
            canVote: viewer.alive && vote.voters.includes(viewer.id),
            canRequestSecondVote:
              (vote.kind ?? 'lynch') === 'lynch' && ctx.registry.rules.some((rule) => rule.canRequestSecondVote?.(ctx, viewer)),
            hasVoted: Object.hasOwn(vote.ballots, viewer.id),
            myBallot: vote.ballots[viewer.id] ?? null,
            options: named(ctx, ballotOptions(ctx, viewer.id)),
          }
        : null,
  };
}
