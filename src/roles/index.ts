/**
 * Rollenkatalog der Grundversion. Neue Rolle: eigene Datei anlegen und hier
 * in BASE_ROLES eintragen (siehe docs/neue-rolle.md).
 */
import { Registry, type RoleDefinition, type RuleModule } from '../engine';
import { mixedLoversRule } from '../rules/mixedLovers';
import { cupid } from './cupid';
import { hunter } from './hunter';
import { seer } from './seer';
import { thief } from './thief';
import { villager } from './villager';
import { werewolf } from './werewolf';
import { witch } from './witch';

export const BASE_ROLES: RoleDefinition[] = [villager, werewolf, seer, witch, hunter, cupid, thief];

/** Optionale, rollenunabhängige Sonderregeln. */
export const BASE_RULES: RuleModule[] = [mixedLoversRule];

export function createDefaultRegistry(): Registry {
  const registry = new Registry();
  for (const role of BASE_ROLES) registry.registerRole(role);
  for (const rule of BASE_RULES) registry.registerRule(rule);
  return registry;
}

export { cupid, hunter, seer, thief, villager, werewolf, witch };
