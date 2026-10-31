/**
 * Eingebaute Pixelgrafik für Oberflächenteile ohne eigene Datei: Symbole (8 x 8) und
 * Hintergrundmuster je Phase. Eigene Grafiken aus src/ui/assets.ts haben immer Vorrang.
 * Alle Farben stammen aus der Palette der Rollenkarten. Ausgabe als SVG mit crispEdges:
 * bei ganzzahliger Vergrößerung bleibt jedes Pixel scharf.
 */
import type { Theme } from './components';

const COLORS: Record<string, string> = {
  k: '#150e0b',
  w: '#e3e6ee',
  m: '#b1b4c5',
  M: '#777a91',
  G: '#d1b566',
  g: '#a88b45',
  R: '#d33427',
  r: '#961f1e',
  f: '#ff6040',
  p: '#e3d3aa',
  s: '#9598ad',
  S: '#5d6076',
  e: '#75c95a',
};

export type PixelIconName = 'dead' | 'lover' | 'pack' | 'bot' | 'captain' | 'moon' | 'sun';

const ICONS: Record<PixelIconName, string[]> = {
  dead: ['.kkkkkk.', 'kppppppk', 'kpkppkpk', 'kpkppkpk', 'kppkkppk', '.kppppk.', '.kpkkpk.', '..kkkk..'],
  lover: ['.kk..kk.', 'kRfkkRRk', 'kRRRRRRk', 'kRRRRRrk', '.kRRRrk.', '..kRrk..', '...kk...', '........'],
  pack: ['.k....k.', 'ksk..ksk', 'ksskkssk', 'ksRssRsk', 'kssssssk', '.kSssSk.', '..kSSk..', '...kk...'],
  bot: ['...kk...', '.kkkkkk.', 'kssssssk', 'ksesseSk', 'kssssSSk', 'kskkkkSk', 'kSSSSSSk', '.kkkkkk.'],
  captain: ['...kk...', '..kGGk..', 'kkkGGkkk', 'kGGGGGgk', '.kGGGgk.', '.kgkkgk.', 'kgk..kgk', 'kk....kk'],
  moon: ['..kkk...', '.kwmk...', 'kwmk....', 'kwmk....', 'kwmk....', 'kwmmk...', '.kmmMkk.', '..kkk...'],
  sun: ['g..gg..g', '.gkkkkg.', '.kGGGgk.', 'gkGGGgkg', 'gkGGggkg', '.kggggk.', '.gkkkkg.', 'g..gg..g'],
};

/** Je Zeile zusammenhängende gleiche Farben als ein Rechteck. */
function gridRects(grid: string[], colors: Record<string, string>): string {
  let out = '';
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      const color = colors[row[x]];
      if (color) out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`;
      x = end;
    }
  });
  return out;
}

const svgUrl = (width: number, height: number, body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${body}</svg>`)}`;

const iconUrls = new Map<PixelIconName, string>();

/** Daten-URL eines eingebauten Symbols (8 x 8). */
export function pixelIconUrl(name: PixelIconName): string {
  let url = iconUrls.get(name);
  if (!url) {
    url = svgUrl(8, 8, gridRects(ICONS[name], COLORS));
    iconUrls.set(name, url);
  }
  return url;
}

// ---------------------------------------------------------------- Hintergrundmuster

/** Fester Zufall: jedes Muster sieht bei jedem Laden gleich aus. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** Sternenhimmel: einzelne Sterne, wenige helle Kreuze. */
function sky(size: number, base: string, dim: string[], bright: [string, string] | null, seed: number, count: number): string {
  const random = seeded(seed);
  let out = rect(0, 0, size, size, base);
  for (let i = 0; i < count; i++) {
    out += rect(Math.floor(random() * size), Math.floor(random() * size), 1, 1, dim[Math.floor(random() * dim.length)]);
  }
  if (bright) {
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(random() * (size - 4));
      const y = 2 + Math.floor(random() * (size - 4));
      out += rect(x - 1, y, 3, 1, bright[1]) + rect(x, y - 1, 1, 3, bright[1]) + rect(x, y, 1, 1, bright[0]);
    }
  }
  return out;
}

/** Holzdielen: Fugen, Lichtkante, Maserung, versetzte Stöße, vereinzelte Astlöcher. */
function planks(width: number, height: number, plank: number, colors: { base: string; light: string; grain: string; seam: string }, seed: number): string {
  const random = seeded(seed);
  let out = rect(0, 0, width, height, colors.base);
  for (let y = 0; y < height; y += plank) {
    out += rect(0, y, width, 1, colors.light) + rect(0, y + plank - 1, width, 1, colors.seam);
    const joint = Math.floor(random() * width);
    out += rect(joint, y, 1, plank, colors.seam);
    for (let i = 0; i < 5; i++) {
      out += rect(Math.floor(random() * width), y + 2 + Math.floor(random() * (plank - 4)), 3 + Math.floor(random() * 8), 1, colors.grain);
    }
    if (random() < 0.4) {
      const x = Math.floor(random() * (width - 4));
      const knotY = y + 3 + Math.floor(random() * (plank - 6));
      out += rect(x, knotY, 3, 1, colors.grain) + rect(x + 1, knotY, 1, 1, colors.seam);
    }
  }
  return out;
}

export interface Backdrop {
  url: string;
  width: number;
  height: number;
}

const backdrops = new Map<Theme, Backdrop>();

/** Kachel für den Seitenhintergrund, solange keine eigene Hintergrundgrafik eingetragen ist. */
export function backdrop(theme: Theme): Backdrop {
  const cached = backdrops.get(theme);
  if (cached) return cached;
  let result: Backdrop;
  switch (theme) {
    case 'night':
      result = { url: svgUrl(128, 128, sky(128, '#0c0e20', ['#222a4c', '#2d3658', '#3b4568', '#5d6076'], ['#e3e6ee', '#777a91'], 7, 46)), width: 128, height: 128 };
      break;
    case 'gameOver':
      result = { url: svgUrl(128, 128, sky(128, '#07070c', ['#121629', '#192040', '#222a4c'], null, 11, 30)), width: 128, height: 128 };
      break;
    case 'day':
      result = {
        url: svgUrl(96, 48, planks(96, 48, 12, { base: '#5a3f28', light: '#674735', grain: '#493329', seam: '#3d2a1c' }, 3)),
        width: 96,
        height: 48,
      };
      break;
    default:
      result = {
        url: svgUrl(96, 48, planks(96, 48, 12, { base: '#261912', light: '#3d2a1c', grain: '#3d2a1c', seam: '#150e0b' }, 5)),
        width: 96,
        height: 48,
      };
  }
  backdrops.set(theme, result);
  return result;
}
