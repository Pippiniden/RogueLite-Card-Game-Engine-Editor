import type { Content } from '../engine/content.ts';
import type { RunState, CardInst } from '../engine/types.ts';
import type { Combat, CombatView } from '../engine/combat.ts';
import { buildScreen, parseOn, type BuiltScreen, type Layout, type Node } from './layout.ts';
import { Vfx } from './vfx.ts';
import { WIDGETS } from './widgets.ts';
import { ACTIONS } from './actions.ts';
import { Sound } from './audio.ts';
import { backgroundFor } from './skins.ts';
import type { ScreenId } from './registry-names.ts';

/* ===== App: owns the current screen, the run, the battle and the UI state ===== */

export type Info =
  | { kind: 'card'; card: CardInst }
  | { kind: 'enemy'; uid: number }
  | { kind: 'player' }
  | { kind: 'relic'; id: string };

export interface UiState {
  open: Set<string>;
  info: Info | null;
  banner: string;
  face: string;
  selected: number | null;   // uid of the selected hand card
  pile: 'draw' | 'discard' | 'exhaust';
  busy: boolean;
  restDone: boolean;
  /** character highlighted on the select screen */
  charId: string;
  /** cards picked in a choice dialog */
  picked: Set<number>;
}

const SAVE_KEY = 'rlce/run-v1';
export const LAYOUT_OVERRIDE_KEY = 'rlce/layout-override';

export class App {
  content: Content;
  layout: Layout;
  stage: HTMLElement;
  vfx: Vfx;
  sound: Sound;
  run: RunState | null = null;
  combat: Combat | null = null;
  /** the battle state currently on screen (lags behind `combat` while frames play) */
  view: CombatView | null = null;
  screen: BuiltScreen | null = null;
  /** set by the editor's play test: saves go to memory only */
  embedded = false;
  private memorySave: string | null = null;
  ui: UiState;
  private faceTimer = 0;
  private bannerTimer = 0;

  constructor(content: Content, layout: Layout, stage: HTMLElement) {
    this.content = content;
    this.layout = layout;
    this.stage = stage;
    this.vfx = new Vfx(content.vfx, stage);
    this.sound = new Sound(content);
    this.ui = { open: new Set(), info: null, banner: '', face: 'normal', selected: null, pile: 'draw', busy: false, restDone: false, charId: this.playableCharacters()[0]?.id ?? '', picked: new Set() };
  }

