import { FACTION_LABELS, type DecisionPrompt, type GameEvent, type PlayerId, type PlayerSummary, type PlayerView, type RoleInfo } from '../engine';
import { ASSETS, assetUrl, type IconKey } from './assets';
import { cardAnimation } from './cardAnimation';
import { button, h, type Child } from './dom';

export type Theme = 'setup' | 'night' | 'day' | 'gameOver';

export interface PanelOptions {
  className?: string;
  /** Kleine Erzähler-Knöpfe unter den Hauptaktionen (z.B. vorzeitig beenden). */
  footer?: Child[];
}

export function panel(title: string, body: Child[], actions: Child[] = [], options: PanelOptions = {}): HTMLElement {
  return h(
    'section',
    { class: options.className ? `panel ${options.className}` : 'panel' },
    h('h2', null, title),
    ...body,
    actions.some(Boolean) ? h('div', { class: 'actions' }, ...actions) : null,
    options.footer?.some(Boolean) ? h('div', { class: 'narrator' }, ...options.footer) : null,
  );
}

/**
 * Rollenkarte: komplette Kartengrafik (mit eigenem Rahmen, Titel und Text; groß auch animiert)
 * oder ein Platzhalter im selben Aufbau. Kleine Karten zeigen den Namen lesbar darunter.
 */
export function roleCard(role: RoleInfo | null, size: 'small' | 'large' = 'large'): HTMLElement {
  if (!role) {
    return ASSETS.cardBack
      ? h('div', { class: `card card-${size} card-art card-back` }, h('img', { src: assetUrl(ASSETS.cardBack), alt: 'Kartenrückseite' }))
      : h('div', { class: `card card-${size} card-back` }, h('div', { class: 'card-placeholder' }, h('span', { class: 'placeholder-label' }, 'Rückseite')));
  }
  const image = ASSETS.cards[role.id];
  if (image) {
    return h(
      'div',
      { class: `card card-${size} card-art faction-${role.faction}` },
      h('img', { src: assetUrl(image), alt: role.name }),
      size === 'large' ? cardAnimation(role.id) : h('div', { class: 'card-name' }, role.name),
    );
  }
  return h(
    'div',
    { class: `card card-${size} faction-${role.faction}` },
    h('div', { class: 'card-placeholder' }, h('span', { class: 'card-initial' }, role.name.charAt(0)), h('span', { class: 'placeholder-label' }, 'Grafik folgt')),
    h('div', { class: 'card-name' }, role.name),
  );
}

export interface HandoffOptions {
  /** Überschrift des Abschnitts, z.B. "Nacht 2". */
  title: string;
  name: string;
  note: string;
  /** Kartenrückseite als Zeichen für "verdeckt". */
  showBack?: boolean;
  extra?: Child[];
  footer?: Child[];
  onReady: () => void;
}

/** Bildschirm zum Weitergeben des Geräts: groß der Name, darunter "Ich bin ...". */
export function handoff(options: HandoffOptions): HTMLElement {
  return panel(
    options.title,
    [
      h('p', { class: 'handoff-label' }, 'Gib das Gerät an'),
      h('p', { class: 'handoff-name' }, options.name),
      options.showBack ? roleCard(null) : null,
      h('p', { class: 'handoff-note' }, options.note),
      ...(options.extra ?? []),
    ],
    [button(`Ich bin ${options.name}`, options.onReady)],
    { className: 'handoff', footer: options.footer },
  );
}

/** Eigene Karte (klein) und Name, z.B. im eigenen Nachtzug. */
export function whoAmI(view: PlayerView): HTMLElement {
  const role = view.self.role;
  return h(
    'div',
    { class: 'whoami' },
    role ? roleCard(role, 'small') : null,
    h('div', { class: 'whoami-text' }, h('p', { class: 'whoami-name' }, view.self.name), role ? h('p', { class: 'hint' }, `Deine Rolle: ${role.name}`) : null, knowledge(view)),
  );
}

/** Symbol aus ASSETS.icons oder Textersatz. */
export function icon(key: IconKey, fallback: string): HTMLElement {
  const path = ASSETS.icons[key];
  return path ? h('img', { class: 'icon', src: assetUrl(path), alt: fallback }) : h('span', { class: 'icon-text' }, fallback);
}

