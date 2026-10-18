/* ===== Pack CSS: rules, documented parts, and a linter =====
   A pack may add stylesheets (pack.json → "styles"). They load after the built-in CSS.
   The same rules are written into every exported .css file (so a person or an LLM editing it
   sees them), checked by the editor's CSS panel and by `npm run check`, and listed in
   docs/css-guide.md (npm run docs). */

export interface CssRule { id: string; sev: 'error' | 'warn'; title: string; text: string }

export const CSS_RULES: CssRule[] = [
  { id: 'layout', sev: 'error', title: '位置と大きさは画面配置で決める',
    text: '画面配置の要素（.q、.t-*、[data-qid]、[data-bind]）に position・left・top・right・bottom・inset・width・height を書かない。位置と大きさは画面配置ツールの座標がそのまま使われる。中の部品（例: [data-bind="hand"] .card）は変えてよい。' },
  { id: 'stage', sev: 'error', title: '画面の土台に触らない',
    text: 'html・body・#stage・.q-host・.q-screen には CSS変数（--で始まる名前）と background だけを書く。スマホの画面に合わせて縮める仕組みが壊れる。' },
  { id: 'external', sev: 'error', title: '外のファイルを読まない',
    text: '@import と、http(s):// や // で始まる url() を使わない（GitHub Pages・オフライン・プライバシーのため）。画像は素材（assets/manifest.json）と theme.json の skins で使う。data: の url() はよい。' },
  { id: 'syntax', sev: 'error', title: '括弧を閉じる',
    text: '{ } と ( ) と引用符はかならず閉じる。閉じていないと、それ以降の CSS がすべて効かなくなる。' },
  { id: 'hide', sev: 'warn', title: '要素を消さない',
    text: '画面配置の要素に display:none・visibility:hidden・opacity:0 を書かない。出す・出さないは画面配置の show（表示条件）で決まる。消すとボタンが押せなくなる。' },
  { id: 'transform', sev: 'warn', title: '要素を動かさない',
    text: '画面配置の要素に transform・translate・scale・rotate・margin を書かない（:active の押し込みは例外）。タップできる場所と見た目がずれる。' },
  { id: 'important', sev: 'warn', title: '!important を使わない',
    text: '!important は、重ね表示を隠す [hidden] や「動きを減らす」設定などの組み込みのルールを上書きしてしまう。詳しいセレクター（[data-screen="BATTLE"] …）で勝つ。' },
  { id: 'pointer', sev: 'warn', title: '押せるものを押せなくしない',
    text: 'ボタン・カード・マップのノード・選択肢・ポーションに pointer-events:none を書かない。' },
  { id: 'font', sev: 'warn', title: '小さすぎる文字にしない',
    text: 'font-size は 11px 以上（スマホで読める大きさ）。' },
  { id: 'broad', sev: 'warn', title: '広すぎるセレクターを使わない',
    text: '* や button・div・img などタグ名だけのセレクターは、すべての画面と組み込みの部品に効いてしまう。クラスか [data-bind] で絞る。' },
  { id: 'zindex', sev: 'warn', title: '重なり順を上げすぎない',
    text: 'z-index は 100 以下。重ね表示は 40、知らせの帯は 45、演出の文字は 80〜90。それより上にすると演出やダイアログが隠れる。' },
];

/* ----- documented parts ----- */
export interface CssPart { group: string; title: string; selector: string; desc: string; example: string[] }

