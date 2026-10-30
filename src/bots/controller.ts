/**
 * Steuert alle Bots einer Partie. Bots spielen ausschließlich über dieselbe
 * Schnittstelle wie Menschen: viewFor(botId) zum Sehen, Befehle zum Handeln.
 * Alles läuft lokal, ohne externen Dienst.
 *
 * - nextDecision(): fällige Nachtfähigkeit, Todesfolge oder Stimme eines Bots.
 * - observe(): verarbeitet neue öffentliche Ereignisse (Chat, Tagesbeginn,
 *   Abstimmung) und plant Chat-Beiträge mit menschlich wirkenden Pausen.
 *
 * Sprachen: Bots denken und formulieren auf Deutsch oder Englisch. Schreiben Menschen
 * in einer anderen Sprache, übersetzt der separate Übersetzer (src/translation) deren
 * Nachrichten ins Englische und die Antworten der Bots in die Sprache des Gesprächs.
 */
import type { Command, DispatchResult, Game, GameEvent, PlayerId } from '../engine';
import { basicTranslator, detectLanguage, translateKeepingNames, type Translator } from '../translation';
import { ClaimStore, extractClaimsOffline, findMentions, questionTopic, shortNames, type Named } from './claims';
import { renderIntent, styleMessage, type TemplateLanguage } from './language';
import { nameAliases } from './names';
import { createRandom, pickRandom, shuffled, type Random } from './random';
import {
  chooseVote,
  claimsFromIntent,
  decideAbility,
  isWerewolfBot,
  newMemory,
  planSpeech,
  presentedRole,
  rememberIntent,
  type BotContext,
} from './strategy';
import type { BotMemory, Claim, Persona, QuestionTopic, SpeechIntent, SpeechTrigger } from './types';

export interface BotSetup {
  playerId: PlayerId;
  persona: Persona;
}

export interface BotControllerOptions {
  /** Führt einen Befehl aus (in der Oberfläche: dispatch + neu zeichnen). */
  send: (command: Command) => DispatchResult;
  /** Separater Übersetzer für fremde Sprachen (Standard: nur Deutsch/Englisch). */
  translator?: Translator;
  seed?: number;
  /** Standardsprache, bis ein Mensch schreibt. */
  language?: string;
  /** Verzögerte Ausführung (Oberfläche: setTimeout; Tests: Warteschlange). */
  schedule?: (delayMs: number, task: () => void) => void;
  /** Wird aufgerufen, wenn sich z.B. die "tippt gerade"-Anzeige ändert. */
  onChange?: () => void;
  maxMessagesPerDay?: number;
  /** Menschlich wirkende Pausen (in Tests aus). */
  realisticTiming?: boolean;
}

interface BotState {
  persona: Persona;
  memory: BotMemory;
}

const CHAT_PHASES = new Set(['DAY_ANNOUNCEMENT', 'DAY_DISCUSSION', 'DAY_VOTING']);

export class BotController {
  readonly claims = new ClaimStore();
  /** Bots, die gerade "tippen". */
  readonly typing = new Set<PlayerId>();
  private readonly game: Game;
  private readonly bots = new Map<PlayerId, BotState>();
  private readonly translator: Translator;
  private readonly random: Random;
  private readonly options: BotControllerOptions;
  private readonly suggestions = new Map<string, PlayerId | null>();
  private language: string | null = null;
  private lastEventId = 0;
  private reactionsToday = 0;
  private processing: Promise<void> = Promise.resolve();

  constructor(game: Game, bots: BotSetup[], options: BotControllerOptions) {
    this.game = game;
    this.options = options;
    this.translator = options.translator ?? basicTranslator;
    this.random = createRandom(options.seed ?? Date.now());
    for (const bot of bots) this.bots.set(bot.playerId, { persona: bot.persona, memory: newMemory() });
  }

  isBot(playerId: PlayerId): boolean {
    return this.bots.has(playerId);
  }

  persona(playerId: PlayerId): Persona | null {
    return this.bots.get(playerId)?.persona ?? null;
  }

  /** Erkannte Sprache des Gesprächs (aus Nachrichten der Menschen). */
  get conversationLanguage(): string | null {
    return this.language;
  }

