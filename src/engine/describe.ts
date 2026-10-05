import type { Content } from './content.ts';
import type { CardDef, Combatant, Effect } from './types.ts';
import type { Combat } from './combat.ts';
import { evalNum } from './expr.ts';
import { EFFECTS } from './effects.ts';

/* ===== Card text is generated from the effects, so changing a number in data updates the text.
   Templates live in text.<lang>.json → "effects" (a plugin op may bring its own default). ===== */

export type Part = { t: string; k?: 'num' | 'up' | 'down' | 'kw' };

const hasX = (v: unknown) => typeof v === 'string' && /\bX\b/.test(v);
const isExpr = (v: unknown) => typeof v === 'string' && !/^-?\d+(\.\d+)?$/.test(v);

function fmtNum(e: Effect, key: string, kind: 'attack' | 'block' | 'plain', cb?: Combat, target?: Combatant, abs = false): Part {
  const raw = e[key];
  if (raw === undefined) return { t: '1', k: 'num' };
  if (typeof raw !== 'number' && typeof raw !== 'string') return { t: '' };
  if (hasX(raw)) return { t: 'X', k: 'num' };
  if (isExpr(raw)) {
    // an expression: show its current value in combat, otherwise a placeholder
    if (!cb) return { t: '?', k: 'num' };
    const v = Math.floor(evalNum(raw as never, cb.exprVars({ source: cb.player, target, vars: {} })));
    return { t: String(abs ? Math.abs(v) : v), k: 'num' };
  }
  const base = Math.floor(evalNum(raw as never, {}));
  if (!cb || kind === 'plain') return { t: String(abs ? Math.abs(base) : base), k: 'num' };
  const v = kind === 'attack' ? cb.previewAttack(base, target, evalNum(e.strengthMul as never, {}, 1)) : cb.previewBlock(base);
  return { t: String(v), k: v > base ? 'up' : v < base ? 'down' : 'num' };
}

function fill(tpl: string, vals: Record<string, Part | Part[]>): Part[] {
  const out: Part[] = [];
  let last = 0;
  tpl.replace(/\{(\w+)\}/g, (m, k, i) => {
    if (i > last) out.push({ t: tpl.slice(last, i) });
    const v = vals[k];
    if (Array.isArray(v)) out.push(...v); else out.push(v ?? { t: m });
    last = i + m.length;
    return m;
  });
  if (last < tpl.length) out.push({ t: tpl.slice(last) });
  return out;
}

const join = (lists: Part[][], sep: string): Part[] => lists.flatMap((l, i) => i ? [{ t: sep }, ...l] : l);

export function describeEffect(c: Content, e: Effect, card: CardDef | null, cb?: Combat, target?: Combatant): Part[] {
  const T = c.text.effects, U = c.text.ui;
  const tpl = (...keys: string[]) => { for (const k of keys) if (T[k]) return T[k]; return EFFECTS[e.op]?.text ?? keys[keys.length - 1]; };
  const all = e.to === 'allEnemies' || (!e.to && card?.target === 'all_enemies');
  const word = (k: string, fallback: string): Part => ({ t: U[k] ?? fallback });
  const pile = (p: unknown) => word(`pile.${String(p)}`, String(p));
  switch (e.op) {
    case 'damage': {
      const times = e.times !== undefined && e.times !== 1;
      const scope = all ? '.all' : e.to === 'randomEnemy' ? '.random' : '';
      return fill(tpl(`damage${scope}${times ? '.times' : ''}`, `damage${times ? '.times' : ''}`, 'damage'), {
        amount: fmtNum(e, 'amount', e.kind === 'raw' ? 'plain' : 'attack', cb, all ? undefined : target), times: fmtNum(e, 'times', 'plain'),
      });
    }
    case 'block': return fill(tpl('block'), { amount: fmtNum(e, 'amount', e.raw ? 'plain' : 'block', cb) });
    case 'applyStatus': {
      const id = String(e.status);
      const st = c.statuses.get(id);
      const neg = typeof e.stacks === 'number' ? e.stacks < 0 : String(e.stacks).trim().startsWith('-');
      const self = e.to === 'self' || (!e.to && st?.kind === 'buff' && !neg);
      const key = id === '$self' ? (neg ? 'applyStatus.selfStatus.minus' : 'applyStatus.selfStatus') : neg ? (self ? 'applyStatus.self.minus' : 'applyStatus.minus') : self ? 'applyStatus.self' : all ? 'applyStatus.all' : 'applyStatus';
      return fill(tpl(key, 'applyStatus'), { status: { t: st?.name ?? (id === '$self' ? 'この状態' : id), k: 'kw' }, stacks: fmtNum(e, 'stacks', 'plain', cb, target, true) });
    }
    case 'removeStatus': case 'multiplyStatus': {
      const st = c.statuses.get(String(e.status));
      return fill(tpl(e.op), { status: { t: st?.name ?? String(e.status), k: 'kw' }, factor: fmtNum(e, 'factor', 'plain') });
    }
    case 'addCard': {
      const name = e.card === '$self' ? U['card.thisCopy'] ?? 'このカードのコピー' : c.cards.get(String(e.card))?.name ?? String(e.card);
      return fill(tpl('addCard'), { card: { t: name, k: 'kw' }, count: fmtNum(e, 'count', 'plain'), pile: pile(e.pile ?? 'discard') });
    }
    case 'moveCards': {
      const sel = String(e.select ?? 'choose');
      return fill(tpl(`moveCards.${e.dest ?? 'exhaust'}`, 'moveCards'), {
        from: pile(e.from ?? 'hand'), to: pile(e.dest ?? 'exhaust'),
        select: word(`select.${sel}`, ''), count: sel === 'all' ? word('count.all', 'すべて') : [fmtNum(e, 'count', 'plain'), { t: U['count.unit'] ?? '枚' }],
        filter: e.filter ? { t: c.text.cardTypes[String(e.filter)] ?? String(e.filter), k: 'kw' } : { t: '' },
      });
    }
    case 'upgradeCards': {
      const sel = String(e.select ?? 'choose');
      return fill(tpl('upgradeCards'), { pile: pile(e.pile ?? 'hand'), select: word(`select.${sel}`, ''), count: sel === 'all' ? word('count.all', 'すべて') : [fmtNum(e, 'count', 'plain'), { t: U['count.unit'] ?? '枚' }] });
    }
    case 'modifyCost': {
      const which = String(e.which ?? 'this'), mode = String(e.mode ?? 'add');
      const v = fmtNum(e, 'value', 'plain', undefined, undefined, true);
      const neg = typeof e.value === 'number' && e.value < 0;
      return fill(tpl(`modifyCost.${mode}${mode === 'add' ? (neg ? '.down' : '.up') : ''}`, 'modifyCost'), {
        which: word(`which.${which}`, which), value: v, duration: word(`duration.${e.duration ?? 'combat'}`, ''),
      });
    }
    case 'repeat': return fill(tpl('repeat'), { times: fmtNum(e, 'times', 'plain'), effects: join(((e.effects as Effect[]) || []).map(x => describeEffect(c, x, card, cb, target)), '、') });
    case 'if': {
      const then = join(((e.then as Effect[]) || []).map(x => describeEffect(c, x, card, cb, target)), '、');
      const els = join(((e.else as Effect[]) || []).map(x => describeEffect(c, x, card, cb, target)), '、');
      return fill(tpl(els.length ? 'if.else' : 'if'), { then, else: els, cond: { t: String(e.condText ?? e.cond ?? '') } });
    }
    default: {
      const t = tpl(e.op);
      const vals: Record<string, Part> = {};
      for (const k of Object.keys(e)) if (k !== 'op' && k !== 'to') vals[k] = typeof e[k] === 'string' && !isExpr(e[k]) ? { t: String(e[k]) } : fmtNum(e, k, 'plain', cb, target);
      return fill(t, vals);
    }
  }
}

