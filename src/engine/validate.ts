import type { Content } from './content.ts';
import { EFFECTS, type ParamSpec } from './effects.ts';
import { RUN_EFFECTS } from './run-effects.ts';
import { lintCss } from './css-guide.ts';
import { checkExpr } from './expr.ts';
import type { Effect, Trigger, Modifier } from './types.ts';
import { parseDoc, lintScreen } from '../game/qlayout-core.js';
import { WIDGET_NAMES, ACTION_NAMES, SCREEN_IDS, SKIN_PARTS } from '../game/registry-names.ts';

/* ===== Pack checks shared by `npm run check` and the editor's 検証 panel ===== */

export interface Issue { sev: 'error' | 'warn'; kind: string; id: string; msg: string }

const EVENTS = ['battleStart', 'battleEnd', 'turnStart', 'turnEnd', 'cardPlayed', 'cardDrawn', 'cardExhausted', 'cardDiscarded', 'shuffle', 'attacked', 'attackDealt', 'damaged', 'blockGained', 'debuffApplied', 'statusGained', 'death', 'potionUsed'];
const STATS = ['attackDealt', 'attackTaken', 'blockGained', 'hpLoss', 'drawPerTurn', 'energyPerTurn', 'healReceived'];
const TARGETS = ['target', 'self', 'allEnemies', 'randomEnemy', 'allAllies', 'all'];

