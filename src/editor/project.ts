import { loadContent, type Content } from '../engine/content.ts';
import type { PackManifest, ContentKind } from '../engine/types.ts';
import { makeZip, readZip } from './zip.ts';

/* ===== The project the editor works on: the packs folder (public/packs) held in memory.
   Sources: the site it is served from, a local folder (File System Access API), picked files, or a zip.
   JSON is parsed into editable models; saving serializes them back (one entry per line in lists). ===== */

export const LIST_KINDS = ['cards', 'statuses', 'relics', 'enemies', 'encounters', 'characters'] as const;
export type ListKind = typeof LIST_KINDS[number];
export const OBJ_KINDS = ['rules', 'vfx', 'theme', 'text', 'audio'] as const;
export type ObjKind = typeof OBJ_KINDS[number];

type Item = { id: string; [k: string]: unknown };
interface VFile { text?: string; blob?: Blob; url?: string }
export interface PackModel {
  id: string;
  dir: string;
  manifest: PackManifest;
  lists: Record<ListKind, { file: string; items: Item[] }[]>;
  objs: Partial<Record<ObjKind, { file: string; data: Record<string, unknown> }>>;
  assets: { file: string; map: Record<string, string> } | null;
  layout: { file: string; text: string } | null;
  plugins: { file: string; text: string }[];
}
export type Source = { kind: 'server' | 'folder' | 'files' | 'zip' | 'new'; label: string; dir?: FileSystemDirectoryHandle };

const TEXT_EXT = /\.(json|qlayout|js|mjs|txt|md|css)$/i;
const ROOT = 'packs';

export function formatJson(v: unknown): string {
  if (Array.isArray(v) && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
    return v.length ? '[\n' + v.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n]\n' : '[]\n';
  }
  return JSON.stringify(v, null, 2) + '\n';
}
const mime = (p: string) => /\.svg$/i.test(p) ? 'image/svg+xml' : /\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : /\.jpe?g$/i.test(p) ? 'image/jpeg' : /\.avif$/i.test(p) ? 'image/avif' : /\.mp3$/i.test(p) ? 'audio/mpeg' : /\.m4a$/i.test(p) ? 'audio/mp4' : /\.ogg$/i.test(p) ? 'audio/ogg' : /\.wav$/i.test(p) ? 'audio/wav' : 'application/octet-stream';

export class Project {
  files = new Map<string, VFile>();
  /** paths changed since the last load/save */
  dirty = new Set<string>();
  deleted = new Set<string>();
  source: Source = { kind: 'new', label: '' };
  index: { packs: string[] } = { packs: [] };
  packs = new Map<string, PackModel>();
  active = '';
  private listeners = new Set<() => void>();
  private snap = new Map<string, string>();

