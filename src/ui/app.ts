/**
 * Hot-Seat-Oberfläche: Ein Gerät ist der Erzähler und wird bei geheimen Entscheidungen
 * an die menschlichen Spieler weitergegeben; Bots handeln selbst. Die Oberfläche
 * entscheidet keine Spielregeln. Sie zeigt nur die Ansichten der Engine an und sendet
 * Befehle; ein späterer Online-Client kann dieselben Ansichten und Befehle verwenden.
 */
import { BotController, PERSONAS, shuffled } from '../bots';
import { Game, type Command, type DispatchResult, type GameEvent, type PendingDecision, type PlayerId, type PublicView } from '../engine';
import { createDefaultRegistry } from '../roles';
import { basicTranslator, createTranslator, detectLanguage, type Translator } from '../translation';
import { ASSETS, assetUrl, playSound, type SoundKey } from './assets';
import { chatLog, eventLog, icon, knowledge, panel, playerList, promptForm, roleCard, type Theme } from './components';
import { button, h, type Child } from './dom';
import { SetupScreen, type StartRequest } from './setup';

/** Debug-Protokoll (zeigt alle geheimen Informationen) nur mit ?debug in der Adresse anbieten. */
const DEBUG = new URLSearchParams(window.location.search).has('debug');

/** Töne eines Abschnitts in dieser Reihenfolge nacheinander (Chat nur, wenn sonst nichts passiert). */
const SOUND_SEQUENCE: ReadonlyArray<readonly [string, SoundKey]> = [
  ['day-start', 'dayStart'],
  ['death', 'death'],
  ['vote-start', 'vote'],
  ['night-start', 'nightStart'],
  ['game-over', 'gameOver'],
];
const SOUND_GAP_MS = 1500;

interface Interstitial {
  title: string;
  lines: string[];
  buttonLabel: string;
}

/** Öffentliche Ereignisse, die nach einer Abstimmung oder Todesentscheidung zusammengefasst werden. */
const RESULT_EVENTS = new Set([
  'vote-result',
  'vote-ballots',
  'vote-tie',
  'vote-elimination',
  'vote-none',
  'vote-start',
  'death',
  'lover-grief',
  'hunter-shot',
  'hunter-skip',
  'game-over',
]);

export class App {
  private readonly root: HTMLElement;
  private readonly registry = createDefaultRegistry();
  private readonly setup: SetupScreen;
  private game: Game | null = null;
  private bots: BotController | null = null;
  private translator: Translator = basicTranslator;
  private botTimer: number | null = null;
  private chatDraft = '';
  private chatAs: PlayerId | null = null;