export const CSS_PARTS: CssPart[] = [
  { group: '色と文字', title: '色とフォントの変数', selector: '#stage',
    desc: '色とフォントは theme.json（エディターの「見た目・UIスキン」）で決めるのが基本。CSS で上書きする時は :root ではなく #stage に書く（:root より theme.json の方が強いため）。--c-bg 背景 / --c-ink 文字 / --c-muted 弱い文字 / --c-parchment 羊皮紙色 / --c-ember 差し色 / --c-hp HP / --c-block ブロック / --c-energy エネルギー / --f-display 見出しの書体 / --f-body 本文の書体',
    example: ['--c-ember: #e8913a;', '--c-parchment: #e9dcbf;', '--f-display: "Shippori Mincho", serif;'] },
  { group: '画面', title: '画面の背景', selector: '[data-screen="MAP"]',
    desc: '画面ごとの背景。画面IDは TITLE CHARSELECT MAP BATTLE REWARD REST SHOP EVENT RESULT。絵の背景は theme.json の backgrounds か幕の backgrounds で指定する（ここでは色やグラデーション）。',
    example: ['background: linear-gradient(#161922, #0c0d12);'] },
  { group: '画面', title: '上部バー', selector: '[data-qid="A"].t-frame',
    desc: '顔・HP・階層・所持金の帯。画像にしたい時は theme.json の skins の topbar を使う。',
    example: ['background: linear-gradient(rgba(10,11,15,.9), rgba(10,11,15,.55));', 'border-bottom: 1px solid #2b2f3a;'] },
  { group: 'ボタン', title: 'ボタン全般', selector: '.t-button',
    desc: '画面配置の button すべて。押した時は :active、押せない時は :disabled。押せる広さは画面配置で決まるので、ここで変えるのは色・枠・文字だけ。',
    example: ['border-radius: 10px;', 'border: 1px solid #5a4a36;', 'background: linear-gradient(#3a3226, #2a241c);', 'color: var(--c-parchment);', 'font-size: 16px;'] },
  { group: 'ボタン', title: '押せないボタン', selector: '.t-button:disabled',
    desc: 'お金が足りない・選べない時など。薄くするのが基本（消さない）。',
    example: ['opacity: .4;'] },
  { group: 'ボタン', title: 'ターン終了ボタン', selector: '[data-bind="battle.endTurn"]',
    desc: '戦闘で一番よく押すボタン。目立つ色にしておく。',
    example: ['background: linear-gradient(#b8642a, var(--c-emberDeep));', 'border-color: #e8a060;', 'color: #fff4e2;'] },
  { group: '文字', title: '見出し（報酬・焚き火・結果）', selector: '[data-bind="reward.title"], [data-bind="rest.title"], [data-bind="result.title"]',
    desc: '大きな見出し。長い見出し（幕の突破など）は .long が付いて小さくなる。',
    example: ['font-family: var(--f-display);', 'font-size: 30px;', 'letter-spacing: .2em;', 'color: var(--c-parchment);'] },
  { group: '文字', title: '知らせの帯', selector: '[data-bind="battle.banner"]',
    desc: '「敵のターン」「〇〇を手に入れた」「第二幕」などを短く出す帯。',
    example: ['font-size: 24px;', 'background: linear-gradient(90deg, transparent, rgba(10,11,15,.88) 20%, rgba(10,11,15,.88) 80%, transparent);'] },
  { group: 'ゲージ', title: 'HPゲージの溝と中身', selector: '.gauge-bar, .gauge-bar i',
    desc: '.gauge-bar が溝、中の i が減っていく中身。ブロックがある時は .has-block が付く。',
    example: ['/* .gauge-bar */ border-radius: 6px;', '/* .gauge-bar i */ background: linear-gradient(#e0574c, var(--c-hp) 60%, #8e2a24);'] },
  { group: 'ゲージ', title: 'エネルギーの玉', selector: '.energy',
    desc: '中の b が残り、small が最大値。使い切ると .empty が付く。',
    example: ['background: radial-gradient(circle at 40% 35%, #ffe7a6, var(--c-energy) 45%, #8a5a14 100%);', 'color: #2a1a06;'] },
  { group: 'カード', title: 'カードの外枠', selector: '.card',
    desc: 'カードの一番外側。種類で .ct-attack .ct-skill .ct-power .ct-status .ct-curse、レアリティで .cr-common .cr-uncommon .cr-rare、強化済みで .up が付く。大きさは置き場所（手札・一覧）が決めるので、幅や高さは書かない。',
    example: ['border-radius: 9px;', 'box-shadow: 0 0 0 1px #000, 0 6px 14px rgba(0,0,0,.5);'] },
  { group: 'カード', title: 'カードの名前の帯', selector: '.card-name',
    desc: '名前の帯。文字の大きさはカードの幅に対する割合（cqw）で書くと、どの大きさのカードでも同じ見た目になる。',
    example: ['font-family: var(--f-display);', 'font-size: 13cqw;', 'background: linear-gradient(#f3ead6, #ddcca8);'] },
  { group: 'カード', title: 'カードの絵', selector: '.card-art',
    desc: '16:9 の絵の枠。中の img は object-fit: cover で切り抜かれる。',
    example: ['background: #2a2622;'] },
  { group: 'カード', title: 'カードの説明文', selector: '.card-text',
    desc: '効果の文。数字は b.p-num、筋力などで増えた数字は b.p-up、減った数字は b.p-down、キーワードは b.p-kw。',
    example: ['font-size: 9.6cqw;', 'line-height: 1.25;'] },
  { group: 'カード', title: 'コストの玉', selector: '.card-cost',
    desc: '左上のコスト。今だけ変わっている時は .changed が付く。画像にしたい時は skins の card.cost。',
    example: ['background: radial-gradient(circle at 40% 35%, #ffe7a6, var(--c-energy) 50%, #8a5a14);', 'color: #2a1a06;'] },
  { group: 'カード', title: '手札のカード', selector: '[data-bind="hand"] .card',
    desc: '手札。扇形の位置は --x --y --r で毎回計算されるので transform は書かない。選んだカードは .selected、使えないカードは .cant。',
    example: ['/* .selected */ filter: drop-shadow(0 0 10px rgba(232,145,58,.8));'] },
  { group: '戦闘', title: '敵', selector: '.enemy',
    desc: '敵1体。中に .enemy-intent（頭上の予告）、.enemy-body（絵）、.enemy-hp（HPゲージ）、.enemy-st（状態）。倒れると .dead。位置は陣形（ルール）で決まる。',
    example: ['/* .enemy-intent b */ color: #ffe6d0;', '/* .enemy-body img */ filter: drop-shadow(0 6px 10px rgba(0,0,0,.5));'] },
  { group: '戦闘', title: '状態アイコン', selector: '.st',
    desc: '筋力・脆弱などのアイコン。数字は中の b。弱体は .st-debuff。',
    example: ['/* .st b */ background: #0b0c11;'] },
  { group: 'マップ', title: 'マップのノード', selector: '.map-node',
    desc: '丸いノード。種類で .n-battle .n-elite .n-rest .n-treasure .n-shop .n-event .n-boss、進める所は .reach、通った所は .visited、今いる所は .current。',
    example: ['border: 2px solid #4a4434;', 'background: #1b1d25;', '/* .reach */ border-color: var(--c-parchment);'] },
  { group: 'マップ', title: 'マップの道', selector: '.map-lines line',
    desc: 'ノードをつなぐ線（SVG）。通った道は .walked。',
    example: ['stroke: #5b5444;', 'stroke-dasharray: 3 6;'] },
  { group: '報酬・ショップ・イベント', title: '報酬などの1行', selector: '.reward-item',
    desc: '報酬のゴールド・レリック・ポーション、ショップのレリックの行。画像にしたい時は skins の reward.item。',
    example: ['border-radius: 10px;', 'border: 1px solid #4a4030;', 'background: #201d18;'] },
  { group: '報酬・ショップ・イベント', title: 'ショップの値札', selector: '.price',
    desc: '値段。お金が足りない時は .short。セールのカードは .shop-item.sale の中。',
    example: ['font-weight: 800;', 'color: var(--c-parchment);', '/* .short */ color: #e07a6a;'] },
  { group: '報酬・ショップ・イベント', title: '店主のひとこと', selector: '[data-bind="shop.say"]',
    desc: '吹き出し。::before が左向きのしっぽ。',
    example: ['background: #1d2028;', 'border: 1px solid #333846;'] },
  { group: '報酬・ショップ・イベント', title: 'イベントの選択肢', selector: '.event-option',
    desc: '選択肢のボタン。b がボタンの文字、small が効果の説明、small.why が選べない理由。',
    example: ['border: 1px solid #4a4030;', 'background: #201d18;', '/* small.why */ color: #e07a6a;'] },
  { group: '報酬・ショップ・イベント', title: 'イベントの文章', selector: '[data-bind="event.text"]',
    desc: '物語の文。1行ずつ p になる。',
    example: ['font-size: 15px;', 'line-height: 1.75;'] },
  { group: 'ポーション', title: 'ポーションの枠', selector: '.potion-slot',
    desc: '上部の枠1つ。空きは .empty、敵を選んで投げる途中は .aiming。',
    example: ['border: 1px solid #4a4030;', 'background: #17181d;', '/* .empty */ border-style: dashed;'] },
  { group: '重ね表示', title: 'ダイアログ', selector: '.t-dialog',
    desc: '重ね表示の枠（デッキ一覧・詳細・購入確認・ポーション）。画像にしたい時は skins の dialog。',
    example: ['border-radius: 14px;', 'background: linear-gradient(#1f222c, #171920);'] },
  { group: '重ね表示', title: 'ダイアログの後ろの暗幕', selector: '.q-scrim',
    desc: 'ダイアログの後ろを暗くする幕。',
    example: ['background: rgba(5,6,9,.62);'] },
  { group: '演出', title: 'ダメージなどの数字', selector: '.fx-float',
    desc: '飛び出す数字。種類で .fx-dmg（ダメージ）.fx-blk（ブロック）.fx-heal（回復）.fx-poison（毒）.fx-buff .fx-debuff。',
    example: ['font-family: var(--f-display);', 'font-size: 28px;', '/* .fx-heal */ color: var(--c-good);'] },
];