/** lines of the card's rules text (keywords last, like most card games) */
export function describeCard(c: Content, card: CardDef, cb?: Combat, target?: Combatant): Part[][] {
  const lines: Part[][] = [];
  if (card.cost === null) lines.push([{ t: c.text.keywords.unplayable?.name ?? '使用不可', k: 'kw' }]);
  for (const k of (card.keywords || []).filter(k => k === 'innate' || k === 'ethereal')) lines.push([{ t: c.text.keywords[k]?.name ?? k, k: 'kw' }]);
  if (card.text) {
    const vals: Record<string, Part> = {};
    card.effects.forEach((e, i) => {
      const k = e.op === 'damage' && e.kind !== 'raw' ? 'attack' : e.op === 'block' && !e.raw ? 'block' : 'plain';
      const key = e.amount !== undefined ? 'amount' : e.stacks !== undefined ? 'stacks' : e.count !== undefined ? 'count' : e.times !== undefined ? 'times' : 'value';
      vals[String(i)] = fmtNum(e, key, k, cb, target, true);
      for (const p of Object.keys(e)) if (p !== 'op') vals[`${i}.${p}`] = fmtNum(e, p, p === 'amount' ? k : 'plain', cb, target, true);
    });
    card.text.split('\n').forEach(l => lines.push(fill(l, vals)));
  } else {
    for (const e of card.effects) lines.push(describeEffect(c, e, card, cb, target));
  }
  for (const k of (card.keywords || []).filter(k => k !== 'innate' && k !== 'ethereal')) lines.push([{ t: c.text.keywords[k]?.name ?? k, k: 'kw' }]);
  return lines;
}

export function statusText(c: Content, id: string, stacks: number): string {
  const d = c.statuses.get(id);
  return d ? d.desc.replace(/\{stacks\}/g, String(Math.abs(stacks))) : id;
}

/** words in a card's text that have their own explanation (for the long-press panel) */
export function glossary(c: Content, card: CardDef): { name: string; desc: string }[] {
  const out: { name: string; desc: string }[] = [];
  const seen = new Set<string>();
  const add = (name: string, desc: string) => { if (!seen.has(name)) { seen.add(name); out.push({ name, desc }); } };
  if (card.cost === null && c.text.keywords.unplayable) add(c.text.keywords.unplayable.name, c.text.keywords.unplayable.desc);
  if (card.cost === 'X' && c.text.keywords.X) add(c.text.keywords.X.name, c.text.keywords.X.desc);
  for (const k of card.keywords || []) { const kw = c.text.keywords[k]; if (kw) add(kw.name, kw.desc); }
  const walk = (list: Effect[]) => {
    for (const e of list) {
      if ((e.op === 'applyStatus' || e.op === 'removeStatus' || e.op === 'multiplyStatus') && e.status !== '$self') { const s = c.statuses.get(String(e.status)); if (s) add(s.name, s.desc.replace(/\{stacks\}/g, 'N')); }
      if (e.op === 'addCard' && e.card !== '$self') { const d = c.cards.get(String(e.card)); if (d) add(d.name, describeCard(c, d).map(l => l.map(p => p.t).join('')).join('。')); }
      for (const k of ['effects', 'then', 'else']) if (Array.isArray(e[k])) walk(e[k] as Effect[]);
    }
  };
  walk(card.effects);
  return out;
}
