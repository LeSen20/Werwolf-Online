import { describe, expect, it } from 'vitest';
import type { Game } from '../src/engine';
import {
  assess,
  chooseVote,
  claimsFromIntent,
  decideAbility,
  extractClaimsOffline,
  newMemory,
  planSpeech,
  questionTopic,
  renderIntent,
  styleMessage,
  type BotContext,
  type Claim,
} from '../src/bots';
import { createRandom } from '../src/bots/random';
import { ok, setupGame, toVoting, use, voteAll } from './helpers';

let eventId = 1000;
function claim(kind: Claim['kind'], speakerId: string, targetId: string | null, extra: Partial<Claim> = {}): Claim {
  return { kind, speakerId, targetId, roleId: null, result: null, round: 1, eventId: eventId++, ...extra };
}

function context(game: Game, playerId: string, claims: Claim[] = [], random = createRandom(3)): BotContext {
  return { view: game.viewFor(playerId), claims, memory: newMemory(), random };
}

const prompt = (game: Game, playerId: string, abilityId: string) => game.viewFor(playerId).pending.find((p) => p.abilityId === abilityId)!;

describe('Bot-Verdachtsmodell', () => {
  it('begründet Verdacht mit Gegenbehauptung, Lüge über mich und widerlegter Rolle', () => {
    const game = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'seer.investigate', ['p3']));
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    // Tag 1: Die Seherin (p2) ist tot und aufgedeckt.
    const claims = [
      claim('role', 'p4', null, { roleId: 'seer' }),
      claim('role', 'p5', null, { roleId: 'witch' }),
      claim('role', 'p6', null, { roleId: 'witch' }),
      claim('investigation', 'p5', 'p3', { result: 'werewolf' }),
    ];
    const ranking = assess(game.viewFor('p3'), claims, { usePrivate: true });
    const reasonsOf = (id: string) => ranking.find((s) => s.playerId === id)!.reasons.map((r) => r.code);
    expect(reasonsOf('p4')).toContain('false-claim'); // Seherin ist schon tot aufgedeckt
    expect(reasonsOf('p5')).toEqual(expect.arrayContaining(['counter-claim', 'false-claim'])); // zwei Hexen + lügt über mich
    expect(reasonsOf('p6')).toContain('counter-claim');
    expect(ranking[0].playerId).toBe('p5');
  });

  it('wertet Aussagen anhand aufgedeckter Rollen aus', () => {
    const game = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p7']));
    ok(use(game, 'p2', 'werewolf.kill', ['p7']));
    toVoting(game);
    voteAll(game, { p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p1' }).forEach(ok);
    // p1 (Werwolf) wurde verbannt. Wer ihn verteidigt hat, ist verdächtig.
    const claims = [claim('defend', 'p4', 'p1'), claim('accuse', 'p5', 'p1')];
    const ranking = assess(game.viewFor('p6'), claims, { usePrivate: true });
    const p4 = ranking.find((s) => s.playerId === 'p4')!;
    const p5 = ranking.find((s) => s.playerId === 'p5')!;
    expect(p4.reasons.map((r) => r.code)).toContain('defended-wolf');
    expect(p4.score).toBeGreaterThan(p5.score);
  });
});

