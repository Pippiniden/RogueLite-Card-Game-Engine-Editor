import type { Content } from './content.ts';
import { canUpgrade, cardView } from './content.ts';
import type { CardInst, DeckChoice, Effect, RunState, Rarity, EventDef, EventOption, ShopState } from './types.ts';
import type { ParamSpec } from './effects.ts';
import { evalNum, evalCond } from './expr.ts';
import { describeCard } from './describe.ts';
import type { CardDef, PotionDef } from './types.ts';
import { Rng, deriveSeed } from './rng.ts';

/* ===== Run effects: what happens outside combat =====
   Used by event options, relic pick-up, and the shop. Like combat effects they are { "op": …, params },
   registered here with param specs so the editor builds forms from them and the checker validates them.
   Effects run in order; one that needs the player to pick cards stores the rest in run.choice.then and
   the run waits (the game shows a picker, the simulator picks at random). */

export type RunLog =
  | { t: 'gold'; n: number }
  | { t: 'hp'; n: number }
  | { t: 'maxHp'; n: number }
  | { t: 'card'; id: string; up: boolean }
  | { t: 'remove'; id: string }
  | { t: 'upgrade'; id: string }
  | { t: 'transform'; from: string; to: string }
  | { t: 'relic'; id: string }
  | { t: 'potion'; id: string }
  | { t: 'potionFull'; id: string };

export interface RunCtx {
  c: Content;
  run: RunState;
  rng: Rng;
  /** extra variables (event vars) */
  vars: Record<string, number>;
  /** false: picks are made at random (starting relics, simulator) */
  canAsk: boolean;
  from: DeckChoice['from'];
  log: RunLog[];
}
type RunResult = void | 'stop' | Effect[];
export interface RunOp {
  label: string;
  group: 'resource' | 'cards' | 'relic' | 'flow' | 'plugin';
  params: Record<string, ParamSpec>;
  run(ctx: RunCtx, e: Effect): RunResult;
  /** default text template ({param}); text.<lang>.json → effects["run.<op>"] wins */
  text?: string;
}

export const RUN_GROUPS: Record<RunOp['group'], string> = { resource: 'HP・ゴールド', cards: 'デッキ', relic: 'レリック・ポーション', flow: '組み合わせ・進行', plugin: 'プラグイン' };

const RARITY_OPTS: [string, string][] = [['', 'ふつうの出やすさで'], ['common', 'コモン'], ['uncommon', 'アンコモン'], ['rare', 'レア']];
const TYPE_OPTS: [string, string][] = [['', 'どれでも'], ['attack', 'アタック'], ['skill', 'スキル'], ['power', 'パワー'], ['status', '状態異常'], ['curse', '呪い']];
const SELECT_OPTS: [string, string][] = [['choose', 'プレイヤーが選ぶ'], ['random', 'ランダム']];

export const n = (e: Effect, k: string, ctx: RunCtx, d = 0) => Math.floor(evalNum(e[k] as never, { ...runVars(ctx.c, ctx.run), ...ctx.vars }, d));

/* ----- helpers shared with run.ts ----- */
const ownPools = (c: Content, run: RunState) => (c.characters.get(run.char)?.cardPools ?? []).filter(p => p !== 'colorless');

/** random card ids for rewards / shops / events */
export function rollCardIds(c: Content, run: RunState, rng: Rng, o: { count: number; rarity?: string; type?: string; colorless?: boolean; weights?: Partial<Record<Rarity, number>>; exclude?: string[] }): string[] {
  const pools = o.colorless ? ['colorless'] : ownPools(c, run);
  const all = [...c.cards.values()].filter(d => d.pools?.some(p => pools.includes(p)) && !['starter', 'special'].includes(d.rarity) && (!o.type || d.type === o.type));
  const taken = new Set(o.exclude ?? []);
  const out: string[] = [];
  for (let i = 0; i < o.count; i++) {
    const rar = o.rarity || rng.weighted(Object.entries(o.weights ?? c.rules.rewards.rarity.normal) as [Rarity, number][], ([, w]) => w)?.[0];
    let cands = all.filter(d => d.rarity === rar && !taken.has(d.id));
    if (!cands.length) cands = all.filter(d => !taken.has(d.id));
    if (!cands.length) break;
    const d = rng.pick(cands);
    taken.add(d.id); out.push(d.id);
  }
  return out;
}

/** a relic this character can find (shared ones plus those in its pools); rarity weights from rules.rewards.relicRarity */
export function pickRelic(c: Content, run: RunState, rng: Rng, o: { rarity?: string; shop?: boolean; exclude?: string[] } = {}): string | undefined {
  const pools = c.characters.get(run.char)?.cardPools ?? [];
  const blocked = ['starter', 'boss', 'special', ...(o.shop ? [] : ['shop'])];
  const cands = [...c.relics.values()].filter(r => !run.relics.includes(r.id) && !o.exclude?.includes(r.id)
    && (o.rarity ? r.rarity === o.rarity : !blocked.includes(r.rarity))
    && (!r.pools?.length || r.pools.some(p => pools.includes(p))));
  if (!cands.length) return undefined;
  const w = c.rules.rewards.relicRarity;
  return (w ? rng.weighted(cands, r => w[r.rarity] ?? 1) ?? rng.pick(cands) : rng.pick(cands)).id;
}

