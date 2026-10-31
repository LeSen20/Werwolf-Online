/** Fehlercodes für abgewiesene Befehle und ungültige Konfigurationen. */
export type ErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_DEFINITION'
  | 'INVALID_COMMAND'
  | 'UNKNOWN_ROLE'
  | 'UNKNOWN_PLAYER'
  | 'UNKNOWN_ABILITY'
  | 'WRONG_PHASE'
  | 'GAME_OVER'
  | 'PLAYER_DEAD'
  | 'NOT_ALLOWED'
  | 'NOT_PENDING'
  | 'NOT_OPTIONAL'
  | 'ABILITY_USED_UP'
  | 'INVALID_TARGET'
  | 'INVALID_CHOICE'
  | 'ALREADY_VOTED'
  | 'INTERNAL_ERROR';

/** Kontrollierter Spielfehler. Game.dispatch() fängt ihn ab und gibt ihn als Ergebnis zurück. */
export class GameError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

/** Ungültige Spielkonfiguration mit allen gefundenen Problemen. */
export class ConfigError extends GameError {
  readonly issues: string[];

  constructor(issues: string[]) {
    super('INVALID_CONFIG', `Ungültige Spielkonfiguration: ${issues.join(' ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}
