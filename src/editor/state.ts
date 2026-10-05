import type { Content } from '../engine/content.ts';
import { loadPlugins, type PluginResult } from '../engine/plugins.ts';
import { validateContent, type Issue } from '../engine/validate.ts';
import type { Project } from './project.ts';
import { debounce } from './ui.ts';

/* Shared editor state: the project, the Content built from it (for previews, checks and effect lists),
   plugin results, issues and simple undo history. */

export interface Ed {
  project: Project;
  content: Content | null;
  plugins: PluginResult[];
  issues: Issue[];
  section: string;
  selected: string | null;
}
export const ed: Ed = { project: null as unknown as Project, content: null, plugins: [], issues: [], section: 'cards', selected: null };

const contentListeners = new Set<() => void>();
export const onContent = (fn: () => void) => { contentListeners.add(fn); return () => contentListeners.delete(fn); };

let pluginSig = '';
export async function rebuild() {
  try {
    const c = await ed.project.buildContent();
    // (re)load plugins when their code changed so their effects appear in the menus
    const sig = c.plugins.map(p => p + ':' + (ed.project.files.get(p)?.text?.length ?? 0) + ':' + (ed.project.files.get(p)?.text ?? '').slice(0, 64)).join('|');
    if (sig !== pluginSig) {
      pluginSig = sig;
      ed.plugins = await loadPlugins(c, async path => {
        const text = ed.project.files.get(path)?.text ?? '';
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try { return await import(/* @vite-ignore */ url); } finally { URL.revokeObjectURL(url); }
      });
    }
    ed.content = c;
    ed.issues = validateContent(c);
    for (const p of ed.plugins) if (!p.ok) ed.issues.unshift({ sev: 'error', kind: 'plugins', id: p.path, msg: `読み込めません: ${p.error}` });
  } catch (e) {
    ed.issues = [{ sev: 'error', kind: 'project', id: '-', msg: (e as Error).message }];
  }
  contentListeners.forEach(f => f());
}
export const rebuildSoon = debounce(() => { void rebuild(); }, 250);

/* ----- undo: snapshots of every text file ----- */
const past: Map<string, string>[] = [];
const future: Map<string, string>[] = [];
let lastSnap = '';
function snapshot(): Map<string, string> { const m = new Map<string, string>(); for (const [p, f] of ed.project.files) if (f.text !== undefined) m.set(p, f.text); return m; }
export const recordUndo = debounce(() => {
  const s = snapshot(); const sig = [...s.values()].join('\u0000');
  if (sig === lastSnap) return;
  if (lastSnap) { past.push(prevSnap); if (past.length > 60) past.shift(); future.length = 0; }
  prevSnap = s; lastSnap = sig;
}, 500);
let prevSnap = new Map<string, string>();
export function resetUndo() { past.length = 0; future.length = 0; prevSnap = snapshot(); lastSnap = [...prevSnap.values()].join('\u0000'); }
function restore(m: Map<string, string>) {
  for (const [p, t] of m) ed.project.files.set(p, { text: t });
  const keepActive = ed.project.active;
  const dirty = new Set(ed.project.dirty);
  ed.project.parse();
  ed.project.active = ed.project.packs.has(keepActive) ? keepActive : ed.project.active;
  for (const d of dirty) ed.project.dirty.add(d);
  ed.project.changed();
}
export function undo() { const s = past.pop(); if (!s) return false; future.push(prevSnap); prevSnap = s; lastSnap = [...s.values()].join('\u0000'); restore(s); return true; }
export function redo() { const s = future.pop(); if (!s) return false; past.push(prevSnap); prevSnap = s; lastSnap = [...s.values()].join('\u0000'); restore(s); return true; }

/** call after any edit */
export function touched() { ed.project.changed(); recordUndo(); rebuildSoon(); }