  /* ----- loading ----- */
  static async fromServer(base = ROOT): Promise<Project> {
    const p = new Project();
    const get = async (path: string, asText: boolean) => {
      const r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${path} を読み込めません（${r.status}）`);
      return asText ? r.text() : r.blob();
    };
    const idxText = await get(`${base}/index.json`, true) as string;
    p.files.set(`${ROOT}/index.json`, { text: idxText });
    for (const id of (JSON.parse(idxText) as { packs: string[] }).packs) {
      const dir = `${base}/${id}`;
      const manText = await get(`${dir}/pack.json`, true) as string;
      p.files.set(`${ROOT}/${id}/pack.json`, { text: manText });
      const man = JSON.parse(manText) as PackManifest;
      const texts = [...Object.values(man.files).flatMap(f => Array.isArray(f) ? f : [f!]), man.layout, man.assets, ...(man.plugins ?? [])].filter(Boolean) as string[];
      for (const f of texts) p.files.set(`${ROOT}/${id}/${f}`, { text: await get(`${dir}/${f}`, true) as string });
      if (man.assets) {
        const m = JSON.parse(p.files.get(`${ROOT}/${id}/${man.assets}`)!.text!) as Record<string, string>;
        const baseDir = man.assets.includes('/') ? man.assets.slice(0, man.assets.lastIndexOf('/') + 1) : '';
        await Promise.all(Object.entries(m).filter(([k, v]) => !k.startsWith('$') && !/^(https?:|data:)/.test(v)).map(async ([, v]) => {
          try { p.files.set(`${ROOT}/${id}/${baseDir}${v}`, { blob: await get(`${dir}/${baseDir}${v}`, false) as Blob }); } catch { /* missing asset: reported by the checks */ }
        }));
      }
    }
    p.source = { kind: 'server', label: 'このサイトの packs（読み取り専用。保存はフォルダかzipへ）' };
    p.parse();
    return p;
  }

  static async fromEntries(entries: { path: string; data: Blob }[], source: Source): Promise<Project> {
    // find the folder that holds index.json (repo root, public/ or packs/ may be chosen)
    const idx = entries.map(e => e.path).filter(x => /(^|\/)index\.json$/.test(x)).sort((a, b) => a.length - b.length)
      .find(x => entries.some(e => e.path === x.replace(/index\.json$/, '') + 'base/pack.json') || entries.some(e => e.path.startsWith(x.replace(/index\.json$/, '')) && e.path.endsWith('/pack.json')));
    if (!idx) throw new Error('packs/index.json が見つかりません。リポジトリか public/packs フォルダを選んでください');
    const prefix = idx.replace(/index\.json$/, '');
    const p = new Project();
    for (const e of entries) {
      if (!e.path.startsWith(prefix)) continue;
      const rel = `${ROOT}/${e.path.slice(prefix.length)}`;
      if (TEXT_EXT.test(rel)) p.files.set(rel, { text: await e.data.text() });
      else p.files.set(rel, { blob: new Blob([e.data], { type: mime(rel) }) });
    }
    p.source = source;
    p.parse();
    return p;
  }

  static async fromFolder(dir: FileSystemDirectoryHandle): Promise<Project> {
    const entries: { path: string; data: Blob }[] = [];
    const walk = async (h: FileSystemDirectoryHandle, path: string) => {
      for await (const [name, child] of (h as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
        if (child.kind === 'directory') {
          if (path === '' && !['public', 'packs'].includes(name) && !(await hasIndex(child as FileSystemDirectoryHandle))) continue;
          await walk(child as FileSystemDirectoryHandle, `${path}${name}/`);
        } else entries.push({ path: path + name, data: await (child as FileSystemFileHandle).getFile() });
      }
    };
    const hasIndex = async (h: FileSystemDirectoryHandle) => { try { await h.getFileHandle('index.json'); return true; } catch { return false; } };
    await walk(dir, '');
    const p = await Project.fromEntries(entries, { kind: 'folder', label: `フォルダ「${dir.name}」`, dir });
    return p;
  }
  static async fromZip(blob: Blob, name: string) { return Project.fromEntries(await readZip(blob), { kind: 'zip', label: `zip「${name}」` }); }

  /** parse every pack's files into editable models */
  parse() {
    this.index = JSON.parse(this.files.get(`${ROOT}/index.json`)?.text ?? '{"packs":[]}');
    this.packs.clear();
    for (const id of this.index.packs) {
      const dir = `${ROOT}/${id}`;
      const manifest = JSON.parse(this.files.get(`${dir}/pack.json`)?.text ?? `{"id":"${id}","name":"${id}","version":"0.1.0","files":{}}`) as PackManifest;
      const pm: PackModel = { id, dir, manifest, lists: { cards: [], statuses: [], relics: [], enemies: [], encounters: [], characters: [] }, objs: {}, assets: null, layout: null, plugins: [] };
      const read = (f: string) => { const t = this.files.get(`${dir}/${f}`)?.text; return t === undefined ? undefined : JSON.parse(t); };
      for (const k of LIST_KINDS) for (const f of this.fileList(manifest, k)) pm.lists[k].push({ file: f, items: (read(f) ?? []) as Item[] });
      for (const k of OBJ_KINDS) { const f = this.fileList(manifest, k)[0]; if (f) pm.objs[k] = { file: f, data: read(f) ?? {} }; }
      if (manifest.assets) pm.assets = { file: manifest.assets, map: read(manifest.assets) ?? {} };
      if (manifest.layout) pm.layout = { file: manifest.layout, text: this.files.get(`${dir}/${manifest.layout}`)?.text ?? '' };
      for (const f of manifest.plugins ?? []) pm.plugins.push({ file: f, text: this.files.get(`${dir}/${f}`)?.text ?? '' });
      this.packs.set(id, pm);
    }
    this.active = this.index.packs.includes(this.active) ? this.active : this.index.packs[this.index.packs.length - 1] ?? '';
    // normalise formatting once, so "unsaved" only counts real edits (a file is rewritten only after it is edited)
    this.snap = new Map();
    this.serialize();
    this.snap = new Map([...this.files].filter(([, f]) => f.text !== undefined).map(([p, f]) => [p, f.text!]));
    this.dirty.clear(); this.deleted.clear();
  }
  private fileList(m: PackManifest, k: ContentKind): string[] { const f = m.files[k]; return f ? (Array.isArray(f) ? f : [f]) : []; }

  /* ----- models → files ----- */
  serialize() {
    const set = (path: string, text: string) => {
      const cur = this.files.get(path);
      if (cur?.text === text) return;
      this.files.set(path, { text });
      if (this.snap.get(path) !== text) this.dirty.add(path); else this.dirty.delete(path);
    };
    set(`${ROOT}/index.json`, formatJson(this.index));
    for (const pm of this.packs.values()) {
      set(`${pm.dir}/pack.json`, formatJson(pm.manifest));
      for (const k of LIST_KINDS) for (const f of pm.lists[k]) set(`${pm.dir}/${f.file}`, formatJson(f.items));
      for (const k of OBJ_KINDS) { const o = pm.objs[k]; if (o) set(`${pm.dir}/${o.file}`, formatJson(o.data)); }
      if (pm.assets) set(`${pm.dir}/${pm.assets.file}`, formatJson(pm.assets.map));
      if (pm.layout) set(`${pm.dir}/${pm.layout.file}`, pm.layout.text);
      for (const pl of pm.plugins) set(`${pm.dir}/${pl.file}`, pl.text);
    }
  }

  /* ----- change notification ----- */
  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { this.serialize(); this.listeners.forEach(f => f()); }
  get isDirty() { return this.dirty.size > 0 || this.deleted.size > 0; }

  /* ----- queries ----- */
  get pack(): PackModel { return this.packs.get(this.active)!; }
  /** items of a kind across packs: later packs override earlier ones with the same id */
  merged(kind: ListKind): { item: Item; pack: string }[] {
    const map = new Map<string, { item: Item; pack: string }>();
    for (const id of this.index.packs) for (const f of this.packs.get(id)!.lists[kind]) for (const it of f.items) map.set(it.id, { item: it, pack: id });
    return [...map.values()];
  }
  ids(kind: ListKind): string[] { return this.merged(kind).map(x => x.item.id); }
  find(kind: ListKind, id: string): { item: Item; pack: string } | undefined { return this.merged(kind).find(x => x.item.id === id); }
  /** merged object kinds (later packs deep-merged over earlier) — for reading */
  obj(kind: ObjKind): Record<string, unknown> {
    const merge = (a: unknown, b: unknown): unknown => (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k, k in (b as object) ? merge((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]) : (a as Record<string, unknown>)[k]])) : b ?? a;
    let out: unknown = {};
    for (const id of this.index.packs) { const o = this.packs.get(id)!.objs[kind]; if (o) out = merge(out, o.data); }
    return out as Record<string, unknown>;
  }
  /** the active pack's own object for a kind, created on first edit */
  ownObj(kind: ObjKind): Record<string, unknown> {
    const pm = this.pack;
    if (!pm.objs[kind]) {
      const file = kind === 'text' ? 'text.ja.json' : `${kind}.json`;
      pm.objs[kind] = { file, data: {} };
      pm.manifest.files[kind] = file;
    }
    return pm.objs[kind]!.data;
  }

  /* ----- list editing (always in the active pack) ----- */
  ownList(kind: ListKind): Item[] {
    const pm = this.pack;
    if (!pm.lists[kind].length) { const file = `${kind}.json`; pm.lists[kind].push({ file, items: [] }); pm.manifest.files[kind] = file; }
    return pm.lists[kind][0].items;
  }
  locate(kind: ListKind, id: string): { list: Item[]; index: number } | null {
    for (const f of this.pack.lists[kind]) { const i = f.items.findIndex(x => x.id === id); if (i >= 0) return { list: f.items, index: i }; }
    return null;
  }
  uniqueId(kind: ListKind, base: string): string { const ids = new Set(this.ids(kind)); let id = base, n = 2; while (ids.has(id)) id = `${base}_${n++}`; return id; }
  add(kind: ListKind, item: Item): Item { this.ownList(kind).push(item); this.changed(); return item; }
  remove(kind: ListKind, id: string) { const l = this.locate(kind, id); if (l) { l.list.splice(l.index, 1); this.changed(); } }
  /** copy an item from an earlier pack into the active one so it can be edited */
  override(kind: ListKind, id: string): Item | null {
    const f = this.find(kind, id); if (!f) return null;
    if (f.pack === this.active) return f.item;
    const copy = structuredClone(f.item); this.ownList(kind).push(copy); this.changed(); return copy;
  }
  /** rename an id and update references to it everywhere */
  rename(kind: ListKind, from: string, to: string): number {
    const keys: Record<ListKind, string[]> = { cards: ['card'], statuses: ['status'], relics: ['relic'], enemies: [], encounters: [], characters: [] };
    let n = 0;
    const walk = (v: unknown, parentKey = ''): unknown => {
      if (Array.isArray(v)) return v.map(x => {
        if (x === from && ((kind === 'cards' && parentKey === 'deck') || (kind === 'relics' && parentKey === 'relics') || (kind === 'enemies' && parentKey === 'enemies'))) { n++; return to; }
        return walk(x, parentKey);
      });
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        for (const k of Object.keys(o)) {
          if (keys[kind].includes(k) && o[k] === from) { o[k] = to; n++; }
          else if (kind === 'statuses' && k === 'statuses' && o[k] && typeof o[k] === 'object' && from in (o[k] as object)) { const m = o[k] as Record<string, unknown>; m[to] = m[from]; delete m[from]; n++; }
          else o[k] = walk(o[k], k);
        }
      }
      return v;
    };
    for (const pm of this.packs.values()) for (const k of LIST_KINDS) for (const f of pm.lists[k]) { for (const it of f.items) { if (k === kind && it.id === from) it.id = to; else walk(it); } }
    this.changed();
    return n;
  }

  /* ----- assets ----- */
  assetMap(): Map<string, { path: string; pack: string }> {
    const out = new Map<string, { path: string; pack: string }>();
    for (const id of this.index.packs) {
      const pm = this.packs.get(id)!; if (!pm.assets) continue;
      const base = pm.assets.file.includes('/') ? pm.assets.file.slice(0, pm.assets.file.lastIndexOf('/') + 1) : '';
      for (const [k, v] of Object.entries(pm.assets.map)) if (!k.startsWith('$')) out.set(k, { path: /^(https?:|data:)/.test(v) ? v : `${pm.dir}/${base}${v}`, pack: id });
    }
    return out;
  }
  urlOf(path: string): string | null {
    if (/^(https?:|data:)/.test(path)) return path;
    const f = this.files.get(path); if (!f?.blob) return null;
    if (!f.url) f.url = URL.createObjectURL(f.blob);
    return f.url;
  }
  assetUrl(key: string | undefined): string | null { if (!key) return null; const a = this.assetMap().get(key); return a ? this.urlOf(a.path) : null; }
  /** put a file into the active pack's assets folder and point `key` at it */
  setAsset(key: string, file: Blob, fileName: string, folder: string) {
    const pm = this.pack;
    if (!pm.assets) { pm.assets = { file: 'assets/manifest.json', map: {} }; pm.manifest.assets = pm.assets.file; }
    const base = pm.assets.file.includes('/') ? pm.assets.file.slice(0, pm.assets.file.lastIndexOf('/') + 1) : '';
    const safe = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    const rel = `${folder}/${safe}`;
    const path = `${pm.dir}/${base}${rel}`;
    const old = this.files.get(path); if (old?.url) URL.revokeObjectURL(old.url);
    this.files.set(path, { blob: new Blob([file], { type: file.type || mime(safe) }) });
    this.dirty.add(path); this.deleted.delete(path);
    pm.assets.map[key] = rel;
    this.changed();
  }
  removeAsset(key: string) {
    const pm = this.pack; if (!pm.assets || !(key in pm.assets.map)) return;
    const base = pm.assets.file.includes('/') ? pm.assets.file.slice(0, pm.assets.file.lastIndexOf('/') + 1) : '';
    const rel = pm.assets.map[key];
    delete pm.assets.map[key];
    if (!Object.values(pm.assets.map).includes(rel)) { const path = `${pm.dir}/${base}${rel}`; this.files.delete(path); this.deleted.add(path); this.dirty.delete(path); }
    this.changed();
  }

  /* ----- packs ----- */
  addPack(id: string, name: string) {
    const dir = `${ROOT}/${id}`;
    const manifest: PackManifest = { id, name, version: '0.1.0', files: {}, assets: 'assets/manifest.json' };
    this.packs.set(id, { id, dir, manifest, lists: { cards: [], statuses: [], relics: [], enemies: [], encounters: [], characters: [] }, objs: {}, assets: { file: 'assets/manifest.json', map: {} }, layout: null, plugins: [] });
    this.index.packs.push(id);
    this.active = id;
    this.changed();
  }

  /* ----- building a playable Content from the current state ----- */
  async buildContent(): Promise<Content> {
    this.serialize();
    const c = await loadContent(ROOT, async p => { const f = this.files.get(p); if (f?.text === undefined) throw new Error(`${p} がありません`); return f.text; });
    for (const [k, path] of c.assets) { const u = this.urlOf(path); if (u) c.assets.set(k, u); }
    return c;
  }
  /** files for the play-test iframe: text by path and object URLs for binaries */
  playPayload(): { files: Record<string, string>; urls: Record<string, string> } {
    this.serialize();
    const files: Record<string, string> = {}, urls: Record<string, string> = {};
    for (const [p, f] of this.files) { if (f.text !== undefined) files[p] = f.text; else { const u = this.urlOf(p); if (u) urls[p] = u; } }
    return { files, urls };
  }

  /* ----- saving ----- */
  async saveToFolder(dir?: FileSystemDirectoryHandle): Promise<number> {
    this.serialize();
    const root = dir ?? this.source.dir;
    if (!root) throw new Error('保存先のフォルダがありません');
    // write under <root>/public/packs when the repo root was chosen
    let base: FileSystemDirectoryHandle = root;
    const tryDir = async (h: FileSystemDirectoryHandle, name: string) => { try { return await h.getDirectoryHandle(name); } catch { return null; } };
    const pub = await tryDir(root, 'public');
    const packsInPub = pub && await tryDir(pub, 'packs');
    if (packsInPub) base = packsInPub;
    else if (await tryDir(root, 'packs')) base = (await tryDir(root, 'packs'))!;
    else { try { await root.getFileHandle('index.json'); } catch { base = await root.getDirectoryHandle('packs', { create: true }); } }
    const writeAll = !dir || dir !== this.source.dir;
    const paths = writeAll ? [...this.files.keys()] : [...this.dirty];
    let n = 0;
    for (const path of paths) {
      const f = this.files.get(path); if (!f) continue;
      const parts = path.split('/').slice(1); // drop "packs"
      let h = base;
      for (const d of parts.slice(0, -1)) h = await h.getDirectoryHandle(d, { create: true });
      const fh = await h.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await (fh as unknown as { createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }> }).createWritable();
      await w.write(f.text ?? f.blob!); await w.close(); n++;
    }
    for (const path of this.deleted) {
      const parts = path.split('/').slice(1); let h: FileSystemDirectoryHandle | null = base;
      for (const d of parts.slice(0, -1)) { h = h ? await tryDir(h, d) : null; }
      try { await h?.removeEntry(parts[parts.length - 1]); } catch { /* already gone */ }
    }
    this.source = { kind: 'folder', label: `フォルダ「${root.name}」`, dir: root };
    this.snap = new Map([...this.files].filter(([, f]) => f.text !== undefined).map(([p, f]) => [p, f.text!]));
    this.dirty.clear(); this.deleted.clear();
    this.listeners.forEach(f => f());
    return n;
  }
  async toZip(): Promise<Blob> {
    this.serialize();
    return makeZip([...this.files].map(([p, f]) => ({ path: p, data: f.text ?? f.blob! })));
  }
}
