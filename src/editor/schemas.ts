import type { F } from './fields.ts';
import { ed } from './state.ts';
import {
  CARD_TYPES, RARITIES, CARD_TARGETS, KEYWORDS, RELIC_RARITIES, STATUS_KINDS, STACKING, DECAY, FLAGS, ENEMY_SIZES, POOLS, PORTRAIT_FACES, FACE_LABELS, type Opt,
} from './labels.ts';
import type { ListKind } from './project.ts';

/* ===== What each content kind looks like in the editor ===== */

const pools = () => [...new Set(ed.project.merged('cards').flatMap(x => (x.item.pools as string[]) ?? []))];
const vfxNames = (): Opt[] => Object.keys(ed.project.obj('vfx')).filter(k => !k.startsWith('$')).map(k => [k, k]);
const COST_HELP = '数字、X（残りエネルギーすべて）、空欄で「使用不可」';

export interface KindDef {
  label: string;
  /** one line under the name in the list */
  sub: (it: Record<string, unknown>) => string;
  fields: F[];
  make: (id: string) => Record<string, unknown>;
  filters?: { key: string; label: string; options: Opt[] }[];
}

const costField: F = {
  k: 'custom', render: (obj) => {
    const wrap = document.createElement('div');
    wrap.className = 'fr';
    const id = 'cost-' + Math.random().toString(36).slice(2, 7);
    wrap.innerHTML = `<label for="${id}">コスト</label>`;
    const inp = document.createElement('input');
    inp.id = id; inp.className = 'mono num';
    inp.value = obj.cost === null || obj.cost === undefined ? '' : String(obj.cost);
    inp.placeholder = '使用不可';
    inp.addEventListener('input', () => { const v = inp.value.trim().toUpperCase(); obj.cost = v === '' ? null : v === 'X' ? 'X' : Math.max(0, Math.round(Number(v) || 0)); touched(); });
    const help = document.createElement('p'); help.className = 'help'; help.textContent = COST_HELP;
    wrap.append(inp, help);
    return wrap;
  },
};

