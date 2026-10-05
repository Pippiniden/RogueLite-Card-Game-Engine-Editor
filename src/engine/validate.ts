import type { Content } from './content.ts';
import { EFFECTS } from './effects.ts';
import { checkExpr } from './expr.ts';
import type { Effect, Trigger, Modifier } from './types.ts';
import { parseDoc, lintScreen } from '../game/qlayout-core.js';
import { WIDGET_NAMES, ACTION_NAMES, SCREEN_IDS, SKIN_PARTS } from '../game/registry-names.ts';

/* ===== Pack checks shared by `npm run check` and the editor's 検証 panel ===== */

export interface Issue { sev: 'error' | 'warn'; kind: string; id: string; msg: string }

const EVENTS = ['battleStart', 'battleEnd', 'turnStart', 'turnEnd', 'cardPlayed', 'cardDrawn', 'cardExhausted', 'cardDiscarded', 'shuffle', 'attacked', 'attackDealt', 'damaged', 'blockGained', 'debuffApplied', 'statusGained', 'death'];
const STATS = ['attackDealt', 'attackTaken', 'blockGained', 'hpLoss', 'drawPerTurn', 'energyPerTurn', 'healReceived'];
const TARGETS = ['target', 'self', 'allEnemies', 'randomEnemy', 'allAllies', 'all'];

