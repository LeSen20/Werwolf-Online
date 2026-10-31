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
import { setCardAnimationGroup } from './cardAnimation';
import { chatLog, clearPromptSelections, eventLog, handoff, icon, knowledge, panel, playerList, progress, promptForm, roleCard, tallyBars, whoAmI, type TallyRow, type Theme } from './components';
import type { DecisionPrompt, PlayerView } from '../engine';
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

/**
 * Nachtrunde reihum (Nachtmodus 'pass'): Jeder lebende Mensch bekommt das Gerät, in Sitzreihenfolge.
 * Wer etwas zu entscheiden hat, entscheidet; alle anderen erledigen eine Tarnaufgabe. So verraten
 * weder das Nehmen des Geräts noch ein liegen bleibendes Gerät (Rolle bei einem Bot) etwas.
 * Runde 2 folgt, wenn im Spiel eine Rolle ist, die auf andere warten muss (z.B. Hexe auf die Werwölfe).
 */
interface NightPass {
  round: number;
  pass: number;
  order: PlayerId[];
  index: number;
  stage: 'cover' | 'turn' | 'done';
  /** Hat der aktuelle Spieler in seinem Zug schon etwas entschieden (echt oder Tarnung)? */
  acted: boolean;
}

/** Eintrag einer Zwischenseite: Text (Art = Ereignistyp, z.B. 'death') oder Stimmenbalken. */
type InterstitialItem = { text: string; kind: string } | { tally: TallyRow[]; abstentions: number };

interface Interstitial {
  title: string;
  items: InterstitialItem[];
  buttonLabel: string;
}

