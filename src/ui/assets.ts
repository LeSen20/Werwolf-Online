/**
 * Zentrale Stelle für alle Grafiken (aktuell nur Platzhalter).
 *
 * Grafiken in public/assets/ ablegen und hier eintragen, Pfade relativ zu public/:
 *   cards: { werewolf: 'assets/cards/werewolf.png', seer: 'assets/cards/seer.png' }
 *   backgrounds: { night: 'assets/backgrounds/night.jpg', ... }
 * Fehlt ein Eintrag (auch für neue Rollen), zeichnet die Oberfläche automatisch einen Platzhalter.
 */
export interface AssetConfig {
  /** Kartenvorderseiten je Rollen-ID. */
  cards: Partial<Record<string, string>>;
  cardBack: string | null;
  backgrounds: Record<'setup' | 'night' | 'day' | 'gameOver', string | null>;
  logo: string | null;
}

export const ASSETS: AssetConfig = {
  cards: {},
  cardBack: null,
  backgrounds: { setup: null, night: null, day: null, gameOver: null },
  logo: null,
};

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
