import { describe, expect, it } from 'vitest';
import {
  BrowserTranslator,
  LibreTranslateTranslator,
  basicTranslator,
  createTranslator,
  detectGermanOrEnglish,
  detectLanguage,
  translateKeepingNames,
  type Translator,
} from '../src/translation';

/** Nachbau der Browser-API (Translator/LanguageDetector) für Tests. */
function fakeBrowser(options: { failCreateOnce?: boolean; unavailable?: string[] } = {}) {
  let failNext = options.failCreateOnce ?? false;
  const created: string[] = [];
  const scope = {
    Translator: {
      availability: async ({ sourceLanguage, targetLanguage }: { sourceLanguage: string; targetLanguage: string }) =>
        options.unavailable?.includes(`${sourceLanguage}>${targetLanguage}`) ? 'unavailable' : 'downloadable',
      create: async ({ sourceLanguage, targetLanguage }: { sourceLanguage: string; targetLanguage: string }) => {
        if (failNext) {
          failNext = false;
          throw new DOMException('Nutzeraktion nötig', 'NotAllowedError');
        }
        created.push(`${sourceLanguage}>${targetLanguage}`);
        return { translate: async (text: string) => `[${targetLanguage}] ${text}` };
      },
    },
    LanguageDetector: {
      create: async () => ({
        detect: async (text: string) =>
          text.startsWith('Bonjour') ? [{ detectedLanguage: 'fr', confidence: 0.95 }] : [{ detectedLanguage: 'en', confidence: 0.3 }],
      }),
    },
  };
  return { scope, created };
}

describe('Separater Übersetzer', () => {
  it('ohne Übersetzer: nur Deutsch und Englisch', async () => {
    expect(detectGermanOrEnglish('Ich glaube, Ben ist ein Werwolf')).toBe('de');
    expect(detectGermanOrEnglish('I think Ben is the wolf')).toBe('en');
    expect(detectGermanOrEnglish('Ben?')).toBeNull();
    expect(await basicTranslator.translate('Hallo', 'de', 'de')).toBe('Hallo');
    expect(await basicTranslator.translate('Hallo', 'de', 'fr')).toBeNull();
    expect(basicTranslator.canTranslate).toBe(false);
  });

  it('wählt LibreTranslate, Browser-Übersetzer oder keinen', () => {
    expect(createTranslator({ libreTranslateUrl: 'http://localhost:5000/' })).toBeInstanceOf(LibreTranslateTranslator);
    expect(createTranslator({}, fakeBrowser().scope)).toBeInstanceOf(BrowserTranslator);
    expect(createTranslator({}, {})).toBe(basicTranslator);
  });

  it('Browser-Übersetzer: erkennt, übersetzt und wiederholt fehlgeschlagene Downloads', async () => {
    const browser = fakeBrowser({ failCreateOnce: true, unavailable: ['de>ja'] });
    const translator = new BrowserTranslator(browser.scope);
    expect(await translator.detect('Bonjour à tous')).toBe('fr');
    expect(await translator.detect('ok')).toBeNull();
    // Erster Versuch scheitert (ohne Nutzeraktion), der nächste klappt.
    expect(await translator.translate('Hello', 'en', 'fr')).toBeNull();
    expect(await translator.translate('Hello', 'en', 'fr')).toBe('[fr] Hello');
    expect(await translator.translate('Hallo', 'de', 'ja')).toBeNull();
    await translator.prepare(['es']);
    expect(browser.created).toEqual(expect.arrayContaining(['es>en', 'en>es']));
  });

  it('LibreTranslate: nutzt /detect und /translate', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url, body });
      const json = url.endsWith('/detect') ? [{ language: 'tr', confidence: 92 }] : { translatedText: 'Merhaba' };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as typeof fetch;
    const translator = new LibreTranslateTranslator('http://translate.local/', fakeFetch);
    expect(await translator.detect('Selam')).toBe('tr');
    expect(await translator.translate('Hello', 'en', 'tr')).toBe('Merhaba');
    expect(requests[1]).toEqual({ url: 'http://translate.local/translate', body: { q: 'Hello', source: 'en', target: 'tr', format: 'text' } });

    const offline = new LibreTranslateTranslator('http://offline', (async () => {
      throw new TypeError('Netzwerkfehler');
    }) as typeof fetch);
    expect(await offline.translate('Hello', 'en', 'tr')).toBeNull();
  });

  it('übersetzt nur, wenn Spielernamen erhalten bleiben', async () => {
    const translator: Translator = {
      name: 'Test',
      canTranslate: true,
      detect: async () => null,
      translate: async (text) => text.replace('Rose', 'Rosa'),
    };
    expect(await translateKeepingNames(translator, 'Ich verdächtige Ben.', 'de', 'it', ['Ben', 'Rose'])).toBe('Ich verdächtige Ben.');
    // Namen werden über Platzhalter geschützt, auch wenn der Übersetzer sie sonst verändern würde.
    expect(await translateKeepingNames(translator, 'Ich verdächtige Rose.', 'de', 'it', ['Ben', 'Rose'])).toBe('Ich verdächtige Rose.');
    expect(await detectLanguage(translator, 'I think so')).toBe('en');
  });

  it('Platzhalter: tolerant beim Zurücksetzen, sonst Rückfall auf Namensprüfung', async () => {
    const names = ['sleepy_panda', 'tim', 'Rose'];
    // Übersetzer, der Namen aus echten Wörtern mitübersetzt und Platzhalter leicht verändert.
    const sloppy: Translator = {
      name: 'sloppy',
      canTranslate: true,
      detect: async () => null,
      translate: async (text) => text.replace('sleepy_panda', 'panda_endormi').replace(/ZQX(\d)/g, 'zqx $1').replace('Ich stimme für', 'Je vote pour'),
    };
    expect(await translateKeepingNames(sloppy, 'Ich stimme für sleepy_panda und tim.', 'de', 'fr', names)).toBe('Je vote pour sleepy_panda und tim.');
    // Übersetzer, der Platzhalter verschluckt: ohne Platzhalter erneut, Ergebnis nur mit allen Namen.
    const dropping = (rename: boolean): Translator => ({
      name: 'dropping',
      canTranslate: true,
      detect: async () => null,
      translate: async (text) => (text.includes('ZQX') ? text.replace(/ZQX\d+/g, '') : rename ? text.replace('Rose', 'Rosa') : text),
    });
    expect(await translateKeepingNames(dropping(false), 'Rose lügt.', 'de', 'it', names)).toBe('Rose lügt.');
    expect(await translateKeepingNames(dropping(true), 'Rose lügt.', 'de', 'it', names)).toBeNull();
  });

  it('Browser-Übersetzer hängt nicht, wenn der Browser nicht antwortet', async () => {
    const never = () => new Promise<never>(() => {});
    const scope = { Translator: { availability: never, create: never }, LanguageDetector: { create: never } };
    const translator = new BrowserTranslator(scope, { timeoutMs: 100 });
    expect(await translator.translate('Hallo', 'de', 'fr')).toBeNull();
    expect(await translator.detect('Bonjour tout le monde')).toBeNull();
    // Danach wird nicht bei jeder Nachricht erneut gewartet.
    const start = Date.now();
    expect(await translator.translate('Hallo', 'de', 'fr')).toBeNull();
    expect(await translator.detect('Bonjour tout le monde')).toBeNull();
    expect(Date.now() - start).toBeLessThan(50);
  });
});