/* ----- potions ----- */
export const DEFAULT_POTIONS = { slots: 3, dropChance: 40, dropStep: 10, rarity: { common: 65, uncommon: 25, rare: 10 }, shop: { count: 3, price: { common: [48, 52], uncommon: [72, 78], rare: [95, 105] } } } as const;
export const potionRules = (c: Content) => c.rules.potions ?? DEFAULT_POTIONS;

/** a random potion this character can find */
export function pickPotion(c: Content, run: RunState, rng: Rng, o: { rarity?: string; exclude?: string[] } = {}): string | undefined {
  const pools = c.characters.get(run.char)?.cardPools ?? [];
  const cands = [...c.potions.values()].filter(d => d.rarity !== 'special' && !o.exclude?.includes(d.id)
    && (o.rarity ? d.rarity === o.rarity : true) && (!d.pools?.length || d.pools.some(p => pools.includes(p))));
  if (!cands.length) return undefined;
  const w = potionRules(c).rarity as Record<string, number>;
  return (rng.weighted(cands, d => w[d.rarity] ?? 1) ?? cands[0]).id;
}
/** put a potion in the first empty slot; false when the belt is full */
export function givePotion(run: RunState, id: string): boolean {
  const belt = run.potions ??= [];
  const i = belt.indexOf(null);
  if (i < 0) return false;
  belt[i] = id;
  return true;
}
export const hasPotionRoom = (run: RunState) => (run.potions ?? []).includes(null);
export function discardPotion(run: RunState, slot: number) { if (run.potions?.[slot]) run.potions[slot] = null; }
/** drink a potion outside combat (only potions with mapEffects) */
export function usePotionOutside(c: Content, run: RunState, slot: number, canAsk = true): { log: RunLog[]; status: 'done' | 'choice' | 'fight' | 'invalid' } {
  const id = run.potions?.[slot]; const d = id ? c.potions.get(id) : undefined;
  if (!d?.mapEffects?.length || run.choice) return { log: [], status: 'invalid' };
  run.potions![slot] = null;
  const ctx = makeCtx(c, run, 'potion', canAsk);
  const status = runRunEffects(ctx, d.mapEffects);
  saveRng(run, ctx.rng);
  return { log: ctx.log, status };
}

/** variables for run-level expressions (event conditions, amounts) */
export function runVars(c: Content, run: RunState): Record<string, number> {
  const v: Record<string, number> = {
    gold: run.gold, hp: run.hp, maxHp: run.maxHp, hpPct: Math.round(run.hp / Math.max(1, run.maxHp) * 100),
    floor: run.stats.floors, deck: run.deck.length, 'deck.count': run.deck.length, relics: run.relics.length,
    removals: run.removals ?? 0,
    act: (run.act ?? 0) + 1, totalFloor: (run.floorBase ?? 0) + run.stats.floors,
    potions: (run.potions ?? []).filter(Boolean).length, potionSlots: (run.potions ?? []).length,
    'deck.upgradable': run.deck.filter(x => canUpgrade(c, x)).length,
  };
  for (const t of ['attack', 'skill', 'power', 'status', 'curse']) v[`deck.${t}`] = run.deck.filter(x => cardView(c, x).type === t).length;
  for (const r of run.relics) v[`relic.${r}`] = 1;
  return v;
}

function newCard(run: RunState, id: string, up = false): CardInst { return { uid: run.nextUid++, id, up }; }

function gainRelic(ctx: RunCtx, id: string) {
  const { c, run } = ctx;
  if (!c.relics.has(id) || run.relics.includes(id)) return;
  run.relics.push(id);
  ctx.log.push({ t: 'relic', id });
  const on = c.relics.get(id)?.onPickup;
  if (on?.length) return on;
}

/** cards a choice may show */
export function choiceCandidates(c: Content, run: RunState, ch: DeckChoice): CardInst[] {
  if (ch.cards) return ch.cards;
  let list = run.deck;
  if (ch.op === 'upgrade') list = list.filter(x => canUpgrade(c, x));
  if (ch.filter) list = list.filter(x => cardView(c, x).type === ch.filter);
  return list;
}

