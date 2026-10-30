import { describe, expect, it } from 'vitest';
import { extractClaimsOffline, findMentions, generateBotName, nameAliases, shortNames } from '../src/bots';
import { createRandom } from '../src/bots/random';

describe('Bot-Namen', () => {
  it('erzeugt abwechslungsreiche, unbedenkliche Benutzernamen', () => {
    const random = createRandom(7);
    const names = Array.from({ length: 400 }, () => generateBotName(random, []));
    expect(new Set(names).size).toBeGreaterThan(300);
    for (const name of names) {
      expect(name).toMatch(/^[A-Za-z0-9_]{3,16}$/);
      expect(name.toLowerCase()).not.toMatch(/wolf|werw|hexe|witch|seher|seer|jäger|jaeger|hunter|amor|cupid|dieb|thief|bot/);
      for (const digits of name.match(/\d+/g) ?? []) expect(digits).not.toMatch(/14|18|28|69|88|420|666/);
    }
    expect(names.some((n) => n.includes('_'))).toBe(true);
    expect(names.some((n) => /\d/.test(n))).toBe(true);
    expect(names.some((n) => /[A-Z]/.test(n))).toBe(true);
  });

  it('vergibt nur Namen, die sich auch in den Kurzformen unterscheiden', () => {
    const random = createRandom(3);
    for (let round = 0; round < 50; round++) {
      const taken = ['Lena', 'Jonas'];
      for (let i = 0; i < 10; i++) taken.push(generateBotName(random, taken));
      const aliases = taken.flatMap((name) => nameAliases(name));
      expect(new Set(aliases).size).toBe(aliases.length);
    }
  });

  it('erkennt Kurzformen, wie Menschen sie schreiben', () => {
    expect(nameAliases('le_sen1')).toEqual(expect.arrayContaining(['le_sen1', 'le_sen', 'lesen']));
    expect(nameAliases('jonas2003')).toContain('jonas');
    expect(nameAliases('xXFrostXx')).toContain('frost');
    expect(nameAliases('tim_b')).toContain('tim');
    expect(nameAliases('TheRealPaula')).toContain('paula');
    expect(nameAliases('Spieler 1')).toEqual(['spieler 1']);

    const players = [
      { id: 'p1', name: 'Max' },
      { id: 'p2', name: 'le_sen1' },
      { id: 'p3', name: 'max_99' },
      { id: 'p4', name: 'jonas2003' },
    ];
    expect(findMentions('lesen, bist du ein Werwolf?', players)).toEqual(['p2']);
    expect(findMentions('max_99 ist komisch', players)).toEqual(['p3']);
    // Voller Name geht vor: "max" ist Max, nicht max_99.
    expect(findMentions('max ist komisch', players)).toEqual(['p1']);
    expect(findMentions('jonas lügt', players)).toEqual(['p4']);
    expect(findMentions('jonas lügt', players, 'p4')).toEqual([]);
    const short = shortNames(players);
    expect(short.get('p2')).toBe('lesen');
    expect(short.get('p4')).toBe('jonas');
    expect(short.has('p3')).toBe(false);
  });

  it('Namen mit Rollenwörtern lösen keine Aussagen aus', () => {
    const players = [
      { id: 'p1', name: 'Anna' },
      { id: 'p2', name: 'Wolfgang' },
    ];
    const roles = [{ id: 'werewolf', name: 'Werwolf' }];
    expect(extractClaimsOffline('Wolfgang war heute ruhig', 'p1', players, roles).claims).toEqual([]);
    expect(extractClaimsOffline('Wolfgang ist ein Werwolf', 'p1', players, roles).claims).toEqual([
      expect.objectContaining({ kind: 'accuse', targetId: 'p2' }),
    ]);
  });
});
