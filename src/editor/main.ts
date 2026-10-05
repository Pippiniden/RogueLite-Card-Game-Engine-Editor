import '../game/cards.css';
import './editor.css';
import { Project, type ListKind, LIST_KINDS } from './project.ts';
import { ed, rebuild, onContent, undo, redo, resetUndo } from './state.ts';
import { h, button, clear, toast, modal, select } from './ui.ts';
import { collectionSection } from './collection.ts';
import { KINDS } from './schemas.ts';
import { rulesSection, themeSection, audioSection, assetsSection, textsSection, layoutSection, vfxSection, pluginsSection, packsSection, issuesSection } from './sections.ts';
import { playtest, playtestMenu } from './playtest.ts';

/* ===== RogueLite Card Game Engine & Editor — the editor shell ===== */

const NAV: { group: string; items: [string, string][] }[] = [
  { group: 'コンテンツ', items: LIST_KINDS.map(k => [k, KINDS[k].label.replace(/（.*/, '')] as [string, string]) },
  { group: '遊びの数値', items: [['rules', 'ルール'], ['vfx', '演出']] },
  { group: '見た目と音', items: [['theme', '見た目・UIスキン'], ['audio', 'サウンド'], ['assets', '素材']] },
  { group: '文言と画面', items: [['texts', '文言'], ['layout', '画面配置']] },
  { group: '拡張', items: [['plugins', 'プラグイン'], ['packs', 'パック']] },
  { group: '', items: [['issues', '検証']] },
];

const app = document.getElementById('app')!;
const canFolder = 'showDirectoryPicker' in window;

function header(): HTMLElement {
  const p = ed.project;
  const errs = ed.issues.filter(i => i.sev === 'error').length, warns = ed.issues.filter(i => i.sev === 'warn').length;
  return h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }), h('div', null, h('b', null, 'RogueLite Card Game Engine & Editor'), h('small', null, p.source.label))),
    h('div', { class: 'top-mid' },
      h('label', { class: 'pack-pick' }, 'パック', select(p.active, p.index.packs.map(id => [id, p.packs.get(id)!.manifest.name + `（${id}）`]), v => { p.active = v; p.changed(); render(); })),
      h('span', { class: `dirty ${p.isDirty ? 'on' : ''}` }, p.isDirty ? `未保存 ${p.dirty.size + p.deleted.size}` : '保存済み'),
      h('button', { type: 'button', class: `chip ${errs ? 'err' : warns ? 'warn' : 'ok'}`, on: { click: () => go('issues') } }, errs ? `エラー ${errs}` : warns ? `警告 ${warns}` : '問題なし')),
    h('div', { class: 'top-act' },
      button('元に戻す', () => { if (!undo()) toast('戻せる変更がありません'); else render(); }, 'ghost sm', { title: 'Ctrl+Z' }),
      button('やり直す', () => { if (!redo()) toast('やり直せる変更がありません'); else render(); }, 'ghost sm', { title: 'Ctrl+Shift+Z' }),
      button('開く…', openMenu, 'sm'),
      button(p.source.kind === 'folder' ? 'フォルダに保存' : '保存…', () => void save(), 'sm', { title: 'Ctrl+S' }),
      button('zipで書き出し', () => void exportZip(), 'sm'),
      button('▶ プレイテスト', async () => { await modal('プレイテスト', playtestMenu(), [['閉じる', null]]); }, 'primary sm')));
}

function nav(): HTMLElement {
  return h('nav', { class: 'side', 'aria-label': '編集する項目' }, NAV.map(g => h('div', { class: 'nav-g' },
    g.group ? h('h4', null, g.group) : null,
    g.items.map(([id, label]) => {
      const n = (LIST_KINDS as readonly string[]).includes(id) ? ed.project.merged(id as ListKind).length : null;
      const bad = ed.issues.filter(i => i.kind === id && i.sev === 'error').length;
      return h('button', { type: 'button', class: `nav-i${ed.section === id ? ' on' : ''}`, 'aria-current': ed.section === id ? 'page' : undefined, on: { click: () => go(id) } },
        h('span', null, label), n !== null ? h('small', { class: 'mono' }, String(n)) : null, bad ? h('span', { class: 'dot error', title: `エラー ${bad}` }) : null);
    }))));
}

let mainEl: HTMLElement;
function section(): HTMLElement {
  const s = ed.section;
  if ((LIST_KINDS as readonly string[]).includes(s)) return collectionSection(s as ListKind);
  switch (s) {
    case 'rules': return rulesSection();
    case 'vfx': return vfxSection();
    case 'theme': return themeSection();
    case 'audio': return audioSection();
    case 'assets': return assetsSection();
    case 'texts': return textsSection();
    case 'layout': return layoutSection();
    case 'plugins': return pluginsSection();
    case 'packs': return packsSection(render);
    default: return issuesSection(go);
  }
}