/** Avatar aus ASSETS.avatars oder farbiges Feld mit Anfangsbuchstaben (Farbe aus dem Namen, überall gleich). */
export function avatar(name: string, avatarKey: string | null): HTMLElement {
  const path = avatarKey ? ASSETS.avatars[avatarKey] : undefined;
  if (path) return h('img', { class: 'avatar', src: assetUrl(path), alt: '' });
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return h('span', { class: 'avatar avatar-placeholder', style: `--avatar-hue: ${hash % 360}`, 'aria-hidden': 'true' }, name.charAt(0).toUpperCase());
}

export interface ChatLine {
  id: number;
  speaker: string;
  avatarKey: string | null;
  text: string;
}

export function chatLog(lines: ChatLine[], typing: string[]): HTMLElement {
  return h(
    'div',
    { class: 'chat-log', id: 'chat-log' },
    lines.length === 0 ? h('p', { class: 'hint' }, 'Noch keine Nachrichten.') : null,
    lines.map((line) =>
      h('div', { class: 'chat-line' }, avatar(line.speaker, line.avatarKey), h('div', null, h('strong', null, line.speaker), h('p', null, line.text))),
    ),
    h('p', { class: 'hint typing', id: 'typing' }, typing.length > 0 ? `${typing.join(', ')} ${typing.length === 1 ? 'tippt' : 'tippen'} ...` : ''),
  );
}

export function playerList(players: PlayerSummary[], avatarOf: (id: PlayerId) => string | null = () => null): HTMLElement {
  return h(
    'ul',
    { class: 'player-list' },
    players.map((p) =>
      h(
        'li',
        { class: `player${p.alive ? '' : ' dead'}` },
        avatar(p.name, avatarOf(p.id)),
        h(
          'div',
          { class: 'player-body' },
          h('span', { class: 'player-name' }, p.name),
          h(
            'span',
            { class: 'player-tags' },
            p.role ? h('span', { class: 'tag' }, p.role.name) : p.faction ? h('span', { class: 'tag' }, FACTION_LABELS[p.faction]) : null,
            p.relations.includes('werewolf-pack') ? icon('pack', '') : null,
            p.relations.includes('lover') || p.relations.includes('couple') ? icon('lover', '') : null,
            p.badges.map((badge) => h('span', { class: 'tag tag-badge' }, badge)),
            p.labels.map((label) => h('span', { class: 'tag tag-info' }, label)),
            p.alive ? null : h('span', { class: 'tag tag-dead' }, icon('dead', ''), p.deathCause ? `tot: ${p.deathCause}` : 'tot'),
          ),
        ),
      ),
    ),
  );
}

/** Was der Spieler über andere weiß (z.B. Mitwerwölfe, Liebespartner). */
export function knowledge(view: PlayerView): HTMLElement | null {
  const known = view.players.filter((p) => p.labels.length > 0);
  if (known.length === 0) return null;
  return h(
    'div',
    { class: 'knowledge' },
    h('p', { class: 'knowledge-title' }, 'Das weißt du:'),
    h('ul', null, known.map((p) => h('li', null, h('strong', null, p.name), p.labels.map((label) => h('span', { class: 'tag' }, label))))),
  );
}

/** Fortschritt als Pixelbalken, z.B. abgegebene Stimmen. */
export function progress(done: number, total: number, label: string): HTMLElement {
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': label },
    h('span', { class: 'progress-label' }, `${label}: ${done} von ${total}`),
    h('span', { class: 'progress-track' }, h('span', { class: 'progress-fill', style: `width: ${Math.round(share * 100)}%` })),
  );
}

export interface TallyRow {
  name: string;
  count: number;
}

/** Stimmenverteilung als Balken. */
export function tallyBars(rows: TallyRow[], abstentions: number): HTMLElement {
  const max = Math.max(1, abstentions, ...rows.map((r) => r.count));
  const row = (name: string, count: number, extra = '') =>
    h(
      'li',
      { class: `tally-row${extra}` },
      h('span', { class: 'tally-name' }, name),
      h('span', { class: 'tally-track' }, h('span', { class: 'tally-fill', style: `width: ${Math.round((count / max) * 100)}%` })),
      h('span', { class: 'tally-count' }, String(count)),
    );
  return h(
    'ul',
    { class: 'tally' },
    rows.length === 0 ? h('li', { class: 'hint' }, 'Keine Stimmen.') : null,
    rows.map((r, index) => row(r.name, r.count, index === 0 && r.count > (rows[1]?.count ?? 0) ? ' leader' : '')),
    abstentions > 0 ? row('Enthaltung', abstentions, ' abstain') : null,
  );
}