describe('Bots handeln gemäß ihrer Karte', () => {
  it('Seherin prüft Unbekannte, deckt einen gefundenen Werwolf auf und stimmt gegen ihn', () => {
    const game = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    const first = decideAbility(context(game, 'p2'), prompt(game, 'p2', 'seer.investigate'));
    expect(first.targets).toHaveLength(1);
    ok(use(game, 'p2', 'seer.investigate', ['p1']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    const ctx = context(game, 'p2');
    const intent = planSpeech(ctx, { kind: 'opening' });
    expect(intent).toMatchObject({ kind: 'claim', roleId: 'seer', accuseId: 'p1', checks: [{ targetId: 'p1', werewolf: true }] });
    toVoting(game);
    expect(chooseVote(ctx, ['p1', 'p4', 'p5'], true)).toBe('p1');
  });

  it('Seherin entlarvt eine falsche Seherin', () => {
    const game = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'seer.investigate', ['p3']));
    ok(use(game, 'p1', 'werewolf.kill', ['p5']));
    const fake = [claim('role', 'p1', null, { roleId: 'seer' }), claim('investigation', 'p1', 'p4', { result: 'werewolf' })];
    const intent = planSpeech(context(game, 'p2', fake), { kind: 'heard', byId: 'p1', claims: fake });
    expect(intent).toMatchObject({ kind: 'claim', roleId: 'seer', accuseId: 'p1' });
    expect(intent?.kind === 'claim' && intent.reasons[0].code).toBe('false-claim');
  });

  it('Werwolf schont sein Rudel, tötet bevorzugt die Seherin und kontert Seherin-Aussagen', () => {
    const game = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    const seerClaim = [claim('role', 'p5', null, { roleId: 'seer' })];
    expect(decideAbility(context(game, 'p1', seerClaim), prompt(game, 'p1', 'werewolf.kill')).targets).toEqual(['p5']);
    ok(use(game, 'p1', 'werewolf.kill', ['p7']));
    ok(use(game, 'p2', 'werewolf.kill', ['p7']));
    toVoting(game);
    // Alle beschuldigen Rudelmitglied p2: Werwolf p1 stimmt trotzdem nie für p2.
    const pressure = ['p3', 'p4', 'p5', 'p6'].map((speaker) => claim('accuse', speaker, 'p2'));
    for (let seed = 1; seed <= 20; seed++) {
      expect(chooseVote(context(game, 'p1', pressure, createRandom(seed)), ['p2', 'p3', 'p4', 'p5', 'p6'], false)).not.toBe('p2');
    }
    const exposed = [claim('role', 'p3', null, { roleId: 'seer' }), claim('investigation', 'p3', 'p2', { result: 'werewolf' })];
    const intent = planSpeech(context(game, 'p1', exposed, () => 0.1), { kind: 'heard', byId: 'p3', claims: exposed });
    expect(intent).toMatchObject({ kind: 'claim', roleId: 'seer', accuseId: 'p3' });
  });

  it('Hexe heilt sich selbst, vergiftet nur bei starkem Verdacht', () => {
    const game = setupGame(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    const ctx = context(game, 'p2');
    expect(decideAbility(ctx, prompt(game, 'p2', 'witch.heal'))).toEqual({ targets: ['p2'] });
    expect(decideAbility(ctx, prompt(game, 'p2', 'witch.poison'))).toEqual({ skip: true });
  });

  it('Hexe vergiftet im Endspiel, wenn eine tote Seherin den Werwolf benannt hat', () => {
    const game = setupGame(['werewolf', 'witch', 'seer', 'villager', 'villager', 'villager']);
    ok(use(game, 'p3', 'seer.investigate', ['p1']));
    ok(use(game, 'p1', 'werewolf.kill', ['p3']));
    ok(game.dispatch({ type: 'USE_ABILITY', playerId: 'p2', abilityId: 'witch.heal', skip: true }));
    ok(game.dispatch({ type: 'USE_ABILITY', playerId: 'p2', abilityId: 'witch.poison', skip: true }));
    // Die (inzwischen tote) Seherin hatte p1 öffentlich als Werwolf benannt.
    const claims = [claim('role', 'p3', null, { roleId: 'seer' }), claim('investigation', 'p3', 'p1', { result: 'werewolf' })];
    toVoting(game);
    voteAll(game, { p1: 'p4', p2: 'p4', p4: 'p5', p5: 'p4', p6: 'p4' }).forEach(ok);
    expect(game.phase).toBe('NIGHT_ACTIONS');
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    expect(decideAbility(context(game, 'p2', claims), prompt(game, 'p2', 'witch.poison'))).toEqual({ targets: ['p1'] });
  });

  it('Jäger erschießt den am stärksten Verdächtigen', () => {
    const game = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p2']));
    const claims = [claim('role', 'p3', null, { roleId: 'seer' }), claim('investigation', 'p3', 'p1', { result: 'werewolf' })];
    expect(decideAbility(context(game, 'p2', claims), prompt(game, 'p2', 'hunter.shoot'))).toEqual({ targets: ['p1'] });
  });

  it('Dieb nimmt lieber die Seherin, muss aber einen Werwolf nehmen, wenn nur Werwölfe übrig sind', () => {
    const withSeer = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager'], { extraCards: ['seer', 'werewolf'] });
    expect(decideAbility(context(withSeer, 'p1'), prompt(withSeer, 'p1', 'thief.steal'))).toEqual({ choice: 'seer' });
    const onlyWolves = setupGame(['thief', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], { extraCards: ['werewolf', 'werewolf'] });
    expect(decideAbility(context(onlyWolves, 'p1'), prompt(onlyWolves, 'p1', 'thief.steal'))).toEqual({ choice: 'werewolf' });
  });

  it('Verliebte stimmen nie gegen ihren Partner', () => {
    const game = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'cupid.link', ['p3', 'p4']));
    ok(use(game, 'p3', 'cupid.lovers'));
    ok(use(game, 'p4', 'cupid.lovers'));
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    toVoting(game);
    const accusations = ['p1', 'p2', 'p5'].map((speaker) => claim('accuse', speaker, 'p4'));
    for (let seed = 1; seed <= 20; seed++) {
      expect(chooseVote(context(game, 'p3', accusations, createRandom(seed)), ['p1', 'p2', 'p4', 'p5'], false)).not.toBe('p4');
    }
  });

  it('eigene Beiträge werden zu öffentlichen Aussagen', () => {
    const claims = claimsFromIntent({ kind: 'claim', roleId: 'seer', checks: [{ targetId: 'p1', werewolf: true }], accuseId: 'p1', reasons: [] }, 'p2', 1, 5);
    expect(claims.map((c) => c.kind)).toEqual(['role', 'investigation', 'accuse']);
  });
});

