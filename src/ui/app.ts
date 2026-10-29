/**
 * Hot-Seat-Oberfläche: Ein Gerät ist der Erzähler und wird bei geheimen Entscheidungen
 * weitergegeben. Die Oberfläche entscheidet keine Spielregeln. Sie zeigt nur die
 * Ansichten der Engine an und sendet Befehle; ein späterer Online-Client kann
 * dieselben Ansichten (viewFor/publicView) und Befehle verwenden.
 */
import { Game, type Command, type GameConfigInput, type GameEvent, type PendingDecision, type PlayerId, type PublicView } from '../engine';
import { createDefaultRegistry } from '../roles';
import { ASSETS, assetUrl } from './assets';
import { eventLog, knowledge, panel, playerList, promptForm, roleCard, type Theme } from './components';
import { button, h, type Child } from './dom';
import { SetupScreen } from './setup';

/** Debug-Protokoll (zeigt alle geheimen Informationen) nur mit ?debug in der Adresse anbieten. */
const DEBUG = new URLSearchParams(window.location.search).has('debug');

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

  constructor(root: HTMLElement) {
    this.root = root;
    this.setup = new SetupScreen(this.registry, (config) => this.startGame(config), () => this.render());
  }

  // ---------------------------------------------------------------- Ablauf

  private startGame(config: GameConfigInput): void {
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
    this.game = null;
    this.message = null;
    this.interstitial = null;
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
    return true;
  }

  /** Zeigt nach einem abgeschlossenen Abschnitt eine Zwischenseite mit den Ergebnissen. */
  private summarize(before: PublicView, beforeKey: string, actors: Set<PlayerId>, events: GameEvent[]): void {
    const afterKey = this.screenKey();
    if (beforeKey.startsWith('night:')) {
      // Private Ergebnisse (z.B. Seherin) nur für die gerade wachen Spieler.
      this.stepNotes.push(
        ...events
          .filter((e) => e.type !== 'group-vote' && e.visibility.kind === 'players' && e.visibility.playerIds.some((id) => actors.has(id)))
          .map((e) => e.text),
      );
      if (afterKey !== beforeKey) {
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
    const view = this.game?.publicView() ?? null;
    const theme = this.themeFor(view);
    document.body.dataset.theme = theme;
    const background = ASSETS.backgrounds[theme];
    document.body.style.setProperty('--bg-image', background ? `url("${assetUrl(background)}")` : 'none');
    this.root.replaceChildren(
      h(
        'div',
        { class: 'app' },
        this.header(view),
        this.message ? h('div', { class: 'message', role: 'alert' }, this.message) : null,
        h('main', null, this.screen(view)),
        this.logPanel(view),
      ),
    );
    this.syncTimer(view);
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
    const players = view.players;
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
      const prompt = game.viewFor(members[0]).pending.find((x) => x.abilityId === abilityId)!;
      sections.push(
        h(
          'section',
          { class: 'actor' },
          h('h3', null, `Gemeinsam: ${members.map((id) => game.viewFor(id).self.name).join(', ')}`),
          promptForm({ ...prompt, group: null }, (answer) =>
            this.dispatch(...members.map((playerId): Command => ({ type: 'USE_ABILITY', playerId, abilityId, ...answer }))),
          ),
        ),
      );
    }
    const actorIds = [...new Set(pending.filter((p) => !groups.has(p.abilityId)).map((p) => p.playerId))];
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
    const next = vote.voters.find((v) => !vote.voted.includes(v.id));
    const status = h('p', null, `Abgestimmt: ${vote.voted.length} von ${vote.voters.length}. Zur Wahl: ${vote.candidates.map((c) => c.name).join(', ')}.`);
    if (!next) return panel(title, [h('p', null, 'Alle haben abgestimmt.'), status], [close]);
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
              h('span', null, p.name),
              h('span', { class: 'hint' }, p.alive ? 'lebt' : `tot (${p.deathCause ?? '?'})`),
            ),
          ),
        ),
      ],
      [button('Neue Partie', () => this.newGame())],
    );
  }
}
