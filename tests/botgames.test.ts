import { describe, expect, it } from 'vitest';
import { BotController, generateBotName, personaFor, shortNames, type BotControllerOptions } from '../src/bots';
import { createRandom } from '../src/bots/random';
import { Game, buildAutoDeck, type Command } from '../src/engine';
import { createDefaultRegistry } from '../src/roles';
import { detectGermanOrEnglish, type Translator } from '../src/translation';
import { NAMES, ok, setupGame, use } from './helpers';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Bots mit sofortiger Ausführung geplanter Aufgaben (keine echten Wartezeiten). */
function harness(game: Game, botIds: string[], options: Partial<BotControllerOptions> = {}) {
  const tasks: Array<() => void> = [];
  const controller = new BotController(
    game,
    botIds.map((playerId, index) => ({ playerId, persona: personaFor(index) })),
    {
      send: (command: Command) => game.dispatch(command),
      schedule: (_delay, task) => tasks.push(task),
      realisticTiming: false,
      seed: 11,
      ...options,
    },
  );
  async function settle(): Promise<void> {
    for (let i = 0; i < 500; i++) {
      await controller.observe();
      await flush();
      const task = tasks.shift();
      if (!task) return;
      task();
      await flush();
    }
    throw new Error('Die Bots kommen nicht zur Ruhe.');
  }
  return { controller, settle };
}

/** Spielt eine reine Bot-Partie bis zum Ende. */
async function playToEnd(game: Game, bots: ReturnType<typeof harness>, label: string): Promise<void> {
  for (let step = 0; step < 3000 && game.phase !== 'GAME_OVER'; step++) {
    await bots.settle();
    const decision = bots.controller.nextDecision();
    if (decision) {
      const result = game.dispatch(decision);
      if (!result.ok) throw new Error(`${label}: ${result.error.message} ${JSON.stringify(decision)}`);
    } else if (['DAY_ANNOUNCEMENT', 'DAY_DISCUSSION'].includes(game.phase)) {
      ok(game.dispatch({ type: 'ADVANCE' }));
    } else {
      throw new Error(`${label}: keine Bot-Entscheidung in Phase ${game.phase}`);
    }
  }
  expect(game.phase, label).toBe('GAME_OVER');
}

const chatOf = (game: Game, playerId: string) =>
  game
    .publicView()
    .events.filter((e) => e.type === 'chat' && e.data?.playerId === playerId)
    .map((e) => String(e.data?.message));

