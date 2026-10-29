/** Minimaler DOM-Helfer. Texte werden immer als Textknoten eingefügt (kein innerHTML, kein XSS). */
export type Child = Node | string | number | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined | ((event: Event) => void);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> | null = null,
  ...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') element.addEventListener(key.replace(/^on/, ''), value);
    else if (key === 'class') element.className = String(value);
    else if (key === 'value') (element as HTMLInputElement).value = String(value);
    else if (key === 'checked') (element as HTMLInputElement).checked = Boolean(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}

export function button(label: string, onclick: () => void, variant = '', disabled = false): HTMLButtonElement {
  return h('button', { type: 'button', class: variant, onclick: () => onclick(), disabled }, label);
}