/** pick-from-deck ops: ask the player, or pick at random when we cannot ask */
function deckPick(ctx: RunCtx, e: Effect, op: DeckChoice['op'], extra: Partial<DeckChoice> = {}): RunResult {
  const count = Math.max(1, n(e, 'count', ctx, 1));
  const ch: DeckChoice = { op, count, prompt: ctx.c.text.ui[`choice.run.${op}`] ?? op, from: ctx.from, filter: e.filter ? String(e.filter) : undefined, ...extra };
  const cands = choiceCandidates(ctx.c, ctx.run, ch);
  if (!cands.length) return;
  ch.count = Math.min(count, cands.length);
  if (e.select === 'random' || !ctx.canAsk) { applyPick(ctx, ch, ctx.rng.shuffle([...cands]).slice(0, ch.count)); return; }
  ctx.run.choice = ch;
  return 'stop';
}

/** apply a finished pick */
export function applyPick(ctx: RunCtx, ch: DeckChoice, picked: CardInst[]) {
  const { c, run } = ctx;
  if (ch.price) { run.gold -= ch.price; ctx.log.push({ t: 'gold', n: -ch.price }); }
  for (const p of picked) {
    const inDeck = run.deck.find(x => x.uid === p.uid);
    switch (ch.op) {
      case 'remove': if (inDeck) { run.deck.splice(run.deck.indexOf(inDeck), 1); ctx.log.push({ t: 'remove', id: inDeck.id }); } break;
      case 'upgrade': if (inDeck && canUpgrade(c, inDeck)) { inDeck.up = true; ctx.log.push({ t: 'upgrade', id: inDeck.id }); } break;
      case 'duplicate': if (inDeck) { run.deck.push(newCard(run, inDeck.id, inDeck.up)); ctx.log.push({ t: 'card', id: inDeck.id, up: inDeck.up }); } break;
      case 'transform': if (inDeck) {
        const to = rollCardIds(c, run, ctx.rng, { count: 1, exclude: [inDeck.id] })[0];
        run.deck.splice(run.deck.indexOf(inDeck), 1);
        if (to) { run.deck.push(newCard(run, to)); ctx.log.push({ t: 'transform', from: inDeck.id, to }); }
      } break;
      case 'take': run.deck.push(newCard(run, p.id, p.up)); ctx.log.push({ t: 'card', id: p.id, up: p.up }); break;
    }
  }
}