/* ----- header written into exported files ----- */
export const HEADER_START = '/* ==== RLCE CSS GUIDE ====';
export const HEADER_END = '@end-guide */';

export function cssHeader(packName: string): string {
  const rules = CSS_RULES.map(r => ` [${r.sev === 'error' ? '必ず' : 'なるべく'}] ${r.title}\n     ${r.text}`).join('\n');
  return `${HEADER_START}
 RogueLite Card Game Engine & Editor — パック「${packName}」の追加CSS
 （この説明はエディターが付けたものです。読み込む時に自動で取り除かれます）

 ■ このファイルについて
   ゲームの組み込みのCSSの後に読まれます。同じセレクターなら、こちらが勝ちます。
   色とフォントは theme.json（エディターの「見た目・UIスキン」）、窓枠やボタンを画像にするのは
   theme.json の skins が担当です。ここでは「それ以外の見た目」を変えます。
   画面ごとに変えたい時は [data-screen="BATTLE"] のように画面IDで絞ります。

 ■ 守るルール（エディターの「CSS」と npm run check が確かめます）
${rules}

 ■ 部品の一覧
   どのセレクターが何か、は docs/css-guide.md と、エディターの「CSS」の右側にあります。
${HEADER_END}
`;
}

/** remove the guide header (and the blank lines after it) */
export function stripHeader(css: string): string {
  const a = css.indexOf(HEADER_START);
  if (a < 0) return css;
  const b = css.indexOf(HEADER_END, a);
  if (b < 0) return css;
  return (css.slice(0, a) + css.slice(b + HEADER_END.length)).replace(/^\s*\n/, '');
}

