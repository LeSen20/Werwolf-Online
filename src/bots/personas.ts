import type { Persona, Voice } from './types';

const voice = (flags: Partial<Voice>): Voice => ({ casual: false, fillers: false, nervous: false, terse: false, ...flags });

/** Persönlichkeiten für Bot-Spieler, je Partie zufällig verteilt. Avatare: ASSETS.avatars[persona.id]. */
export const PERSONAS: Persona[] = [
  { id: 'greta', style: 'direkt und selbstbewusst, beschuldigt schnell', voice: voice({}) },
  { id: 'jonas', style: 'ruhig und analytisch, begründet gern', voice: voice({ fillers: true }) },
  { id: 'mila', style: 'freundlich, stellt viele Rückfragen', voice: voice({ fillers: true, casual: true }) },
  { id: 'theo', style: 'nervös, rechtfertigt sich schnell', voice: voice({ nervous: true, fillers: true }) },
  { id: 'lina', style: 'locker und humorvoll, kurze Sätze', voice: voice({ casual: true, terse: true }) },
  { id: 'felix', style: 'misstrauisch gegenüber allen', voice: voice({ terse: true }) },
  { id: 'paula', style: 'vorsichtig, wartet lieber ab', voice: voice({ nervous: true }) },
  { id: 'noah', style: 'ungeduldig, will schnell abstimmen', voice: voice({ casual: true, terse: true }) },
  { id: 'emma', style: 'empathisch, verteidigt andere gern', voice: voice({ fillers: true }) },
  { id: 'leon', style: 'trocken und wortkarg', voice: voice({ terse: true, casual: true }) },
  { id: 'sofia', style: 'dramatisch und emotional', voice: voice({ fillers: true, nervous: true }) },
  { id: 'max', style: 'logisch, zählt gern Fakten auf', voice: voice({}) },
];

export function personaFor(index: number): Persona {
  return PERSONAS[index % PERSONAS.length];
}
