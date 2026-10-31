/**
 * Animierte Rollenkarten aus einem Sprite-Sheet im Aseprite-Format (frames, meta.frameTags,
 * meta.playlist, meta.fps), z.B. assets/cards/werewolf-sheet.json. Beim Aufdecken läuft zuerst
 * "howl" (falls vorhanden), danach in Schleife die Playlist. Wird die Karte neu gezeichnet, läuft
 * die Animation weiter statt neu zu beginnen. Bei "weniger Bewegung" im System bleibt das Standbild.
 */
import { ASSETS, assetUrl } from './assets';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SheetData {
  frames: Record<string, { frame: Rect }>;
  meta: { image: string; fps: number; frameTags: Array<{ name: string; from: number; to: number }>; playlist?: string[] };
}

interface Sheet {
  image: HTMLImageElement;
  frames: Rect[];
  /** Einmal beim Aufdecken. */
  intro: number[];
  /** Danach in Schleife. */
  loop: number[];
  frameMs: number;
}

const sheets = new Map<string, Promise<Sheet | null>>();
/** Laufende Animation je Rolle; nach mehr als einer Sekunde ohne Anzeige beginnt sie neu. */
const timelines = new Map<string, { start: number; seen: number }>();

function load(roleId: string): Promise<Sheet | null> {
  const dataPath = ASSETS.cardAnimations[roleId];
  if (!dataPath) return Promise.resolve(null);
  let sheet = sheets.get(roleId);
  if (!sheet) {
    sheet = (async () => {
      const dataUrl = new URL(assetUrl(dataPath), document.baseURI);
      const data = (await (await fetch(dataUrl)).json()) as SheetData;
      const image = new Image();
      image.src = new URL(data.meta.image, dataUrl).href;
      await image.decode();
      const frames = Object.keys(data.frames)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => data.frames[key].frame);
      const clip = (name: string) => {
        const tag = data.meta.frameTags.find((t) => t.name === name);
        return tag ? Array.from({ length: tag.to - tag.from + 1 }, (_, i) => tag.from + i) : [];
      };
      const playlist = data.meta.playlist ?? data.meta.frameTags.map((t) => t.name);
      const loop = playlist.flatMap(clip);
      return { image, frames, intro: clip('howl'), loop: loop.length > 0 ? loop : frames.map((_, i) => i), frameMs: 1000 / data.meta.fps };
    })().catch(() => null);
    sheets.set(roleId, sheet);
  }
  return sheet;
}

/** Sprite-Sheets früh laden, damit die Karte beim Aufdecken sofort läuft. */
export function preloadCardAnimations(): void {
  for (const roleId of Object.keys(ASSETS.cardAnimations)) void load(roleId);
}

/** Canvas mit der laufenden Animation (über das Standbild gelegt) oder null ohne Animation. */
export function cardAnimation(roleId: string): HTMLCanvasElement | null {
  if (!ASSETS.cardAnimations[roleId]) return null;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'card-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const now = performance.now();
  const running = timelines.get(roleId);
  if (!running || now - running.seen > 1000) timelines.set(roleId, { start: now, seen: now });

  void load(roleId).then((sheet) => {
    if (!sheet) return;
    canvas.width = sheet.frames[0].w;
    canvas.height = sheet.frames[0].h;
    let shown = -1;
    const draw = (time: number) => {
      if (!canvas.isConnected) return; // Karte nicht mehr angezeigt: Schleife beenden
      const timeline = timelines.get(roleId)!;
      timeline.seen = time;
      const step = Math.floor(Math.max(0, time - timeline.start) / sheet.frameMs);
      const index = step < sheet.intro.length ? sheet.intro[step] : sheet.loop[(step - sheet.intro.length) % sheet.loop.length];
      if (index !== shown) {
        const f = sheet.frames[index];
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, canvas.width, canvas.height);
        shown = index;
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  return canvas;
}
