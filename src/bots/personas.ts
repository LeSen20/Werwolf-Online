import type { Persona, Voice } from './types';

const voice = (flags: Partial<Voice>): Voice => ({ casual: false, fillers: false, nervous: false, terse: false, ...flags });

/** Persönlichkeiten für Bot-Spieler. Avatare: ASSETS.avatars[persona.id]. */
export const PERSONAS: Persona[] = [
  { id: 'greta', name: 'Greta', style: 'direkt und selbstbewusst, beschuldigt schnell', voice: voice({}) },
  { id: 'jonas', name: 'Jonas', style: 'ruhig und analytisch, begründet gern', voice: voice({ fillers: true }) },
  { id: 'mila', name: 'Mila', style: 'freundlich, stellt viele Rückfragen', voice: voice({ fillers: true, casual: true }) },
  { id: 'theo', name: 'Theo', style: 'nervös, rechtfertigt sich schnell', voice: voice({ nervous: true, fillers: true }) },
  { id: 'lina', name: 'Lina', style: 'locker und humorvoll, kurze Sätze', voice: voice({ casual: true, terse: true }) },
  { id: 'felix', name: 'Felix', style: 'misstrauisch gegenüber allen', voice: voice({ terse: true }) },
  { id: 'paula', name: 'Paula', style: 'vorsichtig, wartet lieber ab', voice: voice({ nervous: true }) },
  { id: 'noah', name: 'Noah', style: 'ungeduldig, will schnell abstimmen', voice: voice({ casual: true, terse: true }) },
  { id: 'emma', name: 'Emma', style: 'empathisch, verteidigt andere gern', voice: voice({ fillers: true }) },
  { id: 'leon', name: 'Leon', style: 'trocken und wortkarg', voice: voice({ terse: true, casual: true }) },
  { id: 'sofia', name: 'Sofia', style: 'dramatisch und emotional', voice: voice({ fillers: true, nervous: true }) },
  { id: 'max', name: 'Max', style: 'logisch, zählt gern Fakten auf', voice: voice({}) },
];

export function personaFor(index: number): Persona {
  return PERSONAS[index % PERSONAS.length];
}