  /** UI text from text.<lang>.json → ui, with {name} placeholders */
  t(key: string, vars: Record<string, string | number> = {}): string {
    const s = this.content.text.ui[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  }
  playableCharacters() { return [...this.content.characters.values()].filter(c => !c.locked); }

  /* ----- screens ----- */
  go(id: ScreenId) {
    const spec = this.layout.screens.get(id);
    if (!spec) { console.error(`画面 ${id} が layout にありません`); return; }
    this.ui.open.clear(); this.ui.info = null; this.ui.selected = null; this.ui.banner = '';
    const built = buildScreen(spec);
    this.screen?.root.remove();
    this.screen = built;
    const encBg = id === 'BATTLE' && this.run?.encounter ? this.content.encounters.get(this.run.encounter)?.bg : undefined;
    const bg = backgroundFor(this.content, id, encBg);
    if (bg) Object.assign(built.root.style, { backgroundImage: `url("${bg}")`, backgroundSize: 'cover', backgroundPosition: 'center' });
    this.stage.querySelector('.q-host')!.appendChild(built.root);
    for (const n of built.nodes) {
      const w = n.spec.attrs.bind ? WIDGETS[n.spec.attrs.bind] : undefined;
      w?.mount?.(n, this);
      this.wireOn(n);
    }
    built.root.querySelectorAll<HTMLElement>('.q-scrim').forEach(s => s.addEventListener('click', () => {
      const id = s.dataset.scrimFor!;
      if (this.screen?.byId.get(id)?.spec.attrs.show === 'choice') return; // a choice must be answered
      this.close(id);
    }));
    this.refresh();
    this.sound.bgm(id === 'BATTLE' ? this.battleMusic() : id);
  }
  private battleMusic() {
    const enc = this.run?.encounter ? this.content.encounters.get(this.run.encounter) : undefined;
    return enc?.bgm ?? (enc?.pool === 'boss' ? 'boss' : enc?.pool === 'elite' ? 'elite' : 'battle');
  }

  private wireOn(n: Node) {
    const specs = parseOn(n.spec.attrs.on).filter(s => s.event === 'tap');
    if (!specs.length) return;
    n.el.classList.add('q-tap');
    n.el.addEventListener('click', ev => {
      if (this.ui.busy && !['open', 'close', 'showPile', 'toggleSound'].includes(specs[0].action)) return;
      ev.stopPropagation();
      this.sound.se('click');
      for (const s of specs) this.dispatch(s.action, s.args, s.target);
    });
  }

  dispatch(action: string, args: string[], target: string) {
    let navigate = true;
    if (action === 'open') { this.open(target); return; }
    if (action === 'close') { this.close(target); return; }
    if (action) {
      const fn = ACTIONS[action];
      if (!fn) { console.warn(`アクション ${action} は登録されていません`); return; }
      const r = fn(this, args, target);
      if (r === false) navigate = false;
    }
    if (!navigate || !target) return;
    if (this.layout.screens.has(target)) this.go(target as ScreenId);
    else if (this.screen?.byId.has(target)) this.open(target);
  }

  open(id: string) { this.ui.open.add(id); this.refresh(); }
  close(id: string) {
    this.ui.open.delete(id);
    const n = this.screen?.byId.get(id);
    if (n?.spec.attrs.show === 'info') this.ui.info = null;
    this.refresh();
  }
  showInfo(info: Info) {
    this.ui.info = info;
    const n = this.screen?.nodes.find(x => x.spec.attrs.show === 'info');
    if (n) this.ui.open.add(n.spec.id);
    this.refresh();
  }

  flag(name: string): boolean {
    switch (name) {
      case 'hasSave': return !!this.loadSave();
      case 'restDone': return this.ui.restDone;
      case 'info': return !!this.ui.info;
      case 'banner': return !!this.ui.banner;
      case 'choice': return !!this.view?.choice && !this.ui.busy;
      case 'multiChar': return this.playableCharacters().length > 1;
      case 'muted': return this.sound.muted;
      default: return false;
    }
  }

  /** re-run every widget and visibility rule on the current screen */
  refresh() {
    const s = this.screen; if (!s) return;
    for (const n of s.nodes) {
      const a = n.spec.attrs;
      let visible = true;
      if (a.layer === 'overlay') visible = this.ui.open.has(n.spec.id) || (!!a.show && this.flag(a.show));
      else if (a.show) visible = this.flag(a.show);
      n.el.hidden = !visible;
      const scrim = s.root.querySelector<HTMLElement>(`[data-scrim-for="${n.spec.id}"]`);
      if (scrim) scrim.hidden = !visible;
      // nodes come parent-first, so a hidden ancestor is already known: skip widgets nobody can see
      if (!visible || n.el.parentElement?.closest('.q[hidden]')) continue;
      const w = a.bind ? WIDGETS[a.bind] : undefined;
      w?.update(n, this);
    }
  }
  /** update only some widgets (cheap refresh during battle animations) */
  refreshBinds(...binds: string[]) {
    for (const n of this.screen?.nodes ?? []) if (binds.includes(n.spec.attrs.bind) && !n.el.hidden && !n.el.parentElement?.closest('.q[hidden]')) WIDGETS[n.spec.attrs.bind]?.update(n, this);
  }
  node(bind: string): HTMLElement | null { return this.screen?.nodes.find(n => n.spec.attrs.bind === bind)?.el ?? null; }

  /* ----- face & banner ----- */
  setFace(face: string, ms = 0) {
    this.ui.face = face;
    clearTimeout(this.faceTimer);
    if (ms) this.faceTimer = window.setTimeout(() => { this.ui.face = 'normal'; this.refreshBinds('player.face'); }, ms);
    this.refreshBinds('player.face');
  }
  currentFace(): string {
    if (this.ui.face !== 'normal') return this.ui.face;
    const hp = this.view?.player.hp ?? this.run?.hp ?? 1, max = this.view?.player.maxHp ?? this.run?.maxHp ?? 1;
    return hp / max <= 0.3 ? 'pinch' : 'normal';
  }
  banner(text: string, ms = 900) {
    this.ui.banner = text;
    clearTimeout(this.bannerTimer);
    if (ms) this.bannerTimer = window.setTimeout(() => { this.ui.banner = ''; this.refresh(); }, ms);
    this.refresh();
  }

  /* ----- save ----- */
  save() {
    if (!this.run) return;
    const t = JSON.stringify(this.run);
    if (this.embedded) { this.memorySave = t; return; }
    try { localStorage.setItem(SAVE_KEY, t); } catch { /* storage may be unavailable */ }
  }
  loadSave(): RunState | null {
    try {
      const t = this.embedded ? this.memorySave : localStorage.getItem(SAVE_KEY);
      if (!t) return null;
      const r = JSON.parse(t) as RunState;
      return r.v === 1 && r.phase !== 'won' && r.phase !== 'lost' && this.content.characters.has(r.char) ? r : null;
    } catch { return null; }
  }
  clearSave() { this.memorySave = null; if (!this.embedded) try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
}