export const KINDS: Record<ListKind, KindDef> = {
  cards: {
    label: 'カード',
    sub: it => `${CARD_TYPES.find(([k]) => k === it.type)?.[1] ?? it.type} · ${RARITIES.find(([k]) => k === it.rarity)?.[1].replace(/（.*/, '') ?? it.rarity} · コスト${it.cost === null ? '－' : it.cost}`,
    filters: [{ key: 'type', label: 'すべての種類', options: CARD_TYPES }, { key: 'rarity', label: 'すべてのレアリティ', options: RARITIES }],
    make: id => ({ id, name: '新しいカード', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', pools: [ed.project.merged('characters')[0]?.item.cardPools?.toString().split(',')[0] ?? 'hero'], effects: [{ op: 'damage', amount: 6 }], upgrade: { effects: [{ op: 'damage', amount: 9 }] }, art: 'card.sword' }),
    fields: [
      { k: 'text', key: 'name', label: '名前' },
      { k: 'enum', key: 'type', label: '種類', options: CARD_TYPES },
      { k: 'enum', key: 'rarity', label: 'レアリティ', options: RARITIES },
      costField,
      { k: 'enum', key: 'target', label: '対象', options: CARD_TARGETS, help: '「敵1体を選ぶ」だけが敵をタップして使う' },
      { k: 'flags', key: 'keywords', label: 'キーワード', options: KEYWORDS },
      { k: 'tags', key: 'pools', label: '報酬プール', help: '主人公の「カードプール」と同じ名前を書くと、その主人公の報酬に出る（例: hero, colorless）', suggest: pools },
      { k: 'asset', key: 'art', label: 'イラスト', prefix: 'card', help: '16:9（640×360推奨）' },
      { k: 'effects', key: 'effects', label: '効果', card: true, help: '上から順に実行。説明文は自動で作られる' },
      { k: 'group', label: '強化後（＋）', key: 'upgrade', optional: '強化できるようにする', help: '書いた項目だけが強化後に置き換わる', fields: [
        { k: 'text', key: 'name', label: '名前', placeholder: '空なら「名前+」' },
        { k: 'custom', render: obj => { const w = costField.k === 'custom' ? costField.render(obj) : document.createElement('div'); (w.querySelector('input') as HTMLInputElement).placeholder = '変えない'; return w; } },
        { k: 'flags', key: 'keywords', label: 'キーワード（置き換え）', options: KEYWORDS },
        { k: 'effects', key: 'effects', label: '効果（置き換え）', card: true },
        { k: 'text', key: 'text', label: '説明文（置き換え）', multiline: true },
      ] },
      { k: 'group', label: '詳しい設定', open: false, fields: [
        { k: 'text', key: 'text', label: '説明文（手書き）', multiline: true, help: '空なら効果から自動生成。{0} {1}… は効果1, 2… の数値（筋力などの補正が入る）。改行で行を分ける' },
        { k: 'cond', key: 'playIf', label: '使える条件', help: '例: hand.attack == hand.count（手札がすべてアタック）' },
        { k: 'numMap', key: 'vars', label: 'カードの変数（初期値）', help: '効果「このカードの数値を変える」で増減し、式から card.名前 で読む' },
        { k: 'triggers', key: 'handTriggers', label: '手札にある間のトリガー', help: '火傷のように、ターン終了時に手札にあると効果がある時に使う（いまは turnEnd のみ）' },
      ] },
    ],
  },

  statuses: {
    label: '状態（バフ・デバフ）',
    sub: it => `${it.kind === 'debuff' ? '弱体' : '強化'} · ${STACKING.find(([k]) => k === it.stacking)?.[1].replace(/（.*/, '') ?? ''}`,
    filters: [{ key: 'kind', label: '強化も弱体も', options: STATUS_KINDS }],
    make: id => ({ id, name: '新しい状態', icon: '', kind: 'buff', stacking: 'intensity', desc: '説明（{stacks} に量が入る）' }),
    fields: [
      { k: 'text', key: 'name', label: '名前' },
      { k: 'asset', key: 'icon', label: 'アイコン', prefix: 'status', help: '128×128 透過' },
      { k: 'enum', key: 'kind', label: '分類', options: STATUS_KINDS, help: '弱体は「結界」で防がれる' },
      { k: 'enum', key: 'stacking', label: '数値の意味', options: STACKING },
      { k: 'enum', key: 'decay', label: '自然に減る', options: DECAY, empty: '減らない' },
      { k: 'bool', key: 'allowNegative', label: 'マイナスになれる（筋力など。マイナスは弱体扱い）' },
      { k: 'text', key: 'desc', label: '説明文', multiline: true, help: '{stacks} に量が入る' },
      { k: 'flags', key: 'flags', label: 'エンジンの特別な働き', options: FLAGS, free: true },
      { k: 'modifiers', key: 'modifiers', label: '数値の補正', help: '値の式では stacks（この状態の量）が使える' },
      { k: 'triggers', key: 'triggers', label: 'トリガー', help: '「この状態自身（$self）」を増減・削除すると、使い切りの状態が作れる' },
      { k: 'enum', key: 'vfx', label: '付いた時の演出', options: vfxNames, empty: 'なし' },
    ],
  },

  relics: {
    label: 'レリック',
    sub: it => `${RELIC_RARITIES.find(([k]) => k === it.rarity)?.[1] ?? it.rarity}${(it.pools as string[] | undefined)?.length ? ' · ' + (it.pools as string[]).join(', ') : ''}`,
    filters: [{ key: 'rarity', label: 'すべてのレアリティ', options: RELIC_RARITIES }],
    make: id => ({ id, name: '新しいレリック', icon: '', rarity: 'common', desc: '説明', triggers: [{ on: 'battleStart', effects: [{ op: 'block', amount: 5 }] }] }),
    fields: [
      { k: 'text', key: 'name', label: '名前' },
      { k: 'asset', key: 'icon', label: 'アイコン', prefix: 'relic', help: '128×128 透過' },
      { k: 'enum', key: 'rarity', label: 'レアリティ', options: RELIC_RARITIES },
      { k: 'text', key: 'desc', label: '説明文', multiline: true },
      { k: 'tags', key: 'pools', label: '出る主人公のプール', help: '空ならすべての主人公に出る', suggest: pools },
      { k: 'modifiers', key: 'modifiers', label: '数値の補正（常時）' },
      { k: 'triggers', key: 'triggers', label: 'トリガー' },
      { k: 'effects', key: 'onPickup', label: '拾った時（冒険全体の効果）', help: '使えるのは 最大HP・回復・HPを失う・ゴールド・カードを加える（デッキへ）' },
    ],
  },

  enemies: {
    label: '敵',
    sub: it => `HP ${(it.hp as number[])?.join('〜')} · ${ENEMY_SIZES.find(([k]) => k === it.size)?.[1] ?? it.size} · 行動${Object.keys((it.moves as object) ?? {}).length}`,
    filters: [{ key: 'size', label: 'すべての大きさ', options: ENEMY_SIZES }],
    make: id => ({ id, name: '新しい敵', hp: [20, 24], size: 'medium', art: '', moves: { attack: { name: '攻撃', intent: 'attack', effects: [{ op: 'damage', amount: 6 }] } }, ai: { type: 'sequence', order: ['attack'] } }),
    fields: [
      { k: 'text', key: 'name', label: '名前' },
      { k: 'range', key: 'hp', label: 'HP（最小〜最大）' },
      { k: 'enum', key: 'size', label: '大きさ', options: ENEMY_SIZES, help: '表示の高さ。ルールの「敵の大きさ」で比率を決める' },
      { k: 'asset', key: 'art', label: '絵', prefix: 'enemy', help: '透過・足元が下端中央。docs/asset-spec.md' },
      { k: 'float', key: 'footOffset', label: '足元の調整', step: 0.01, help: '影やしっぽの分、絵の高さの割合だけ下げる（0.05 など）' },
      { k: 'statusMap', key: 'statuses', label: '最初から持つ状態' },
      { k: 'custom', render: obj => movesEditor(obj) },
      { k: 'custom', render: obj => enemyFxEditor(obj) },
    ],
  },

  encounters: {
    label: '遭遇（敵の組み合わせ）',
    sub: it => `${POOLS.find(([k]) => k === it.pool)?.[1] ?? it.pool} · ${(it.enemies as string[])?.map(e => (ed.project.find('enemies', e)?.item.name as string) ?? e).join('・')}`,
    filters: [{ key: 'pool', label: 'すべての種類', options: POOLS }],
    make: id => ({ id, pool: 'normal', enemies: [ed.project.ids('enemies')[0] ?? ''] }),
    fields: [
      { k: 'enum', key: 'pool', label: '種類', options: POOLS },
      { k: 'refList', key: 'enemies', label: '出てくる敵（左から順に並ぶ・最大4体）', to: 'enemies' },
      { k: 'int', key: 'weight', label: '出やすさ', optional: true, help: '空なら1' },
      { k: 'int', key: 'minFloor', label: '出る最初の階', optional: true, help: '0 = 1階目' },
      { k: 'int', key: 'maxFloor', label: '出る最後の階', optional: true },
      { k: 'asset', key: 'bg', label: '背景（この遭遇だけ）', prefix: 'bg' },
      { k: 'asset', key: 'bgm', label: '音楽（この遭遇だけ）', prefix: 'bgm', audio: true },
    ],
  },

  characters: {
    label: '主人公',
    sub: it => `HP ${it.hp} · エネルギー ${it.energy} · デッキ ${(it.deck as string[])?.length ?? 0}枚${it.locked ? ' · 非公開' : ''}`,
    make: id => ({ id, name: '新しい主人公', title: '', hp: 70, gold: 99, energy: 3, draw: 5, deck: [], relics: [], cardPools: [id], portrait: { normal: '' }, intro: '' }),
    fields: [
      { k: 'text', key: 'name', label: '名前' },
      { k: 'text', key: 'title', label: '肩書' },
      { k: 'text', key: 'intro', label: '紹介文', multiline: true },
      { k: 'text', key: 'color', label: 'テーマ色', mono: true, placeholder: '#e8913a', help: '主人公選択の光などに使う' },
      { k: 'int', key: 'hp', label: '最大HP', min: 1 },
      { k: 'int', key: 'gold', label: '最初のゴールド', min: 0 },
      { k: 'int', key: 'energy', label: '毎ターンのエネルギー', min: 0 },
      { k: 'int', key: 'draw', label: '毎ターン引く枚数', min: 0 },
      { k: 'refList', key: 'deck', label: '初期デッキ', to: 'cards' },
      { k: 'refList', key: 'relics', label: '最初のレリック', to: 'relics' },
      { k: 'tags', key: 'cardPools', label: 'カードプール', help: 'カードとレリックの報酬を引くプール。カード側の「報酬プール」と合わせる', suggest: pools },
      { k: 'custom', render: obj => portraitEditor(obj) },
      { k: 'asset', key: 'selectArt', label: '選択画面の大きな絵（任意）', prefix: 'portrait' },
      { k: 'bool', key: 'locked', label: '非公開（選択画面に出さない）' },
    ],
  },
};

import { assetPicker } from './fields.ts';
import { movesEditor, enemyFxEditor } from './enemy-editor.ts';
import { h, button, prompt } from './ui.ts';
import { touched } from './state.ts';
function portraitEditor(obj: Record<string, unknown>): HTMLElement {
  const p = (obj.portrait as Record<string, string>) ?? (obj.portrait = {});
  const box = h('div', { class: 'fr wide' }, h('label', null, '顔グラフィック（表情ごと）'));
  const grid = h('div', { class: 'faces' });
  const draw = () => {
    grid.replaceChildren();
    const keys = [...new Set([...PORTRAIT_FACES, ...Object.keys(p)])];
    for (const k of keys) grid.appendChild(h('div', { class: 'face' }, h('b', null, FACE_LABELS[k] ?? k), h('small', { class: 'mono' }, k), assetPicker(p as Record<string, unknown>, k, 'portrait')));
    grid.appendChild(button('＋ 表情を追加', async () => { const k = await prompt('表情を追加', '表情の名前（英数字）'); if (k) { p[k] = ''; touched(); draw(); } }, 'sm'));
  };
  draw();
  box.appendChild(grid);
  box.appendChild(h('p', { class: 'help' }, '512×512。normal は必須。hurt（被弾）・pinch（HP30%以下）・happy（勝利）が無ければ normal を使う'));
  return box;
}