export function validateContent(c: Content, extra: { widgets?: string[]; actions?: string[] } = {}): Issue[] {
  const out: Issue[] = [];
  const err = (kind: string, id: string, msg: string) => out.push({ sev: 'error', kind, id, msg });
  const warn = (kind: string, id: string, msg: string) => out.push({ sev: 'warn', kind, id, msg });

  const effects = (kind: string, id: string, where: string, list: Effect[] | undefined) => {
    (list || []).forEach((e, i) => {
      const at = `${where}[${i + 1}]`;
      const op = EFFECTS[e.op];
      if (!op) return err(kind, id, `${at}: 効果「${e.op}」は登録されていません（プラグインの読み込み忘れ？）`);
      if (e.to !== undefined && !TARGETS.includes(String(e.to))) err(kind, id, `${at}: 対象「${e.to}」は使えません`);
      for (const [k, spec] of Object.entries(op.params)) {
        const v = e[k];
        if (v === undefined || v === '') { if (spec.required) err(kind, id, `${at}: ${op.label} の「${spec.label}」がありません`); continue; }
        if (spec.type === 'num' || spec.type === 'cond') { const m = checkExpr(v); if (m) err(kind, id, `${at} ${spec.label}: ${m}`); }
        if (spec.type === 'status' && v !== '$self' && !c.statuses.has(String(v))) err(kind, id, `${at}: 状態「${v}」がありません`);
        if ((spec.type === 'card' || spec.type === 'cardOrSelf') && v !== '$self' && !c.cards.has(String(v))) err(kind, id, `${at}: カード「${v}」がありません`);
        if (spec.type === 'enum' && spec.options && !spec.options.some(([o]) => o === v)) err(kind, id, `${at} ${spec.label}: 「${v}」は選択肢にありません`);
        if (spec.type === 'effects') effects(kind, id, `${at}.${k}`, v as Effect[]);
      }
    });
  };
  const triggers = (kind: string, id: string, list: Trigger[] | undefined) => (list || []).forEach((t, i) => {
    if (!EVENTS.includes(t.on)) err(kind, id, `トリガー${i + 1}: イベント「${t.on}」はありません`);
    if (t.when) { const m = checkExpr(t.when); if (m) err(kind, id, `トリガー${i + 1} の条件: ${m}`); }
    effects(kind, id, `トリガー${i + 1}`, t.effects);
  });
  const modifiers = (kind: string, id: string, list: Modifier[] | undefined) => (list || []).forEach((m, i) => {
    if (!STATS.includes(m.stat)) err(kind, id, `補正${i + 1}: 「${m.stat}」は補正できません`);
    const x = checkExpr(m.value); if (x) err(kind, id, `補正${i + 1}: ${x}`);
  });
  const asset = (kind: string, id: string, key?: string) => { if (key && !c.assets.has(key)) warn(kind, id, `画像「${key}」が素材一覧にありません（仮の絵で表示）`); };

  for (const d of c.cards.values()) {
    effects('cards', d.id, '効果', d.effects);
    effects('cards', d.id, '強化後の効果', d.upgrade?.effects);
    triggers('cards', d.id, d.handTriggers);
    if (d.playIf) { const m = checkExpr(d.playIf); if (m) err('cards', d.id, `使用条件: ${m}`); }
    if (!d.pools?.length && !['special', 'starter'].includes(d.rarity)) warn('cards', d.id, 'どの報酬プールにも入っていないので報酬に出ません');
    asset('cards', d.id, d.art);
  }
  for (const d of c.statuses.values()) { triggers('statuses', d.id, d.triggers); modifiers('statuses', d.id, d.modifiers); asset('statuses', d.id, d.icon); }
  for (const d of c.relics.values()) { triggers('relics', d.id, d.triggers); modifiers('relics', d.id, d.modifiers); asset('relics', d.id, d.icon); }
  for (const d of c.enemies.values()) {
    for (const [k, m] of Object.entries(d.moves)) effects('enemies', d.id, `行動「${m.name || k}」`, m.effects);
    const moves = d.ai.type === 'sequence' ? d.ai.order : [...d.ai.table.map(t => t.move), ...(d.ai.first ? [d.ai.first] : [])];
    if (!moves.length) err('enemies', d.id, '行動パターンが空です');
    moves.forEach(m => { if (!d.moves[m]) err('enemies', d.id, `行動パターンの「${m}」が行動一覧にありません`); });
    Object.keys(d.statuses ?? {}).forEach(s => { if (!c.statuses.has(s)) err('enemies', d.id, `最初の状態「${s}」がありません`); });
    asset('enemies', d.id, typeof d.art === 'string' ? d.art : d.art.idle);
    if (d.hp[0] > d.hp[1]) err('enemies', d.id, 'HPの最小が最大より大きい');
  }
  for (const d of c.encounters.values()) {
    if (!d.enemies.length) err('encounters', d.id, '敵がいません');
    d.enemies.forEach(e => { if (!c.enemies.has(e)) err('encounters', d.id, `敵「${e}」がありません`); });
    if (!c.rules.formations[String(d.enemies.length)]) err('encounters', d.id, `敵${d.enemies.length}体の陣形がルールにありません`);
  }
  for (const p of ['normal', 'elite', 'boss']) if (![...c.encounters.values()].some(e => e.pool === p)) err('encounters', p, `「${p}」の遭遇が1つもありません`);
  if (!c.characters.size) err('characters', '-', '主人公が1人もいません');
  for (const d of c.characters.values()) {
    d.deck.forEach(id => { if (!c.cards.has(id)) err('characters', d.id, `初期デッキのカード「${id}」がありません`); });
    d.relics.forEach(id => { if (!c.relics.has(id)) err('characters', d.id, `レリック「${id}」がありません`); });
    Object.values(d.portrait).forEach(k => asset('characters', d.id, k));
    if (!d.portrait.normal) warn('characters', d.id, '顔グラフィック normal がありません');
    if (!d.cardPools.length) warn('characters', d.id, 'カードプールが空なので報酬にカードが出ません');
    else if (![...c.cards.values()].some(x => x.pools?.some(p => d.cardPools.includes(p)))) err('characters', d.id, `カードプール「${d.cardPools.join(', ')}」のカードがありません`);
  }
  for (const [part, s] of Object.entries(c.theme.skins ?? {})) {
    if (!s) continue;
    if (!(part in SKIN_PARTS)) warn('theme', part, `スキン部品「${part}」はゲームで使われていません`);
    if (!c.assets.has(s.image)) warn('theme', part, `スキンの画像「${s.image}」が素材一覧にありません（CSSで表示）`);
  }

  // layout
  const doc = parseDoc(c.layout);
  doc.errors.forEach(e => err('layout', '-', e));
  const screens = doc.items.filter(i => i.kind === 'screen').map(i => (i as { s: Parameters<typeof lintScreen>[0] }).s);
  for (const id of SCREEN_IDS) if (!screens.some(s => s.id === id) && id !== 'CHARSELECT') err('layout', id, `画面 ${id} がありません`);
  const widgets = new Set([...WIDGET_NAMES, ...(extra.widgets ?? [])]);
  const actions = new Set([...ACTION_NAMES, ...(extra.actions ?? [])]);
  for (const s of screens) {
    lintScreen(s, screens, doc.project).filter(x => x.sev !== 'info').forEach(x => warn('layout', s.id, `${x.id ?? ''} ${x.msg}`));
    for (const e of s.els) {
      if (e.attrs.bind && !widgets.has(e.attrs.bind)) warn('layout', s.id, `${e.id}: bind="${e.attrs.bind}" はゲームに登録されていません（空欄で表示）`);
      const m = /:\s*([A-Za-z_]\w*)/.exec(e.attrs.on ?? '');
      if (m && !actions.has(m[1])) warn('layout', s.id, `${e.id}: アクション「${m[1]}」はゲームに登録されていません`);
    }
  }
  return out;
}
