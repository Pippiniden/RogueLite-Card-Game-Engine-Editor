import './cards.css';
import './style.css';
import { loadContent, type Content } from '../engine/content.ts';
import { loadPlugins } from '../engine/plugins.ts';
import { newRun } from '../engine/run.ts';
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
  run?: { char: string; seed?: number };
  battle?: { encounter: string; enemies?: string[]; char: string; deck?: string[]; relics?: string[]; hp?: number };
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
    run.encounter = s.battle.encounter;
    run.phase = 'battle';
    run.at = { floor: c.encounters.get(s.battle.encounter)!.pool === 'boss' ? run.map.floors.length : 1, col: 0 };
    app.run = run;
    beginBattle(app);
    return;
  }
  if (s?.run && c.characters.has(s.run.char)) { app.run = newRun(c, s.run.char, s.run.seed); app.go('MAP'); return; }
  app.go(s?.screen && app.layout.screens.has(s.screen) ? s.screen : 'TITLE');
}

boot().catch(e => {
  const b = document.getElementById('boot');
  if (b) b.textContent = `起動できませんでした: ${(e as Error).message}`;
  console.error(e);
  if (embedded) parent.postMessage({ type: 'rlce:error', message: (e as Error).message }, '*');
});
