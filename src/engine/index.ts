export { Game, type GameOptions, type LogEntry } from './game';
export { Registry } from './registry';
export { EngineContext } from './context';
export { GameError, ConfigError, type ErrorCode } from './errors';
export {
  DEFAULT_RULES,
  DEFAULT_TIMERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  buildAutoDeck,
  suggestWerewolfCount,
  validateConfig,
  type AutoDeckOptions,
} from './config';
export { defineRole, defineRule } from './definitions';
export type {
  AbilityDefinition,
  AbilityInput,
  Choice,
  KnownInfo,
  PromptText,
  RoleDefinition,
  RuleModule,
  TeamDefinition,
  WinCheckResult,
  WinCondition,
} from './definitions';
export { NightResolution, type Attack, type Protection } from './night';
export { pluralityTargets } from './actions';
export { VILLAGE, WEREWOLVES, isOpponentOf, teamMembers } from './win';
export { PHASE_LABELS, FACTION_LABELS } from './labels';
export { PHASE_SPECS } from './phases';
export type { DecisionPrompt, PlayerSummary, PlayerView, PlayerVoteView, PublicView, RoleInfo, VoteView } from './views';
export * from './types';
