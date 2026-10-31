/**
 * Rollenkatalog der Grundversion. Neue Rolle: eigene Datei anlegen und hier
 * in BASE_ROLES eintragen (siehe docs/neue-rolle.md).
 */
import { Registry, type RoleDefinition, type RuleModule } from '../engine';
import { captainRule } from '../rules/captain';
import { mixedLoversRule } from '../rules/mixedLovers';
import { bearTamer, fox, knight } from './neighbors';
import { cupid } from './cupid';
import { wildChild, wolfhound } from './converts';
import { elder } from './elder';
import { healer } from './healer';
import { hunter } from './hunter';
import { idiot } from './idiot';
import { judge } from './judge';
import { piper } from './piper';
import { scapegoat } from './scapegoat';
import { seer } from './seer';
import { brothers, sisters } from './siblings';
import { thief } from './thief';
import { villager } from './villager';
import { werewolf } from './werewolf';
import { angel, bigBadWolf, urwolf, whiteWerewolf } from './wolves';
import { witch } from './witch';

export const BASE_ROLES: RoleDefinition[] = [
  villager, werewolf, seer, witch, hunter, cupid, thief,
  // Neumond
  healer, elder, idiot, scapegoat, piper,
  // Charaktere
  sisters, brothers, wolfhound, wildChild, fox, bearTamer, knight, judge, angel, urwolf, bigBadWolf, whiteWerewolf,
];

/** Optionale, rollenunabhängige Sonderregeln. */
export const BASE_RULES: RuleModule[] = [mixedLoversRule, captainRule];

export function createDefaultRegistry(): Registry {
  const registry = new Registry();
  for (const role of BASE_ROLES) registry.registerRole(role);
  for (const rule of BASE_RULES) registry.registerRule(rule);
  return registry;
}

export {
  angel, bearTamer, bigBadWolf, brothers, cupid, elder, fox, healer, hunter, idiot, judge, knight, piper, scapegoat, seer, sisters, thief, urwolf,
  villager, werewolf, whiteWerewolf, wildChild, witch, wolfhound,
};
