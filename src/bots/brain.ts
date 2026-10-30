/**
 * Verdachtsmodell der Bots. Grundlage ist ausschließlich die Spieleransicht des
 * Bots (viewFor) plus öffentliche Chat-Aussagen. Bots sehen also nie mehr als ein
 * menschlicher Spieler mit derselben Karte.
 *
 * Jeder Verdacht trägt nachvollziehbare Begründungen (Reason), die Bots im Chat
 * als Schlussfolgerung aussprechen.
 */
import type { Faction, PlayerId, PlayerSummary, PlayerView, RoleId } from '../engine';
import type { Claim, Reason, Suspicion } from './types';

export interface AssessOptions {
  /**
   * true: eigenes Geheimwissen nutzen (Seherin-Ergebnisse, Rudel, Partner).
   * false: nur öffentliche Informationen, so argumentiert ein getarnter Werwolf.
   */
  usePrivate: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function knownFaction(player: PlayerSummary): Faction | null {
  return player.role?.faction ?? player.faction;
}

/** Eigene Untersuchungsergebnisse (nur Seherin). */
export function ownChecks(view: PlayerView): Array<{ targetId: PlayerId; werewolf: boolean }> {
  return view.events
    .filter((e) => e.type === 'seer-result' && e.data && typeof e.data.targetId === 'string')
    .map((e) => ({ targetId: String(e.data!.targetId), werewolf: e.data!.isWerewolf === true }));
}

/** Grundwahrscheinlichkeit: verbleibende Werwölfe geteilt durch lebende Mitspieler. */
export function baseRate(view: PlayerView): number {
  const others = view.players.filter((p) => p.alive && p.id !== view.self.id);
  const wolfCards = view.deck.filter((d) => d.faction === 'werewolves').reduce((sum, d) => sum + d.count, 0);
  const deadWolves = view.players.filter((p) => !p.alive && knownFaction(p) === 'werewolves').length;
  const selfWolf = view.self.role?.faction === 'werewolves' ? 1 : 0;
  const wolvesLeft = Math.max(1, wolfCards - deadWolves - selfWolf);
  return clamp(wolvesLeft / Math.max(1, others.length), 0.05, 0.9);
}

/** Zuletzt behauptete Rolle je Spieler. */
export function roleClaims(claims: readonly Claim[]): Map<PlayerId, RoleId> {
  const result = new Map<PlayerId, RoleId>();
  for (const claim of claims) if (claim.kind === 'role' && claim.roleId) result.set(claim.speakerId, claim.roleId);
  return result;
}

export function assess(view: PlayerView, claims: readonly Claim[], options: AssessOptions): Suspicion[] {
  const me = view.self.id;
  const iAmInnocent = options.usePrivate ? view.self.role?.faction !== 'werewolves' : true;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const others = view.players.filter((p) => p.alive && p.id !== me);
  const revealed = (id: PlayerId): Faction | null => {
    const player = byId.get(id);
    return player && !player.alive ? knownFaction(player) : null;
  };
  const base = baseRate(view);
  const entries = new Map<PlayerId, Suspicion>(others.map((p) => [p.id, { playerId: p.id, score: base, known: null, reasons: [] }]));
  const used = new Set<string>();
  const add = (reason: Reason, key?: string) => {
    const entry = entries.get(reason.subjectId);
    if (!entry || (key && used.has(key))) return;
    if (key) used.add(key);
    entry.reasons.push(reason);
    entry.score += reason.weight;
  };

  // 1) Geheimwissen: eigene Untersuchungen, Rudel, Liebespartner
  if (options.usePrivate) {
    for (const check of ownChecks(view)) {
      const entry = entries.get(check.targetId);
      if (!entry) continue;
      entry.known = check.werewolf ? 'wolf' : 'good';
      entry.reasons.push({ code: check.werewolf ? 'own-check-wolf' : 'own-check-good', subjectId: check.targetId, weight: check.werewolf ? 1 : -1 });
    }
    for (const player of others) {
      const entry = entries.get(player.id)!;
      if (player.relations.includes('werewolf-pack') || player.relations.includes('lover')) entry.known ??= 'ally';
    }
  }

  // 2) Rollen-Behauptungen: Gegenbehauptungen und widerlegte Behauptungen
  const claimedRoles = roleClaims(claims);
  const uniqueRole = (roleId: RoleId) => (view.deck.find((d) => d.roleId === roleId)?.count ?? 0) <= 1;
  const credibility = new Map<PlayerId, number>();
  for (const [speaker, roleId] of claimedRoles) {
    if (!entries.has(speaker)) continue;
    let trust = 0.6;
    if (uniqueRole(roleId) && view.players.some((p) => !p.alive && p.role?.id === roleId)) {
      add({ code: 'false-claim', subjectId: speaker, roleId, weight: 0.6 });
      trust = 0.05;
    } else if (uniqueRole(roleId) && options.usePrivate && view.self.role?.id === roleId) {
      add({ code: 'false-claim', subjectId: speaker, relatedId: me, roleId, weight: 0.7 });
      trust = 0;
    } else if (uniqueRole(roleId)) {
      for (const [rival, rivalRole] of claimedRoles) {
        if (rival === speaker || rivalRole !== roleId || (!entries.has(rival) && rival !== me)) continue;
        add({ code: 'counter-claim', subjectId: speaker, relatedId: rival, roleId, weight: 0.25 });
        trust = Math.min(trust, 0.4);
      }
    }
    credibility.set(speaker, trust);
  }

  // 3) Untersuchungs-Behauptungen: erst gegen aufgedeckte Rollen prüfen, dann gewichten
  for (const claim of claims) {
    if (claim.kind !== 'investigation' || !claim.targetId || claim.speakerId === me || !entries.has(claim.speakerId)) continue;
    const truth = revealed(claim.targetId);
    if (truth) {
      const correct = (truth === 'werewolves') === (claim.result === 'werewolf');
      if (correct) credibility.set(claim.speakerId, Math.max(credibility.get(claim.speakerId) ?? 0.6, 0.9));
      else {
        add({ code: 'wrong-check', subjectId: claim.speakerId, relatedId: claim.targetId, weight: 0.5 });
        credibility.set(claim.speakerId, 0);
      }
    } else if (claim.targetId === me && claim.result === 'werewolf' && iAmInnocent) {
      add({ code: 'false-claim', subjectId: claim.speakerId, relatedId: me, weight: 0.6 }, `lie:${claim.speakerId}`);
      credibility.set(claim.speakerId, 0);
    }
  }
  for (const claim of claims) {
    if (claim.kind !== 'investigation' || !claim.targetId || claim.speakerId === me || claim.targetId === me) continue;
    if (!entries.has(claim.targetId)) continue;
    const speaker = byId.get(claim.speakerId);
    // Eine tote, als Seherin aufgedeckte Spielerin hat die Wahrheit gesagt.
    const trust = speaker && !speaker.alive ? (speaker.role?.id === 'seer' ? 1 : 0.1) : (credibility.get(claim.speakerId) ?? 0.3);
    if (claim.result === 'werewolf') {
      add({ code: 'claimed-check-wolf', subjectId: claim.targetId, relatedId: claim.speakerId, weight: 0.45 * trust }, `cw:${claim.speakerId}:${claim.targetId}`);
    } else {
      add({ code: 'claimed-check-good', subjectId: claim.targetId, relatedId: claim.speakerId, weight: -0.25 * trust }, `cg:${claim.speakerId}:${claim.targetId}`);
    }
  }

  // 4) Verhalten im Licht aufgedeckter Rollen
  for (const claim of claims) {
    if (!claim.targetId || claim.speakerId === me) continue;
    const truth = revealed(claim.targetId);
    const accusing = claim.kind === 'accuse' || claim.kind === 'vote';
    if (claim.kind === 'defend' && truth === 'werewolves') {
      add({ code: 'defended-wolf', subjectId: claim.speakerId, relatedId: claim.targetId, weight: 0.25 }, `dw:${claim.speakerId}:${claim.targetId}`);
    } else if (accusing && truth === 'werewolves') {
      add({ code: 'accused-wolf', subjectId: claim.speakerId, relatedId: claim.targetId, weight: -0.12 }, `aw:${claim.speakerId}:${claim.targetId}`);
    } else if (claim.kind === 'vote' && truth) {
      add({ code: 'voted-innocent', subjectId: claim.speakerId, relatedId: claim.targetId, weight: 0.1 }, `vi:${claim.speakerId}:${claim.targetId}`);
    }
    if (accusing && claim.targetId === me && iAmInnocent && claim.round === view.round) {
      add({ code: 'accused-me', subjectId: claim.speakerId, weight: 0.15 }, `am:${claim.speakerId}`);
    }
  }
  // Veröffentlichte Einzelstimmen (Regel revealBallots)
  for (const event of view.events) {
    const ballots = event.type === 'vote-result' ? (event.data?.ballots as Record<string, string | null> | undefined) : undefined;
    for (const [voterId, targetId] of Object.entries(ballots ?? {})) {
      if (!targetId || voterId === me) continue;
      const truth = revealed(targetId);
      if (truth === 'werewolves') add({ code: 'voted-wolf', subjectId: voterId, relatedId: targetId, weight: -0.1 }, `bw:${voterId}:${targetId}`);
      else if (truth) add({ code: 'voted-innocent', subjectId: voterId, relatedId: targetId, weight: 0.1 }, `vi:${voterId}:${targetId}`);
    }
  }

  // 5) Heutiges Verhalten: Schweigen und Mehrheitsverdacht
  const todaysChat = view.events.filter((e) => e.type === 'chat' && e.round === view.round);
  if (todaysChat.length >= 4) {
    const speakers = new Set(todaysChat.map((e) => String(e.data?.playerId)));
    for (const player of others) if (!speakers.has(player.id)) add({ code: 'quiet', subjectId: player.id, weight: 0.05 });
  }
  const accusations = new Map<PlayerId, Set<PlayerId>>();
  for (const claim of claims) {
    if (claim.round !== view.round || !claim.targetId || claim.speakerId === me) continue;
    if (claim.kind !== 'accuse' && claim.kind !== 'vote') continue;
    accusations.set(claim.targetId, (accusations.get(claim.targetId) ?? new Set()).add(claim.speakerId));
  }
  for (const [targetId, accusers] of accusations) {
    if (accusers.size >= 2) add({ code: 'bandwagon', subjectId: targetId, weight: Math.min(0.15, 0.04 * accusers.size) });
  }

  // 6) Abschluss: sicheres Wissen überschreibt Schätzungen
  for (const entry of entries.values()) {
    if (entry.known === 'wolf') entry.score = 0.99;
    else if (entry.known === 'good') entry.score = 0.01;
    else if (entry.known === 'ally') entry.score = 0;
    else entry.score = clamp(entry.score, 0.02, 0.97);
    entry.reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  }
  return [...entries.values()].sort((a, b) => b.score - a.score);
}

/** Wie oft der Spieler heute öffentlich beschuldigt wurde. */
export function accusationsToday(view: PlayerView, claims: readonly Claim[], targetId: PlayerId): number {
  const accusers = new Set<PlayerId>();
  for (const claim of claims) {
    if (claim.round !== view.round || claim.targetId !== targetId || claim.speakerId === targetId) continue;
    if (claim.kind === 'accuse' || claim.kind === 'vote' || (claim.kind === 'investigation' && claim.result === 'werewolf')) accusers.add(claim.speakerId);
  }
  return accusers.size;
}
