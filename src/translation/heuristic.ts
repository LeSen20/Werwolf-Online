import type { Translator } from './types';

const GERMAN_WORDS = new Set(['ich', 'ist', 'nicht', 'und', 'der', 'die', 'das', 'du', 'wir', 'ein', 'eine', 'mit', 'für', 'wer', 'was', 'warum', 'kein', 'bin', 'glaube', 'auch', 'aber', 'mir', 'dich']);
const ENGLISH_WORDS = new Set(['i', 'is', 'not', 'and', 'the', 'you', 'we', 'a', 'an', 'with', 'for', 'who', 'what', 'why', 'think', 'am', 'he', 'she', 'it', 'me', 'but', 'are']);

/** Grobe Erkennung von Deutsch und Englisch anhand häufiger Wörter (ohne Netzwerk). */
export function detectGermanOrEnglish(text: string): 'de' | 'en' | null {
  let de = 0;
  let en = 0;
  for (const word of text.toLowerCase().split(/[^\p{L}']+/u)) {
    if (GERMAN_WORDS.has(word)) de++;
    if (ENGLISH_WORDS.has(word)) en++;
  }
  if (de === en) return null;
  return de > en ? 'de' : 'en';
}

/** Ersatz ohne Übersetzung: erkennt nur Deutsch und Englisch. */
export const basicTranslator: Translator = {
  name: 'Kein Übersetzer (nur Deutsch/Englisch)',
  canTranslate: false,
  detect: async (text) => detectGermanOrEnglish(text),
  translate: async (text, from, to) => (from === to ? text : null),
};