/* ----- the registry ----- */
export const RUN_EFFECTS: Record<string, RunOp> = {
  gainGold: { label: 'ゴールドを得る', group: 'resource', params: { amount: { type: 'num', required: true, label: '量' } },
    run(ctx, e) { const v = n(e, 'amount', ctx); ctx.run.gold = Math.max(0, ctx.run.gold + v); ctx.log.push({ t: 'gold', n: v }); } },
  loseGold: { label: 'ゴールドを失う', group: 'resource', params: { amount: { type: 'num', required: true, label: '量', help: '所持金より多ければ0になる' } },
    run(ctx, e) { const v = Math.min(ctx.run.gold, n(e, 'amount', ctx)); ctx.run.gold -= v; ctx.log.push({ t: 'gold', n: -v }); } },
  heal: { label: 'HPを回復', group: 'resource', params: { amount: { type: 'num', required: true, label: '量', help: '例: maxHp * 0.25' } },
    run(ctx, e) { const r = ctx.run; const v = Math.max(0, Math.min(r.maxHp - r.hp, n(e, 'amount', ctx))); r.hp += v; ctx.log.push({ t: 'hp', n: v }); } },
  loseHp: { label: 'HPを失う', group: 'resource', params: { amount: { type: 'num', required: true, label: '量', help: '冒険中はHP1で止まる' } },
    run(ctx, e) { const r = ctx.run; const v = Math.max(0, Math.min(r.hp - 1, n(e, 'amount', ctx))); r.hp -= v; ctx.log.push({ t: 'hp', n: -v }); } },
  gainMaxHp: { label: '最大HPを増やす', group: 'resource', params: { amount: { type: 'num', required: true, label: '量' } },
    run(ctx, e) { const r = ctx.run; const v = n(e, 'amount', ctx); r.maxHp += v; r.hp += Math.max(0, v); ctx.log.push({ t: 'maxHp', n: v }); } },
  loseMaxHp: { label: '最大HPを減らす', group: 'resource', params: { amount: { type: 'num', required: true, label: '量' } },
    run(ctx, e) { const r = ctx.run; const v = Math.max(0, Math.min(r.maxHp - 1, n(e, 'amount', ctx))); r.maxHp -= v; r.hp = Math.min(r.hp, r.maxHp); ctx.log.push({ t: 'maxHp', n: -v }); } },

  addCard: { label: 'カードをデッキに加える', group: 'cards',
    params: { card: { type: 'card', required: true, label: 'カード' }, count: { type: 'num', default: 1, label: '枚数' }, upgraded: { type: 'bool', default: false, label: '強化済み' } },
    run(ctx, e) { const id = String(e.card); if (!ctx.c.cards.has(id)) return; for (let i = 0; i < n(e, 'count', ctx, 1); i++) { ctx.run.deck.push(newCard(ctx.run, id, !!e.upgraded)); ctx.log.push({ t: 'card', id, up: !!e.upgraded }); } } },
  addRandomCard: { label: 'ランダムなカードを加える', group: 'cards',
    params: { count: { type: 'num', default: 1, label: '枚数' }, rarity: { type: 'enum', default: '', label: 'レアリティ', options: RARITY_OPTS }, type: { type: 'enum', default: '', label: '種類', options: TYPE_OPTS }, colorless: { type: 'bool', default: false, label: '共通（colorless）から' }, upgraded: { type: 'bool', default: false, label: '強化済み' } },
    run(ctx, e) { for (const id of rollCardIds(ctx.c, ctx.run, ctx.rng, { count: n(e, 'count', ctx, 1), rarity: String(e.rarity ?? ''), type: String(e.type ?? ''), colorless: !!e.colorless })) { ctx.run.deck.push(newCard(ctx.run, id, !!e.upgraded)); ctx.log.push({ t: 'card', id, up: !!e.upgraded }); } } },
  offerCards: { label: 'カードを見せて1枚選ばせる', group: 'cards',
    params: { count: { type: 'num', default: 3, label: '候補の数' }, rarity: { type: 'enum', default: '', label: 'レアリティ', options: RARITY_OPTS }, type: { type: 'enum', default: '', label: '種類', options: TYPE_OPTS }, colorless: { type: 'bool', default: false, label: '共通（colorless）から' }, upgraded: { type: 'bool', default: false, label: '強化済み' }, canSkip: { type: 'bool', default: true, label: '選ばずに済ませられる' } },
    run(ctx, e) {
      const ids = rollCardIds(ctx.c, ctx.run, ctx.rng, { count: n(e, 'count', ctx, 3), rarity: String(e.rarity ?? ''), type: String(e.type ?? ''), colorless: !!e.colorless });
      if (!ids.length) return;
      const cards = ids.map(id => newCard(ctx.run, id, !!e.upgraded));
      const ch: DeckChoice = { op: 'take', count: 1, cards, prompt: ctx.c.text.ui['choice.run.take'] ?? 'take', from: ctx.from, canCancel: e.canSkip !== false };
      if (!ctx.canAsk) { applyPick(ctx, ch, [ctx.rng.pick(cards)]); return; }
      ctx.run.choice = ch;
      return 'stop';
    } },
  removeCards: { label: 'デッキからカードを取り除く', group: 'cards',
    params: { count: { type: 'num', default: 1, label: '枚数' }, select: { type: 'enum', default: 'choose', label: '選び方', options: SELECT_OPTS }, filter: { type: 'enum', default: '', label: '種類', options: TYPE_OPTS } },
    run(ctx, e) { return deckPick(ctx, e, 'remove'); } },
  upgradeCards: { label: 'デッキのカードを強化', group: 'cards',
    params: { count: { type: 'num', default: 1, label: '枚数' }, select: { type: 'enum', default: 'choose', label: '選び方', options: SELECT_OPTS }, filter: { type: 'enum', default: '', label: '種類', options: TYPE_OPTS } },
    run(ctx, e) { return deckPick(ctx, e, 'upgrade'); } },
  transformCards: { label: 'カードを別のカードに変える', group: 'cards',
    params: { count: { type: 'num', default: 1, label: '枚数' }, select: { type: 'enum', default: 'choose', label: '選び方', options: SELECT_OPTS }, filter: { type: 'enum', default: '', label: '種類', options: TYPE_OPTS } },
    run(ctx, e) { return deckPick(ctx, e, 'transform'); } },
  duplicateCard: { label: 'カードを複製する', group: 'cards',
    params: { count: { type: 'num', default: 1, label: '枚数' }, select: { type: 'enum', default: 'choose', label: '選び方', options: SELECT_OPTS }, filter: { type: 'enum', default: '', label: '種類', options: TYPE_OPTS } },
    run(ctx, e) { return deckPick(ctx, e, 'duplicate'); } },

  gainRelic: { label: 'レリックを得る', group: 'relic',
    params: { relic: { type: 'relic', label: 'レリック', help: '空ならランダム' }, rarity: { type: 'enum', default: '', label: 'ランダムの時のレアリティ', options: [['', 'ふつうの出やすさで'], ['common', 'コモン'], ['uncommon', 'アンコモン'], ['rare', 'レア'], ['boss', 'ボス'], ['shop', 'ショップ']] } },
    run(ctx, e) {
      const id = e.relic ? String(e.relic) : pickRelic(ctx.c, ctx.run, ctx.rng, { rarity: String(e.rarity ?? '') || undefined });
      return id ? gainRelic(ctx, id) : undefined;
    } },
  gainPotion: { label: 'ポーションを得る', group: 'relic',
    params: { potion: { type: 'potion', label: 'ポーション', help: '空ならランダム' }, rarity: { type: 'enum', default: '', label: 'ランダムの時のレアリティ', options: RARITY_OPTS }, count: { type: 'num', default: 1, label: '数' } },
    run(ctx, e) {
      for (let i = 0; i < n(e, 'count', ctx, 1); i++) {
        const id = e.potion ? String(e.potion) : pickPotion(ctx.c, ctx.run, ctx.rng, { rarity: String(e.rarity ?? '') || undefined });
        if (!id || !ctx.c.potions.has(id)) return;
        if (givePotion(ctx.run, id)) ctx.log.push({ t: 'potion', id }); else { ctx.log.push({ t: 'potionFull', id }); return; }
      }
    } },
  addPotionSlots: { label: 'ポーションの枠を増やす', group: 'relic', params: { count: { type: 'num', default: 1, label: '数' } },
    run(ctx, e) { const belt = ctx.run.potions ??= []; for (let i = 0; i < n(e, 'count', ctx, 1); i++) belt.push(null); } },
  loseRelic: { label: 'レリックを失う', group: 'relic', params: { relic: { type: 'relic', label: 'レリック', help: '空なら持っている中からランダム（初期レリックは除く）' } },
    run(ctx, e) {
      const r = ctx.run;
      const pool = r.relics.filter(x => ctx.c.relics.get(x)?.rarity !== 'starter');
      const id = e.relic ? String(e.relic) : pool.length ? ctx.rng.pick(pool) : '';
      const i = r.relics.indexOf(id); if (i >= 0) r.relics.splice(i, 1);
    } },

  if: { label: 'もし〜なら', group: 'flow', params: { cond: { type: 'cond', required: true, label: '条件', help: '例: gold >= 100' }, then: { type: 'effects', label: 'なら' }, else: { type: 'effects', label: 'でなければ' } },
    run(ctx, e) { return (evalCond(e.cond as never, { ...runVars(ctx.c, ctx.run), ...ctx.vars }) ? e.then : e.else) as Effect[] ?? []; } },
  chance: { label: '確率で', group: 'flow', params: { percent: { type: 'num', required: true, default: 50, label: '確率(%)' }, then: { type: 'effects', label: '当たり' }, else: { type: 'effects', label: '外れ' } },
    run(ctx, e) { return (ctx.rng.next() * 100 < n(e, 'percent', ctx, 50) ? e.then : e.else) as Effect[] ?? []; } },
  goto: { label: 'イベントのページへ進む', group: 'flow', params: { page: { type: 'page', required: true, label: 'ページ' } },
    run(ctx, e) { if (ctx.run.event) ctx.run.event.next = String(e.page); } },
  endEvent: { label: 'イベントを終える', group: 'flow', params: {},
    run(ctx) { if (ctx.run.event) ctx.run.event.next = null; } },
  fight: { label: '戦闘を始める', group: 'flow',
    params: { encounter: { type: 'encounter', required: true, label: '遭遇' }, reward: { type: 'enum', default: 'normal', label: '勝った時の報酬', options: [['normal', '通常戦と同じ'], ['elite', 'エリート戦と同じ（レリック付き）'], ['none', 'なし']] } },
    run(ctx, e) {
      const id = String(e.encounter); if (!ctx.c.encounters.has(id)) return;
      const r = ctx.run;
      r.encounter = id; r.fight = { reward: (e.reward as 'normal' | 'elite' | 'none') ?? 'normal' };
      r.event = undefined; r.phase = 'battle';
      return 'stop';
    } },
};
export function registerRunEffect(op: string, def: Omit<RunOp, 'group'> & { group?: RunOp['group'] }) { RUN_EFFECTS[op] = { ...def, group: def.group ?? 'plugin' }; }