  private context(playerId: PlayerId): BotContext {
    const state = this.bots.get(playerId)!;
    const view = this.game.viewFor(playerId);
    if (state.memory.day !== view.round) {
      state.memory.day = view.round;
      state.memory.messagesToday = 0;
      state.memory.plannedVote = null;
    }
    return { view, claims: this.claims.all(), memory: state.memory, random: this.random };
  }

  private delay(base: number, jitter: number): number {
    return this.options.realisticTiming === false ? 0 : base + this.random() * jitter;
  }

  private schedule(delayMs: number, task: () => void): void {
    if (this.options.schedule) this.options.schedule(delayMs, task);
    else setTimeout(task, delayMs);
  }

  // ---------------------------------------------------------------- Entscheidungen

  /** Nächste fällige Bot-Entscheidung als Befehl, oder null. */
  nextDecision(): Command | null {
    const phase = this.game.phase;
    if (phase === 'NIGHT_ACTIONS' || phase === 'DEATH_RESOLUTION') {
      for (const pending of this.game.pendingDecisions()) {
        if (!this.isBot(pending.playerId)) continue;
        const ctx = this.context(pending.playerId);
        const prompt = ctx.view.pending.find((p) => p.abilityId === pending.abilityId);
        if (!prompt) continue;
        if (prompt.group) {
          const mine = prompt.group.find((m) => m.playerId === pending.playerId)?.targets;
          const humans = prompt.group.filter((m) => !this.isBot(m.playerId));
          // Mit Menschen im Rudel folgen Bots der menschlichen Wahl.
          const lead = humans.length > 0 ? humans.find((m) => m.targets)?.targets : prompt.group.find((m) => m.targets)?.targets;
          if (humans.length > 0 && !lead) continue;
          if (mine && (!lead || sameTargets(mine, lead))) continue;
          const targets = lead ?? decideAbility(ctx, prompt).targets ?? [];
          return { type: 'USE_ABILITY', playerId: pending.playerId, abilityId: prompt.abilityId, targets };
        }
        return { type: 'USE_ABILITY', playerId: pending.playerId, abilityId: prompt.abilityId, ...decideAbility(ctx, prompt) };
      }
      return null;
    }
    if (phase === 'DAY_VOTING') {
      const vote = this.game.publicView().vote;
      for (const voter of vote?.voters ?? []) {
        if (!this.isBot(voter.id) || vote!.voted.includes(voter.id)) continue;
        const ctx = this.context(voter.id);
        const options = ctx.view.vote?.options.map((o) => o.id) ?? [];
        return { type: 'VOTE', playerId: voter.id, targetId: chooseVote(ctx, options, ctx.view.rules.allowAbstain) };
      }
    }
    return null;
  }

  /** Vorschlag eines Bot-Rudelmitglieds für das gemeinsame Opfer (Anzeige für Menschen). */
  suggestion(botId: PlayerId, abilityId: string): PlayerId | null {
    const key = `${this.game.publicView().round}:${botId}:${abilityId}`;
    if (!this.suggestions.has(key)) {
      const ctx = this.context(botId);
      const prompt = ctx.view.pending.find((p) => p.abilityId === abilityId);
      this.suggestions.set(key, prompt ? (decideAbility(ctx, prompt).targets?.[0] ?? null) : null);
    }
    return this.suggestions.get(key) ?? null;
  }

  // ---------------------------------------------------------------- Chat

  /** Neue öffentliche Ereignisse verarbeiten. Aufrufe werden nacheinander abgearbeitet. */
  observe(): Promise<void> {
    this.processing = this.processing.then(() => this.processNewEvents()).catch((error) => console.warn('[Bots]', error));
    return this.processing;
  }

  private async processNewEvents(): Promise<void> {
    const view = this.game.publicView();
    const fresh = view.events.filter((e) => e.id > this.lastEventId);
    if (fresh.length === 0) return;
    this.lastEventId = fresh[fresh.length - 1].id;
    const players: Named[] = view.players.map((p) => ({ id: p.id, name: p.name }));
    const roles: Named[] = view.deck.map((d) => ({ id: d.roleId, name: d.name }));
    for (const event of fresh) {
      if (event.type === 'day-start') this.onDayStart();
      else if (event.type === 'vote-start') this.onVoteStart();
      else if (event.type === 'chat') await this.onChat(event, players, roles);
    }
  }

