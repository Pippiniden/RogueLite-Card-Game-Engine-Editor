import type { Effect, Combatant, TargetSel, CardInst, CardDef } from './types.ts';
import type { Combat } from './combat.ts';
import { evalNum, evalCond } from './expr.ts';

/* ===== Effect registry =====
   An effect is { op, ...params }. Each op declares its parameters (the editor builds its form from them,
   the checker validates them) and how it runs. Plugins add ops with registerEffect(). */

export type ParamType =
  | 'num'        // number or expression
  | 'int'        // plain integer
  | 'bool'
  | 'string'
  | 'cond'       // expression used as a yes/no condition
  | 'enum'       // one of options
  | 'status' | 'card' | 'cardOrSelf'
  | 'target'
  | 'effects';   // nested effect list

export interface ParamSpec {
  type: ParamType;
  label: string;
  required?: boolean;
  default?: unknown;
  options?: [string, string][];   // enum: [value, label]
  help?: string;
}

export interface ChoiceReq {
  prompt: string;
  cards: CardInst[];
  min: number;
  max: number;
}

export interface EffectCtx {
  source: Combatant;
  /** chosen target (player cards), the player (enemy moves), the other party (triggers) */
  target?: Combatant;
  vars: Record<string, number>;
  /** the card being played / drawn / exhausted, if any */
  card?: CardInst;
  cardDef?: CardDef;
  /** id of the status whose trigger is running ("$self" in params refers to it) */
  statusId?: string;
  /** may this effect stop and ask the player to pick cards */
  canAsk?: boolean;
}

export type EffectRun = (cb: Combat, ctx: EffectCtx, e: Effect, who: Combatant[]) => void | Generator<ChoiceReq, void, CardInst[]>;

export interface EffectOp {
  label: string;
  /** groups the op in the editor's menu */
  group: 'attack' | 'defense' | 'status' | 'cards' | 'resource' | 'flow' | 'run' | 'plugin';
  params: Record<string, ParamSpec>;
  /** receiver when `to` is omitted (null = the op does not use a receiver) */
  defaultTo: TargetSel | null | ((e: Effect, cb: Combat) => TargetSel);
  run: EffectRun;
  /** default description template when the text table has none ({param} placeholders) */
  text?: string;
}

const PILES: [string, string][] = [['hand', '手札'], ['draw', '山札'], ['discard', '捨て札'], ['exhaust', '廃棄']];
const SELECT: [string, string][] = [['choose', 'プレイヤーが選ぶ'], ['random', 'ランダム'], ['top', '上から'], ['all', 'すべて']];
const CARD_TYPES: [string, string][] = [['', 'どれでも'], ['attack', 'アタック'], ['skill', 'スキル'], ['power', 'パワー'], ['status', '状態異常'], ['curse', '呪い']];

export const num = (e: Effect, k: string, ctx: EffectCtx, d = 0) => Math.floor(evalNum(e[k] as never, ctx.vars, d));
const statusOf = (e: Effect, ctx: EffectCtx) => { const s = String(e.status ?? ''); return s === '$self' ? ctx.statusId ?? '' : s; };

