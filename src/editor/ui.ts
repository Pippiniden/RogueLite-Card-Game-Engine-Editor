/* Tiny DOM helpers for the editor (no framework). */

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & { class?: string; style?: string | Record<string, string>; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') { if (typeof v === 'string') el.setAttribute('style', v); else Object.assign(el.style, v); }
      else if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}
export function append(el: Element, children: Child[]) {
  for (const c of children.flat(Infinity as 1) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c as Node);
  }
}
export function clear(el: Element, ...children: Child[]) { el.replaceChildren(); append(el, children); }

let uid = 0;
export const nextId = (p = 'f') => `${p}${++uid}`;

/** a labelled field row */
export function row(label: string, control: Node, help?: string, wide = false): HTMLElement {
  const id = (control as HTMLElement).id || nextId();
  if (control instanceof HTMLElement && !control.id && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) control.id = id;
  return h('div', { class: `fr${wide ? ' wide' : ''}` }, h('label', { for: id }, label), control, help ? h('p', { class: 'help' }, help) : null);
}

export function input(value: string | number | undefined, onInput: (v: string) => void, attrs: Props = {}): HTMLInputElement {
  return h('input', { value: value ?? '', ...attrs, on: { input: (e: Event) => onInput((e.target as HTMLInputElement).value) } });
}
export function textarea(value: string | undefined, onInput: (v: string) => void, attrs: Props = {}): HTMLTextAreaElement {
  const t = h('textarea', { ...attrs, on: { input: (e: Event) => onInput((e.target as HTMLTextAreaElement).value) } });
  t.value = value ?? '';
  return t;
}
export function select(value: string, options: ([string, string] | { group: string; items: [string, string][] })[], onChange: (v: string) => void, attrs: Props = {}): HTMLSelectElement {
  const s = h('select', { ...attrs, on: { change: (e: Event) => onChange((e.target as HTMLSelectElement).value) } });
  let found = false;
  for (const o of options) {
    if (Array.isArray(o)) { s.appendChild(h('option', { value: o[0] }, o[1])); if (o[0] === value) found = true; }
    else { const g = h('optgroup', { label: o.group }); for (const [v, l] of o.items) { g.appendChild(h('option', { value: v }, l)); if (v === value) found = true; } s.appendChild(g); }
  }
  if (!found && value) s.appendChild(h('option', { value }, `${value}（未登録）`));
  s.value = value;
  return s;
}
export function checkbox(checked: boolean, label: string, onChange: (v: boolean) => void): HTMLLabelElement {
  return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked, on: { change: (e: Event) => onChange((e.target as HTMLInputElement).checked) } }), label);
}
export function button(label: string, onClick: () => void, cls = '', attrs: Props = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn ${cls}`, ...attrs, on: { click: (e: Event) => { e.stopPropagation(); onClick(); } } }, label);
}

/** toast message in the corner */
export function toast(msg: string, kind: 'ok' | 'err' | '' = '') {
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

/** modal dialog that resolves with the value of the clicked button */
export function modal<T>(title: string, body: Node, buttons: [string, T, string?][]): Promise<T | null> {
  return new Promise(resolve => {
    const close = (v: T | null) => { d.close(); d.remove(); resolve(v); };
    const d = h('dialog', { class: 'modal' },
      h('h2', null, title), body,
      h('div', { class: 'modal-btns' }, buttons.map(([l, v, c]) => button(l, () => close(v), c ?? ''))));
    d.addEventListener('cancel', () => close(null));
    document.body.appendChild(d);
    d.showModal();
  });
}
export async function prompt(title: string, label: string, value = ''): Promise<string | null> {
  const inp = h('input', { value, class: 'mono' });
  const r = await modal(title, row(label, inp), [['キャンセル', null], ['OK', 'ok', 'primary']]);
  return r ? inp.value.trim() : null;
}

export const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => { let t = 0; return (...a: A) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); }; };