/** run a list; stops (and stores the rest) when the player has to pick, or when a fight starts */
export function runRunEffects(ctx: RunCtx, list: Effect[] | undefined): 'done' | 'choice' | 'fight' {
  const q = [...(list ?? [])];
  while (q.length) {
    const e = q.shift()!;
    const op = RUN_EFFECTS[e.op];
    if (!op) continue;
    const r = op.run(ctx, e);
    if (Array.isArray(r)) { q.unshift(...r); continue; }
    if (r === 'stop') {
      if (ctx.run.choice) { ctx.run.choice.then = q; return 'choice'; }
      return 'fight';
    }
  }
  return 'done';
}

/** the run's own random stream for events and shops */
export function runRng(run: RunState): Rng { return new Rng(run.rng.event ?? deriveSeed(run.seed, 'event')); }
export function saveRng(run: RunState, rng: Rng) { run.rng.event = rng.state; }

export function makeCtx(c: Content, run: RunState, from: DeckChoice['from'], canAsk = true): RunCtx {
  return { c, run, rng: runRng(run), vars: { ...(run.event?.vars ?? {}) }, canAsk, from, log: [] };
}

/** answer run.choice (an empty pick = cancel, when allowed). Continues the stored effects. */
export function resolveChoice(c: Content, run: RunState, uids: number[], canAsk = true): { log: RunLog[]; status: 'done' | 'choice' | 'fight' | 'invalid' } {
  const ch = run.choice; if (!ch) return { log: [], status: 'invalid' };
  const cands = choiceCandidates(c, run, ch);
  const picked = cands.filter(x => uids.includes(x.uid)).slice(0, ch.count);
  const cancel = !picked.length;
  if (cancel && !ch.canCancel) return { log: [], status: 'invalid' };
  if (!cancel && picked.length < Math.min(ch.count, cands.length)) return { log: [], status: 'invalid' };
  if (!cancel && ch.price && run.gold < ch.price) return { log: [], status: 'invalid' };
  const ctx = makeCtx(c, run, ch.from, canAsk);
  run.choice = undefined;
  // a cancelled shop removal costs nothing; a cancelled pick elsewhere just skips it
  if (!cancel) {
    applyPick(ctx, ch, picked);
    if (ch.from === 'shop' && ch.op === 'remove' && run.shop) { run.shop.removal.used = true; run.removals = (run.removals ?? 0) + 1; }
  }
  const status = runRunEffects(ctx, ch.then);
  saveRng(run, ctx.rng);
  if (status === 'done' && ch.from === 'event') finishEventStep(run);
  return { log: ctx.log, status };
}

