/* Types for the parser copied from the layout tool (qlayout-core.js). Kept loose on purpose:
   the JS is the source of truth and is replaced as a whole when the tool's parser changes. */
export interface QLEl { uid: string; id: string; type: string; x: number; y: number; w: number; h: number; label: string; attrs: Record<string, string> }
export interface QLScreen { id: string; w: number; h: number; title: string; notes: string[]; els: QLEl[] }
export interface QLProject { name: string; size: { w: number; h: number } | null; safe: { t: number; r: number; b: number; l: number }; url: string; context: string; states: { id: string; desc: string }[]; types: { key: string; cat: string; name: string }[]; attrs: { key: string; desc: string }[] }
export type QLItem = { kind: 'screen'; s: QLScreen; ln: number } | { kind: 'patch'; id: string; ops: unknown[]; ln: number } | { kind: 'drop'; id: string; ln: number };
export interface QLLayoutAttr { ok: boolean; dir: 'row' | 'column' | 'grid'; gap: number; cols: number; align: string; justify: string }
export function parseDoc(text: string): { project: QLProject | null; items: QLItem[]; errors: string[]; header: string | null };
export function applyDoc(state: unknown, parsed: unknown): unknown;
export function serializeScreen(s: QLScreen): string;
export function serializeProject(p: QLProject): string;
export function exportText(list: QLScreen[], project: QLProject | null): string;
export function lintScreen(s: QLScreen, screens: QLScreen[], project: QLProject | null): { sev: 'err' | 'warn' | 'info'; uid: string | null; id: string | null; msg: string }[];
export function buildTree(els: QLEl[]): { roots: QLEl[]; kids: Map<string, QLEl[]>; parent: Map<string, string | null> };
export function dfs(els: QLEl[]): { e: QLEl; d: number }[];
export function onTargets(on: string): string[];
export function parseAnchor(v: string | undefined): { x: string; y: string; ok: boolean };
export function parseLayout(v: string | undefined): QLLayoutAttr | null;
export function defaultProject(): QLProject;
