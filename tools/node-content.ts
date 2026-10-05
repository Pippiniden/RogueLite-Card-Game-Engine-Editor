import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadContent } from '../src/engine/content.ts';
import { loadPlugins } from '../src/engine/plugins.ts';

export const PACK_ROOT = fileURLToPath(new URL('../public/packs', import.meta.url));

/** load the packs from disk, plugins included (so check / sim know plugin effects) */
export async function loadNodeContent() {
  const c = await loadContent(PACK_ROOT, p => readFile(p, 'utf8'));
  const plugins = await loadPlugins(c, p => import(pathToFileURL(p).href));
  return { content: c, plugins };
}
