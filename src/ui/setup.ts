import { PERSONAS } from '../bots';
import {
  DEFAULT_RULES,
  DEFAULT_TIMERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  buildAutoDeck,
  suggestWerewolfCount,
  validateConfig,
  type GameConfigInput,
  type GameRules,
  type Registry,
  type RoleId,
} from '../engine';
import { createTranslator, type TranslationSettings } from '../translation';
import { panel } from './components';
import { button, h } from './dom';

const STORAGE_KEY = 'werwolf.setup';
const BASE_ROLE_IDS = ['villager', 'werewolf'];

interface SetupState {
  names: string[];
  /** Je Spieler: true = Bot. */
  bots: boolean[];
  mode: 'auto' | 'manual';
  werewolves: number;
  specials: RoleId[];
  counts: Record<RoleId, number>;
  rules: GameRules;
  seerResult: 'faction' | 'role';
  witchSelfHeal: boolean;
  witchBoth: boolean;
  mixedLovers: boolean;
  discussion: number;
  libreTranslateUrl: string;
}

export interface StartRequest {
  config: GameConfigInput;
  /** Indizes der Bot-Spieler (Spieler-ID = p{index+1}). */
  botIndices: number[];
  translation: TranslationSettings;
}

interface Stored {
  names?: unknown;
  bots?: unknown;
  libreTranslateUrl?: unknown;
}

function load(): Stored {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Stored) ?? {};
  } catch {
    return {};
  }
}

function save(state: SetupState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ names: state.names, bots: state.bots, libreTranslateUrl: state.libreTranslateUrl }));
  } catch {
    // Speicher nicht verfügbar: Einstellungen gelten nur für diese Sitzung.
  }
}

const isDefaultName = (name: string) => /^Spieler \d+$/.test(name.trim()) || name.trim() === '';

/**
 * Spielvorbereitung. Alle Rollen aus der Registry erscheinen automatisch,
 * neue Rollen sind also ohne Änderung hier auswählbar. Die Prüfung übernimmt die Engine.
 */
export class SetupScreen {
  private readonly registry: Registry;
  private readonly onStart: (request: StartRequest) => void;
  private readonly rerender: () => void;
  private readonly state: SetupState;
  private summary: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;

  constructor(registry: Registry, onStart: (request: StartRequest) => void, rerender: () => void) {
    this.registry = registry;
    this.onStart = onStart;
    this.rerender = rerender;
    const stored = load();
    const names =
      Array.isArray(stored.names) && stored.names.every((n) => typeof n === 'string') && stored.names.length >= MIN_PLAYERS
        ? (stored.names as string[])
        : Array.from({ length: 8 }, (_, i) => `Spieler ${i + 1}`);
    const bots = Array.isArray(stored.bots) ? names.map((_, i) => (stored.bots as unknown[])[i] === true) : names.map(() => false);
    this.state = {
      names,
      bots,
      mode: 'auto',
      werewolves: suggestWerewolfCount(names.length),
      specials: ['seer', 'witch', 'hunter', 'cupid'],
      counts: {},
      rules: { ...DEFAULT_RULES },
      seerResult: 'faction',
      witchSelfHeal: true,
      witchBoth: true,
      mixedLovers: false,
      discussion: DEFAULT_TIMERS.discussion,
      libreTranslateUrl: typeof stored.libreTranslateUrl === 'string' ? stored.libreTranslateUrl : '',
    };
  }

  private deck(): Record<RoleId, number> {
    const s = this.state;
    if (s.mode === 'manual') return { ...s.counts };
    return buildAutoDeck(this.registry, { playerCount: s.names.length, werewolves: s.werewolves, specialRoles: s.specials });
  }

  buildConfig(): GameConfigInput {
    const s = this.state;
    return {
      players: s.names.map((name) => ({ name })),
      roles: this.deck(),
      rules: { ...s.rules },
      options: {
        seer: { result: s.seerResult },
        witch: { canSelfHeal: s.witchSelfHeal, canUseBothSameNight: s.witchBoth },
        'mixed-lovers': { enabled: s.mixedLovers },
      },
      timers: { discussion: s.discussion },
    };
  }

  /** Freier Persona-Name für einen neuen Bot. */
  private botName(): string {
    const used = new Set(this.state.names.map((n) => n.trim().toLowerCase()));
    return PERSONAS.find((p) => !used.has(p.name.toLowerCase()))?.name ?? `Bot ${this.state.names.length + 1}`;
  }