/** a commented snippet for one part (used by "insert" and the starter file) */
export function partSnippet(p: CssPart): string {
  const sel = p.selector;
  // examples are the current look, written as comments: remove the /* */ of a line to use it
  const decl = p.example.map(x => { const m = /^\/\* (.*?) \*\/ (.*)$/.exec(x); return m ? `  /* ${m[1]} では → ${m[2]} */` : `  /* ${x} */`; }).join('\n');
  return `/* ── ${p.title} ─────────\n   ${p.desc}\n*/\n${sel} {\n${decl}\n}\n`;
}

/** the starter file: every part, with the current look written as comments */
export function cssStarter(packName: string): string {
  let out = cssHeader(packName) + '\n';
  let g = '';
  for (const p of CSS_PARTS) {
    if (p.group !== g) { g = p.group; out += `\n/* ================ ${g} ================ */\n\n`; }
    out += partSnippet(p) + '\n';
  }
  return out;
}

/* ----- linter ----- */
export interface CssIssue { sev: 'error' | 'warn'; rule: string; line: number; msg: string }
interface Decl { prop: string; value: string; important: boolean; line: number }
interface RuleBlock { selector: string; decls: Decl[]; line: number; at: string[] }

/** a small, forgiving CSS reader: enough to find rules and declarations, never throws */
export function parseCss(src: string): { rules: RuleBlock[]; atRules: { name: string; prelude: string; line: number }[]; errors: CssIssue[] } {
  const errors: CssIssue[] = [];
  // blank out comments but keep line breaks so line numbers stay right
  let s = '';
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      if (end < 0) errors.push({ sev: 'error', rule: 'syntax', line: lineAt(src, i), msg: 'コメント /* が閉じていません' });
      for (let j = i; j < stop; j++) s += src[j] === '\n' ? '\n' : ' ';
      i = stop - 1;
    } else s += src[i];
  }
  const rules: RuleBlock[] = [];
  const atRules: { name: string; prelude: string; line: number }[] = [];
  let i = 0;
  const readBlock = (start: number): number => {
    // returns the index after the matching }
    let depth = 0, q = '';
    for (let j = start; j < s.length; j++) {
      const ch = s[j];
      if (q) { if (ch === '\\') j++; else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") q = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return j + 1; }
    }
    errors.push({ sev: 'error', rule: 'syntax', line: lineAt(s, start), msg: '{ が閉じていません（} が足りない）' });
    return s.length;
  };
  const parseList = (from: number, to: number, at: string[]) => {
    let k = from;
    while (k < to) {
      while (k < to && /\s/.test(s[k])) k++;
      if (k >= to) break;
      if (s[k] === '}') { errors.push({ sev: 'error', rule: 'syntax', line: lineAt(s, k), msg: '余分な } があります' }); k++; continue; }
      // prelude up to { or ;
      let p = k, q = '';
      while (p < to) { const ch = s[p]; if (q) { if (ch === '\\') p++; else if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '{' || ch === ';') break; p++; }
      const prelude = s.slice(k, p).trim();
      const line = lineAt(s, k);
      if (p >= to) { if (prelude) errors.push({ sev: 'error', rule: 'syntax', line, msg: `「${prelude.slice(0, 30)}」の後に { がありません` }); break; }
      if (s[p] === ';') { if (prelude.startsWith('@')) atRules.push({ name: prelude.split(/\s/)[0].toLowerCase(), prelude, line }); k = p + 1; continue; }
      const end = readBlock(p);
      const inner = s.slice(p + 1, end - 1);
      if (prelude.startsWith('@')) {
        const name = prelude.split(/[\s(]/)[0].toLowerCase();
        atRules.push({ name, prelude, line });
        if (['@media', '@supports', '@container', '@layer'].includes(name)) parseList(p + 1, end - 1, [...at, prelude]);
        else if (name === '@font-face') rules.push({ selector: '@font-face', decls: decls(inner, p + 1), line, at });
        // @keyframes and others: contents are not rules
      } else rules.push({ selector: prelude, decls: decls(inner, p + 1), line, at });
      k = end;
    }
  };
  const decls = (body: string, offset: number): Decl[] => {
    const out: Decl[] = [];
    let start = 0, depth = 0, q = '';
    const push = (endIdx: number) => {
      const raw = body.slice(start, endIdx);
      const c = raw.indexOf(':');
      if (raw.trim() && c > 0) {
        const prop = raw.slice(0, c).trim().toLowerCase();
        let value = raw.slice(c + 1).trim();
        const important = /!\s*important\s*$/i.test(value);
        value = value.replace(/!\s*important\s*$/i, '').trim();
        out.push({ prop, value, important, line: lineAt(s, offset + start + (raw.length - raw.trimStart().length)) });
      } else if (raw.trim()) errors.push({ sev: 'error', rule: 'syntax', line: lineAt(s, offset + start), msg: `「${raw.trim().slice(0, 30)}」は「名前: 値;」の形になっていません` });
      start = endIdx + 1;
    };
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (q) { if (ch === '\\') j++; else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") q = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ';' && depth <= 0) push(j);
    }
    push(body.length);
    if (depth > 0) errors.push({ sev: 'error', rule: 'syntax', line: lineAt(s, offset), msg: '( が閉じていません' });
    return out;
  };
  parseList(i, s.length, []);
  void i;
  return { rules, atRules, errors };
}
function lineAt(s: string, idx: number) { let n = 1; for (let i = 0; i < idx && i < s.length; i++) if (s[i] === '\n') n++; return n; }

const LAYOUT_SUBJECT = /(^|[^\w-])\.q(?![\w-])|\.t-[a-z]+|\[data-qid|\[data-bind/;
const STAGE_SUBJECT = /^(html|body|#stage|\.q-host|\.q-screen|\[data-screen[^\]]*\])$/;
const PRESSABLE = /\.t-button|\.card|\.map-node|\.event-option|\.potion-slot|\.reward-item|\[data-bind/;
const GEOMETRY = new Set(['position', 'left', 'top', 'right', 'bottom', 'inset', 'width', 'height']);
const MOVES = new Set(['transform', 'translate', 'scale', 'rotate', 'margin', 'margin-left', 'margin-top', 'margin-right', 'margin-bottom']);

/** the rightmost compound selector of each comma part, e.g. "[data-bind=hand] .card:hover" → ".card:hover" */
const subjects = (sel: string) => sel.split(',').map(x => x.trim()).filter(Boolean).map(x => x.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() ?? x);

export function lintCss(css: string): CssIssue[] {
  const { rules, atRules, errors } = parseCss(stripHeader(css));
  const out: CssIssue[] = [...errors];
  const rule = (id: string) => CSS_RULES.find(r => r.id === id)!;
  const add = (id: string, line: number, msg: string) => out.push({ sev: rule(id).sev, rule: id, line, msg: `${msg}（${rule(id).title}）` });
  for (const a of atRules) if (a.name === '@import') add('external', a.line, '@import は使えません');
  for (const r of rules) {
    const subs = r.selector === '@font-face' ? [] : subjects(r.selector);
    const layout = subs.some(x => LAYOUT_SUBJECT.test(x));
    const stage = subs.some(x => STAGE_SUBJECT.test(x.replace(/:.*$/, '')));
    const pressable = subs.some(x => PRESSABLE.test(x));
    const active = /:active|:hover|:focus/.test(r.selector);
    const whole = r.selector.split(',').map(x => x.trim());
    if (whole.some(x => x === '*' || /^[a-z][a-z0-9]*(:[\w-]+)?$/i.test(x)) && !stage) add('broad', r.line, `「${r.selector}」はタグ名だけで、全体に効いてしまいます`);
    for (const d of r.decls) {
      if (/url\(\s*['"]?\s*(https?:|\/\/)/i.test(d.value)) add('external', d.line, `${d.prop} で外のファイルを読んでいます`);
      if (d.important) add('important', d.line, `${d.prop} に !important`);
      if (stage && !d.prop.startsWith('--') && !d.prop.startsWith('background')) add('stage', d.line, `${r.selector} の ${d.prop}`);
      if (layout && !stage) {
        if (GEOMETRY.has(d.prop) || /^(min|max)-(width|height)$/.test(d.prop)) add('layout', d.line, `「${r.selector}」の ${d.prop}`);
        if (MOVES.has(d.prop) && !active) add('transform', d.line, `「${r.selector}」の ${d.prop}`);
        if ((d.prop === 'display' && d.value === 'none') || (d.prop === 'visibility' && d.value === 'hidden') || (d.prop === 'opacity' && Number(d.value) === 0)) add('hide', d.line, `「${r.selector}」を ${d.prop}: ${d.value} で消しています`);
      }
      if (pressable && d.prop === 'pointer-events' && d.value === 'none') add('pointer', d.line, `「${r.selector}」が押せなくなります`);
      if (d.prop === 'font-size') { const m = /^([\d.]+)px$/.exec(d.value); if (m && Number(m[1]) < 11) add('font', d.line, `font-size: ${d.value}`); }
      if (d.prop === 'z-index' && Number(d.value) > 100) add('zindex', d.line, `z-index: ${d.value}`);
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** a request to paste into an LLM, with the rules and the current CSS */
export function llmPrompt(packName: string, css: string, wish = ''): string {
  return `次の CSS は、スマホ向けカードゲーム「RogueLite Card Game Engine & Editor」のパック「${packName}」の追加CSSです。
冒頭のコメントの「守るルール」を必ず守って、下の希望どおりに書き換えてください。
- 返すのは CSS ファイル全体だけ（説明の文章は不要）。冒頭のコメントはそのまま残す。
- 部品ごとのコメントは残し、変えた所にも短いコメントを付ける。
- 色は可能なら var(--c-…) の変数を使う。

希望: ${wish || '（ここに、どう変えたいかを書く）'}

\`\`\`css
${cssHeader(packName)}
${stripHeader(css).trim()}
\`\`\`
`;
}