/* ===== shop ===== */
export const DEFAULT_SHOP = {
  cards: 5, colorless: 2,
  rarity: { common: 54, uncommon: 37, rare: 9 },
  cardPrice: { common: [45, 55], uncommon: [68, 82], rare: [135, 165] },
  colorlessMarkup: 1.2,
  sale: { count: 1, factor: 0.5 },
  relics: 3,
  relicPrice: { common: [143, 157], uncommon: [238, 262], rare: [285, 315], shop: [143, 157] },
  removal: { price: 75, step: 25 },
} as const;

/** price after relic discounts (Membership-Card-like relics: relic.shop.discount) */
export function shopPrice(c: Content, run: RunState, base: number): number {
  let k = 1;
  for (const r of run.relics) { const d = c.relics.get(r)?.shop?.discount; if (d) k *= 1 - d; }
  return Math.max(0, Math.round(base * k));
}
export function removalPrice(c: Content, run: RunState): number {
  const S = c.rules.shop ?? DEFAULT_SHOP;
  const fixed = run.relics.map(r => c.relics.get(r)?.shop?.removalPrice).find(v => v !== undefined);
  return fixed !== undefined ? fixed : shopPrice(c, run, S.removal.price + S.removal.step * (run.removals ?? 0));
}

export function makeShop(c: Content, run: RunState, rng: Rng): ShopState {
  const S = c.rules.shop ?? DEFAULT_SHOP;
  const price = (r: [number, number] | readonly [number, number] | undefined, k = 1) => Math.round(rng.int(r?.[0] ?? 50, r?.[1] ?? 50) * k);
  const cards: ShopState['cards'] = [];
  const own = rollCardIds(c, run, rng, { count: S.cards, weights: S.rarity as Partial<Record<Rarity, number>> });
  const col = rollCardIds(c, run, rng, { count: S.colorless, colorless: true, weights: S.rarity as Partial<Record<Rarity, number>>, exclude: own });
  for (const id of own) cards.push({ card: newCard(run, id), price: price(S.cardPrice[c.cards.get(id)!.rarity as 'common']) });
  for (const id of col) cards.push({ card: newCard(run, id), price: price(S.cardPrice[c.cards.get(id)!.rarity as 'common'], S.colorlessMarkup) });
  const saleable = cards.slice(0, own.length);
  for (const it of rng.shuffle([...saleable]).slice(0, S.sale.count)) { it.price = Math.round(it.price * S.sale.factor); it.sale = true; }
  const relics: ShopState['relics'] = [];
  for (let i = 0; i < S.relics; i++) {
    const id = pickRelic(c, run, rng, { shop: true, exclude: relics.map(r => r.id) });
    if (!id) break;
    relics.push({ id, price: price(S.relicPrice[c.relics.get(id)!.rarity as 'common'] ?? S.relicPrice.common) });
  }
  const P = potionRules(c);
  const potions: NonNullable<ShopState['potions']> = [];
  for (let i = 0; i < P.shop.count; i++) {
    const id = pickPotion(c, run, rng, { exclude: [] }); if (!id) break;
    const rar = c.potions.get(id)!.rarity as 'common';
    potions.push({ id, price: price((P.shop.price as Record<string, [number, number]>)[rar] ?? P.shop.price.common) });
  }
  return { cards, relics, potions, removal: { price: 0 } };
}

