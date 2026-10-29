import { FACTION_LABELS, type DecisionPrompt, type GameEvent, type PlayerId, type PlayerSummary, type PlayerView, type RoleInfo } from '../engine';
import { ASSETS, assetUrl } from './assets';
import { button, h, type Child } from './dom';

export type Theme = 'setup' | 'night' | 'day' | 'gameOver';

export function panel(title: string, body: Child[], actions: Child[] = []): HTMLElement {
  return h(
    'section',
    { class: 'panel' },
    h('h2', null, title),
    ...body,
    actions.some(Boolean) ? h('div', { class: 'actions' }, ...actions) : null,
  );
}

/** Rollenkarte: hinterlegte Grafik oder Platzhalter in der Farbe der Fraktion. */
export function roleCard(role: RoleInfo | null, size: 'small' | 'large' = 'large'): HTMLElement {
  if (!role) {
    return h(
      'div',
      { class: `card card-${size} card-back` },
      ASSETS.cardBack ? h('img', { src: assetUrl(ASSETS.cardBack), alt: 'Kartenrückseite' }) : h('span', { class: 'placeholder-label' }, 'Rückseite'),
    );
  }
  const image = ASSETS.cards[role.id];
  return h(
    'div',
    { class: `card card-${size} faction-${role.faction}` },
    image
      ? h('img', { src: assetUrl(image), alt: role.name })
      : h('div', { class: 'card-placeholder' }, h('span', { class: 'card-initial' }, role.name.charAt(0)), h('span', { class: 'placeholder-label' }, 'Grafik folgt')),
    h('div', { class: 'card-name' }, role.name),
  );
}

export function playerList(players: PlayerSummary[]): HTMLElement {
  return h(
    'ul',
    { class: 'player-list' },
    players.map((p) =>
      h(
        'li',
        { class: `player${p.alive ? '' : ' dead'}` },
        h('span', { class: 'player-name' }, p.name),
        p.role ? h('span', { class: 'tag' }, p.role.name) : p.faction ? h('span', { class: 'tag' }, FACTION_LABELS[p.faction]) : null,
        p.labels.map((label) => h('span', { class: 'tag tag-info' }, label)),
        p.alive ? null : h('span', { class: 'tag tag-dead' }, p.deathCause ? `tot: ${p.deathCause}` : 'tot'),
      ),
    ),
  );
}

/** Was der Spieler über andere weiß (z.B. Mitwerwölfe, Liebespartner). */
export function knowledge(view: PlayerView): HTMLElement | null {
  const known = view.players.filter((p) => p.labels.length > 0);
  if (known.length === 0) return null;
  return h('ul', { class: 'knowledge' }, known.map((p) => h('li', null, `${p.name}: ${p.labels.join(', ')}`)));
}

export interface PromptAnswer {
  targets?: PlayerId[];
  choice?: string;
  skip?: boolean;
}

/** Generisches Eingabeformular für jede Fähigkeit. Die Regeln (Ziele, Anzahl) kommen aus der Engine. */
export function promptForm(prompt: DecisionPrompt, onAnswer: (answer: PromptAnswer) => void): HTMLElement {
  const container = h('div', { class: 'prompt' });
  let selected: string[] = [];

  const draw = () => {
    const nameOf = (id: string) => prompt.candidates.find((c) => c.id === id)?.name ?? id;
    const options =
      prompt.kind === 'players'
        ? prompt.candidates.map((c) => ({ id: c.id, label: c.name }))
        : prompt.kind === 'choice'
          ? prompt.choices
          : [];
    const toggle = (id: string) => {
      const max = prompt.kind === 'players' ? prompt.max : 1;
      if (selected.includes(id)) selected = selected.filter((x) => x !== id);
      else selected = max === 1 ? [id] : selected.length < max ? [...selected, id] : selected;
      draw();
    };
    const valid = prompt.kind === 'players' ? selected.length >= prompt.min && selected.length <= prompt.max : prompt.kind === 'choice' ? selected.length === 1 : true;
    const submit = () =>
      onAnswer(prompt.kind === 'players' ? { targets: selected } : prompt.kind === 'choice' ? { choice: selected[0] } : {});

    const parts: Array<Node | null> = [
      h('h3', null, prompt.title),
      ...prompt.info.map((line) => h('p', { class: 'info' }, line)),
      prompt.group
        ? h(
            'p',
            { class: 'group-status' },
            'Stimmen: ',
            prompt.group.map((m) => `${m.name} -> ${m.targets ? m.targets.map(nameOf).join(', ') : '?'}`).join(' | '),
          )
        : null,
      options.length > 0
        ? h(
            'div',
            { class: 'choice-grid' },
            options.map((o) => button(o.label, () => toggle(o.id), `choice${selected.includes(o.id) ? ' selected' : ''}`)),
          )
        : null,
      h(
        'div',
        { class: 'actions' },
        button(prompt.kind === 'confirm' ? 'Verstanden' : 'Bestätigen', submit, '', !valid),
        prompt.optional ? button('Nicht einsetzen', () => onAnswer({ skip: true }), 'secondary') : null,
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
