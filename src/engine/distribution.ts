/**
 * Rollenverteilung, getrennt von der restlichen Spiellogik:
 * Stapel bilden, feste Zuweisungen entnehmen, mischen, je Spieler genau eine
 * Karte austeilen, übrige Karten (Dieb) beiseitelegen.
 */
import type { EngineContext } from './context';
import { GameError } from './errors';
import type { RoleId } from './types';

const MAX_DEAL_ATTEMPTS = 200;

export function dealRoles(ctx: EngineContext): void {
  const { config } = ctx;
  const remaining: RoleId[] = [];
  for (const roleId of Object.keys(config.roles).sort()) {
    for (let i = 0; i < config.roles[roleId]; i++) remaining.push(roleId);
  }
  for (const roleId of Object.values(config.fixedRoles)) {
    const index = remaining.indexOf(roleId);
    if (index < 0) throw new GameError('INVALID_CONFIG', `Feste Rolle "${roleId}" ist nicht im Kartenstapel.`);
    remaining.splice(index, 1);
  }
  const openPlayers = ctx.players.filter((p) => !(p.id in config.fixedRoles));

  // Mischen; Verteilungen ohne ausgeteilten Werwolf werden verworfen (z.B. alle Werwölfe bei den Dieb-Karten).
  let dealt: RoleId[] | null = null;
  let extras: RoleId[] = [];
  for (let attempt = 1; attempt <= MAX_DEAL_ATTEMPTS && !dealt; attempt++) {
    const shuffled = ctx.shuffle(remaining);
    const candidate = shuffled.slice(0, openPlayers.length);
    if (isValidDeal(ctx, candidate)) {
      dealt = candidate;
      extras = shuffled.slice(openPlayers.length);
      if (attempt > 1) ctx.debug(`Rollenverteilung nach ${attempt} Versuchen gültig.`);
    }
  }
  if (!dealt) throw new GameError('INVALID_CONFIG', 'Es konnte keine gültige Rollenverteilung gefunden werden.');

  openPlayers.forEach((player, index) => {
    player.roleId = dealt[index];
    player.originalRoleId = dealt[index];
  });
  for (const [playerId, roleId] of Object.entries(config.fixedRoles)) {
    const player = ctx.player(playerId);
    player.roleId = roleId;
    player.originalRoleId = roleId;
  }
  ctx.state.extraCards = extras;

  for (const player of ctx.players) {
    ctx.privateEvent([player.id], 'role-assigned', `Deine Rolle: ${ctx.roleName(player.roleId)}.`, { roleId: player.roleId });
  }
  ctx.publicEvent('roles-dealt', 'Die Rollenkarten wurden verteilt. Jeder sieht sich geheim seine Karte an.');
  ctx.debug(`Verteilung: ${ctx.players.map((p) => `${p.name}=${p.roleId}`).join(', ')}; Zusatzkarten: ${extras.join(', ') || '-'}`);
}

function isValidDeal(ctx: EngineContext, dealt: RoleId[]): boolean {
  if (!ctx.rules.requireWerewolves) return true;
  return [...dealt, ...Object.values(ctx.config.fixedRoles)].some((roleId) => ctx.registry.getRole(roleId).faction === 'werewolves');
}