export type BuyResult = { ok: false; reason: 'gold' | 'sold' } | { ok: true; log: RunLog[]; status: 'done' | 'choice' | 'fight' };
export function buyCard(c: Content, run: RunState, i: number): BuyResult {
  const it = run.shop?.cards[i]; if (!it || it.sold) return { ok: false, reason: 'sold' };
  const p = shopPrice(c, run, it.price); if (run.gold < p) return { ok: false, reason: 'gold' };
  run.gold -= p; it.sold = true; run.deck.push(it.card);
  return { ok: true, log: [{ t: 'gold', n: -p }, { t: 'card', id: it.card.id, up: it.card.up }], status: 'done' };
}
export function buyRelic(c: Content, run: RunState, i: number, canAsk = true): BuyResult {
  const it = run.shop?.relics[i]; if (!it || it.sold) return { ok: false, reason: 'sold' };
  const p = shopPrice(c, run, it.price); if (run.gold < p) return { ok: false, reason: 'gold' };
  run.gold -= p; it.sold = true;
  const ctx = makeCtx(c, run, 'relic', canAsk);
  ctx.log.push({ t: 'gold', n: -p });
  const more = gainRelic(ctx, it.id);
  const status = runRunEffects(ctx, more ?? []);
  saveRng(run, ctx.rng);
  return { ok: true, log: ctx.log, status };
}
export function buyPotion(c: Content, run: RunState, i: number): BuyResult | { ok: false; reason: 'full' } {
  const it = run.shop?.potions?.[i]; if (!it || it.sold) return { ok: false, reason: 'sold' };
  const p = shopPrice(c, run, it.price); if (run.gold < p) return { ok: false, reason: 'gold' };
  if (!hasPotionRoom(run)) return { ok: false, reason: 'full' };
  run.gold -= p; it.sold = true; givePotion(run, it.id);
  return { ok: true, log: [{ t: 'gold', n: -p }, { t: 'potion', id: it.id }], status: 'done' };
}
/** opens the removal picker (pay on confirm) */
export function startRemoval(c: Content, run: RunState): { ok: boolean; reason?: 'gold' | 'sold' | 'empty' } {
  if (!run.shop || run.shop.removal.used) return { ok: false, reason: 'sold' };
  const price = removalPrice(c, run);
  if (run.gold < price) return { ok: false, reason: 'gold' };
  if (!run.deck.length) return { ok: false, reason: 'empty' };
  run.choice = { op: 'remove', count: 1, prompt: c.text.ui['choice.run.removeShop'] ?? c.text.ui['choice.run.remove'] ?? 'remove', from: 'shop', canCancel: true, price };
  return { ok: true };
}

/* ===== events ===== */
export function eventVars(c: Content, run: RunState): Record<string, number> { return { ...runVars(c, run), ...(run.event?.vars ?? {}) }; }

export function pickEvent(c: Content, run: RunState, rng: Rng): EventDef | undefined {
  const floor = run.stats.floors - 1;
  const vars = runVars(c, run);
  const seen = run.seenEvents ?? [];
  const act = (run.act ?? 0) + 1;
  const list = [...c.events.values()].filter(ev => (ev.minFloor ?? 0) <= floor && floor <= (ev.maxFloor ?? 999) && (!ev.acts?.length || ev.acts.includes(act))
    && (!ev.chars?.length || ev.chars.includes(run.char)) && (ev.repeatable || !seen.includes(ev.id))
    && (!ev.when || evalCond(ev.when as never, vars)) && !!ev.pages?.start);
  return rng.weighted(list, ev => ev.weight ?? 1);
}

export function startEvent(c: Content, run: RunState, ev: EventDef) {
  const base = runVars(c, run);
  const vars: Record<string, number> = {};
  for (const [k, v] of Object.entries(ev.vars ?? {})) vars[k] = Math.floor(evalNum(v as never, { ...base, ...vars }));
  run.event = { id: ev.id, page: 'start', vars };
  (run.seenEvents ??= []).push(ev.id);
  run.phase = 'event';
}

export interface OptionView { option: EventOption; index: number; enabled: boolean }
export function eventOptions(c: Content, run: RunState): OptionView[] {
  const ev = run.event && c.events.get(run.event.id); if (!ev || !run.event) return [];
  const page = ev.pages[run.event.page]; if (!page) return [];
  const vars = eventVars(c, run);
  return page.options.map((option, index) => ({ option, index, enabled: !option.enableIf || evalCond(option.enableIf as never, vars) }))
    .filter(o => !o.option.when || evalCond(o.option.when as never, vars));
}

/** after an option's effects: move to the next page, or end the event */
export function finishEventStep(run: RunState) {
  const st = run.event; if (!st) return;
  const next = st.next;
  st.next = undefined;
  if (next) st.page = next;
  else { run.event = undefined; run.phase = 'map'; run.resolved = undefined; }
}

