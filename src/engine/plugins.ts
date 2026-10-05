import { EFFECTS, registerEffect, type EffectOp, type ParamSpec, type EffectCtx, type ChoiceReq } from './effects.ts';
import { evalNum, evalCond } from './expr.ts';
import type { Content } from './content.ts';

/* ===== Plugins =====
   A pack lists JavaScript modules in pack.json → "plugins". Each module default-exports a function
   that receives this API and registers what it adds. See docs/plugins.md.

     export default function (api) {
       api.registerEffect('lifesteal', { label: '吸収攻撃', params: {...}, defaultTo: 'target', run(cb, ctx, e, who) {...} });
     }
*/

export const PLUGIN_API_VERSION = 1;

export interface PluginApi {
  version: number;
  content: Content;
  registerEffect(op: string, def: Omit<EffectOp, 'group'> & { group?: EffectOp['group'] }): void;
  /** browser only — undefined when running the checker / simulator in Node */
  registerFx?: (name: string, fn: (el: HTMLElement, step: Record<string, unknown>, stage: HTMLElement) => Animation | void) => void;
  registerWidget?: (bind: string, widget: unknown) => void;
  registerAction?: (name: string, fn: unknown) => void;
  evalNum: typeof evalNum;
  evalCond: typeof evalCond;
  effects: typeof EFFECTS;
  log(...a: unknown[]): void;
}
export type { EffectOp, ParamSpec, EffectCtx, ChoiceReq };

export interface PluginResult { path: string; ok: boolean; error?: string; added: string[] }

/** import every plugin of the content; `importer` turns a pack path into a module (fetch/import in the browser, file URL in Node) */
export async function loadPlugins(content: Content, importer: (path: string) => Promise<{ default?: unknown }>, extra: Partial<PluginApi> = {}): Promise<PluginResult[]> {
  const out: PluginResult[] = [];
  for (const path of content.plugins) {
    const before = new Set(Object.keys(EFFECTS));
    try {
      const mod = await importer(path);
      const fn = mod.default;
      if (typeof fn !== 'function') throw new Error('default export が関数ではありません');
      const api: PluginApi = {
        version: PLUGIN_API_VERSION, content, evalNum, evalCond, effects: EFFECTS,
        registerEffect: (op, def) => registerEffect(op, { ...def, group: def.group ?? 'plugin' }),
        log: (...a) => console.log(`[plugin ${path}]`, ...a),
        ...extra,
      };
      await fn(api);
      out.push({ path, ok: true, added: Object.keys(EFFECTS).filter(k => !before.has(k)) });
    } catch (e) {
      out.push({ path, ok: false, error: (e as Error).message, added: [] });
    }
  }
  return out;
}
