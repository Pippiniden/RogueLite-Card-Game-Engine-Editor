import type { Num } from './types.ts';

/* Tiny, safe expression evaluator for amounts and conditions in data files.
   Numbers, variables (letters, digits, _ and . — e.g. target.vulnerable), + - * / %,
   comparisons < <= > >= == !=, logic && || !, a ? b : c, parentheses,
   and min / max / floor / ceil / round / abs. Comparisons give 1 or 0.
   Nothing outside the variables passed in can be reached. */

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };
type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; v: string }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'tern'; c: Node; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const cache = new Map<string, Node>();
const OPS2 = ['<=', '>=', '==', '!=', '&&', '||'];

function lex(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; out.push({ k: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < src.length && /[A-Za-z0-9_.$]/.test(src[j])) j++; out.push({ k: 'id', v: src.slice(i, j) }); i = j; continue; }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { out.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/%(),<>!?:'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    throw new Error(`式「${src}」に使えない文字「${c}」があります`);
  }
  return out;
}

function parse(src: string): Node {
  const toks = lex(src); let p = 0;
  const peek = () => toks[p];
  const isOp = (...v: string[]) => peek()?.k === 'op' && v.includes(String(peek().v));
  const eat = (v?: string) => { const t = toks[p++]; if (!t || (v && t.v !== v)) throw new Error(`式「${src}」を解釈できません`); return t; };
  const prim = (): Node => {
    const t = eat();
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'op' && (t.v === '-' || t.v === '!')) return { t: 'un', op: t.v, a: prim() };
    if (t.k === 'op' && t.v === '(') { const n = expr(); eat(')'); return n; }
    if (t.k === 'id') {
      if (t.v === 'true') return { t: 'num', v: 1 };
      if (t.v === 'false') return { t: 'num', v: 0 };
      if (isOp('(')) {
        eat('('); const args: Node[] = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { eat(','); args.push(expr()); } }
        eat(')'); return { t: 'call', fn: t.v, args };
      }
      return { t: 'var', v: t.v };
    }
    throw new Error(`式「${src}」を解釈できません`);
  };
  const level = (ops: string[], next: () => Node) => (): Node => { let a = next(); while (isOp(...ops)) { const op = String(eat().v); a = { t: 'bin', op, a, b: next() }; } return a; };
  const prod = level(['*', '/', '%'], prim);
  const sum = level(['+', '-'], prod);
  const cmp = level(['<', '<=', '>', '>=', '==', '!='], sum);
  const and = level(['&&'], cmp);
  const or = level(['||'], and);
  const expr = (): Node => { const c = or(); if (isOp('?')) { eat('?'); const a = expr(); eat(':'); const b = expr(); return { t: 'tern', c, a, b }; } return c; };
  const n = expr();
  if (p !== toks.length) throw new Error(`式「${src}」の後ろに余分な部分があります`);
  return n;
}

const FNS: Record<string, (...a: number[]) => number> = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs };

function run(n: Node, vars: Record<string, number>): number {
  switch (n.t) {
    case 'num': return n.v;
    case 'var': return vars[n.v] ?? 0;
    case 'un': { const a = run(n.a, vars); return n.op === '-' ? -a : a ? 0 : 1; }
    case 'tern': return run(n.c, vars) ? run(n.a, vars) : run(n.b, vars);
    case 'call': { const f = FNS[n.fn]; if (!f) throw new Error(`関数 ${n.fn} はありません`); return f(...n.args.map(a => run(a, vars))); }
    case 'bin': {
      if (n.op === '&&') return run(n.a, vars) && run(n.b, vars) ? 1 : 0;
      if (n.op === '||') return run(n.a, vars) || run(n.b, vars) ? 1 : 0;
      const a = run(n.a, vars), b = run(n.b, vars);
      switch (n.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b ? a / b : 0; case '%': return b ? a % b : 0;
        case '<': return +(a < b); case '<=': return +(a <= b); case '>': return +(a > b); case '>=': return +(a >= b);
        case '==': return +(a === b); case '!=': return +(a !== b);
      }
      return 0;
    }
  }
}

function compiled(v: string): Node { let n = cache.get(v); if (!n) { n = parse(v); cache.set(v, n); } return n; }

export function evalNum(v: Num | undefined | null, vars: Record<string, number> = {}, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return run(compiled(String(v)), vars);
}
/** a condition: empty means "always true" */
export function evalCond(v: Num | undefined | null, vars: Record<string, number>): boolean {
  if (v === undefined || v === null || v === '') return true;
  return !!evalNum(v, vars);
}

/** null when fine, otherwise a readable error (used by the checker and the editor) */
export function checkExpr(v: unknown): string | null {
  if (typeof v === 'number' || typeof v === 'boolean') return null;
  if (typeof v !== 'string') return '数値か式の文字列ではありません';
  try { parse(v); return null; } catch (e) { return (e as Error).message; }
}
/** variable names an expression reads (the editor shows them as hints) */
export function exprVars(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  try { return lex(v).filter(t => t.k === 'id' && !FNS[t.v as string]).map(t => String(t.v)); } catch { return []; }
}
