/**
 * Separater Übersetzer. Auswahl (createTranslator):
 * 1. eigener LibreTranslate-Server, falls eingetragen (jeder Browser, kein Key, keine Limits)
 * 2. eingebauter Browser-Übersetzer (Chrome-Desktop, lokal, kein Key, keine Limits)
 * 3. kein Übersetzer: nur Deutsch und Englisch
 */
import { BrowserTranslator, browserTranslationAvailable } from './browser';
import { basicTranslator, detectGermanOrEnglish } from './heuristic';
import { LibreTranslateTranslator } from './libre';
import type { LanguageCode, Translator } from './types';

export { BrowserTranslator, LibreTranslateTranslator, basicTranslator, browserTranslationAvailable, detectGermanOrEnglish };
export type { LanguageCode, Translator };

export interface TranslationSettings {
  libreTranslateUrl?: string | null;
}

export function createTranslator(settings: TranslationSettings = {}, scope: object = globalThis): Translator {
  const url = settings.libreTranslateUrl?.trim();
  if (url) return new LibreTranslateTranslator(url);
  if (browserTranslationAvailable(scope)) return new BrowserTranslator(scope);
  return basicTranslator;
}

/** Sprache erkennen: erst der Übersetzer, sonst die Deutsch/Englisch-Erkennung. */
export async function detectLanguage(translator: Translator, text: string): Promise<LanguageCode | null> {
  return (await translator.detect(text).catch(() => null)) ?? detectGermanOrEnglish(text);
}

const NAME_CHARS = '\\p{L}\\p{N}_';
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Platzhalter ohne Bedeutung in irgendeiner Sprache; beim Zurücksetzen tolerant (zqx 1). */
const placeholder = (index: number) => `ZQX${index + 1}`;
const PLACEHOLDER = /Z\s*Q\s*X\s*(\d+)/giu;

/** Ersetzt jede Nennung (ganzes Wort, Groß-/Kleinschreibung egal) durch einen Platzhalter. */
function protectNames(text: string, names: readonly string[]): { masked: string; originals: string[] } {
  const sorted = [...new Set(names.filter((name) => name.trim()))].sort((a, b) => b.length - a.length);
  const originals: string[] = [];
  if (sorted.length === 0) return { masked: text, originals };
  const pattern = new RegExp(`(^|[^${NAME_CHARS}])(${sorted.map(escapeRegex).join('|')})(?=$|[^${NAME_CHARS}])`, 'giu');
  const masked = text.replace(pattern, (_match, before: string, name: string) => `${before}${placeholder(originals.push(name) - 1)}`);
  return { masked, originals };
}

/** Setzt die Namen wieder ein; null, wenn ein Platzhalter fehlt, doppelt oder unbekannt ist. */
function restoreNames(text: string, originals: readonly string[]): string | null {
  const seen = new Set<number>();
  let valid = true;
  const restored = text.replace(PLACEHOLDER, (_match, digits: string) => {
    const index = Number(digits) - 1;
    if (!(index in originals) || seen.has(index)) valid = false;
    seen.add(index);
    return originals[index] ?? '';
  });
  return valid && seen.size === originals.length ? restored : null;
}

const containsWord = (text: string, word: string) =>
  new RegExp(`(^|[^${NAME_CHARS}])${escapeRegex(word)}(?=$|[^${NAME_CHARS}])`, 'iu').test(text);

/**
 * Übersetzt, ohne Spielernamen zu verändern: Namen werden vorher durch Platzhalter ersetzt
 * und danach wieder eingesetzt (so bleibt auch "sleepy_panda" erhalten). Übersteht ein
 * Platzhalter die Übersetzung nicht, wird ohne Platzhalter übersetzt und nur angenommen,
 * wenn alle Namen erhalten sind. Sonst null (dann lieber den Originaltext senden).
 */
export async function translateKeepingNames(
  translator: Translator,
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  names: readonly string[],
): Promise<string | null> {
  if (from === to) return text;
  const { masked, originals } = protectNames(text, names);
  if (originals.length > 0) {
    const result = await translator.translate(masked, from, to).catch(() => null);
    const restored = result ? restoreNames(result, originals) : null;
    if (restored) return restored;
  }
  const result = await translator.translate(text, from, to).catch(() => null);
  if (!result) return null;
  return originals.every((name) => containsWord(result, name)) ? result : null;
}
