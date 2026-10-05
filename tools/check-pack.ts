/* npm run check — broken references, bad expressions, missing files and layout problems in the packs.
   The editor's 検証 panel runs the same checks (src/engine/validate.ts). */
import { existsSync } from 'node:fs';
import { loadNodeContent } from './node-content.ts';
import { validateContent } from '../src/engine/validate.ts';

const { content: c, plugins } = await loadNodeContent();
const issues = validateContent(c);
for (const p of plugins) {
  if (!p.ok) issues.push({ sev: 'error', kind: 'plugins', id: p.path, msg: `読み込めません: ${p.error}` });
}
for (const [k, url] of c.assets) {
  if (!/^(https?:|data:|blob:)/.test(url) && !existsSync(url)) issues.push({ sev: 'error', kind: 'assets', id: k, msg: `ファイル ${url.replace(/^.*\/public\//, 'public/')} がありません` });
}

const added = plugins.flatMap(p => p.added);
console.log(`パック: ${c.packs.map(p => p.id).join(', ')} — カード${c.cards.size} 敵${c.enemies.size} 遭遇${c.encounters.size} レリック${c.relics.size} 状態${c.statuses.size} 主人公${c.characters.size} 素材${c.assets.size}${added.length ? ` · プラグイン効果 ${added.join(', ')}` : ''}`);
for (const i of issues.filter(x => x.sev === 'warn')) console.log(`  警告 [${i.kind} ${i.id}] ${i.msg}`);
const errors = issues.filter(x => x.sev === 'error');
for (const i of errors) console.log(`  エラー [${i.kind} ${i.id}] ${i.msg}`);
console.log(errors.length ? `エラー ${errors.length} 件` : 'エラーはありません');
process.exit(errors.length ? 1 : 0);
