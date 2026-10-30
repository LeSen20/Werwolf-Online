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

/**
 * Übersetzt und prüft, dass Spielernamen erhalten bleiben. Geht ein Name verloren,
 * wird null zurückgegeben (dann lieber den Originaltext senden).
 */
export async function translateKeepingNames(
  translator: Translator,
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  names: readonly string[],
): Promise<string | null> {
  if (from === to) return text;
  const result = await translator.translate(text, from, to).catch(() => null);
  if (!result) return null;
  const lost = names.some((name) => text.includes(name) && !result.includes(name));
  return lost ? null : result;
}
