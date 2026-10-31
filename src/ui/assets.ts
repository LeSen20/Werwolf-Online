/**
 * Zentrale Stelle für alle Grafiken und Töne (aktuell nur Platzhalter).
 * Die vollständige Liste mit Dateinamen und Formaten steht in docs/assets.md.
 * Grafiken sind Pixelgrafik: PNG in Originalgröße, die Oberfläche vergrößert ganzzahlig
 * und ohne Weichzeichnen.
 *
 * Dateien in public/assets/ ablegen und hier eintragen, Pfade relativ zu public/:
 *   cards: { werewolf: 'assets/cards/werewolf.png' }
 * Fehlt ein Eintrag (auch bei neuen Rollen), zeichnet die Oberfläche einen Platzhalter
 * bzw. spielt keinen Ton.
 */
export type IconKey = 'dead' | 'lover' | 'pack' | 'bot';
export type SoundKey = 'nightStart' | 'dayStart' | 'death' | 'vote' | 'chat' | 'gameOver';

export interface AssetConfig {
  /** Kartenvorderseiten je Rollen-ID: komplette Karte 192 x 288 mit Rahmen, Titel und Text. */
  cards: Partial<Record<string, string>>;
  /** Optional: animierte Karten je Rollen-ID als Sprite-Sheet-JSON (Aseprite-Format, siehe cardAnimation.ts). */
  cardAnimations: Partial<Record<string, string>>;
  cardBack: string | null;
  backgrounds: Record<'setup' | 'night' | 'day' | 'gameOver', string | null>;
  /** Optional: Hochformat-Varianten für Handys; ohne Eintrag wird das Querformat beschnitten. */
  backgroundsPortrait: Partial<Record<'setup' | 'night' | 'day' | 'gameOver', string>>;
  logo: string | null;
  /** Avatare je Persona-ID der Bots (siehe src/bots/personas.ts) und 'human' für Menschen. */
  avatars: Partial<Record<string, string>>;
  icons: Partial<Record<IconKey, string>>;
  sounds: Partial<Record<SoundKey, string>>;
}

export const ASSETS: AssetConfig = {
  cards: { werewolf: 'assets/cards/werewolf.png', villager: 'assets/cards/villager.png', seer: 'assets/cards/seer.png', witch: 'assets/cards/witch.png', hunter: 'assets/cards/hunter.png', cupid: 'assets/cards/cupid.png', thief: 'assets/cards/thief.png' },
  cardAnimations: { werewolf: 'assets/cards/werewolf-sheet.json', villager: 'assets/cards/villager-sheet.json', seer: 'assets/cards/seer-sheet.json', witch: 'assets/cards/witch-sheet.json', hunter: 'assets/cards/hunter-sheet.json', cupid: 'assets/cards/cupid-sheet.json', thief: 'assets/cards/thief-sheet.json' },
  cardBack: null,
  backgrounds: { setup: null, night: null, day: null, gameOver: null },
  backgroundsPortrait: {},
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
