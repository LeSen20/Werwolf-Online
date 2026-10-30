/** Sprachcode nach ISO 639-1, z.B. 'de', 'en', 'tr'. */
export type LanguageCode = string;

/**
 * Übersetzer-Schnittstelle. Unabhängig vom Spiel: Bots nutzen sie für fremdsprachige
 * Nachrichten, später kann auch die Oberfläche darüber übersetzt werden.
 */
export interface Translator {
  /** Anzeigename, z.B. "Browser-Übersetzer (lokal)". */
  readonly name: string;
  /** true, wenn wirklich übersetzt werden kann (sonst nur Deutsch/Englisch). */
  readonly canTranslate: boolean;
  /** Sprache eines Textes erkennen; null = unsicher. */
  detect(text: string): Promise<LanguageCode | null>;
  /** Übersetzen; null = nicht möglich, dann den Originaltext verwenden. */
  translate(text: string, from: LanguageCode, to: LanguageCode): Promise<string | null>;
  /**
   * Vorbereitung während einer Nutzeraktion (Klick). Browser dürfen Sprachpakete nur
   * nach einer Nutzeraktion herunterladen.
   */
  prepare?(languages: LanguageCode[]): Promise<void>;
}