export function go(sec: string, id?: string) {
  ed.section = sec;
  if (id !== undefined && (LIST_KINDS as readonly string[]).includes(sec)) ed.selected = id;
  else if (!(LIST_KINDS as readonly string[]).includes(sec)) ed.selected = ed.selected;
  render();
}

let topEl: HTMLElement, navEl: HTMLElement;
function render() {
  topEl = header(); navEl = nav();
  mainEl = h('main', { class: 'main' }, section());
  clear(app, topEl, h('div', { class: 'body' }, navEl, mainEl));
}
/** refresh the header and nav without rebuilding the open form */
function refreshChrome() {
  if (!topEl) return;
  const t = header(), n = nav();
  topEl.replaceWith(t); navEl.replaceWith(n); topEl = t; navEl = n;
}

/* ----- open / save ----- */
async function openMenu() {
  const pick = h('input', { type: 'file', webkitdirectory: true, hidden: true }) as HTMLInputElement;
  const zip = h('input', { type: 'file', accept: '.zip', hidden: true }) as HTMLInputElement;
  const body = h('div', { class: 'open-menu' },
    canFolder ? button('フォルダを開く（Chrome / Edge）', async () => { close(); try { const dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' }); await load(() => Project.fromFolder(dir)); } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'err'); } }, 'primary') : null,
    h('p', { class: 'help' }, 'リポジトリのフォルダ、または public/packs を選びます。保存するとそのフォルダのファイルが書き換わります。'),
    button('フォルダを読み込む（どのブラウザでも）', () => pick.click()), pick,
    button('zip を開く', () => zip.click()), zip,
    button('このサイトの packs を読み直す', () => { close(); void load(() => Project.fromServer()); }));
  let closeFn: (() => void) | null = null;
  const close = () => closeFn?.();
  pick.addEventListener('change', () => { close(); const files = [...(pick.files ?? [])]; void load(() => Project.fromEntries(files.map(f => ({ path: (f as File & { webkitRelativePath: string }).webkitRelativePath, data: f })), { kind: 'files', label: `読み込んだフォルダ（保存は zip で）` })); });
  zip.addEventListener('change', () => { close(); const f = zip.files?.[0]; if (f) void load(() => Project.fromZip(f, f.name)); });
  const p = modal('プロジェクトを開く', body, [['閉じる', null]]);
  closeFn = () => document.querySelector<HTMLDialogElement>('dialog.modal')?.close();
  await p;
}

async function load(make: () => Promise<Project>) {
  if (ed.project?.isDirty && !(await modal('保存していない変更があります', h('p', null, '開くと失われます。'), [['やめる', null], ['開く', 'y', 'danger']]))) return;
  try {
    const p = await make();
    setProject(p);
    toast('開きました', 'ok');
  } catch (e) { toast((e as Error).message, 'err'); }
}
function setProject(p: Project) {
  ed.project = p;
  p.onChange(() => refreshChromeSoon());
  ed.selected = null;
  resetUndo();
  render();
  void rebuild();
}
let chromeTimer = 0;
const refreshChromeSoon = () => { clearTimeout(chromeTimer); chromeTimer = window.setTimeout(refreshChrome, 150); };

async function save() {
  const p = ed.project;
  try {
    if (p.source.kind === 'folder' && p.source.dir) { const n = await p.saveToFolder(); toast(`${n} ファイルを保存しました`, 'ok'); refreshChrome(); return; }
    if (canFolder) {
      const ok = await modal('保存先', h('p', null, 'リポジトリのフォルダ（または public/packs）を選んでください。packs の中身がすべて書き込まれます。'), [['やめる', null], ['フォルダを選ぶ', 'y', 'primary']]);
      if (!ok) return;
      const dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
      const n = await p.saveToFolder(dir); toast(`${n} ファイルを保存しました`, 'ok'); refreshChrome(); return;
    }
    await exportZip();
  } catch (e) { if ((e as Error).name !== 'AbortError') toast(`保存できませんでした: ${(e as Error).message}`, 'err'); }
}
async function exportZip() {
  const blob = await ed.project.toZip();
  const a = h('a', { href: URL.createObjectURL(blob), download: 'packs.zip' });
  document.body.appendChild(a); a.click(); a.remove();
  toast('packs.zip を書き出しました。リポジトリの public/ に展開して packs を置き換えます', 'ok');
}

/* ----- keys ----- */
addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
  const inText = (e.target as HTMLElement).closest?.('input, textarea, select');
  if (mod && e.key.toLowerCase() === 'z' && !inText) { e.preventDefault(); if (e.shiftKey ? redo() : undo()) render(); }
});
addEventListener('beforeunload', e => { if (ed.project?.isDirty) { e.preventDefault(); } });
onContent(() => refreshChrome());

/* ----- boot ----- */
async function boot() {
  try { setProject(await Project.fromServer()); }
  catch {
    clear(app, h('div', { class: 'welcome' },
      h('h1', null, 'RogueLite Card Game Engine & Editor'),
      h('p', null, 'packs フォルダを開いて編集を始めます。'),
      button('開く…', openMenu, 'primary')));
  }
}
void boot();
void playtest;
