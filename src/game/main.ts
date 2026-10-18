import './cards.css';
import './style.css';
import './run-screens.ts'; // shop / event / deck-pick widgets and actions
import { loadContent, type Content } from '../engine/content.ts';
import { loadPlugins } from '../engine/plugins.ts';
import { newRun, startAct } from '../engine/run.ts';
import { makeShop, startEvent, givePotion } from '../engine/run-effects.ts';
import { Rng } from '../engine/rng.ts';
import { parseLayoutText } from './layout.ts';
import { App, LAYOUT_OVERRIDE_KEY } from './app.ts';
import { installDevPanel } from './dev.ts';
import { installSkins } from './skins.ts';
import { registerFx } from './vfx.ts';
import { registerWidget, type Widget } from './widgets.ts';
import { registerAction, type Action } from './actions.ts';
import { beginBattle } from './battle.ts';
import type { ScreenId } from './registry-names.ts';

/* Boot: load packs (fetched at run time, so swapping JSON/images needs no rebuild), plugins and theme,
   read the layout (or a pasted override), fit the 390×844 stage to the screen, open the title.

   Embedded mode (#embed): the editor's play test sends the files it is editing with postMessage
   instead of the game fetching them, so unsaved edits can be played at once. */

export interface PlayStart {
  screen?: ScreenId;
  run?: { char: string; seed?: number; act?: number; potions?: string[] };
  battle?: { encounter: string; enemies?: string[]; char: string; deck?: string[]; relics?: string[]; hp?: number; potions?: string[] };
  /** open a shop / an event directly (editor play test) */
  shop?: { char: string; gold?: number; floor?: number };
  event?: { id: string; char: string; gold?: number; floor?: number };
}
interface LoadMsg { type: 'rlce:load'; files: Record<string, string>; urls: Record<string, string>; start?: PlayStart }

const embedded = location.hash.includes('embed') || new URLSearchParams(location.search).has('embed');

function waitForFiles(): Promise<LoadMsg> {
  return new Promise(resolve => {
    addEventListener('message', function on(ev: MessageEvent) {
      if (ev.data?.type !== 'rlce:load') return;
      removeEventListener('message', on);
      resolve(ev.data as LoadMsg);
    });
    parent.postMessage({ type: 'rlce:ready' }, '*');
  });
}