export function validateContent(c: Content, extra: { widgets?: string[]; actions?: string[] } = {}): Issue[] {
  const out: Issue[] = [];
  const err = (kind: string, id: string, msg: string) => out.push({ sev: 'error', kind, id, msg });
  const warn = (kind: string, id: string, msg: string) => out.push({ sev: 'warn', kind, id, msg });

  // combat effects (cards, enemies, statuses) and run effects (events, relic pick-up) share the checks
  const effectsIn = (reg: Record<string, { label: string; params: Record<string, ParamSpec> }>, run: boolean, pages?: string[]) => {
  const effects = (kind: string, id: string, where: string, list: Effect[] | undefined) => {
    (list || []).forEach((e, i) => {
      const at = `${where}[${i + 1}]`;
      const op = reg[e.op];
      if (!op) return err(kind, id, `${at}: ${run ? '冒険の効果' : '効果'}「${e.op}」は登録されていません${run && EFFECTS[e.op] ? '（戦闘中だけの効果です）' : '（プラグインの読み込み忘れ？）'}`);
      if (!run && e.to !== undefined && !TARGETS.includes(String(e.to))) err(kind, id, `${at}: 対象「${e.to}」は使えません`);
      for (const [k, spec] of Object.entries(op.params)) {
        const v = e[k];
        if (v === undefined || v === '') { if (spec.required) err(kind, id, `${at}: ${op.label} の「${spec.label}」がありません`); continue; }
        if (spec.type === 'num' || spec.type === 'cond') { const m = checkExpr(v); if (m) err(kind, id, `${at} ${spec.label}: ${m}`); }
        if (spec.type === 'status' && v !== '$self' && !c.statuses.has(String(v))) err(kind, id, `${at}: 状態「${v}」がありません`);
        if ((spec.type === 'card' || spec.type === 'cardOrSelf') && v !== '$self' && !c.cards.has(String(v))) err(kind, id, `${at}: カード「${v}」がありません`);
        if (spec.type === 'enum' && spec.options && !spec.options.some(([o]) => o === v)) err(kind, id, `${at} ${spec.label}: 「${v}」は選択肢にありません`);
        if (spec.type === 'relic' && !c.relics.has(String(v))) err(kind, id, `${at}: レリック「${v}」がありません`);
        if (spec.type === 'potion' && !c.potions.has(String(v))) err(kind, id, `${at}: ポーション「${v}」がありません`);
        if (spec.type === 'encounter' && !c.encounters.has(String(v))) err(kind, id, `${at}: 遭遇「${v}」がありません`);
        if (spec.type === 'page' && pages && !pages.includes(String(v))) err(kind, id, `${at}: ページ「${v}」がありません`);
        if (spec.type === 'effects') effects(kind, id, `${at}.${k}`, v as Effect[]);
      }
    });
  };
  return effects;
  };
  const effects = effectsIn(EFFECTS, false);
  const runEffects = effectsIn(RUN_EFFECTS, true);
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
  for (const d of c.relics.values()) { triggers('relics', d.id, d.triggers); modifiers('relics', d.id, d.modifiers); asset('relics', d.id, d.icon); runEffects('relics', d.id, '拾った時', d.onPickup); }
  for (const ev of c.events.values()) {
    const pages = Object.keys(ev.pages ?? {});
    if (!ev.pages?.start) { err('events', ev.id, '最初のページ「start」がありません'); continue; }
    const check = effectsIn(RUN_EFFECTS, true, pages);
    asset('events', ev.id, ev.art);
    if (ev.when) { const m = checkExpr(ev.when); if (m) err('events', ev.id, `出現条件: ${m}`); }
    for (const [k, v] of Object.entries(ev.vars ?? {})) { const m = checkExpr(v); if (m) err('events', ev.id, `変数 ${k}: ${m}`); }
    ev.chars?.forEach(ch => { if (!c.characters.has(ch)) err('events', ev.id, `主人公「${ch}」がありません`); });
    const reached = new Set(['start']);
    for (const [pid, pg] of Object.entries(ev.pages)) {
      asset('events', ev.id, pg.art);
      if (!pg.text) warn('events', ev.id, `ページ「${pid}」の文章が空です`);
      pg.options.forEach((o, i) => {
        const at = `ページ「${pid}」の選択肢${i + 1}`;
        if (!o.label) err('events', ev.id, `${at}: ボタンの文字がありません`);
        for (const [k, x] of [['表示条件', o.when], ['選べる条件', o.enableIf]] as const) if (x) { const m = checkExpr(x); if (m) err('events', ev.id, `${at} ${k}: ${m}`); }
        if (o.next) { reached.add(o.next); if (!ev.pages[o.next]) err('events', ev.id, `${at}: 次のページ「${o.next}」がありません`); }
        const walk = (l?: Effect[]) => (l ?? []).forEach(e => { if (e.op === 'goto') reached.add(String(e.page)); walk(e.then as Effect[]); walk(e.else as Effect[]); });
        walk(o.effects);
        check('events', ev.id, at, o.effects);
      });
    }
    pages.filter(pid => !reached.has(pid)).forEach(pid => warn('events', ev.id, `ページ「${pid}」へ進む選択肢がありません`));
  }
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
  // acts: every act needs its own normal / elite / boss encounters (encounters without "acts" count for every act)
  const acts = Math.max(1, c.rules.acts?.length ?? 1);
  for (let a = 1; a <= acts; a++) for (const p of ['normal', 'elite', 'boss']) {
    if (![...c.encounters.values()].some(e => e.pool === p && (!e.acts?.length || e.acts.includes(a)))) (p === 'boss' ? err : warn)('encounters', `act${a}`, `第${a}幕に「${p}」の遭遇がありません${p === 'boss' ? '' : '（他の幕の遭遇を使います）'}`);
  }
  for (const e of c.encounters.values()) e.acts?.forEach(a => { if (a < 1 || a > acts) warn('encounters', e.id, `第${a}幕はルールにありません（幕は ${acts} つ）`); });
  for (const e of c.events.values()) e.acts?.forEach(a => { if (a < 1 || a > acts) warn('events', e.id, `第${a}幕はルールにありません（幕は ${acts} つ）`); });
  if (acts > 1 && ![...c.relics.values()].some(r => r.rarity === 'boss')) warn('relics', '-', 'ボスのレリックが1つもないので、幕の間の報酬にレリックが出ません');
  for (const d of c.potions.values()) {
    effects('potions', d.id, '戦闘での効果', d.effects);
    runEffects('potions', d.id, '戦闘の外での効果', d.mapEffects);
    if (!d.effects?.length && !d.mapEffects?.length) err('potions', d.id, '効果がないので使えません');
    asset('potions', d.id, d.icon);
  }
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

  // pack stylesheets
  for (const st of c.styles) for (const i of lintCss(st.text)) out.push({ sev: i.sev, kind: 'styles', id: `${st.path.replace(/^.*packs\//, '')}:${i.line}`, msg: i.msg });

  // layout
  const doc = parseDoc(c.layout);
  doc.errors.forEach(e => err('layout', '-', e));
  const screens = doc.items.filter(i => i.kind === 'screen').map(i => (i as { s: Parameters<typeof lintScreen>[0] }).s);
  const w = c.rules.map.weights;
  const used: Record<string, boolean> = { CHARSELECT: false, SHOP: (w.shop ?? 0) > 0 || (c.rules.unknown?.shop ?? 0) > 0, EVENT: (w.event ?? 0) > 0 };
  for (const id of SCREEN_IDS) if (!screens.some(s => s.id === id) && used[id] !== false) err('layout', id, `画面 ${id} がありません`);
  if ((w.event ?? 0) > 0 && !c.events.size && (c.rules.unknown?.event ?? 1) > 0) warn('events', '-', '「？」マスが出ますがイベントが1つもありません（戦闘になります）');
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
