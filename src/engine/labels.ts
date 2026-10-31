import type { Faction, Phase } from './types';

export const PHASE_LABELS: Record<Phase, string> = {
  SETUP: 'Vorbereitung',
  ROLE_DISTRIBUTION: 'Rollenverteilung',
  NIGHT_START: 'Nachtbeginn',
  NIGHT_ACTIONS: 'Nacht',
  NIGHT_RESOLUTION: 'Nachtauflösung',
  DAY_ANNOUNCEMENT: 'Tagesanbruch',
  DAY_DISCUSSION: 'Diskussion',
  DAY_VOTING: 'Abstimmung',
  VOTE_RESOLUTION: 'Auszählung',
  DEATH_RESOLUTION: 'Todesfolgen',
  WIN_CHECK: 'Siegprüfung',
  GAME_OVER: 'Spielende',
};

export const FACTION_LABELS: Record<Faction, string> = {
  village: 'Dorf',
  werewolves: 'Werwölfe',
  neutral: 'Neutral',
};
