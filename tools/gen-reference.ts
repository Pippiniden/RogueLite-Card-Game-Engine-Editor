/* npm run docs → docs/reference.md
   The data reference is generated from the same registries the engine and the editor use,
   so it always lists exactly what the code accepts. */
import { writeFileSync } from 'node:fs';
import { EFFECTS, EFFECT_GROUPS, TARGET_LABELS } from '../src/engine/effects.ts';
import { EVENTS, BY, FLAGS, STATS, MOD_OPS, STACKING, DECAY, KEYWORDS, CARD_TARGETS, INTENTS, FX_KINDS, SE_MOMENTS, BGM_SLOTS, VAR_HELP, type Opt } from '../src/editor/labels.ts';
import { WIDGET_INFO, ACTION_INFO, SKIN_PARTS, SCREEN_IDS } from '../src/game/registry-names.ts';
import { loadNodeContent } from './node-content.ts';

const { content } = await loadNodeContent();
const out: string[] = [];
const p = (...l: string[]) => out.push(...l);
const cell = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const optTable = (title: string, opts: Opt[], head = ['値', '意味']) => {
  p(`### ${title}`, '', `| ${head[0]} | ${head[1]} |`, '| --- | --- |', ...opts.map(([k, v]) => `| \`${k || '（空）'}\` | ${cell(v)} |`), '');
};

p('# データリファレンス', '',
  '> このファイルは `npm run docs`（tools/gen-reference.ts）が**コードの登録表から自動生成**しています。手で編集しないでください。', '',
  'エディターのフォームに出る項目はすべてここにある名前の JSON として保存されます。', '');

/* ----- effects ----- */
p('## 効果（effects）', '',
  'カードの `effects`、敵の行動、状態・レリックの `triggers[].effects` に並べる部品です。', '',
  '```json', '{ "op": "damage", "amount": 6, "times": 2, "to": "target" }', '```', '',
  '- 数値の項目（num）には数値のほか**式**も書けます（例 `"X"`、`"self.block"`、`"stacks * 2"`）。', '- `to` を省くと各効果の既定の受け手になります。', '');
const byGroup = new Map<string, [string, typeof EFFECTS[string]][]>();
for (const [op, d] of Object.entries(EFFECTS)) { const g = d.group; if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g)!.push([op, d]); }
for (const [g, list] of byGroup) {
  p(`### ${EFFECT_GROUPS[g as keyof typeof EFFECT_GROUPS] ?? g}`, '');
  for (const [op, d] of list) {
    const def = typeof d.defaultTo === 'function' ? '（内容による）' : d.defaultTo ? `\`${d.defaultTo}\`` : 'なし';
    p(`#### \`${op}\` — ${d.label}`, '', `既定の受け手: ${def}`, '');
    const ps = Object.entries(d.params);
    if (ps.length) {
      p('| 項目 | 型 | 既定 | 説明 |', '| --- | --- | --- | --- |');
      for (const [k, s] of ps) {
        const opts = s.options ? ' ' + s.options.map(([v, l]) => `\`${v || '""'}\`=${l}`).join(' / ') : '';
        p(`| \`${k}\`${s.required ? ' *' : ''} | ${s.type} | ${s.default === undefined ? '' : `\`${JSON.stringify(s.default)}\``} | ${cell(s.label + (s.help ? `（${s.help}）` : '') + opts)} |`);
      }
      p('');
    }
  }
}
p('`*` は必須。型の意味: num=数値か式 / int=整数 / bool=真偽 / string=文字 / cond=条件式 / enum=選択肢 / status=状態ID / card=カードID / cardOrSelf=カードIDか `$self` / target=受け手 / effects=効果の入れ子', '');
optTable('受け手（to）', Object.entries(TARGET_LABELS) as Opt[]);

/* ----- triggers & modifiers ----- */
p('## トリガー（triggers）', '', '状態・レリック・カード（手札にある間 `handTriggers`）に付けます。', '',
  '```json', '{ "on": "attacked", "by": "self", "when": "amount > 0", "if": { "cardType": "attack" }, "effects": [ { "op": "damage", "amount": "stacks", "kind": "raw", "to": "target" } ] }', '```', '',
  '- `when`: 条件式（成り立つ時だけ）。`if`: `cardType` / `cardTypeNot` / `every`（N回に1回）/ `turn`（Nターン目）', '- 状態のトリガーでは `stacks` が自分の量、`"status": "$self"` が自分の状態IDを指します。', '');
optTable('いつ（on）', EVENTS);
optTable('誰に起きた時（by）', BY);
p('## 数値補正（modifiers）', '', '```json', '{ "stat": "attackDealt", "op": "mul", "value": 0.75, "when": "" }', '```', '');
optTable('補正する数値（stat）', STATS);
optTable('演算（op）', MOD_OPS);
optTable('状態の旗（flags）', FLAGS);
optTable('重なり方（stacking）', STACKING);
optTable('減り方（decay）', DECAY);

/* ----- vars ----- */
p('## 式で使える変数', '', '```', VAR_HELP, '```', '');

/* ----- cards etc ----- */
optTable('カードのキーワード（keywords）', KEYWORDS);
optTable('カードの対象（target）', CARD_TARGETS);
optTable('敵の予告（intent）', INTENTS);

/* ----- statuses in the base pack ----- */
p('## 基本パックの状態', '', '| ID | 名前 | 種類 | 説明 |', '| --- | --- | --- | --- |');
for (const s of content.statuses.values()) p(`| \`${s.id}\` | ${cell(s.name)} | ${s.kind === 'debuff' ? '弱体' : '強化'} | ${cell(s.desc)} |`);
p('');

/* ----- screens ----- */
p('## 画面・部品・アクション', '', `画面ID: ${SCREEN_IDS.map(s => `\`${s}\``).join(' ')}`, '');
optTable('部品（bind）', Object.entries(WIDGET_INFO) as Opt[], ['bind', '中身']);
optTable('アクション（on="tap: …"）', Object.entries(ACTION_INFO).map(([k, v]) => [k, typeof v === 'string' ? v : (v as { desc?: string }).desc ?? JSON.stringify(v)]) as Opt[], ['アクション', '働き']);
optTable('UIスキンの部品（skin）', Object.entries(SKIN_PARTS) as Opt[], ['部品名', '場所']);
optTable('演出の種類（vfx.json の fx）', FX_KINDS);
optTable('効果音の場面（audio.json → se）', SE_MOMENTS);
optTable('音楽の場面（audio.json → bgm）', BGM_SLOTS);

writeFileSync(new URL('../docs/reference.md', import.meta.url), out.join('\n'));
console.log(`docs/reference.md: ${Object.keys(EFFECTS).length} effects, ${content.statuses.size} statuses`);