  private livingBots(): PlayerId[] {
    const alive = new Set(this.game.publicView().players.filter((p) => p.alive).map((p) => p.id));
    return [...this.bots.keys()].filter((id) => alive.has(id));
  }

  private onDayStart(): void {
    this.reactionsToday = 0;
    const speakers = shuffled(this.random, this.livingBots())
      .filter(() => this.random() < 0.65)
      .slice(0, 3);
    speakers.forEach((id, index) => this.speak(id, { kind: 'opening' }, this.delay(1500 + index * 2500, 1500)));
  }

  private onVoteStart(): void {
    let announced = 0;
    for (const id of shuffled(this.random, this.livingBots())) {
      const ctx = this.context(id);
      ctx.memory.plannedVote = null;
      if (announced >= 2 || this.random() >= 0.3) continue;
      const options = ctx.view.vote?.options.map((o) => o.id) ?? [];
      const target = chooseVote(ctx, options, false);
      if (!target) continue;
      ctx.memory.plannedVote = target;
      announced += 1;
      this.speak(id, { intent: { kind: 'vote', targetId: target } }, this.delay(800 + announced * 1500, 1500));
    }
  }

  private async onChat(event: GameEvent, players: Named[], roles: Named[]): Promise<void> {
    const speakerId = String(event.data?.playerId ?? '');
    const message = String(event.data?.message ?? '');
    if (!speakerId || !message) return;
    const fromBot = this.isBot(speakerId);
    let addressed = findMentions(message, players, speakerId);
    let topic: QuestionTopic | null = message.includes('?') ? questionTopic(message) : null;
    if (!fromBot) {
      // Menschen: Sprache erkennen, bei Bedarf ins Englische übersetzen, Aussagen auslesen.
      const language = await detectLanguage(this.translator, message);
      if (language) this.language = language;
      let analysis = message;
      if (language && language !== 'de' && language !== 'en' && this.translator.canTranslate) {
        const names = players.flatMap((p) => nameAliases(p.name));
        analysis = (await translateKeepingNames(this.translator, message, language, 'en', names)) ?? message;
      }
      const extracted = extractClaimsOffline(analysis, speakerId, players, roles);
      this.claims.add(...extracted.claims.map((draft): Claim => ({ ...draft, speakerId, round: event.round, eventId: event.id })));
      addressed = [...new Set([...addressed, ...extracted.addressed])];
      if (!topic && extracted.isQuestion) topic = questionTopic(analysis);
      else if (topic) topic = questionTopic(analysis);
    }
    // Bot-Aussagen wurden beim Senden bereits als Aussagen registriert.
    const claims = this.claims.all().filter((c) => c.eventId === event.id);
    this.planReactions(speakerId, claims, addressed, topic, fromBot);
  }

  private planReactions(speakerId: PlayerId, claims: Claim[], addressed: PlayerId[], topic: QuestionTopic | null, fromBot: boolean): void {
    // Gespräche unter Bots begrenzen, damit sie nicht endlos weiterlaufen.
    if (fromBot && (this.reactionsToday >= this.bots.size || this.random() < 0.4)) return;
    const bots = this.livingBots().filter((id) => id !== speakerId);
    const responders = new Map<PlayerId, SpeechTrigger>();
    for (const claim of claims) {
      const accusing = claim.kind === 'accuse' || claim.kind === 'vote' || (claim.kind === 'investigation' && claim.result === 'werewolf');
      if (accusing && claim.targetId && bots.includes(claim.targetId)) responders.set(claim.targetId, { kind: 'accused', byId: speakerId, claims });
    }
    for (const id of addressed) {
      if (bots.includes(id) && !responders.has(id)) responders.set(id, { kind: 'addressed', byId: speakerId, topic });
    }
    // Werwolf-Bots reagieren, wenn eine "Seherin" ihr Rudel belastet (mögliche Gegenbehauptung).
    if (claims.some((c) => c.kind === 'investigation' && c.result === 'werewolf')) {
      for (const id of bots) {
        if (!responders.has(id) && isWerewolfBot(this.game.viewFor(id))) responders.set(id, { kind: 'heard', byId: speakerId, claims });
      }
    }
    if (responders.size === 0 && claims.length > 0) {
      const other = pickRandom(this.random, bots);
      if (other && this.random() < (fromBot ? 0.35 : 0.6)) responders.set(other, { kind: 'heard', byId: speakerId, claims });
    }
    let budget = fromBot ? 1 : 2;
    let index = 0;
    for (const [id, trigger] of responders) {
      if (budget-- <= 0) break;
      this.reactionsToday += 1;
      this.speak(id, trigger, this.delay(1200 + index++ * 2000, 1500));
    }
  }

