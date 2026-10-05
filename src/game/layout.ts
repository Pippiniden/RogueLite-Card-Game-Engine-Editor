import { skinClass } from './skins.ts';
import { parseDoc, buildTree, parseLayout as parseLayoutAttr } from './qlayout-core.js';

/* ===== QLAYOUT → DOM =====
   Every element becomes an absolutely positioned box at exactly the tool's coordinates.
   What goes inside is decided by `bind` (a widget) or, without one, by the element type. */

export interface QEl { uid: string; id: string; type: string; x: number; y: number; w: number; h: number; label: string; attrs: Record<string, string> }
export interface QScreen { id: string; w: number; h: number; title: string; notes: string[]; els: QEl[] }
export interface Layout { screens: Map<string, QScreen>; size: { w: number; h: number } }

export function parseLayoutText(text: string): { layout: Layout; errors: string[] } {
  const d = parseDoc(text);
  const screens = new Map<string, QScreen>();
  for (const it of d.items) if (it.kind === 'screen') screens.set(it.s.id, it.s as QScreen);
  const size = d.project?.size ?? { w: 390, h: 844 };
  return { layout: { screens, size }, errors: d.errors as string[] };
}

export interface Node { el: HTMLElement; spec: QEl }
export interface BuiltScreen { id: string; root: HTMLElement; nodes: Node[]; byId: Map<string, Node> }

export function buildScreen(s: QScreen): BuiltScreen {
  const root = document.createElement('div');
  root.className = 'q-screen';
  root.dataset.screen = s.id;
  root.style.width = s.w + 'px';
  root.style.height = s.h + 'px';
  const { roots, kids } = buildTree(s.els) as { roots: QEl[]; kids: Map<string, QEl[]> };
  const nodes: Node[] = [];
  const byId = new Map<string, Node>();
  const make = (e: QEl, parent: HTMLElement, px: number, py: number) => {
    const el = document.createElement(e.type === 'button' ? 'button' : 'div');
    if (el instanceof HTMLButtonElement) el.type = 'button';
    el.className = `q t-${e.type}`;
    const skin = e.attrs.skin || (e.type === 'button' ? 'button' : e.type === 'dialog' ? 'dialog' : '');
    if (skin) el.classList.add(skinClass(skin));
    el.dataset.qid = e.id;
    if (e.attrs.bind) el.dataset.bind = e.attrs.bind;
    if (e.attrs.skin) el.dataset.skin = e.attrs.skin;
    Object.assign(el.style, { left: `${e.x - px}px`, top: `${e.y - py}px`, width: `${e.w}px`, height: `${e.h}px` });
    if (e.attrs.scroll) el.classList.add(e.attrs.scroll === 'x' ? 'q-scroll-x' : 'q-scroll-y');
    const ch = kids.get(e.uid) || [];
    if (!ch.length) applyFlow(el, e);
    if (e.attrs.layer === 'overlay') {
      el.classList.add('q-overlay');
      if (e.type === 'dialog') {
        const scrim = document.createElement('div');
        scrim.className = 'q-scrim';
        scrim.dataset.scrimFor = e.id;
        parent.appendChild(scrim);
      }
    }
    if (!e.attrs.bind && !ch.length) defaultContent(el, e);
    parent.appendChild(el);
    const n = { el, spec: e };
    nodes.push(n); byId.set(e.id, n);
    ch.forEach(k => make(k, el, e.x, e.y));
  };
  roots.forEach(r => make(r, root, 0, 0));
  return { id: s.id, root, nodes, byId };
}

/** layout="row|column|grid" and repeat="CxR" become flex/grid on the widget's own children */
function applyFlow(el: HTMLElement, e: QEl) {
  const rep = /^(\d+)x(\d+)$/.exec(e.attrs.repeat || '');
  if (rep) { Object.assign(el.style, { display: 'grid', gridTemplateColumns: `repeat(${rep[1]}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rep[2]}, minmax(0,1fr))`, gap: '8px' }); return; }
  const lay = parseLayoutAttr(e.attrs.layout);
  if (!lay || !lay.ok) return;
  if (lay.dir === 'grid') Object.assign(el.style, { display: 'grid', gridTemplateColumns: `repeat(${lay.cols || 2}, minmax(0,1fr))`, alignContent: 'start' });
  else Object.assign(el.style, { display: 'flex', flexDirection: lay.dir, alignItems: lay.align === 'center' ? 'center' : lay.align === 'end' ? 'flex-end' : lay.align === 'stretch' ? 'stretch' : lay.dir === 'row' ? 'center' : 'stretch' });
  if (lay.gap) el.style.gap = `${lay.gap}px`;
}

function defaultContent(el: HTMLElement, e: QEl) {
  if (['label', 'text', 'button'].includes(e.type)) { el.textContent = e.label; return; }
  if (e.type === 'image' || e.type === 'icon') { el.classList.add('q-missing'); el.textContent = e.label; }
}

/** parse on="tap: name(arg) → TARGET / tap: …" */
export interface OnSpec { event: string; action: string; args: string[]; target: string }
export function parseOn(on: string | undefined): OnSpec[] {
  if (!on) return [];
  return on.split(/\s+\/\s+/).map(seg => {
    const m = /^\s*(\w+)\s*:\s*([A-Za-z_]\w*)?\s*(?:\(([^)]*)\))?\s*(?:(?:→|->|=>)\s*([A-Za-z_]\w*))?/.exec(seg);
    if (!m) {
      const t = /(?:→|->|=>)\s*([A-Za-z_]\w*)/.exec(seg);
      return { event: 'tap', action: '', args: [], target: t ? t[1] : '' };
    }
    return { event: m[1], action: m[2] || '', args: m[3] ? m[3].split(',').map(x => x.trim()).filter(Boolean) : [], target: m[4] || '' };
  });
}
