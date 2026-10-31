/**
 * LibreTranslate (Open Source). Selbst betrieben ohne API-Key und ohne Limits, z.B. per
 * Docker auf dem späteren Spielserver: docker run -p 5000:5000 libretranslate/libretranslate
 * Funktioniert in jedem Browser, also auch auf Handys.
 */
import type { LanguageCode, Translator } from './types';

export class LibreTranslateTranslator implements Translator {
  readonly name: string;
  readonly canTranslate = true;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
    this.name = `LibreTranslate (${this.baseUrl})`;
  }

  async detect(text: string): Promise<LanguageCode | null> {
    const results = await this.post<Array<{ language: string; confidence: number }>>('detect', { q: text });
    const best = Array.isArray(results) ? results[0] : undefined;
    // LibreTranslate liefert die Sicherheit in Prozent.
    return best && best.confidence >= 50 ? best.language : null;
  }

  async translate(text: string, from: LanguageCode, to: LanguageCode): Promise<string | null> {
    if (from === to) return text;
    const data = await this.post<{ translatedText?: string }>('translate', { q: text, source: from, target: to, format: 'text' });
    return typeof data?.translatedText === 'string' ? data.translatedText : null;
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok ? ((await response.json()) as T) : null;
    } catch {
      return null;
    }
  }
}