  private canChat(playerId: PlayerId): boolean {
    if (!CHAT_PHASES.has(this.game.phase)) return false;
    return this.game.publicView().players.some((p) => p.id === playerId && p.alive);
  }

  private speak(playerId: PlayerId, what: SpeechTrigger | { intent: SpeechIntent }, delayMs: number): void {
    this.schedule(delayMs, () => {
      void this.say(playerId, what);
    });
  }

  private async say(playerId: PlayerId, what: SpeechTrigger | { intent: SpeechIntent }): Promise<void> {
    if (!this.canChat(playerId)) return;
    const state = this.bots.get(playerId)!;
    const ctx = this.context(playerId);
    if (ctx.memory.messagesToday >= (this.options.maxMessagesPerDay ?? 4)) return;
    const intent = 'intent' in what ? what.intent : planSpeech(ctx, what);
    if (!intent) return;
    ctx.memory.messagesToday += 1;

    const target = this.language ?? this.options.language ?? 'de';
    const base: TemplateLanguage = target === 'de' ? 'de' : 'en';
    const voice = state.persona.voice;
    // Wie Menschen kürzen Bots lange Benutzernamen ab (le_sen1 -> lesen), lockere Typen öfter.
    const short = shortNames(ctx.view.players);
    const shortChance = voice.casual || voice.terse ? 0.6 : 0.2;
    const names = [...ctx.view.players.map((p) => p.name), ...short.values()];
    // Innerhalb einer Nachricht immer dieselbe Form pro Person.
    const chosen = new Map<PlayerId, string>();
    const name = (id: PlayerId) => {
      if (!chosen.has(id)) {
        const alias = short.get(id);
        chosen.set(id, alias && this.random() < shortChance ? alias : (ctx.view.players.find((p) => p.id === id)?.name ?? id));
      }
      return chosen.get(id)!;
    };
    const render = () =>
      styleMessage(
        renderIntent(intent, { lang: base, name, me: playerId, presentedRole: presentedRole(ctx.memory), random: this.random, voice }),
        voice,
        base,
        names,
        this.random,
      );
    // Nicht wiederholen, was gerade jemand geschrieben hat, auch nicht mit vertauschten Namen.
    const anyName = new RegExp([...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
    const normalize = (message: string) => message.replace(anyName, '#').toLowerCase();
    const recent = new Set(
      ctx.view.events
        .filter((e) => e.type === 'chat')
        .slice(-10)
        .map((e) => normalize(String(e.data?.message ?? ''))),
    );
    let text = render();
    for (let attempt = 0; attempt < 3 && recent.has(normalize(text)); attempt++) text = render();
    this.typing.add(playerId);
    this.options.onChange?.();
    if (target !== base && this.translator.canTranslate) {
      text = (await translateKeepingNames(this.translator, text, base, target, names)) ?? text;
    }
    const typingTime = this.options.realisticTiming === false ? 0 : Math.min(7000, 900 + text.length * 35) + this.random() * 700;
    this.schedule(typingTime, () => {
      this.typing.delete(playerId);
      if (this.canChat(playerId)) {
        const result = this.options.send({ type: 'CHAT', playerId, text });
        const event = result.ok ? result.events.find((e) => e.type === 'chat') : undefined;
        if (event) {
          this.claims.add(...claimsFromIntent(intent, playerId, event.round, event.id));
          rememberIntent(state.memory, intent, isWerewolfBot(ctx.view));
        }
      }
      this.options.onChange?.();
    });
  }
}

function sameTargets(a: PlayerId[], b: PlayerId[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