export const EFFECTS: Record<string, EffectOp> = {
  /* ----- attack ----- */
  damage: {
    label: 'ダメージを与える', group: 'attack',
    params: {
      amount: { type: 'num', required: true, label: 'ダメージ量' },
      times: { type: 'num', default: 1, label: '回数' },
      kind: { type: 'enum', default: 'attack', label: '種類', options: [['attack', '攻撃（筋力・弱体・脆弱が効く）'], ['raw', 'そのまま（補正なし・ブロックは効く）']] },
      strengthMul: { type: 'num', default: 1, label: '筋力の倍率', help: '3 にすると筋力が3倍で効く' },
      to: { type: 'target', label: '対象' },
    },
    defaultTo: 'target',
    run(cb, ctx, e, who) {
      const times = num(e, 'times', ctx, 1);
      const kind = e.kind === 'raw' ? 'raw' : 'attack';
      const mul = evalNum(e.strengthMul as never, ctx.vars, 1);
      for (let i = 0; i < times; i++) {
        if (e.to === 'randomEnemy' && i > 0) who = cb.resolveTargets('randomEnemy', ctx);
        for (const t of who) if (t.alive) cb.attack(ctx.source, t, num(e, 'amount', ctx), { kind, strengthMul: mul });
        if (cb.over) return;
      }
    },
  },

  /* ----- defense ----- */
  block: {
    label: 'ブロックを得る', group: 'defense',
    params: {
      amount: { type: 'num', required: true, label: 'ブロック量' },
      raw: { type: 'bool', default: false, label: '敏捷・衰弱の影響を受けない' },
      to: { type: 'target', label: '対象' },
    },
    defaultTo: 'self',
    run(cb, ctx, e, who) { for (const t of who) cb.gainBlock(t, num(e, 'amount', ctx), !e.raw); },
  },
  multiplyBlock: {
    label: 'ブロックを倍にする', group: 'defense',
    params: { factor: { type: 'num', default: 2, label: '倍率' }, to: { type: 'target', label: '対象' } },
    defaultTo: 'self',
    run(cb, ctx, e, who) { for (const t of who) cb.gainBlock(t, Math.floor(t.block * (evalNum(e.factor as never, ctx.vars, 2) - 1)), false); },
  },
  heal: {
    label: 'HPを回復', group: 'defense',
    params: { amount: { type: 'num', required: true, label: '回復量' }, to: { type: 'target', label: '対象' } },
    defaultTo: 'self',
    run(cb, ctx, e, who) { for (const t of who) cb.heal(t, num(e, 'amount', ctx)); },
  },
  loseHp: {
    label: 'HPを失う（ブロック無視）', group: 'attack',
    params: { amount: { type: 'num', required: true, label: '量' }, to: { type: 'target', label: '対象' } },
    defaultTo: 'self',
    run(cb, ctx, e, who) { for (const t of who) cb.loseHp(t, num(e, 'amount', ctx), ctx.source); },
  },

  /* ----- statuses ----- */
  applyStatus: {
    label: '状態を付与・増減', group: 'status',
    params: {
      status: { type: 'status', required: true, label: '状態', help: '$self = この状態自身（状態のトリガーの中で使う）' },
      stacks: { type: 'num', required: true, label: '量', help: 'マイナスで減らす' },
      to: { type: 'target', label: '対象' },
    },
    defaultTo: (e, cb) => {
      const st = cb.content.statuses.get(String(e.status));
      return st?.kind === 'buff' && !(typeof e.stacks === 'number' && e.stacks < 0) ? 'self' : 'target';
    },
    run(cb, ctx, e, who) { const id = statusOf(e, ctx); for (const t of who) cb.addStatus(t, id, num(e, 'stacks', ctx), ctx.source); },
  },
  removeStatus: {
    label: '状態を消す', group: 'status',
    params: { status: { type: 'status', required: true, label: '状態' }, to: { type: 'target', label: '対象' } },
    defaultTo: 'self',
    run(cb, ctx, e, who) { const id = statusOf(e, ctx); for (const t of who) cb.removeStatus(t, id); },
  },
  removeDebuffs: {
    label: '弱体をすべて消す', group: 'status',
    params: { to: { type: 'target', label: '対象' } },
    defaultTo: 'self',
    run(cb, _ctx, _e, who) {
      for (const t of who) for (const id of Object.keys(t.statuses)) if (cb.isDebuff(id, t.statuses[id])) cb.removeStatus(t, id);
    },
  },
  multiplyStatus: {
    label: '状態を倍にする', group: 'status',
    params: { status: { type: 'status', required: true, label: '状態' }, factor: { type: 'num', default: 2, label: '倍率' }, to: { type: 'target', label: '対象' } },
    defaultTo: 'self',
    run(cb, ctx, e, who) {
      const id = statusOf(e, ctx), f = evalNum(e.factor as never, ctx.vars, 2);
      for (const t of who) { const cur = t.statuses[id] || 0; if (cur) cb.addStatus(t, id, Math.floor(cur * f) - cur, ctx.source); }
    },
  },

  /* ----- cards ----- */
  draw: {
    label: 'カードを引く', group: 'cards',
    params: { count: { type: 'num', required: true, label: '枚数' } },
    defaultTo: null,
    run(cb, ctx, e) { if (ctx.source.side === 'player') cb.draw(num(e, 'count', ctx)); },
  },
  addCard: {
    label: 'カードを加える', group: 'cards',
    params: {
      card: { type: 'cardOrSelf', required: true, label: 'カード', help: '$self = このカードのコピー' },
      pile: { type: 'enum', default: 'discard', label: '加える先', options: [['hand', '手札'], ['draw', '山札（ランダムな位置）'], ['drawTop', '山札の一番上'], ['discard', '捨て札']] },
      count: { type: 'num', default: 1, label: '枚数' },
      upgraded: { type: 'bool', default: false, label: '強化済み' },
      free: { type: 'bool', default: false, label: 'このターンはコスト0' },
    },
    defaultTo: null,
    run(cb, ctx, e) {
      const id = e.card === '$self' ? ctx.card?.id ?? '' : String(e.card);
      const up = e.card === '$self' ? !!ctx.card?.up : !!e.upgraded;
      cb.addCards(id, String(e.pile ?? 'discard'), num(e, 'count', ctx, 1), { up, free: !!e.free });
    },
  },
  moveCards: {
    label: 'カードを移す（廃棄・捨てる・戻す）', group: 'cards',
    params: {
      from: { type: 'enum', default: 'hand', label: '元', options: PILES },
      dest: { type: 'enum', default: 'exhaust', label: '先', options: [...PILES, ['drawTop', '山札の一番上']] },
      select: { type: 'enum', default: 'choose', label: '選び方', options: SELECT },
      count: { type: 'num', default: 1, label: '枚数' },
      filter: { type: 'enum', default: '', label: '種類', options: CARD_TYPES },
      prompt: { type: 'string', label: '選ぶときの案内文', help: '空なら自動' },
    },
    defaultTo: null,
    *run(cb, ctx, e) {
      const from = String(e.from ?? 'hand'), to = String(e.dest ?? 'exhaust');
      const cards = yield* cb.pickCards(ctx, { pile: from, select: String(e.select ?? 'choose'), count: num(e, 'count', ctx, 1), filter: String(e.filter ?? ''), prompt: String(e.prompt ?? '') || cb.text(`choice.move.${to}`) });
      cb.moveCards(cards, from, to);
    },
  },
  upgradeCards: {
    label: 'カードを強化（この戦闘中）', group: 'cards',
    params: {
      pile: { type: 'enum', default: 'hand', label: '場所', options: [...PILES.slice(0, 3), ['all', 'すべての山']] },
      select: { type: 'enum', default: 'choose', label: '選び方', options: SELECT },
      count: { type: 'num', default: 1, label: '枚数' },
    },
    defaultTo: null,
    *run(cb, ctx, e) {
      const cards = yield* cb.pickCards(ctx, { pile: String(e.pile ?? 'hand'), select: String(e.select ?? 'choose'), count: num(e, 'count', ctx, 1), filter: 'upgradable', prompt: cb.text('choice.upgrade') });
      for (const c of cards) c.up = true;
    },
  },
  modifyCost: {
    label: 'コストを変える', group: 'cards',
    params: {
      which: { type: 'enum', default: 'this', label: 'どのカード', options: [['this', 'このカード'], ['hand', '手札から選ぶ'], ['handAll', '手札すべて']] },
      mode: { type: 'enum', default: 'add', label: '変え方', options: [['add', '増減'], ['set', 'この値にする'], ['random', '0〜値のランダム']] },
      value: { type: 'num', required: true, label: '値' },
      duration: { type: 'enum', default: 'combat', label: '期間', options: [['turn', 'このターン'], ['combat', 'この戦闘中']] },
      select: { type: 'enum', default: 'choose', label: '選び方（手札から選ぶ時）', options: SELECT },
      count: { type: 'num', default: 1, label: '枚数（手札から選ぶ時）' },
    },
    defaultTo: null,
    *run(cb, ctx, e) {
      let cards: CardInst[] = [];
      if (e.which === 'hand') cards = yield* cb.pickCards(ctx, { pile: 'hand', select: String(e.select ?? 'choose'), count: num(e, 'count', ctx, 1), filter: 'costed', prompt: cb.text('choice.cost') });
      else if (e.which === 'handAll') cards = [...cb.hand];
      else if (ctx.card) cards = [ctx.card];
      for (const c of cards) cb.changeCost(c, String(e.mode ?? 'add'), num(e, 'value', ctx), e.duration === 'turn' ? 'turn' : 'combat');
    },
  },
  cardVar: {
    label: 'このカードの数値を変える', group: 'cards',
    params: { name: { type: 'string', required: true, label: '変数名', help: '式から card.名前 で読める' }, add: { type: 'num', required: true, label: '増減' } },
    defaultTo: null,
    run(_cb, ctx, e) {
      if (!ctx.card) return;
      const k = String(e.name); const v = (ctx.card.vars ??= {});
      v[k] = (v[k] ?? ctx.cardDef?.vars?.[k] ?? 0) + num(e, 'add', ctx);
    },
  },
  replayCard: {
    label: 'このカードをもう一度使う', group: 'cards',
    params: {},
    defaultTo: null,
    run(cb, ctx) { if (ctx.card) cb.replay(ctx.card, ctx.target); },
  },

  /* ----- resources ----- */
  gainEnergy: {
    label: 'エネルギーを得る', group: 'resource',
    params: { amount: { type: 'num', required: true, label: '量' } },
    defaultTo: null,
    run(cb, ctx, e) { if (ctx.source.side === 'player') cb.gainEnergy(num(e, 'amount', ctx)); },
  },
  gainGold: {
    label: 'ゴールドを得る', group: 'run',
    params: { amount: { type: 'num', required: true, label: '量' } },
    defaultTo: null,
    run(cb, ctx, e) { cb.runDelta.gold += num(e, 'amount', ctx); },
  },
  gainMaxHp: {
    label: '最大HPを増やす', group: 'run',
    params: { amount: { type: 'num', required: true, label: '量' } },
    defaultTo: null,
    run(cb, ctx, e) { const n = num(e, 'amount', ctx); cb.player.maxHp += n; cb.player.hp += Math.max(0, n); cb.runDelta.maxHp += n; },
  },

  /* ----- flow ----- */
  repeat: {
    label: '繰り返す', group: 'flow',
    params: { times: { type: 'num', required: true, label: '回数' }, effects: { type: 'effects', label: '繰り返す効果' } },
    defaultTo: null,
    *run(cb, ctx, e) {
      const n = num(e, 'times', ctx);
      for (let i = 0; i < n && !cb.over; i++) yield* cb.runEffects((e.effects as Effect[]) || [], { ...ctx, vars: { ...ctx.vars, i } }, ctx.cardDef);
    },
  },
  if: {
    label: '条件で分ける', group: 'flow',
    params: {
      cond: { type: 'cond', required: true, label: '条件', help: '例: target.vulnerable > 0' },
      then: { type: 'effects', label: '成り立つとき' },
      else: { type: 'effects', label: '成り立たないとき' },
    },
    defaultTo: null,
    *run(cb, ctx, e) {
      const vars = cb.exprVars(ctx);
      const list = evalCond(e.cond as never, vars) ? e.then : e.else;
      if (Array.isArray(list)) yield* cb.runEffects(list as Effect[], ctx, ctx.cardDef);
    },
  },
};

export const EFFECT_GROUPS: Record<EffectOp['group'], string> = {
  attack: '攻撃', defense: '防御・回復', status: '状態', cards: 'カード操作', resource: 'エネルギー', run: '冒険全体', flow: '組み合わせ', plugin: 'プラグイン',
};
export const TARGET_LABELS: Record<TargetSel, string> = {
  target: '対象（選んだ敵／敵から見たプレイヤー／イベントの相手）', self: '自分', allEnemies: '相手全員', randomEnemy: 'ランダムな相手', allAllies: '味方全員', all: '全員',
};

export function registerEffect(op: string, def: EffectOp) { EFFECTS[op] = { ...def, group: def.group ?? 'plugin' }; }
