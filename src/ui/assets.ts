/**
 * Zentrale Stelle für alle Grafiken und Töne (aktuell nur Platzhalter).
 * Die vollständige Liste mit Dateinamen und Formaten steht in docs/assets.md.
 *
 * Dateien in public/assets/ ablegen und hier eintragen, Pfade relativ zu public/:
 *   cards: { werewolf: 'assets/cards/werewolf.webp' }
 * Fehlt ein Eintrag (auch bei neuen Rollen), zeichnet die Oberfläche einen Platzhalter
 * bzw. spielt keinen Ton.
 */
export type IconKey = 'dead' | 'lover' | 'pack' | 'bot';
export type SoundKey = 'nightStart' | 'dayStart' | 'death' | 'vote' | 'chat' | 'gameOver';

export interface AssetConfig {
  /** Kartenvorderseiten je Rollen-ID. */
  cards: Partial<Record<string, string>>;
  cardBack: string | null;
  backgrounds: Record<'setup' | 'night' | 'day' | 'gameOver', string | null>;
  logo: string | null;
  /** Avatare je Persona-ID der Bots (siehe src/bots/personas.ts) und 'human' für Menschen. */
  avatars: Partial<Record<string, string>>;
  icons: Partial<Record<IconKey, string>>;
  sounds: Partial<Record<SoundKey, string>>;
}

export const ASSETS: AssetConfig = {
  cards: {},
  cardBack: null,
  backgrounds: { setup: null, night: null, day: null, gameOver: null },
  logo: null,
  avatars: {},
  icons: {},
  sounds: {},
};

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** Spielt einen Ton ab, falls einer hinterlegt ist (Fehler, z.B. Autoplay-Sperren, werden ignoriert). */
export function playSound(key: SoundKey): void {
  const path = ASSETS.sounds[key];
  if (!path || typeof Audio === 'undefined') return;
  void new Audio(assetUrl(path)).play().catch(() => {});
}