describe('Sprache der Bots ohne Netzwerk', () => {
  const names: Record<string, string> = { p1: 'Anna', p2: 'Ben', p3: 'Clara' };
  const base = { name: (id: string) => names[id], me: 'p3', presentedRole: 'villager', random: createRandom(1) };

  it('formuliert Absichten auf Deutsch und Englisch', () => {
    const accuse = { kind: 'accuse' as const, targetId: 'p2', reasons: [{ code: 'accused-me' as const, subjectId: 'p2', weight: 0.15 }] };
    expect(renderIntent(accuse, { ...base, lang: 'de' })).toMatch(/Ben/);
    expect(renderIntent(accuse, { ...base, lang: 'de' })).toMatch(/ohne Grund auf mir rum/);
    expect(renderIntent(accuse, { ...base, lang: 'en' })).toMatch(/for no reason/);
    const answer = { kind: 'answer' as const, askedById: 'p1', topic: 'role' as const, suspectId: null, reasons: [] };
    expect(renderIntent(answer, { ...base, lang: 'de' })).toMatch(/ein einfacher Dorfbewohner/);
    expect(renderIntent(answer, { ...base, lang: 'en' })).toMatch(/just a villager/);
  });

  it('Sprechstil verändert den Text, Namen bleiben großgeschrieben', () => {
    const voice = { casual: true, fillers: false, nervous: false, terse: false };
    expect(styleMessage('Ich stimme für Ben.', voice, 'de', ['Ben'], () => 0.1)).toBe('ich stimme für Ben');
    expect(styleMessage('Ben ist komisch.', voice, 'de', ['Ben'], () => 0.1)).toBe('Ben ist komisch');
  });

  it('liest Aussagen und Fragen auf Deutsch und Englisch', () => {
    const players = [
      { id: 'p1', name: 'Anna' },
      { id: 'p2', name: 'Ben' },
      { id: 'p3', name: 'Clara' },
    ];
    const roles = [{ id: 'seer', name: 'Seherin' }];
    const german = extractClaimsOffline('Ich bin die Seherin und Ben ist ein Werwolf. Clara ist sauber!', 'p1', players, roles);
    expect(german.claims).toEqual([
      { kind: 'role', targetId: null, roleId: 'seer', result: null },
      { kind: 'investigation', targetId: 'p2', roleId: null, result: 'werewolf' },
      { kind: 'investigation', targetId: 'p3', roleId: null, result: 'not-werewolf' },
    ]);
    const english = extractClaimsOffline("I think Ben is lying, I'm voting for Ben. Clara is not a wolf.", 'p1', players, roles);
    expect(english.claims.map((c) => `${c.kind}:${c.targetId}`)).toEqual(['accuse:p2', 'vote:p2', 'defend:p3']);
    expect(english.language).toBe('en');
    expect(questionTopic('Ben, bist du ein Werwolf?')).toBe('role');
    expect(questionTopic('Who do you suspect?')).toBe('suspect');
    expect(questionTopic('Warum ausgerechnet Clara?')).toBe('why');
    expect(questionTopic('Für wen stimmst du?')).toBe('vote');
  });
});

describe('Gesprächsführung der Bots', () => {
  it('nur der erste Bot reagiert auf die Toten, spätere fragen oder beschuldigen', () => {
    const game = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    ok(use(game, 'p1', 'werewolf.kill', ['p6']));
    ok(game.dispatch({ type: 'CHAT', playerId: 'p2', text: 'Oh nein, Frieda...' }));
    for (let seed = 1; seed <= 15; seed++) {
      const intent = planSpeech(context(game, 'p3', [], createRandom(seed)), { kind: 'opening' });
      expect(intent?.kind).not.toBe('react-deaths');
    }
    const asking = planSpeech(context(game, 'p3', [], () => 0.1), { kind: 'opening' });
    expect(asking).toMatchObject({ kind: 'ask', topic: 'suspect' });
    expect(renderIntent(asking!, { lang: 'de', name: (id) => ({ p1: 'Anna', p4: 'David', p5: 'Emil' })[id] ?? id, me: 'p3', presentedRole: 'villager', random: () => 0.1 })).toMatch(/\?$/);
  });
});