export interface PromptAnswer {
  targets?: PlayerId[];
  choice?: string;
  skip?: boolean;
}

/**
 * Auswahl offener Formulare. Die Oberfläche wird bei jeder Bot-Nachricht neu gezeichnet;
 * ohne diesen Speicher ginge eine angefangene Auswahl dabei verloren.
 */
const selections = new Map<string, string[]>();

export function clearPromptSelections(): void {
  selections.clear();
}

/**
 * Generisches Eingabeformular für jede Fähigkeit. Die Regeln (Ziele, Anzahl) kommen aus der Engine.
 * key: eindeutiger Schlüssel der Entscheidung, damit die Auswahl ein Neuzeichnen übersteht.
 */
export function promptForm(prompt: DecisionPrompt, onAnswer: (answer: PromptAnswer) => void, key?: string): HTMLElement {
  const container = h('div', { class: 'prompt' });
  const valid = new Set(prompt.kind === 'players' ? prompt.candidates.map((c) => c.id) : prompt.choices.map((c) => c.id));
  let selected: string[] = (key ? (selections.get(key) ?? []) : []).filter((id) => valid.has(id));
  const answer = (value: PromptAnswer) => {
    if (key) selections.delete(key);
    onAnswer(value);
  };

  const draw = () => {
    const nameOf = (id: string) => prompt.candidates.find((c) => c.id === id)?.name ?? id;
    const options =
      prompt.kind === 'players'
        ? prompt.candidates.map((c) => ({ id: c.id, label: c.name }))
        : prompt.kind === 'choice'
          ? prompt.choices
          : [];
    const max = prompt.kind === 'players' ? prompt.max : 1;
    const toggle = (id: string) => {
      if (selected.includes(id)) selected = selected.filter((x) => x !== id);
      else selected = max === 1 ? [id] : selected.length < max ? [...selected, id] : selected;
      if (key) selections.set(key, selected);
      draw();
    };
    const complete = prompt.kind === 'players' ? selected.length >= prompt.min && selected.length <= prompt.max : prompt.kind === 'choice' ? selected.length === 1 : true;
    const submit = () => answer(prompt.kind === 'players' ? { targets: selected } : prompt.kind === 'choice' ? { choice: selected[0] } : {});
    const count = prompt.kind === 'players' && prompt.max > 1 ? h('p', { class: 'hint' }, `Ausgewählt: ${selected.length} von ${prompt.min === prompt.max ? prompt.max : `${prompt.min} bis ${prompt.max}`}`) : null;

    const parts: Array<Node | null> = [
      h('h3', null, prompt.title),
      ...prompt.info.map((line) => h('p', { class: 'info' }, line)),
      prompt.group
        ? h(
            'ul',
            { class: 'group-status', 'aria-label': 'Stimmen der Gruppe' },
            prompt.group.map((m) => h('li', null, h('strong', null, m.name), m.targets ? `: ${m.targets.map(nameOf).join(', ')}` : ': noch offen')),
          )
        : null,
      options.length > 0
        ? h(
            'div',
            { class: 'choice-grid' },
            options.map((o) => {
              const chosen = selected.includes(o.id);
              const choice = button(o.label, () => toggle(o.id), `choice${chosen ? ' selected' : ''}`);
              choice.setAttribute('aria-pressed', String(chosen));
              return choice;
            }),
          )
        : null,
      count,
      h(
        'div',
        { class: 'actions' },
        button(prompt.kind === 'confirm' ? 'Verstanden' : 'Bestätigen', submit, '', !complete),
        prompt.optional ? button('Nicht einsetzen', () => answer({ skip: true }), 'secondary') : null,
      ),
    ];
    container.replaceChildren(...parts.filter((part): part is Node => part !== null));
  };
  draw();
  return container;
}

export function eventLog(events: GameEvent[], title: string): HTMLElement {
  return h(
    'section',
    { class: 'panel log' },
    h('h2', null, title),
    h(
      'ol',
      null,
      [...events].reverse().map((e) =>
        h('li', { class: `event event-${e.visibility.kind}` }, h('span', { class: 'event-meta' }, `R${e.round} ${e.type}`), ' ', e.text),
      ),
    ),
  );
}
