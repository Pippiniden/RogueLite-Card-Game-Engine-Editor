/* npm run docs → docs/reference.md
   The data reference is generated from the same registries the engine and the editor use,
   so it always lists exactly what the code accepts. */
import { writeFileSync } from 'node:fs';
import { EFFECTS, EFFECT_GROUPS, TARGET_LABELS } from '../src/engine/effects.ts';
import { RUN_EFFECTS, RUN_GROUPS } from '../src/engine/run-effects.ts';
import { CSS_RULES, CSS_PARTS } from '../src/engine/css-guide.ts';
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
type OpLike = { label: string; group: string; params: Record<string, { type: string; label: string; required?: boolean; default?: unknown; help?: string; options?: [string, string][] }>; defaultTo?: unknown };
const opTables = (reg: Record<string, OpLike>, groups: Record<string, string>, withTo: boolean) => {
  const byGroup = new Map<string, [string, OpLike][]>();
  for (const [op, d] of Object.entries(reg)) { if (!byGroup.has(d.group)) byGroup.set(d.group, []); byGroup.get(d.group)!.push([op, d]); }
  for (const [g, list] of byGroup) {
    p(`### ${groups[g] ?? g}`, '');
    for (const [op, d] of list) {
      p(`#### \`${op}\` — ${d.label}`, '');
      if (withTo) { const def = typeof d.defaultTo === 'function' ? '（内容による）' : d.defaultTo ? `\`${d.defaultTo}\`` : 'なし'; p(`既定の受け手: ${def}`, ''); }
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
};
opTables(EFFECTS, EFFECT_GROUPS, true);
p('`*` は必須。型の意味: num=数値か式 / int=整数 / bool=真偽 / string=文字 / cond=条件式 / enum=選択肢 / status=状態ID / card=カードID / cardOrSelf=カードIDか `$self` / target=受け手 / relic=レリックID / encounter=遭遇ID / page=イベントのページ / effects=効果の入れ子', '');
optTable('受け手（to）', Object.entries(TARGET_LABELS) as Opt[]);

/* ----- run effects ----- */
p('## 冒険の効果（イベント・レリックを拾った時）', '',
  'イベントの選択肢の `effects` と、レリックの `onPickup` に並べる部品です。戦闘の外で、デッキ・HP・ゴールド・レリックを変えます。', '',
  '```json', '{ "label": "{bet}ゴールド賭ける", "enableIf": "gold >= bet", "effects": [', '  { "op": "loseGold", "amount": "bet" },', '  { "op": "chance", "percent": 45, "then": [{ "op": "gainGold", "amount": "prize" }, { "op": "goto", "page": "win" }], "else": [{ "op": "goto", "page": "lose" }] }', '] }', '```', '',
  '- 式で使える変数: `gold` `hp` `maxHp` `hpPct` `floor`（今の階、1始まり）`deck` `deck.<種類>` `deck.upgradable` `relics` `relic.<ID>`（持っていれば1）`removals`（ショップで削除した回数）と、イベントの `vars`。',
  '- カードを選ばせる効果（取り除く・強化・変化・複製・見せて選ばせる）は画面で選ぶまで待ち、残りの効果はそのあとに続きます。', '');
opTables(RUN_EFFECTS as unknown as Record<string, OpLike>, RUN_GROUPS, false);

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

/* ----- docs/css-guide.md ----- */
const g: string[] = [];
const q = (...l: string[]) => g.push(...l);
q('# CSS ガイド（パックの追加CSS）', '',
  '> このファイルは `npm run docs` が src/engine/css-guide.ts から**自動生成**しています。ルールと部品の一覧は、エディターの「CSS」画面と、書き出した .css ファイルの冒頭にも同じものが入ります。', '',
  '## しくみ', '',
  '- パックの `pack.json` に `"styles": ["styles/custom.css"]` と書くと、そのCSSがゲームの組み込みのCSSの**後に**読まれます。後に読むパックのCSSほど強くなります。',
  '- 色とフォントは theme.json（エディターの「見た目・UIスキン」）、窓枠・ボタン・カード枠を画像にするのは theme.json の `skins`（[asset-spec.md](asset-spec.md#3-uiスキン窓枠ボタンなど)）。CSS はそれ以外の見た目を変えるためのものです。',
  '- 色の変数を CSS で上書きする時は `:root` ではなく `#stage` に書きます（theme.json の色は `<html>` に直接入るので、`:root` より強い）。',
  '- 画面ごとに変えたい時は `[data-screen="BATTLE"] …` のように画面IDで絞ります。', '',
  '## 画面の作り', '',
  '```html',
  '<div id="stage">                       <!-- 390×844 の画面。スマホに合わせて縮む -->',
  '  <div class="q-host">',
  '    <div class="q-screen" data-screen="BATTLE">',
  '      <!-- 画面配置の要素: 種類が t-◯◯、IDが data-qid、部品名が data-bind -->',
  '      <button class="q t-button sk-button" data-qid="E4" data-bind="battle.endTurn">ターン終了</button>',
  '      <div class="q t-canvas" data-qid="F" data-bind="hand"> <div class="card ct-attack cr-common in-hand">…</div> </div>',
  '```', '',
  '位置と大きさ（left / top / width / height）は画面配置ツールの座標がそのまま入ります。CSS で変えるのは見た目だけです。', '',
  '## 守るルール', '',
  'エディターの「CSS」と `npm run check` が確かめます。「必ず」はエラー、「なるべく」は注意として出ます。', '');
for (const r of CSS_RULES) q(`### ${r.sev === 'error' ? '必ず' : 'なるべく'}: ${r.title}`, '', r.text, '');
q('## 部品の一覧', '');
let grp = '';
for (const p of CSS_PARTS) {
  if (p.group !== grp) { grp = p.group; q(`### ${grp}`, ''); }
  q(`#### ${p.title}`, '', `\`${p.selector}\``, '', p.desc, '', '```css', `${p.selector} {`, ...p.example.map(x => '  ' + x), '}', '```', '');
}
q('## LLM に頼む時', '',
  '1. エディターの「CSS」→「LLM への依頼文をコピー」で、どう変えたいかを書いてコピーする（ルール・部品の説明・今のCSSが入る）',
  '2. Claude などに貼り、返ってきたCSSをファイルに保存する',
  '3. 「読み込む…」で戻す。ルールに反する所は一覧に出るので、その行を直すか、もう一度頼む', '',
  '書き出した .css ファイルの冒頭にもルールが入っているので、ファイルをそのまま渡しても同じように守ってもらえます。');
writeFileSync(new URL('../docs/css-guide.md', import.meta.url), g.join('\n'));
console.log(`docs/css-guide.md: ${CSS_RULES.length} rules, ${CSS_PARTS.length} parts`);
