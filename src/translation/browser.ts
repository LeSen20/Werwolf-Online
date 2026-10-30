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

/**
 * Höchstens so lange auf den Browser warten. Ohne Grenze hängt z.B. availability() dauerhaft,
 * wenn der Browser keine Sprachpakete laden kann, und mit ihm der Bot-Chat.
 */
class TimeoutError extends Error {}

/** Nach einer Zeitüberschreitung so lange nicht erneut warten (bis zur nächsten Nutzeraktion, siehe prepare). */
const RETRY_AFTER_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError('Zeitüberschreitung beim Browser-Übersetzer')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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
  /** Grenze je Aufruf; das Laden eines Sprachpakets (create) darf doppelt so lange dauern. */
  private readonly timeoutMs: number;
  private readonly blockedUntil = new Map<string, number>();

  constructor(scope: object = globalThis, options: { timeoutMs?: number } = {}) {
    const api = scope as BrowserScope;
    if (!api.Translator) throw new Error('Der Browser bietet keinen eingebauten Übersetzer.');
    this.translators = api.Translator;
    this.detectors = api.LanguageDetector ?? null;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async detect(text: string): Promise<LanguageCode | null> {
    const detector = await this.getDetector();
    if (!detector) return null;
    try {
      const [best] = await withTimeout(detector.detect(text), this.timeoutMs);
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
      return await withTimeout(instance.translate(text), this.timeoutMs);
    } catch {
      return null;
    }
  }

  async prepare(languages: LanguageCode[]): Promise<void> {
    this.blockedUntil.clear();
    await this.getDetector();
    for (const language of languages) {
      if (language === 'en') continue;
      await Promise.all([this.getInstance(language, 'en'), this.getInstance('en', language)]);
    }
  }

  private blocked(key: string): boolean {
    return (this.blockedUntil.get(key) ?? 0) > Date.now();
  }

  private noteFailure(key: string, error: unknown): void {
    if (error instanceof TimeoutError) this.blockedUntil.set(key, Date.now() + RETRY_AFTER_MS);
  }

  private getDetector(): Promise<NativeDetector | null> {
    if (!this.detectors || this.blocked('detector')) return Promise.resolve(null);
    this.detector ??= withTimeout(this.detectors.create(), this.timeoutMs * 2).catch((error: unknown) => {
      this.detector = null;
      this.noteFailure('detector', error);
      return null;
    });
    return this.detector;
  }

  private getInstance(from: LanguageCode, to: LanguageCode): Promise<NativeTranslator | null> {
    const key = `${from}>${to}`;
    if (this.blocked(key)) return Promise.resolve(null);
    let instance = this.instances.get(key);
    if (!instance) {
      instance = withTimeout(this.translators.availability({ sourceLanguage: from, targetLanguage: to }), this.timeoutMs)
        .then((state) =>
          state === 'unavailable' ? null : withTimeout(this.translators.create({ sourceLanguage: from, targetLanguage: to }), this.timeoutMs * 2),
        )
        .catch((error: unknown) => {
          this.noteFailure(key, error);
          return null;
        });
      this.instances.set(key, instance);
      // Fehlversuche (z.B. Download ohne Nutzeraktion) dürfen später wiederholt werden.
      void instance.then((result) => {
        if (!result) this.instances.delete(key);
      });
    }
    return instance;
  }
}