  /** Aktualisiert nur Zusammenfassung und Startknopf (Eingabefelder behalten den Fokus). */
  private refresh(): void {
    const config = this.buildConfig();
    const issues = validateConfig(config, this.registry);
    if (!this.state.bots.some((bot) => !bot)) issues.push('Mindestens ein Spieler muss ein Mensch sein.');
    const cards = Object.entries(config.roles)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${this.registry.hasRole(id) ? this.registry.getRole(id).name : id} x${n}`);
    this.summary?.replaceChildren(
      h('p', null, `Kartenstapel: ${cards.join(', ') || '-'}`),
      issues.length > 0 ? h('ul', { class: 'issues' }, issues.map((issue) => h('li', null, issue))) : h('p', { class: 'ok' }, 'Konfiguration ist gültig.'),
    );
    if (this.startButton) this.startButton.disabled = issues.length > 0;
  }

  private setMode(mode: 'auto' | 'manual'): void {
    if (mode === 'manual' && this.state.mode === 'auto') this.state.counts = this.deck();
    this.state.mode = mode;
    this.rerender();
  }

  render(): HTMLElement {
    const s = this.state;
    const roles = this.registry.listRoles();
    const update = (fn: () => void) => () => {
      fn();
      this.refresh();
    };
    const numberInput = (value: number, min: number, onChange: (n: number) => void, label: string) =>
      h('input', {
        type: 'number',
        min,
        value,
        'aria-label': label,
        oninput: (e: Event) => {
          onChange(Math.max(min, Math.floor(Number((e.target as HTMLInputElement).value) || 0)));
          this.refresh();
        },
      });
    const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void) =>
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked, onchange: (e: Event) => update(() => onChange((e.target as HTMLInputElement).checked))() }),
        label,
      );
    const select = <T extends string>(label: string, value: T, options: Array<[T, string]>, onChange: (v: T) => void) =>
      h(
        'label',
        { class: 'field' },
        label,
        h(
          'select',
          { onchange: (e: Event) => update(() => onChange((e.target as HTMLSelectElement).value as T))() },
          options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)),
        ),
      );

    const humans = s.bots.filter((bot) => !bot).length;
    const playerSection = panel(
      `Spieler (${s.names.length}, davon ${s.names.length - humans} Bots)`,
      [
        h(
          'ol',
          { class: 'name-list' },
          s.names.map((name, index) =>
            h(
              'li',
              null,
              h('input', {
                value: name,
                maxlength: 24,
                'aria-label': `Name von Spieler ${index + 1}`,
                oninput: (e: Event) => {
                  s.names[index] = (e.target as HTMLInputElement).value;
                  this.refresh();
                },
              }),
              h(
                'label',
                { class: 'check bot-toggle' },
                h('input', {
                  type: 'checkbox',
                  checked: s.bots[index],
                  onchange: (e: Event) => {
                    s.bots[index] = (e.target as HTMLInputElement).checked;
                    if (s.bots[index] && isDefaultName(s.names[index])) s.names[index] = this.botName();
                    this.rerender();
                  },
                }),
                'Bot',
              ),
              button('Entfernen', () => {
                s.names.splice(index, 1);
                s.bots.splice(index, 1);
                this.rerender();
              }, 'small secondary', s.names.length <= MIN_PLAYERS),
            ),
          ),
        ),
      ],
      [
        button('Spieler hinzufügen', () => {
          s.names.push(`Spieler ${s.names.length + 1}`);
          s.bots.push(false);
          this.rerender();
        }, 'secondary', s.names.length >= MAX_PLAYERS),
        button('Bot hinzufügen', () => {
          s.names.push(this.botName());
          s.bots.push(true);
          this.rerender();
        }, 'secondary', s.names.length >= MAX_PLAYERS),
        button('Einzelspieler gegen Bots', () => {
          s.bots = s.names.map((_, i) => i > 0);
          s.names = s.names.map((name, i) => (i === 0 ? name : ''));
          for (let i = 1; i < s.names.length; i++) s.names[i] = this.botName();
          this.rerender();
          // Eigenen Namen gleich eintippen lassen. Ein Ersatzname wie "Du" ergäbe schiefe Bot-Sätze ("Du ist verdächtig").
          if (isDefaultName(s.names[0])) {
            const input = document.querySelector<HTMLInputElement>('input[aria-label="Name von Spieler 1"]');
            input?.focus();
            input?.select();
          }
        }, 'secondary'),
      ],
    );

    const specials = roles.filter((r) => !BASE_ROLE_IDS.includes(r.id));
    const roleFields =
      s.mode === 'auto'
        ? [
            h('label', { class: 'field' }, 'Anzahl Werwölfe', numberInput(s.werewolves, 0, (n) => (s.werewolves = n), 'Anzahl Werwölfe')),
            h('p', { class: 'hint' }, 'Sonderrollen (je eine Karte, der Rest wird mit Dorfbewohnern aufgefüllt):'),
            h(
              'div',
              { class: 'check-grid' },
              specials.map((role) =>
                checkbox(`${role.name}${role.faction === 'neutral' ? ' (neutral)' : ''}`, s.specials.includes(role.id), (on) => {
                  s.specials = on ? [...s.specials, role.id] : s.specials.filter((id) => id !== role.id);
                }),
              ),
            ),
          ]
        : [
            h('p', { class: 'hint' }, 'Anzahl je Rolle. Mit Dieb werden 2 Karten mehr als Spieler benötigt.'),
            h(
              'div',
              { class: 'count-grid' },
              roles.map((role) =>
                h('label', { class: 'field' }, role.name, numberInput(s.counts[role.id] ?? 0, 0, (n) => (s.counts[role.id] = n), `Anzahl ${role.name}`)),
              ),
            ),
          ];

    this.summary = h('div', { class: 'summary' });
    const rolesSection = panel('Rollen', [
      h(
        'div',
        { class: 'segmented' },
        button('Automatisch', () => this.setMode('auto'), s.mode === 'auto' ? 'selected' : 'secondary'),
        button('Manuell', () => this.setMode('manual'), s.mode === 'manual' ? 'selected' : 'secondary'),
      ),
      ...roleFields,
      this.summary,
    ]);

    const r = s.rules;
    const rulesSection = panel('Regeln', [
      h(
        'div',
        { class: 'rule-grid' },
        select('Gleichstand', r.tieBreak, [['runoff', 'Stichwahl'], ['none', 'Niemand stirbt'], ['random', 'Zufall']], (v) => (r.tieBreak = v)),
        select('Gleichstand in der Stichwahl', r.runoffTieBreak, [['none', 'Niemand stirbt'], ['random', 'Zufall']], (v) => (r.runoffTieBreak = v)),
        select('Beim Tod aufdecken', r.revealRoleOnDeath, [['role', 'Rolle'], ['faction', 'Nur Fraktion'], ['none', 'Nichts']], (v) => (r.revealRoleOnDeath = v)),
        select('Sieg der Werwölfe', r.werewolfWin, [['parity', 'Bei Gleichstand (Parität)'], ['elimination', 'Erst wenn alle Gegner tot sind']], (v) => (r.werewolfWin = v)),
        select('Seherin sieht', s.seerResult, [['faction', 'Werwolf ja/nein'], ['role', 'Genaue Rolle']], (v) => (s.seerResult = v)),
        h('label', { class: 'field' }, 'Diskussionszeit (Sekunden, 0 = ohne)', numberInput(s.discussion, 0, (n) => (s.discussion = n), 'Diskussionszeit')),
      ),
      h(
        'div',
        { class: 'check-grid' },
        checkbox('Enthaltung erlaubt', r.allowAbstain, (v) => (r.allowAbstain = v)),
        checkbox('Stimme ändern erlaubt', r.allowVoteChange, (v) => (r.allowVoteChange = v)),
        checkbox('Einzelstimmen veröffentlichen', r.revealBallots, (v) => (r.revealBallots = v)),
        checkbox('Hexe darf sich selbst heilen', s.witchSelfHeal, (v) => (s.witchSelfHeal = v)),
        checkbox('Hexe darf beide Tränke in einer Nacht nutzen', s.witchBoth, (v) => (s.witchBoth = v)),
        checkbox('Gemischtes Liebespaar gewinnt eigenständig', s.mixedLovers, (v) => (s.mixedLovers = v)),
      ),
    ]);

    const translator = createTranslator({ libreTranslateUrl: s.libreTranslateUrl });
    const translationSection = panel('Sprachen und Übersetzer', [
      h('p', null, `Aktiv: ${translator.name}.`),
      h(
        'p',
        { class: 'hint' },
        translator.canTranslate
          ? 'Bots antworten in der Sprache, in der geschrieben wird. Sprachpakete werden beim ersten Gebrauch geladen.'
          : 'Bots verstehen und schreiben Deutsch und Englisch. Für weitere Sprachen: Chrome am Desktop (eingebauter Übersetzer) oder einen eigenen LibreTranslate-Server eintragen.',
      ),
      h(
        'label',
        { class: 'field' },
        'Eigener LibreTranslate-Server (optional, z.B. http://localhost:5000)',
        h('input', {
          type: 'url',
          value: s.libreTranslateUrl,
          placeholder: 'leer = Browser-Übersetzer oder keiner',
          onchange: (e: Event) => {
            s.libreTranslateUrl = (e.target as HTMLInputElement).value.trim();
            this.rerender();
          },
        }),
      ),
    ]);

    this.startButton = button('Spiel starten', () => {
      save(s);
      this.onStart({
        config: this.buildConfig(),
        botIndices: s.bots.flatMap((bot, index) => (bot ? [index] : [])),
        translation: { libreTranslateUrl: s.libreTranslateUrl || null },
      });
    });
    const element = h(
      'div',
      { class: 'setup' },
      playerSection,
      rolesSection,
      rulesSection,
      translationSection,
      h('div', { class: 'actions start' }, this.startButton),
    );
    this.refresh();
    return element;
  }
}
