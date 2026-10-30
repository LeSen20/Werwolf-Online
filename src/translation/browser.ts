/**
 * Im Browser eingebauter Übersetzer (Translator- und LanguageDetector-API, Chrome
 * ab Version 138 am Desktop). Läuft lokal auf dem Gerät: kein API-Key, keine Limits.
 * Sprachpakete lädt der Browser beim ersten Gebrauch selbst herunter.
 */
import type { LanguageCode, Translator } from './types';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface NativeTranslator {
  translate(text: string): Promise<string>;
}

interface NativeTranslatorFactory {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<NativeTranslator>;
}

interface NativeDetector {
  detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}

interface NativeDetectorFactory {
  create(): Promise<NativeDetector>;
}

interface BrowserScope {
  Translator?: NativeTranslatorFactory;
  LanguageDetector?: NativeDetectorFactory;
}

export function browserTranslationAvailable(scope: object = globalThis): boolean {
  return typeof (scope as BrowserScope).Translator?.create === 'function';
}

export class BrowserTranslator implements Translator {
  readonly name = 'Browser-Übersetzer (lokal)';
  readonly canTranslate = true;
  private readonly translators: NativeTranslatorFactory;
  private readonly detectors: NativeDetectorFactory | null;
  private readonly instances = new Map<string, Promise<NativeTranslator | null>>();
  private detector: Promise<NativeDetector | null> | null = null;

  constructor(scope: object = globalThis) {
    const api = scope as BrowserScope;
    if (!api.Translator) throw new Error('Der Browser bietet keinen eingebauten Übersetzer.');
    this.translators = api.Translator;
    this.detectors = api.LanguageDetector ?? null;
  }

  async detect(text: string): Promise<LanguageCode | null> {
    const detector = await this.getDetector();
    if (!detector) return null;
    try {
      const [best] = await detector.detect(text);
      if (!best || best.confidence < 0.6 || best.detectedLanguage === 'und') return null;
      return best.detectedLanguage.split('-')[0].toLowerCase();
    } catch {
      return null;
    }
  }

  async translate(text: string, from: LanguageCode, to: LanguageCode): Promise<string | null> {
    if (from === to) return text;
    const instance = await this.getInstance(from, to);
    if (!instance) return null;
    try {
      return await instance.translate(text);
    } catch {
      return null;
    }
  }

  async prepare(languages: LanguageCode[]): Promise<void> {
    await this.getDetector();
    for (const language of languages) {
      if (language === 'en') continue;
      await Promise.all([this.getInstance(language, 'en'), this.getInstance('en', language)]);
    }
  }

  private getDetector(): Promise<NativeDetector | null> {
    if (!this.detectors) return Promise.resolve(null);
    this.detector ??= this.detectors.create().catch(() => {
      this.detector = null;
      return null;
    });
    return this.detector;
  }

  private getInstance(from: LanguageCode, to: LanguageCode): Promise<NativeTranslator | null> {
    const key = `${from}>${to}`;
    let instance = this.instances.get(key);
    if (!instance) {
      instance = this.translators
        .availability({ sourceLanguage: from, targetLanguage: to })
        .then((state) => (state === 'unavailable' ? null : this.translators.create({ sourceLanguage: from, targetLanguage: to })))
        .catch(() => null);
      this.instances.set(key, instance);
      // Fehlversuche (z.B. Download ohne Nutzeraktion) dürfen später wiederholt werden.
      void instance.then((result) => {
        if (!result) this.instances.delete(key);
      });
    }
    return instance;
  }
}