export function chooseEventOption(c: Content, run: RunState, index: number, canAsk = true): { log: RunLog[]; status: 'done' | 'choice' | 'fight' | 'invalid' } {
  const opt = eventOptions(c, run).find(o => o.index === index);
  if (!opt || !opt.enabled || run.choice) return { log: [], status: 'invalid' };
  run.event!.next = opt.option.next ?? null;
  const ctx = makeCtx(c, run, 'event', canAsk);
  const status = runRunEffects(ctx, opt.option.effects);
  saveRng(run, ctx.rng);
  if (status === 'done') finishEventStep(run);
  return { log: ctx.log, status };
}

/** a page with no options shows a single "continue" that ends the event */
export function leaveEvent(run: RunState) { if (run.event) { run.event.next = null; finishEventStep(run); } }

/* ===== text ===== */
export function fillText(c: Content, run: RunState | null, s: string): string {
  const vars = run ? eventVars(c, run) : {};
  const name = run ? c.characters.get(run.char)?.name ?? '' : '';
  return s.replace(/\{([\w.]+)\}/g, (m, k) => k === 'name' ? name : k in vars ? String(vars[k]) : m);
}

/** one-line description of run effects, for event options and the editor */
export function describeRun(c: Content, list: Effect[] | undefined, vars?: Record<string, number>): string {
  const T = c.text.effects;
  const num = (v: unknown) => {
    if (typeof v === 'number') return String(v);
    if (vars && v !== undefined && v !== '') { try { return String(Math.floor(evalNum(v as never, vars))); } catch { /* fall through */ } }
    return v === undefined ? '' : String(v);
  };
  const parts: string[] = [];
  for (const e of list ?? []) {
    const op = RUN_EFFECTS[e.op]; if (!op) continue;
    if (e.op === 'goto' || e.op === 'endEvent') continue;
    if (e.op === 'if') { const a = describeRun(c, e.then as Effect[], vars), b = describeRun(c, e.else as Effect[], vars); parts.push(fmt(T['run.if'] ?? '条件次第で {then}', { then: a, else: b })); continue; }
    if (e.op === 'chance') {
      const a = describeRun(c, e.then as Effect[], vars), b = describeRun(c, e.else as Effect[], vars);
      const pct = num(e.percent ?? 50), miss = /^\d+$/.test(pct) ? String(100 - Number(pct)) : `100-${pct}`;
      const key = a && b ? 'run.chance.else' : a ? 'run.chance' : b ? 'run.chance.miss' : '';
      if (key) parts.push(fmt(T[key] ?? '{percent}%で {then}', { percent: pct, miss, then: a, else: b }));
      continue;
    }
    const key = `run.${e.op}` + ((e.op === 'gainRelic' && !e.relic) || (e.op === 'gainPotion' && !e.potion) ? '.random' : '') + (['removeCards', 'upgradeCards', 'transformCards', 'duplicateCard'].includes(e.op) && e.select === 'random' ? '.random' : '');
    const vals: Record<string, string> = {};
    for (const k of Object.keys(op.params)) {
      const v = e[k] ?? op.params[k].default;
      if (k === 'card') vals[k] = c.cards.get(String(v))?.name ?? String(v ?? '');
      else if (k === 'relic') vals[k] = c.relics.get(String(v))?.name ?? '';
      else if (k === 'potion') vals[k] = c.potions.get(String(v))?.name ?? '';
      else if (k === 'encounter') vals[k] = (c.encounters.get(String(v))?.enemies ?? []).map(id => c.enemies.get(id)?.name ?? id).join('・');
      else if (k === 'rarity') vals[k] = v ? c.text.rarities[String(v)] ?? String(v) : '';
      else if (k === 'type' || k === 'filter') vals[k] = v ? c.text.cardTypes[String(v)] ?? String(v) : '';
      else vals[k] = num(v);
    }
    parts.push(fmt(T[key] ?? T[`run.${e.op}`] ?? op.text ?? op.label, vals));
  }
  return parts.filter(Boolean).join(T['run.join'] ?? '、');
}
const fmt = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '').replace(/\s+/g, ' ').trim();

/** description of a potion: its own text, or generated from its effects like a card */
export function potionText(c: Content, d: PotionDef): string {
  if (d.desc) return d.desc;
  const card = { id: d.id, name: d.name, type: 'skill', rarity: 'special', cost: 0, target: d.target, effects: d.effects } as CardDef;
  const lines = d.effects.length ? describeCard(c, card).map(l => l.map(x => x.t).join('')) : [];
  if (d.mapEffects?.length) lines.push(d.effects.length ? (c.text.ui['potion.alsoOutside'] ?? '戦闘の外でも使える') : describeRun(c, d.mapEffects));
  return lines.join('\n');
}
