export { BotController, type BotControllerOptions, type BotSetup } from './controller';
export { accusationsToday, assess, baseRate, ownChecks } from './brain';
export { ClaimStore, extractClaimsOffline, findMentions, questionTopic } from './claims';
export { renderIntent, renderReason, styleMessage } from './language';
export { PERSONAS, personaFor } from './personas';
export {
  accusationRanking,
  chooseVote,
  claimsFromIntent,
  decideAbility,
  newMemory,
  planSpeech,
  registerBotAbility,
  type AbilityStrategy,
  type BotContext,
} from './strategy';
export type * from './types';