  // Reiner Bildschirmablauf (keine Spielregeln):
  private revealIndex = 0;
  private revealOpen = false;
  private nightIntroRound = 0;
  private awakeKey: string | null = null;
  private stepNotes: string[] = [];
  private voterReady: PlayerId | null = null;
  private interstitial: Interstitial | null = null;
  private message: string | null = null;
  private logMode: 'off' | 'public' | 'debug' = 'off';
  private timer: { key: string; endsAt: number; handle: number } | null = null;
  private theme: Theme = 'setup';
  private readonly imageSizes = new Map<string, { width: number; height: number }>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.setup = new SetupScreen(this.registry, (request) => this.startGame(request), () => this.render());
    window.addEventListener('resize', () => this.applyBackground());
  }

  // ---------------------------------------------------------------- Ablauf

  private startGame(request: StartRequest): void {
    const { config } = request;
    try {
      this.game = Game.create(config, this.registry, {
        logger: (entry) => {
          if (entry.level !== 'info') console.warn(`[Werwolf] ${entry.message}`, entry.data);
        },
      });
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
      this.render();
      return;
    }
    // Bots: Spieler-IDs sind p1..pN in der Reihenfolge der Vorbereitung.
    this.translator = createTranslator(request.translation);
    // Persönlichkeiten (Sprechstil, Avatar) jede Partie neu verteilen.
    const personas = shuffled(Math.random, PERSONAS);
    const botSetups = request.botIndices.map((index, order) => ({ playerId: `p${index + 1}`, persona: personas[order % personas.length] }));
    this.bots =
      botSetups.length > 0
        ? new BotController(this.game, botSetups, {
            send: (command) => this.botSend(command),
            translator: this.translator,
            onChange: () => this.refreshTyping(),
          })
        : null;
    this.chatDraft = '';
    this.chatAs = null;
    this.revealIndex = 0;
    this.revealOpen = false;
    this.nightIntroRound = 0;
    this.awakeKey = null;
    this.stepNotes = [];
    this.voterReady = null;
    this.interstitial = null;
    this.dispatch({ type: 'START_GAME' });
  }

  private newGame(): void {
    this.stopTimer();
    if (this.botTimer !== null) window.clearTimeout(this.botTimer);
    this.botTimer = null;
    this.bots = null;
    this.game = null;
    this.message = null;
    this.interstitial = null;
    this.setup.renewBotNames();
    this.render();
  }

  /** Schlüssel des aktuellen Bildschirms; ändert er sich, ist ein Abschnitt beendet. */
  private screenKey(view: PublicView | null = this.game?.publicView() ?? null): string {
    if (!view) return 'setup';
    switch (view.phase) {
      case 'NIGHT_ACTIONS':
        return `night:${view.round}:${view.nightStep?.id ?? ''}`;
      case 'DAY_VOTING':
        return `vote:${view.round}:${view.vote?.round ?? 0}`;
      case 'DEATH_RESOLUTION':
        return `death:${view.round}:${view.deathDecisions.map((d) => d.playerId).join(',')}`;
      default:
        return `${view.phase}:${view.round}`;
    }
  }

  private dispatch(...commands: Command[]): void {
    for (const command of commands) {
      if (!this.apply(command)) break;
    }
    this.render();
  }

  private apply(command: Command): boolean {
    const game = this.game;
    if (!game) return false;
    const before = game.publicView();
    const beforeKey = this.screenKey(before);
    const actors = new Set(game.pendingDecisions().map((p) => p.playerId));
    const result = game.dispatch(command);
    if (!result.ok) {
      this.message = result.error.message;
      return false;
    }
    this.message = null;
    this.summarize(before, beforeKey, actors, result.events);
    this.playEventSounds(result.events);
    return true;
  }

  private isBot(playerId: PlayerId): boolean {
    return this.bots?.isBot(playerId) ?? false;
  }

  /** Chatnachrichten der Bots. Abgelehnte Nachrichten (z.B. Phase vorbei) werden still verworfen. */
  private botSend(command: Command): DispatchResult {
    const result = this.game!.dispatch(command);
    if (result.ok) {
      this.playEventSounds(result.events);
      this.render();
    }
    return result;
  }

  /** Fällige Bot-Entscheidungen nach einer kurzen, menschlich wirkenden Pause ausführen. */
  private scheduleBots(view: PublicView | null): void {
    if (!this.bots || !view || this.botTimer !== null || this.interstitial) return;
    if (view.phase === 'NIGHT_ACTIONS' && this.nightIntroRound < view.round) return;
    const command = this.bots.nextDecision();
    if (!command) return;
    const delay = command.type === 'VOTE' ? 500 + Math.random() * 900 : 1800 + Math.random() * 1800;
    this.botTimer = window.setTimeout(() => {
      this.botTimer = null;
      const next = this.bots?.nextDecision();
      if (next) this.dispatch(next);
      else this.render();
    }, delay);
  }

  private refreshTyping(): void {
    const element = this.root.querySelector('#typing');
    if (!element || !this.game || !this.bots) return;
    const names = [...this.bots.typing].map((id) => this.game!.publicView().players.find((p) => p.id === id)?.name ?? id);
    element.textContent = names.length > 0 ? `${names.join(', ')} ${names.length === 1 ? 'tippt' : 'tippen'} ...` : '';
  }

  /** Während der Nutzeraktion (Klick) Sprachpakete vorbereiten; Browser laden sie nur dann. */
  private async prepareTranslation(text: string): Promise<void> {
    if (!this.translator.canTranslate || !this.translator.prepare) return;
    const language = await detectLanguage(this.translator, text);
    if (language && language !== 'de' && language !== 'en') await this.translator.prepare([language]).catch(() => {});
  }

  private playEventSounds(events: GameEvent[]): void {
    const types = new Set(events.filter((e) => e.visibility.kind === 'public').map((e) => e.type));
    const keys = SOUND_SEQUENCE.filter(([type]) => types.has(type)).map(([, key]) => key);
    if (keys.length === 0 && types.has('chat')) keys.push('chat');
    keys.forEach((key, index) => setTimeout(() => playSound(key), index * SOUND_GAP_MS));
  }

  /** Zeigt nach einem abgeschlossenen Abschnitt eine Zwischenseite mit den Ergebnissen. */
  private summarize(before: PublicView, beforeKey: string, actors: Set<PlayerId>, events: GameEvent[]): void {
    const afterKey = this.screenKey();
    if (beforeKey.startsWith('night:')) {
      // Private Ergebnisse (z.B. Seherin) nur für die gerade wachen Menschen; Bot-Wissen bleibt geheim.
      const humans = [...actors].filter((id) => !this.isBot(id));
      this.stepNotes.push(
        ...events
          .filter((e) => e.type !== 'group-vote' && e.visibility.kind === 'players' && e.visibility.playerIds.some((id) => humans.includes(id)))
          .map((e) => e.text),
      );
      if (afterKey !== beforeKey && humans.length === 0) {
        this.stepNotes = [];
      } else if (afterKey !== beforeKey) {
        const label = before.nightStep?.label ?? 'Nacht';
        this.interstitial = {
          title: label,
          lines: [...this.stepNotes, `${label}: bitte wieder einschlafen und das Gerät zurücklegen.`],
          buttonLabel: 'Augen sind geschlossen',
        };
        this.stepNotes = [];
      }
      return;
    }
    if ((beforeKey.startsWith('vote:') || beforeKey.startsWith('death:')) && afterKey !== beforeKey) {
      const lines = events.filter((e) => e.visibility.kind === 'public' && RESULT_EVENTS.has(e.type)).map((e) => e.text);
      this.interstitial = { title: beforeKey.startsWith('vote:') ? 'Ergebnis der Abstimmung' : 'Todesfolgen', lines, buttonLabel: 'Weiter' };
    }
  }

  // ---------------------------------------------------------------- Zeitlimits

  private timerSeconds(view: PublicView): number {
    if (this.interstitial) return 0;
    switch (view.phase) {
      case 'ROLE_DISTRIBUTION':
        return view.timers.roleReveal;
      case 'NIGHT_ACTIONS':
        return this.awakeKey === this.screenKey(view) ? view.timers.nightStep : 0;
      case 'DEATH_RESOLUTION':
        return view.timers.deathDecision;
      case 'DAY_DISCUSSION':
        return view.timers.discussion;
      case 'DAY_VOTING':
        return view.timers.voting;
      default:
        return 0;
    }
  }

  /** Die Engine misst keine Zeit: Die Oberfläche sendet nach Ablauf TIMEOUT. */
  private syncTimer(view: PublicView | null): void {
    const seconds = view ? this.timerSeconds(view) : 0;
    const key = this.screenKey(view);
    if (seconds <= 0) {
      this.stopTimer();
      return;
    }
    if (this.timer?.key === key) {
      this.showTimer();
      return;
    }
    this.stopTimer();
    const endsAt = Date.now() + seconds * 1000;
    const handle = window.setInterval(() => {
      if (Date.now() >= endsAt) {
        this.stopTimer();
        this.dispatch({ type: 'TIMEOUT' });
      } else {
        this.showTimer();
      }
    }, 250);
    this.timer = { key, endsAt, handle };
    this.showTimer();
  }

  private showTimer(): void {
    const element = this.root.querySelector('#timer');
    if (!element || !this.timer) return;
    const remaining = Math.max(0, Math.ceil((this.timer.endsAt - Date.now()) / 1000));
    element.textContent = `Restzeit: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  }

  private stopTimer(): void {
    if (this.timer) window.clearInterval(this.timer.handle);
    this.timer = null;
  }

  // ---------------------------------------------------------------- Darstellung

  render(): void {
    // Fokus im Chat-Eingabefeld über das Neuzeichnen hinweg erhalten.
    const active = document.activeElement;
    const chatFocused = active instanceof HTMLInputElement && active.id === 'chat-input';
    const caret = chatFocused ? active.selectionStart : null;
    const view = this.game?.publicView() ?? null;
    this.theme = this.themeFor(view);
    document.body.dataset.theme = this.theme;
    this.applyBackground();
    this.root.replaceChildren(
      h(
        'div',
        { class: 'app' },
        this.header(view),
        this.message ? h('div', { class: 'message', role: 'alert' }, this.message) : null,
        h('main', null, this.screen(view), view ? this.chatPanel(view) : null),
        this.logPanel(view),
      ),
    );
    const log = this.root.querySelector('#chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    if (chatFocused) {
      const input = this.root.querySelector<HTMLInputElement>('#chat-input');
      input?.focus();
      if (input && caret !== null) input.setSelectionRange(caret, caret);
    }
    this.syncTimer(view);
    this.scheduleBots(view);
    void this.bots?.observe();
  }

  /** Tages-Chat für Menschen; Bots schreiben über den BotController mit. */
  private chatPanel(view: PublicView): HTMLElement | null {
    if (!['DAY_ANNOUNCEMENT', 'DAY_DISCUSSION', 'DAY_VOTING'].includes(view.phase) || this.interstitial) return null;
    const humans = view.players.filter((p) => p.alive && !this.isBot(p.id));
    if (!this.chatAs || !humans.some((p) => p.id === this.chatAs)) this.chatAs = humans[0]?.id ?? null;
    const lines = view.events
      .filter((e) => e.type === 'chat')
      .map((e) => {
        const speakerId = String(e.data?.playerId ?? '');
        return {
          id: e.id,
          speaker: view.players.find((p) => p.id === speakerId)?.name ?? '?',
          avatarKey: this.bots?.persona(speakerId)?.id ?? 'human',
          text: String(e.data?.message ?? ''),
        };
      });
    const typing = [...(this.bots?.typing ?? [])].map((id) => view.players.find((p) => p.id === id)?.name ?? id);
    const send = () => {
      const text = this.chatDraft.trim();
      if (!text || !this.chatAs) return;
      this.chatDraft = '';
      void this.prepareTranslation(text);
      this.dispatch({ type: 'CHAT', playerId: this.chatAs, text });
    };
    return panel('Chat', [
      chatLog(lines, typing),
      humans.length > 0
        ? h(
            'div',
            { class: 'chat-input' },
            humans.length > 1
              ? h(
                  'select',
                  {
                    'aria-label': 'Schreiben als',
                    onchange: (e: Event) => {
                      this.chatAs = (e.target as HTMLSelectElement).value;
                    },
                  },
                  humans.map((p) => h('option', { value: p.id, selected: p.id === this.chatAs }, p.name)),
                )
              : null,
            h('input', {
              id: 'chat-input',
              value: this.chatDraft,
              maxlength: 500,
              placeholder: 'Nachricht schreiben (jede Sprache) ...',
              'aria-label': 'Nachricht',
              oninput: (e: Event) => {
                this.chatDraft = (e.target as HTMLInputElement).value;
              },
              onkeydown: (e: Event) => {
                if ((e as KeyboardEvent).key === 'Enter') send();
              },
            }),
            button('Senden', send),
          )
        : h('p', { class: 'hint' }, 'Nur lebende Spieler dürfen schreiben.'),
    ]);
  }

  /**
   * Hintergrund (Pixelgrafik) in ganzzahliger Vergrößerung, die das Fenster gerade abdeckt:
   * so bleiben alle Pixel gleich groß. Im Hochformat wird die Hochformat-Variante bevorzugt.
   */
  private applyBackground(): void {
    const portrait = window.innerHeight > window.innerWidth;
    const path = (portrait ? ASSETS.backgroundsPortrait[this.theme] : undefined) ?? ASSETS.backgrounds[this.theme];
    // Absoluter Pfad: Relative URLs in CSS-Variablen würden gegen die CSS-Datei aufgelöst.
    const url = path ? new URL(assetUrl(path), document.baseURI).href : null;
    const style = document.body.style;
    style.setProperty('--bg-image', url ? `url("${url}")` : 'none');
    const size = url ? this.imageSizes.get(url) : undefined;
    if (url && !size) {
      const image = new Image();
      image.onload = () => {
        this.imageSizes.set(url, { width: image.naturalWidth, height: image.naturalHeight });
        this.applyBackground();
      };
      image.src = url;
    }
    if (!size) {
      style.removeProperty('--bg-size');
      return;
    }
    const scale = Math.max(1, Math.ceil(Math.max(window.innerWidth / size.width, window.innerHeight / size.height)));
    style.setProperty('--bg-size', `${size.width * scale}px ${size.height * scale}px`);
  }

  private themeFor(view: PublicView | null): Theme {
    if (!view) return 'setup';
    if (view.phase === 'GAME_OVER') return 'gameOver';
    if (view.phase === 'ROLE_DISTRIBUTION') return 'night';
    return view.time === 'day' ? 'day' : 'night';
  }

  private header(view: PublicView | null): HTMLElement {
    const nextLog = { off: 'public', public: DEBUG ? 'debug' : 'off', debug: 'off' } as const;
    const logLabel = { off: 'Protokoll', public: DEBUG ? 'Debug-Protokoll' : 'Protokoll aus', debug: 'Protokoll aus' };
    return h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'brand' },
        ASSETS.logo ? h('img', { class: 'logo', src: assetUrl(ASSETS.logo), alt: 'Werwolf' }) : h('span', { class: 'logo-text' }, 'Werwolf'),
        view ? h('span', { class: 'phase' }, `${view.phaseLabel}${view.round > 0 ? ` - Runde ${view.round}` : ''}`) : null,
      ),
      h('span', { class: 'spacer' }),
      view
        ? button(logLabel[this.logMode], () => {
            this.logMode = nextLog[this.logMode];
            this.render();
          }, 'small secondary')
        : null,
      view && view.phase !== 'GAME_OVER'
        ? button('Abbrechen', () => {
            if (window.confirm('Partie wirklich abbrechen?')) this.dispatch({ type: 'ABORT', reason: 'Vom Erzähler abgebrochen.' });
          }, 'small danger')
        : null,
    );
  }

  private logPanel(view: PublicView | null): HTMLElement | null {
    if (!this.game || !view || this.logMode === 'off') return null;
    return this.logMode === 'public'
      ? eventLog(view.events, 'Öffentliches Protokoll')
      : eventLog(this.game.allEvents(), 'Debug-Protokoll (enthält geheime Informationen)');
  }

  private screen(view: PublicView | null): Child {
    if (!this.game || !view) return this.setup.render();
    if (this.interstitial) {
      const { title, lines, buttonLabel } = this.interstitial;
      return panel(title, lines.map((line) => h('p', { class: 'narration' }, line)), [
        button(buttonLabel, () => {
          this.interstitial = null;
          this.render();
        }),
      ]);
    }
    switch (view.phase) {
      case 'ROLE_DISTRIBUTION':
        return this.revealScreen(view);
      case 'NIGHT_ACTIONS':
        return this.nightScreen(view);
      case 'DEATH_RESOLUTION':
        return this.decisionScreen('Todesfolgen', [
          ...this.nightDeathLines(view),
          ...view.deathDecisions.map((d) => `${d.name} darf "${d.abilityName}" einsetzen. Alle dürfen zusehen.`),
        ]);
      case 'DAY_ANNOUNCEMENT':
        return this.announcementScreen(view);
      case 'DAY_DISCUSSION':
        return panel(
          `Tag ${view.round}: Diskussion`,
          [
            h('p', null, 'Diskutiert, wer ein Werwolf sein könnte. Wer etwas weiß, darf es teilen - oder lügen.'),
            h('p', { class: 'timer', id: 'timer' }),
            playerList(view.players),
          ],
          [button('Zur Abstimmung', () => this.dispatch({ type: 'ADVANCE' }))],
        );
      case 'DAY_VOTING':
        return this.votingScreen(view);
      case 'GAME_OVER':
        return this.gameOverScreen(view);
      default:
        return panel('Unerwarteter Zustand', [h('p', null, view.phaseLabel)]);
    }
  }

  /** Todesfolgen in der Nacht: Alle wachen auf und erfahren die bisherigen Toten. */
  private nightDeathLines(view: PublicView): string[] {
    if (view.time !== 'night') return [];
    let start = 0;
    view.events.forEach((e, index) => {
      if (e.type === 'night-start') start = index;
    });
    const deaths = view.events.slice(start).filter((e) => e.type === 'death' || e.type === 'lover-grief');
    return ['Der Morgen graut. Alle wachen auf.', ...deaths.map((e) => e.text)];
  }

  private revealScreen(view: PublicView): Child {
    const game = this.game!;
    // Bots kennen ihre Karte bereits, das Gerät geht nur an Menschen.
    const players = view.players.filter((p) => !this.isBot(p.id));
    if (this.revealIndex >= players.length) {
      return panel('Alle kennen ihre Rolle', [h('p', null, 'Legt das Gerät in die Mitte. Gleich beginnt die erste Nacht.')], [
        button('Erste Nacht beginnen', () => this.dispatch({ type: 'ADVANCE' })),
      ]);
    }
    const current = players[this.revealIndex];
    if (!this.revealOpen) {
      return panel(
        `Gib das Gerät an ${current.name}`,
        [roleCard(null), h('p', null, 'Nur diese Person darf jetzt auf den Bildschirm schauen.')],
        [
          button(`Ich bin ${current.name}`, () => {
            this.revealOpen = true;
            this.render();
          }),
        ],
      );
    }
    const own = game.viewFor(current.id);
    return panel(
      `${current.name}, deine Rolle`,
      [roleCard(own.self.role), h('p', null, own.self.role?.description ?? ''), knowledge(own)],
      [
        button('Karte verdecken und weitergeben', () => {
          this.revealOpen = false;
          this.revealIndex += 1;
          this.render();
        }),
      ],
    );
  }

  private nightScreen(view: PublicView): Child {
    if (this.nightIntroRound < view.round) {
      return panel(`Nacht ${view.round}`, [h('p', { class: 'narration' }, 'Die Nacht bricht herein. Alle schließen die Augen.')], [
        button('Alle Augen sind zu', () => {
          this.nightIntroRound = view.round;
          this.render();
        }),
      ]);
    }
    const step = view.nightStep;
    const key = this.screenKey(view);
    const humanActors = this.game!.pendingDecisions().filter((p) => !this.isBot(p.playerId));
    if (step && humanActors.length === 0) {
      return panel(step.label, [
        h('p', { class: 'narration' }, `${step.label}: wach und am Entscheiden ...`),
        h('p', null, 'Alle anderen halten die Augen geschlossen.'),
      ]);
    }
    if (step && this.awakeKey !== key) {
      return panel(
        step.label,
        [
          h('p', { class: 'narration' }, `${step.label}: bitte aufwachen und das Gerät nehmen.`),
          h('p', null, 'Alle anderen halten die Augen geschlossen.'),
        ],
        [
          button('Wach und bereit', () => {
            this.awakeKey = key;
            this.render();
          }),
        ],
      );
    }
    return this.decisionScreen(step?.label ?? 'Nacht', []);
  }

  /** Entscheidungen aller aktuell handelnden Spieler (Nachtschritt oder Todesfolge). */
  private decisionScreen(title: string, intro: string[]): Child {
    const game = this.game!;
    const pending: PendingDecision[] = game.pendingDecisions();
    const sections: Child[] = [];
    // Gruppenentscheidungen (z.B. Werwölfe): Alle Mitglieder sind gleichzeitig wach und einigen
    // sich wie am Tisch per Handzeichen. Die gemeinsame Wahl wird als Stimme jedes Mitglieds gesendet.
    const groups = new Map<string, PlayerId[]>();
    for (const p of pending) {
      const prompt = game.viewFor(p.playerId).pending.find((x) => x.abilityId === p.abilityId);
      if (prompt?.group) groups.set(p.abilityId, [...(groups.get(p.abilityId) ?? []), p.playerId]);
    }
    for (const [abilityId, members] of groups) {
      const humans = members.filter((id) => !this.isBot(id));
      if (humans.length === 0) continue;
      const prompt = game.viewFor(humans[0]).pending.find((x) => x.abilityId === abilityId)!;
      const nameOf = (id: PlayerId) => game.publicView().players.find((p) => p.id === id)?.name ?? id;
      // Bots im Rudel machen einen Vorschlag, die Menschen entscheiden.
      const suggestions = members
        .filter((id) => this.isBot(id))
        .map((id) => {
          const target = this.bots?.suggestion(id, abilityId);
          return target ? `Vorschlag von ${nameOf(id)}: ${nameOf(target)}` : '';
        })
        .filter(Boolean);
      sections.push(
        h(
          'section',
          { class: 'actor' },
          h('h3', null, `Gemeinsam: ${members.map(nameOf).join(', ')}`),
          ...suggestions.map((line) => h('p', { class: 'info' }, line)),
          promptForm({ ...prompt, group: null }, (answer) =>
            this.dispatch(...members.map((playerId): Command => ({ type: 'USE_ABILITY', playerId, abilityId, ...answer }))),
          ),
        ),
      );
    }
    const actorIds = [...new Set(pending.filter((p) => !groups.has(p.abilityId) && !this.isBot(p.playerId)).map((p) => p.playerId))];
    const deciding = [...new Set(pending.filter((p) => this.isBot(p.playerId) && !groups.has(p.abilityId)).map((p) => p.playerId))];
    if (deciding.length > 0) {
      const names = deciding.map((id) => game.publicView().players.find((p) => p.id === id)?.name ?? id);
      sections.push(h('p', { class: 'narration' }, `${names.join(', ')} ${names.length === 1 ? 'entscheidet' : 'entscheiden'} ...`));
    }
    for (const playerId of actorIds) {
      const own = game.viewFor(playerId);
      sections.push(
        h(
          'section',
          { class: 'actor' },
          h('h3', null, `${own.self.name}${own.self.role ? ` (${own.self.role.name})` : ''}`),
          knowledge(own),
          own.pending
            .filter((prompt) => !groups.has(prompt.abilityId))
            .map((prompt) => promptForm(prompt, (answer) => this.dispatch({ type: 'USE_ABILITY', playerId, abilityId: prompt.abilityId, ...answer }))),
        ),
      );
    }
    return panel(
      title,
      [...intro.map((line) => h('p', { class: 'narration' }, line)), h('p', { class: 'timer', id: 'timer' }), ...sections],
      [button('Zeit abgelaufen: Ersatzregel anwenden', () => this.dispatch({ type: 'TIMEOUT' }), 'secondary')],
    );
  }

  private announcementScreen(view: PublicView): Child {
    const dayStart = [...view.events].reverse().find((e) => e.type === 'day-start');
    return panel(`Tag ${view.round}`, [h('p', { class: 'narration' }, dayStart?.text ?? ''), playerList(view.players)], [
      button('Diskussion beginnen', () => this.dispatch({ type: 'ADVANCE' })),
    ]);
  }

  private votingScreen(view: PublicView): Child {
    const game = this.game!;
    const vote = view.vote!;
    const title = vote.round > 1 ? 'Stichwahl' : 'Abstimmung';
    const close = button('Abstimmung beenden (fehlende Stimmen = Enthaltung)', () => this.dispatch({ type: 'ADVANCE' }), 'secondary');
    // Reihum stimmen nur Menschen ab; Bots stimmen selbst (geheim).
    const next = vote.voters.find((v) => !vote.voted.includes(v.id) && !this.isBot(v.id));
    const status = h('p', null, `Abgestimmt: ${vote.voted.length} von ${vote.voters.length}. Zur Wahl: ${vote.candidates.map((c) => c.name).join(', ')}.`);
    if (!next) {
      const waiting = vote.voted.length < vote.voters.length;
      return panel(title, [h('p', null, waiting ? 'Die übrigen Stimmen werden abgegeben ...' : 'Alle haben abgestimmt.'), status], [close]);
    }
    if (this.voterReady !== next.id) {
      return panel(title, [h('p', { class: 'narration' }, `Gib das Gerät an ${next.name}. Die Stimme ist geheim.`), status, h('p', { class: 'timer', id: 'timer' })], [
        button(`Ich bin ${next.name}`, () => {
          this.voterReady = next.id;
          this.render();
        }),
        close,
      ]);
    }
    const own = game.viewFor(next.id).vote!;
    const prompt = {
      abilityId: 'vote',
      abilityName: 'Stimme',
      title: `${next.name}: Wen soll das Dorf verbannen?`,
      info: [],
      kind: 'players' as const,
      min: 1,
      max: 1,
      optional: view.rules.allowAbstain,
      candidates: own.options,
      choices: [],
      group: null,
    };
    return panel(title, [
      promptForm(prompt, (answer) => {
        this.voterReady = null;
        this.dispatch({ type: 'VOTE', playerId: next.id, targetId: answer.skip ? null : (answer.targets?.[0] ?? null) });
      }),
    ]);
  }

  private gameOverScreen(view: PublicView): Child {
    const result = view.result!;
    const summary = view.events.find((e) => e.type === 'game-over')?.text ?? '';
    return panel(
      result.aborted ? 'Partie abgebrochen' : 'Spielende',
      [
        h('p', { class: 'narration' }, summary),
        h(
          'div',
          { class: 'card-row' },
          view.players.map((p) =>
            h(
              'div',
              { class: `final${result.winners.includes(p.id) ? ' winner' : ''}` },
              roleCard(p.role, 'small'),
              h('span', null, p.name, this.isBot(p.id) ? [' ', icon('bot', '(Bot)')] : null),
              h('span', { class: 'hint' }, p.alive ? 'lebt' : `tot (${p.deathCause ?? '?'})`),
            ),
          ),
        ),
      ],
      [button('Neue Partie', () => this.newGame())],
    );
  }
}