/** Ereignisse, die auf Zwischenseiten als Todesnachricht hervorgehoben werden. */
const DEATH_EVENTS = new Set(['death', 'lover-grief', 'vote-elimination', 'hunter-shot']);

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
  /** Richter: Häkchen für die zweite Abstimmung (übersteht das Neuzeichnen). */
  private secondVoteWish: PlayerId | null = null;
  private interstitial: Interstitial | null = null;
  private message: string | null = null;
  private logMode: 'off' | 'public' | 'debug' = 'off';
  private timer: { key: string; endsAt: number; handle: number } | null = null;
  private theme: Theme = 'setup';
  private menuOpen = false;
  private nightPass: NightPass | null = null;
  /** Töne, die während der Nachtrunde reihum anfallen; erst danach abspielen (sonst verrät der Zeitpunkt etwas). */
  private deferredSounds: SoundKey[] = [];
  /** Letztes Ereignis, das ein Spieler in seinem Nachtzug gesehen hat (für "Neu für dich"). */
  private readonly seenEvents = new Map<PlayerId, number>();
  private readonly imageSizes = new Map<string, { width: number; height: number }>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.setup = new SetupScreen(this.registry, (request) => this.startGame(request), () => this.render());
    window.addEventListener('resize', () => this.applyBackground());
    // Menü schließen bei Klick daneben oder mit Escape.
    document.addEventListener('click', (event) => {
      if (this.menuOpen && !(event.target instanceof Element && event.target.closest('.menu'))) this.closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (this.menuOpen && event.key === 'Escape') this.closeMenu();
    });
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.render();
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
    // Kartenanimationen nur für die Rollen dieser Partie laden (und nur gemeinsam abspielen).
    setCardAnimationGroup(this.game.publicView().deck.map((entry) => entry.roleId));
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
    this.nightPass = null;
    this.deferredSounds = [];
    this.menuOpen = false;
    this.secondVoteWish = null;
    clearPromptSelections();
    this.seenEvents.clear();
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
    // Abbruch: direkt zum Spielende, ohne Zwischenseite.
    if (command.type === 'ABORT') this.interstitial = null;
    else this.summarize(before, beforeKey, actors, result.events);
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
    if (this.nightPass) {
      for (const key of keys) if (!this.deferredSounds.includes(key)) this.deferredSounds.push(key);
      return;
    }
    if (keys.length === 0 && types.has('chat')) keys.push('chat');
    this.playSounds(keys);
  }

  private playSounds(keys: SoundKey[]): void {
    keys.forEach((key, index) => setTimeout(() => playSound(key), index * SOUND_GAP_MS));
  }

  /** Nachtrunde reihum beenden und zurückgehaltene Töne abspielen. */
  private endPass(): void {
    this.nightPass = null;
    const keys = SOUND_SEQUENCE.map(([, key]) => key).filter((key) => this.deferredSounds.includes(key));
    this.deferredSounds = [];
    this.playSounds(keys);
  }

  /** Zeigt nach einem abgeschlossenen Abschnitt eine Zwischenseite mit den Ergebnissen. */
  private summarize(before: PublicView, beforeKey: string, actors: Set<PlayerId>, events: GameEvent[]): void {
    const afterKey = this.screenKey();
    // Nachtrunde reihum: Ergebnisse zeigt der jeweilige Zug selbst.
    if (beforeKey.startsWith('night:') && before.rules.nightMode === 'pass') return;
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
          items: [...this.stepNotes, `${label}: bitte wieder einschlafen und das Gerät zurücklegen.`].map((text) => ({ text, kind: 'note' })),
          buttonLabel: 'Augen sind geschlossen',
        };
        this.stepNotes = [];
      }
      return;
    }
    if ((beforeKey.startsWith('vote:') || beforeKey.startsWith('death:')) && afterKey !== beforeKey) {
      const nameOf = (id: string) => before.players.find((p) => p.id === id)?.name ?? id;
      const items = events
        .filter((e) => e.visibility.kind === 'public' && RESULT_EVENTS.has(e.type))
        .map((e): InterstitialItem => {
          const counts = e.data?.counts;
          if (e.type !== 'vote-result' || !counts || typeof counts !== 'object') return { text: e.text, kind: e.type };
          const tally = Object.entries(counts as Record<string, number>)
            .map(([id, count]) => ({ name: nameOf(id), count: Number(count) }))
            .sort((a, b) => b.count - a.count);
          return { tally, abstentions: Number(e.data?.abstentions ?? 0) };
        });
      const title = !beforeKey.startsWith('vote:') ? 'Todesfolgen' : before.vote?.kind === 'election' ? 'Wahlergebnis' : 'Ergebnis';
      this.interstitial = { title, items, buttonLabel: 'Weiter' };
    }
  }

  // ---------------------------------------------------------------- Zeitlimits

  private timerSeconds(view: PublicView): number {
    // Während der Nachtrunde reihum läuft keine Uhr der Engine (z.B. Todesfolgen warten bis danach).
    if (this.interstitial || this.nightPass) return 0;
    switch (view.phase) {
      case 'ROLE_DISTRIBUTION':
        return view.timers.roleReveal;
      case 'NIGHT_ACTIONS':
        return view.rules.nightMode !== 'pass' && this.awakeKey === this.screenKey(view) ? view.timers.nightStep : 0;
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
    const chat = view ? this.chatPanel(view) : null;
    this.root.replaceChildren(
      h(
        'div',
        { class: chat ? 'app with-chat' : 'app' },
        this.header(view),
        this.message ? h('div', { class: 'message', role: 'alert' }, this.message) : null,
        h('main', null, this.screen(view), chat),
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
    if (!['DAY_ANNOUNCEMENT', 'DAY_DISCUSSION', 'DAY_VOTING'].includes(view.phase) || this.interstitial || this.nightPass) return null;
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
    // Nachtrunde reihum: Die Engine kann schon beim Tag sein, das darf man nicht sehen.
    if (this.nightPass && view.phase !== 'GAME_OVER') return 'night';
    if (view.phase === 'GAME_OVER') return 'gameOver';
    if (view.phase === 'ROLE_DISTRIBUTION') return 'night';
    return view.time === 'day' ? 'day' : 'night';
  }

  private header(view: PublicView | null): HTMLElement {
    return h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'brand' },
        ASSETS.logo ? h('img', { class: 'logo', src: assetUrl(ASSETS.logo), alt: 'Werwolf' }) : h('span', { class: 'logo-text' }, 'Werwolf'),
        view ? h('span', { class: 'phase' }, this.nightPass && view.phase !== 'GAME_OVER' ? `Nacht · Runde ${this.nightPass.round}` : `${view.phaseLabel}${view.round > 0 ? ` · Runde ${view.round}` : ''}`) : null,
      ),
      h('span', { class: 'spacer' }),
      view ? this.menu(view) : null,
    );
  }

  /** Menü statt einzelner Knöpfe: spart Platz und schützt vor versehentlichem Abbrechen. */
  private menu(view: PublicView): HTMLElement {
    const toggle = button('Menü', () => {
      this.menuOpen = !this.menuOpen;
      this.render();
    }, 'small secondary');
    toggle.setAttribute('aria-expanded', String(this.menuOpen));
    toggle.setAttribute('aria-haspopup', 'menu');
    const setLog = (mode: 'off' | 'public' | 'debug') => () => {
      this.logMode = mode;
      this.closeMenu();
    };
    const item = (label: string, onclick: () => void, variant = 'secondary') => {
      const element = button(label, onclick, variant);
      element.setAttribute('role', 'menuitem');
      return element;
    };
    const items = [
      this.logMode === 'public' ? item('Protokoll ausblenden', setLog('off')) : item('Protokoll anzeigen', setLog('public')),
      DEBUG ? (this.logMode === 'debug' ? item('Debug-Protokoll ausblenden', setLog('off')) : item('Debug-Protokoll (geheim)', setLog('debug'))) : null,
      view.phase !== 'GAME_OVER'
        ? item('Partie abbrechen', () => {
            this.menuOpen = false;
            if (window.confirm('Partie wirklich abbrechen?')) this.dispatch({ type: 'ABORT', reason: 'Vom Erzähler abgebrochen.' });
            else this.render();
          }, 'danger')
        : item('Neue Partie', () => this.newGame()),
    ];
    return h('div', { class: 'menu' }, toggle, this.menuOpen ? h('div', { class: 'menu-items', role: 'menu' }, ...items) : null);
  }

  private logPanel(view: PublicView | null): HTMLElement | null {
    if (!this.game || !view || this.logMode === 'off') return null;
    return this.logMode === 'public'
      ? eventLog(view.events, 'Öffentliches Protokoll')
      : eventLog(this.game.allEvents(), 'Debug-Protokoll (enthält geheime Informationen)');
  }

  private screen(view: PublicView | null): Child {
    if (!this.game || !view) return this.setup.render();
    if (this.nightPass && !this.interstitial) return this.passScreen(view);
    if (this.interstitial) {
      const { title, items, buttonLabel } = this.interstitial;
      return panel(
        title,
        items.map((item) =>
          'tally' in item ? tallyBars(item.tally, item.abstentions) : h('p', { class: DEATH_EVENTS.has(item.kind) ? 'narration death-line' : 'narration' }, item.text),
        ),
        [
          button(buttonLabel, () => {
            this.interstitial = null;
            this.render();
          }),
        ],
      );
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
          `Tag ${view.round}`,
          [
            h('p', { class: 'timer', id: 'timer' }),
            h('p', null, 'Diskutiert, wer ein Werwolf sein könnte. Wer etwas weiß, darf es teilen - oder lügen.'),
            this.players(view),
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

  /** Spielerliste mit denselben Avatarfarben wie im Chat. */
  private players(view: PublicView): HTMLElement {
    return playerList(view.players, (id) => this.bots?.persona(id)?.id ?? 'human');
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
      return panel('Alle bereit', [h('p', { class: 'narration' }, 'Alle kennen ihre Rolle. Legt das Gerät in die Mitte, gleich beginnt die erste Nacht.')], [
        button('Erste Nacht beginnen', () => this.dispatch({ type: 'ADVANCE' })),
      ]);
    }
    const current = players[this.revealIndex];
    if (!this.revealOpen) {
      return handoff({
        title: players.length > 1 ? `Rollen ${this.revealIndex + 1} von ${players.length}` : 'Deine Rolle',
        name: current.name,
        note: 'Nur diese Person darf jetzt auf den Bildschirm schauen.',
        showBack: true,
        onReady: () => {
          this.revealOpen = true;
          this.render();
        },
      });
    }
    const own = game.viewFor(current.id);
    return panel(
      `${current.name}, deine Rolle`,
      [roleCard(own.self.role), h('p', { class: 'role-text' }, own.self.role?.description ?? ''), knowledge(own)],
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
    if (view.rules.nightMode === 'pass' && this.nightIntroRound < view.round) {
      return panel(`Nacht ${view.round}`, [h('p', { class: 'narration' }, 'Die Nacht bricht herein. Alle schließen die Augen. Das Gerät geht reihum, jeder ist einmal dran.')], [
        button('Alle Augen sind zu', () => {
          this.nightIntroRound = view.round;
          this.startPass(view, 1);
          this.render();
        }),
      ]);
    }
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
  // ---------------------------------------------------------------- Nachtrunde reihum

  private startPass(view: PublicView, pass: number): void {
    const order = [...view.players]
      .filter((p) => p.alive && !this.isBot(p.id))
      .sort((a, b) => a.seat - b.seat)
      .map((p) => p.id);
    this.nightPass = { round: view.round, pass, order, index: 0, stage: 'cover', acted: false };
  }

  /** Runde 2 hängt nur vom Kartenstapel ab, nicht davon, wer welche Rolle hat (sonst verriete sie etwas). */
  private needsSecondPass(view: PublicView, round: number): boolean {
    const active = (nights: string | undefined) => (nights === 'first' ? round === 1 : nights === 'after-first' ? round > 1 : true);
    return view.deck.some((entry) =>
      (this.registry.getRole(entry.roleId).abilities ?? []).some((a) => a.trigger === 'night' && (a.after?.length ?? 0) > 0 && active(a.nights)),
    );
  }

  /** Offene Entscheidungen eines Spielers; Gruppenstimmen gelten nach der eigenen Stimme als erledigt. */
  private openPrompts(own: PlayerView): DecisionPrompt[] {
    return own.pending.filter((prompt) => !prompt.group?.some((m) => m.playerId === own.self.id && m.targets !== null));
  }

  /** Private Nachrichten dieser Nacht, die der Spieler noch nicht gesehen hat. */
  private newNotes(own: PlayerView, round: number): string[] {
    const seen = this.seenEvents.get(own.self.id) ?? -1;
    return own.events
      .filter((e) => e.id > seen && e.round === round && e.visibility.kind === 'players' && e.type !== 'group-vote' && e.type !== 'ballot')
      .map((e) => e.text);
  }

  private passScreen(view: PublicView): Child {
    const pass = this.nightPass!;
    const game = this.game!;
    if (game.phase === 'GAME_OVER') {
      this.endPass();
      return this.screen(view);
    }
    if (pass.index >= pass.order.length) return this.passEnd(view);
    const playerId = pass.order[pass.index];
    const own = game.viewFor(playerId);
    const title = `Nacht ${pass.round}`;
    if (pass.stage === 'cover') {
      return handoff({
        title: pass.pass > 1 ? `${title} · ${pass.pass}. Durchgang` : title,
        name: own.self.name,
        note: pass.pass > 1 ? 'Alle anderen halten die Augen geschlossen. Im zweiten Durchgang sind Rollen dran, die auf andere warten.' : 'Alle anderen halten die Augen geschlossen.',
        showBack: true,
        onReady: () => {
          pass.stage = 'turn';
          this.render();
        },
      });
    }
    const header = whoAmI(own);
    const open = game.phase === 'NIGHT_ACTIONS' ? this.openPrompts(own) : [];
    if (pass.stage === 'turn' && open.length > 0) {
      return panel(title, [
        header,
        ...open.map((prompt) =>
          promptForm(
            prompt,
            (answer) => {
              pass.acted = true;
              this.dispatch({ type: 'USE_ABILITY', playerId, abilityId: prompt.abilityId, ...answer });
            },
            `night:${pass.round}:${playerId}:${prompt.abilityId}`,
          ),
        ),
      ]);
    }
    if (pass.stage === 'turn' && !pass.acted) {
      // Tarnaufgabe: dauert ungefähr so lange wie eine echte Entscheidung.
      const others = own.players.filter((p) => p.alive && p.id !== playerId).map((p) => ({ id: p.id, name: p.name }));
      const decoy: DecisionPrompt = {
        abilityId: 'decoy',
        abilityName: 'Tarnung',
        title: 'Du hast heute Nacht nichts zu tun. Wen behältst du im Auge?',
        info: ['Das dient nur der Tarnung, damit niemand am Geräusch erkennt, wer eine Rolle hat.'],
        kind: 'players',
        min: 1,
        max: 1,
        optional: false,
        candidates: others,
        choices: [],
        group: null,
      };
      return panel(title, [
        header,
        promptForm(
          decoy,
          () => {
            pass.acted = true;
            pass.stage = 'done';
            this.render();
          },
          `decoy:${pass.round}:${pass.pass}:${playerId}`,
        ),
      ]);
    }
    const notes = this.newNotes(own, pass.round);
    return panel(title, [header, ...notes.map((line) => h('p', { class: 'note' }, line)), notes.length === 0 ? h('p', { class: 'hint' }, 'Nichts Neues für dich.') : null], [
      button('Augen schließen und Gerät weitergeben', () => {
        this.seenEvents.set(playerId, Math.max(-1, ...own.events.map((e) => e.id)));
        pass.index += 1;
        pass.stage = 'cover';
        pass.acted = false;
        this.render();
      }),
    ]);
  }

  /** Nach einer Runde: Runde 2 (falls laut Stapel nötig), auf Bots warten oder den Morgen zeigen. */
  private passEnd(view: PublicView): Child {
    const pass = this.nightPass!;
    const game = this.game!;
    const waiting = panel(`Nacht ${pass.round}`, [h('p', { class: 'narration' }, 'Die Nacht ist noch nicht vorbei', h('span', { class: 'dots', 'aria-hidden': 'true' })), h('p', null, 'Alle halten die Augen geschlossen.')]);
    const botsBusy = game.phase === 'NIGHT_ACTIONS' && game.pendingDecisions().some((p) => this.isBot(p.playerId));
    const humansOpen = game.phase === 'NIGHT_ACTIONS' && game.pendingDecisions().some((p) => !this.isBot(p.playerId));
    if (botsBusy) return waiting;
    if ((pass.pass === 1 && this.needsSecondPass(view, pass.round)) || humansOpen) {
      this.startPass(view, pass.pass + 1);
      this.nightPass!.round = pass.round;
      return this.passScreen(view);
    }
    this.endPass();
    return h('div', null, this.screen(view));
  }

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
          promptForm(
            { ...prompt, group: null },
            (answer) => this.dispatch(...members.map((playerId): Command => ({ type: 'USE_ABILITY', playerId, abilityId, ...answer }))),
            `group:${game.publicView().round}:${abilityId}`,
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
          whoAmI(own),
          own.pending
            .filter((prompt) => !groups.has(prompt.abilityId))
            .map((prompt) =>
              promptForm(prompt, (answer) => this.dispatch({ type: 'USE_ABILITY', playerId, abilityId: prompt.abilityId, ...answer }), `decide:${game.publicView().round}:${playerId}:${prompt.abilityId}`),
            ),
        ),
      );
    }
    const humansDeciding = pending.some((p) => !this.isBot(p.playerId));
    return panel(
      title,
      [...intro.map((line) => h('p', { class: 'narration' }, line)), h('p', { class: 'timer', id: 'timer' }), ...sections],
      [],
      { footer: humansDeciding ? [button('Zeit abgelaufen: Ersatzregel anwenden', () => this.dispatch({ type: 'TIMEOUT' }), 'small secondary')] : [] },
    );
  }

  private announcementScreen(view: PublicView): Child {
    const dayStart = [...view.events].reverse().find((e) => e.type === 'day-start');
    return panel(`Tag ${view.round}`, [h('p', { class: 'narration' }, dayStart?.text ?? ''), this.players(view)], [
      button('Diskussion beginnen', () => this.dispatch({ type: 'ADVANCE' })),
    ]);
  }

  private votingScreen(view: PublicView): Child {
    const game = this.game!;
    const vote = view.vote!;
    const election = vote.kind === 'election';
    const title = election ? (vote.round > 1 ? 'Stichwahl um das Hauptmannsamt' : 'Hauptmannswahl') : vote.round > 1 ? 'Stichwahl' : 'Abstimmung';
    const missing = vote.voters.length - vote.voted.length;
    const close = (label: string, variant: string) =>
      button(label, () => {
        if (missing > 0 && !window.confirm(`Es fehlen noch ${missing} ${missing === 1 ? 'Stimme' : 'Stimmen'}. Fehlende Stimmen zählen als Enthaltung. Trotzdem beenden?`)) return;
        this.dispatch({ type: 'ADVANCE' });
      }, variant);
    // Reihum stimmen nur Menschen ab; Bots stimmen selbst (geheim).
    const next = vote.voters.find((v) => !vote.voted.includes(v.id) && !this.isBot(v.id));
    const alive = view.players.filter((p) => p.alive).length;
    const status = [
      progress(vote.voted.length, vote.voters.length, 'Stimmen'),
      // Zur Wahl nur nennen, wenn nicht ohnehin alle wählbar sind (z.B. Stichwahl).
      vote.candidates.length < alive ? h('p', { class: 'hint' }, `Zur Wahl: ${vote.candidates.map((c) => c.name).join(', ')}`) : null,
    ];
    if (!next) {
      const waiting = missing > 0;
      return panel(
        title,
        [h('p', { class: 'narration' }, waiting ? 'Die übrigen Stimmen werden abgegeben' : 'Alle haben abgestimmt.', waiting ? h('span', { class: 'dots', 'aria-hidden': 'true' }) : null), ...status],
        waiting ? [] : [close('Abstimmung auswerten', '')],
        { footer: waiting ? [close('Abstimmung vorzeitig beenden', 'small secondary')] : [] },
      );
    }
    if (this.voterReady !== next.id) {
      return handoff({
        title,
        name: next.name,
        note: 'Die Stimme ist geheim.',
        extra: [...status, h('p', { class: 'timer', id: 'timer' })],
        footer: [close('Abstimmung vorzeitig beenden', 'small secondary')],
        onReady: () => {
          this.voterReady = next.id;
          this.render();
        },
      });
    }
    const own = game.viewFor(next.id).vote!;
    const prompt = {
      abilityId: 'vote',
      abilityName: 'Stimme',
      title: election ? 'Wer soll Hauptmann werden?' : 'Wen soll das Dorf verbannen?',
      info: [],
      kind: 'players' as const,
      min: 1,
      max: 1,
      optional: view.rules.allowAbstain,
      candidates: own.options,
      choices: [],
      group: null,
    };
    // Stotternder Richter: heimlich eine zweite Abstimmung verlangen (nur auf seinem eigenen Zug sichtbar).
    const secondVote = own.canRequestSecondVote
      ? h('input', {
          type: 'checkbox',
          checked: this.secondVoteWish === next.id,
          onchange: (e: Event) => {
            this.secondVoteWish = (e.target as HTMLInputElement).checked ? next.id : null;
          },
        })
      : null;
    return panel(title, [
      h('p', { class: 'voter' }, `Geheime Stimme von ${next.name}`),
      promptForm(
        prompt,
        (answer) => {
          this.voterReady = null;
          const second = this.secondVoteWish === next.id && own.canRequestSecondVote;
          this.secondVoteWish = null;
          this.dispatch({
            type: 'VOTE',
            playerId: next.id,
            targetId: answer.skip ? null : (answer.targets?.[0] ?? null),
            ...(second ? { requestSecondVote: true } : {}),
          });
        },
        `vote:${view.round}:${vote.kind}:${vote.round}:${next.id}`,
      ),
      secondVote ? h('label', { class: 'check' }, secondVote, 'Als Richter heute eine zweite Abstimmung verlangen (nur einmal pro Partie)') : null,
    ]);
  }

  private gameOverScreen(view: PublicView): Child {
    const result = view.result!;
    const event = view.events.find((e) => e.type === 'game-over');
    const teamName = typeof event?.data?.teamName === 'string' ? event.data.teamName : null;
    const banner = result.aborted
      ? [h('p', { class: 'narration' }, result.reason || 'Die Partie wurde abgebrochen.')]
      : [
          h('div', { class: 'winner-banner' }, h('p', { class: 'winner-label' }, teamName ? 'Sieger' : 'Ergebnis'), h('p', { class: 'winner-name' }, teamName ?? 'Unentschieden')),
          h('p', { class: 'narration' }, result.reason),
        ];
    return panel(
      result.aborted ? 'Partie abgebrochen' : 'Spielende',
      [
        ...banner,
        h(
          'div',
          { class: 'card-row' },
          view.players.map((p) =>
            h(
              'div',
              { class: `final${result.winners.includes(p.id) ? ' winner' : ''}${p.alive ? '' : ' is-dead'}` },
              result.winners.includes(p.id) ? h('span', { class: 'tag tag-badge ribbon' }, 'Sieger') : null,
              roleCard(p.role, 'small'),
              h('span', { class: 'final-name' }, p.name, this.isBot(p.id) ? [' ', icon('bot', '(Bot)')] : null),
              h('span', { class: 'hint' }, p.alive ? 'lebt' : `tot (${p.deathCause ?? '?'})`),
            ),
          ),
        ),
      ],
      [button('Neue Partie', () => this.newGame())],
    );
  }
}