async function boot() {
  const stage = document.getElementById('stage')!;
  let msg: LoadMsg | null = null;
  let content: Content;
  if (embedded) {
    msg = await waitForFiles();
    const m = msg;
    content = await loadContent('packs', async p => { if (p in m.files) return m.files[p]; throw new Error(`${p} がありません`); });
    for (const [k, path] of content.assets) if (m.urls[path]) content.assets.set(k, m.urls[path]);
  } else {
    const read = async (p: string) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${p} を読み込めません（${r.status}）`); return r.text(); };
    const only = new URLSearchParams(location.search).get('packs')?.split(',').map(x => x.trim()).filter(x => /^[\w-]+$/.test(x));
    content = await loadContent('packs', read, only);
  }

  // plugins
  const results = await loadPlugins(content, async path => {
    if (msg) {
      const url = msg.urls[path] ?? (msg.files[path] !== undefined ? URL.createObjectURL(new Blob([msg.files[path]], { type: 'text/javascript' })) : path);
      return import(/* @vite-ignore */ url);
    }
    return import(/* @vite-ignore */ new URL(path, location.href).href);
  }, {
    registerFx: registerFx as never,
    registerWidget: (bind, w) => registerWidget(bind, w as Widget),
    registerAction: (name, fn) => registerAction(name, fn as Action),
  });
  for (const r of results) if (!r.ok) console.error(`プラグイン ${r.path} を読み込めません: ${r.error}`);

  // theme → CSS variables and skins
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(content.theme.colors)) root.setProperty(`--c-${k}`, v);
  for (const [k, v] of Object.entries(content.theme.cardTypeColors)) root.setProperty(`--type-${k}`, v);
  for (const [k, v] of Object.entries(content.theme.rarityColors)) root.setProperty(`--rar-${k}`, v);
  root.setProperty('--f-display', content.theme.fonts.display);
  root.setProperty('--f-body', content.theme.fonts.body);
  if (content.theme.fonts.googleFonts) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = content.theme.fonts.googleFonts; document.head.appendChild(l);
  }
  installSkins(content);
  // pack stylesheets go after the built-in CSS (rules: docs/css-guide.md)
  document.querySelectorAll('style[data-pack-css]').forEach(e => e.remove());
  for (const st of content.styles) {
    const el = document.createElement('style');
    el.dataset.packCss = st.path;
    el.textContent = st.text;
    document.head.appendChild(el);
  }
  document.title = content.text.ui['game.title'] ?? document.title;

  let layoutText = content.layout;
  let overridden = false;
  if (!embedded) try { const o = localStorage.getItem(LAYOUT_OVERRIDE_KEY); if (o) { layoutText = o; overridden = true; } } catch { /* no storage */ }
  let { layout, errors } = parseLayoutText(layoutText);
  if (errors.length && overridden) {
    console.warn('上書きレイアウトにエラーがあるので、パックのレイアウトを使います', errors);
    ({ layout, errors } = parseLayoutText(content.layout)); overridden = false;
  }
  if (errors.length) console.warn('layout.qlayout:', errors);

  stage.style.width = layout.size.w + 'px';
  stage.style.height = layout.size.h + 'px';
  const fit = () => stage.style.setProperty('--s', String(Math.min(innerWidth / layout.size.w, innerHeight / layout.size.h)));
  addEventListener('resize', fit); fit();

  const app = new App(content, layout, stage);
  app.embedded = embedded;
  (window as unknown as { app: App }).app = app;
  document.getElementById('boot')?.remove();
  start(app, msg?.start);
  (window as unknown as { rlceStart: (s: PlayStart) => void }).rlceStart = s => start(app, s);
  if (!embedded && (new URLSearchParams(location.search).has('dev') || location.hash === '#dev' || overridden)) installDevPanel(app, content.layout, overridden);
  if (embedded) parent.postMessage({ type: 'rlce:started', plugins: results }, '*');
}

function start(app: App, s?: PlayStart) {
  const c = app.content;
  if (s?.battle?.enemies?.length) {
    c.encounters.set('__test', { id: '__test', pool: 'normal', enemies: s.battle.enemies.filter(e => c.enemies.has(e)).slice(0, 4) });
    s.battle.encounter = '__test';
  }
  if (s?.battle && c.encounters.has(s.battle.encounter) && c.characters.has(s.battle.char)) {
    const run = newRun(c, s.battle.char);
    if (s.battle.deck?.length) run.deck = s.battle.deck.map(x => ({ id: x.replace(/\+$/, ''), up: x.endsWith('+') })).filter(x => c.cards.has(x.id)).map((x, i) => ({ uid: 1000 + i, ...x }));
    if (s.battle.relics) run.relics = s.battle.relics.filter(r => c.relics.has(r));
    if (s.battle.hp) run.hp = Math.min(run.maxHp, s.battle.hp);
    if (s.battle.potions) s.battle.potions.forEach(id => { if (c.potions.has(id)) givePotion(run, id); });
    const enc = c.encounters.get(s.battle.encounter);
    if (enc?.acts?.length && enc.acts[0] > 1) startAct(c, run, enc.acts[0] - 1);
    run.encounter = s.battle.encounter;
    run.phase = 'battle';
    run.at = { floor: c.encounters.get(s.battle.encounter)!.pool === 'boss' ? run.map.floors.length : 1, col: 0 };
    app.run = run;
    beginBattle(app);
    return;
  }
  const placed = (char: string, gold?: number, floor = 5) => {
    const run = newRun(c, char);
    if (gold !== undefined) run.gold = gold;
    const f = Math.max(0, Math.min(run.map.floors.length - 1, floor - 1));
    const node = run.map.floors[f].find(Boolean)!;
    run.at = { floor: f, col: node.col };
    run.path = [{ floor: f, col: node.col }];
    run.stats.floors = f + 1;
    return run;
  };
  if (s?.shop && c.characters.has(s.shop.char)) {
    const run = placed(s.shop.char, s.shop.gold ?? 300, s.shop.floor);
    run.shop = makeShop(c, run, new Rng(run.seed)); run.phase = 'shop';
    app.run = run; app.go('SHOP'); return;
  }
  if (s?.event && c.characters.has(s.event.char) && c.events.has(s.event.id)) {
    const run = placed(s.event.char, s.event.gold, s.event.floor);
    startEvent(c, run, c.events.get(s.event.id)!);
    app.run = run; app.go('EVENT'); return;
  }
  if (s?.run && c.characters.has(s.run.char)) {
    const run = newRun(c, s.run.char, s.run.seed);
    if (s.run.act && s.run.act > 1) { startAct(c, run, s.run.act - 1); app.ui.actBanner = true; }
    s.run.potions?.forEach(id => { if (c.potions.has(id)) givePotion(run, id); });
    app.run = run; app.go('MAP'); return;
  }
  app.go(s?.screen && app.layout.screens.has(s.screen) ? s.screen : 'TITLE');
}

boot().catch(e => {
  const b = document.getElementById('boot');
  if (b) b.textContent = `起動できませんでした: ${(e as Error).message}`;
  console.error(e);
  if (embedded) parent.postMessage({ type: 'rlce:error', message: (e as Error).message }, '*');
});