describe('Partien mit Bots', () => {
  it('reine Bot-Partien laufen bis zum Ende, Bots reden und begründen', { timeout: 60_000 }, async () => {
    const registry = createDefaultRegistry();
    let chats = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const playerCount = 6 + (seed % 5);
      const game = Game.create(
        {
          players: NAMES.slice(0, playerCount).map((name) => ({ name })),
          roles: buildAutoDeck(registry, { playerCount, werewolves: playerCount >= 8 ? 2 : 1, specialRoles: ['seer', 'witch', 'hunter', 'cupid', 'thief'].slice(0, seed % 6) }),
          seed,
        },
        registry,
      );
      ok(game.dispatch({ type: 'START_GAME' }));
      ok(game.dispatch({ type: 'ADVANCE' }));
      const bots = harness(game, game.publicView().players.map((p) => p.id), { seed });
      await playToEnd(game, bots, `Seed ${seed}`);
      chats += game.publicView().events.filter((e) => e.type === 'chat').length;
    }
    expect(chats).toBeGreaterThan(100);
  });

  it('Bots antworten Menschen in deren Sprache und verteidigen sich', async () => {
    // p1 ist ein Mensch, alle anderen sind Bots.
    const game = setupGame(['villager', 'werewolf', 'seer', 'villager', 'villager']);
    ok(use(game, 'p3', 'seer.investigate', ['p2']));
    ok(use(game, 'p2', 'werewolf.kill', ['p5']));
    const bots = harness(game, ['p2', 'p3', 'p4', 'p5']);
    await bots.settle();

    ok(game.dispatch({ type: 'CHAT', playerId: 'p1', text: 'Ben, are you a werewolf?' }));
    await bots.settle();
    const benReply = chatOf(game, 'p2').at(-1) ?? '';
    expect(benReply.toLowerCase()).toContain('villager');
    expect(bots.controller.conversationLanguage).toBe('en');

    ok(game.dispatch({ type: 'CHAT', playerId: 'p1', text: 'I think Clara is lying, she is the wolf.' }));
    await bots.settle();
    // Clara ist die Seherin und kennt den Werwolf: Sie deckt sich auf und belastet Ben.
    const claim = chatOf(game, 'p3').find((text) => /seer/i.test(text)) ?? '';
    expect(claim).toContain('Ben');
    expect(bots.controller.claims.all()).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'investigation', speakerId: 'p3', targetId: 'p2', result: 'werewolf' })]),
    );
  });

  it('übersetzt fremde Sprachen über den separaten Übersetzer', async () => {
    const translator: Translator = {
      name: 'Test-Übersetzer',
      canTranslate: true,
      detect: async (text) => (text.startsWith('FR:') ? 'fr' : detectGermanOrEnglish(text)),
      translate: async (text, from, to) => {
        if (from === 'fr' && to === 'en') return text.replace('FR:', '').replace('est un loup-garou', 'is a werewolf');
        if (to === 'fr') return `FR: ${text}`;
        return null;
      },
    };
    const game = setupGame(['villager', 'werewolf', 'villager', 'villager', 'villager']);
    ok(use(game, 'p2', 'werewolf.kill', ['p5']));
    const bots = harness(game, ['p2', 'p3', 'p4', 'p5'], { translator });
    await bots.settle();
    ok(game.dispatch({ type: 'CHAT', playerId: 'p1', text: 'FR: Je pense que Ben est un loup-garou' }));
    await bots.settle();
    expect(bots.controller.claims.all().some((c) => c.kind === 'accuse' && c.speakerId === 'p1' && c.targetId === 'p2')).toBe(true);
    const reply = chatOf(game, 'p2').at(-1) ?? '';
    expect(reply.startsWith('FR:')).toBe(true);
    expect(bots.controller.conversationLanguage).toBe('fr');
  });

  it('Bots mit Benutzernamen verstehen Kurzformen und kürzen selbst ab', async () => {
    const game = setupGame(['villager', 'werewolf', 'villager', 'villager', 'villager'], { names: ['Anna', 'le_sen1', 'jonas2003', 'nachteule7', 'xXFrostXx'] });
    ok(use(game, 'p2', 'werewolf.kill', ['p5']));
    const bots = harness(game, ['p2', 'p3', 'p4', 'p5']);
    await bots.settle();
    ok(game.dispatch({ type: 'CHAT', playerId: 'p1', text: 'lesen, bist du ein Werwolf?' }));
    await bots.settle();
    expect(chatOf(game, 'p2').at(-1) ?? '').toMatch(/dorfbewohner/i);

    // Reine Bot-Partie mit erzeugten Namen: läuft durch, Kurzformen tauchen im Chat auf.
    const random = createRandom(5);
    const names: string[] = [];
    for (let i = 0; i < 8; i++) names.push(generateBotName(random, names));
    const registry = createDefaultRegistry();
    const full = Game.create({ players: names.map((name) => ({ name })), roles: buildAutoDeck(registry, { playerCount: 8, werewolves: 2, specialRoles: ['seer', 'witch', 'hunter'] }), seed: 5 }, registry);
    ok(full.dispatch({ type: 'START_GAME' }));
    ok(full.dispatch({ type: 'ADVANCE' }));
    const allBots = harness(full, full.publicView().players.map((p) => p.id), { seed: 5 });
    await playToEnd(full, allBots, 'Benutzernamen');
    const aliases = [...shortNames(full.publicView().players).values()];
    const messages = full.publicView().events.filter((e) => e.type === 'chat').map((e) => String(e.data?.message));
    expect(aliases.length).toBeGreaterThan(0);
    expect(messages.some((m) => aliases.some((alias) => new RegExp(`(^|[^\\w])${alias}([^\\w]|$)`, 'i').test(m)))).toBe(true);
  });

  it('Bots im Rudel folgen der Wahl eines menschlichen Werwolfs', () => {
    const game = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    const bots = harness(game, ['p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(bots.controller.nextDecision()).toBeNull();
    ok(use(game, 'p1', 'werewolf.kill', ['p4']));
    expect(bots.controller.nextDecision()).toEqual({ type: 'USE_ABILITY', playerId: 'p2', abilityId: 'werewolf.kill', targets: ['p4'] });
  });
});
