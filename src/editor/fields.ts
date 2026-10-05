import { EFFECTS, EFFECT_GROUPS, TARGET_LABELS, type ParamSpec } from '../engine/effects.ts';
import { checkExpr } from '../engine/expr.ts';
import { describeEffect } from '../engine/describe.ts';
import type { Effect, Trigger, Modifier, CardDef } from '../engine/types.ts';
import { ed, touched } from './state.ts';
import { h, row, input, textarea, select, checkbox, button, clear, prompt, toast } from './ui.ts';
import { EVENTS, BY, CARD_TYPES, STATS, MOD_OPS, VAR_HELP, type Opt } from './labels.ts';
import type { ListKind } from './project.ts';

/* ===== Schema-driven form fields. Every control writes straight into the object and calls touched(). ===== */

export type F =
  | { k: 'text'; key: string; label: string; help?: string; multiline?: boolean; mono?: boolean; placeholder?: string }
  | { k: 'int'; key: string; label: string; help?: string; min?: number; max?: number; optional?: boolean }
  | { k: 'float'; key: string; label: string; help?: string; step?: number }
  | { k: 'num'; key: string; label: string; help?: string; optional?: boolean }
  | { k: 'cond'; key: string; label: string; help?: string }
  | { k: 'bool'; key: string; label: string; help?: string }
  | { k: 'enum'; key: string; label: string; options: Opt[] | (() => Opt[]); help?: string; empty?: string }
  | { k: 'ref'; key: string; label: string; to: ListKind; empty?: string; help?: string }
  | { k: 'refList'; key: string; label: string; to: ListKind; help?: string }
  | { k: 'tags'; key: string; label: string; help?: string; suggest?: () => string[] }
  | { k: 'flags'; key: string; label: string; options: Opt[]; help?: string; free?: boolean }
  | { k: 'asset'; key: string; label: string; prefix: string; audio?: boolean; help?: string }
  | { k: 'range'; key: string; label: string; help?: string }
  | { k: 'effects'; key: string; label: string; help?: string; card?: boolean }
  | { k: 'triggers'; key: string; label: string; help?: string }
  | { k: 'modifiers'; key: string; label: string; help?: string }
  | { k: 'statusMap'; key: string; label: string; help?: string }
  | { k: 'numMap'; key: string; label: string; help?: string }
  | { k: 'group'; label: string; key?: string; fields: F[]; optional?: string; help?: string; open?: boolean }
  | { k: 'json'; key: string; label: string; help?: string }
  | { k: 'custom'; render: (obj: Record<string, unknown>) => HTMLElement };

type Obj = Record<string, unknown>;
const setOrDelete = (o: Obj, k: string, v: unknown) => { if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete o[k]; else o[k] = v; };
const numOrExpr = (v: string): number | string => v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : v.trim();

export const idOptions = (kind: ListKind, empty?: string): Opt[] => {
  const names = ed.project.merged(kind).map(({ item }) => [item.id, `${item.name ?? item.id}（${item.id}）`] as Opt);
  return empty !== undefined ? [['', empty], ...names] : names;
};

/** a text box for a number or an expression, with inline validation */
export function exprInput(value: unknown, onSet: (v: number | string | undefined) => void, opts: { cond?: boolean; placeholder?: string } = {}): HTMLElement {
  const err = h('span', { class: 'err' });
  const check = (v: string) => { const m = v.trim() === '' ? null : checkExpr(numOrExpr(v)); err.textContent = m ?? ''; inp.classList.toggle('bad', !!m); };
  const inp = input(value === undefined ? '' : String(value), v => { check(v); onSet(v.trim() === '' ? undefined : opts.cond ? v.trim() : numOrExpr(v)); }, { class: 'mono expr', placeholder: opts.placeholder ?? '', title: VAR_HELP });
  check(String(value ?? ''));
  return h('span', { class: 'expr-wrap' }, inp, err);
}

export function renderFields(obj: Obj, fields: F[]): HTMLElement {
  const box = h('div', { class: 'fields' });
  for (const f of fields) box.appendChild(field(obj, f));
  return box;
}

function field(obj: Obj, f: F): HTMLElement {
  switch (f.k) {
    case 'text': {
      const ctl = f.multiline
        ? textarea(obj[f.key] as string, v => { setOrDelete(obj, f.key, v); touched(); }, { rows: 3, class: f.mono ? 'mono' : '', placeholder: f.placeholder ?? '' })
        : input(obj[f.key] as string, v => { setOrDelete(obj, f.key, v); touched(); }, { class: f.mono ? 'mono' : '', placeholder: f.placeholder ?? '' });
      return row(f.label, ctl, f.help, f.multiline);
    }
    case 'int': case 'float':
      return row(f.label, input(obj[f.key] as number, v => { if (v === '' && (f.k === 'float' || f.optional)) delete obj[f.key]; else obj[f.key] = f.k === 'int' ? Math.round(Number(v) || 0) : Number(v) || 0; touched(); }, { type: 'number', class: 'mono num', step: f.k === 'float' ? f.step ?? 0.05 : 1, min: f.k === 'int' ? f.min : undefined, max: f.k === 'int' ? f.max : undefined }), f.help);
    case 'num': case 'cond':
      return row(f.label, exprInput(obj[f.key], v => { setOrDelete(obj, f.key, v); touched(); }, { cond: f.k === 'cond' }), f.help ?? (f.k === 'cond' ? '空なら常に成り立つ。例: target.vulnerable > 0' : undefined));
    case 'bool':
      return h('div', { class: 'fr' }, checkbox(!!obj[f.key], f.label, v => { setOrDelete(obj, f.key, v || undefined); touched(); }), f.help ? h('p', { class: 'help' }, f.help) : null);
    case 'enum': {
      const opts = typeof f.options === 'function' ? f.options() : f.options;
      return row(f.label, select(String(obj[f.key] ?? ''), f.empty !== undefined ? [['', f.empty], ...opts] : opts, v => { setOrDelete(obj, f.key, v); touched(); }), f.help);
    }
    case 'ref':
      return row(f.label, select(String(obj[f.key] ?? ''), idOptions(f.to, f.empty), v => { setOrDelete(obj, f.key, v); touched(); }), f.help);
    case 'refList': return row(f.label, refList(obj, f.key, f.to), f.help, true);
    case 'tags': return row(f.label, tags(obj, f.key, f.suggest), f.help);
    case 'flags': {
      const cur = new Set((obj[f.key] as string[]) ?? []);
      const known = new Set(f.options.map(([v]) => v));
      const commit = () => { setOrDelete(obj, f.key, [...cur]); touched(); };
      const box = h('div', { class: 'flags' }, f.options.map(([v, l]) => checkbox(cur.has(v), l, on => { if (on) cur.add(v); else cur.delete(v); commit(); })));
      if (f.free) box.appendChild(h('div', { class: 'ep wide' }, h('span', { class: 'ep-l' }, 'その他（カンマ区切り）'),
        input([...cur].filter(v => !known.has(v)).join(', '), v => { for (const x of [...cur]) if (!known.has(x)) cur.delete(x); v.split(',').map(x => x.trim()).filter(Boolean).forEach(x => cur.add(x)); commit(); }, { class: 'mono' })));
      return row(f.label, box, f.help, true);
    }
    case 'asset': return row(f.label, assetPicker(obj, f.key, f.prefix, f.audio), f.help);
    case 'range': {
      const r = (obj[f.key] as [number, number]) ?? [1, 1];
      const a = input(r[0], v => { r[0] = Number(v) || 0; obj[f.key] = r; touched(); }, { type: 'number', class: 'mono num' });
      const b = input(r[1], v => { r[1] = Number(v) || 0; obj[f.key] = r; touched(); }, { type: 'number', class: 'mono num' });
      return row(f.label, h('span', { class: 'range' }, a, '〜', b), f.help);
    }
    case 'effects': {
      const list = (obj[f.key] as Effect[]) ?? (obj[f.key] = []);
      return h('div', { class: 'fr wide' }, h('label', null, f.label), effectsEditor(list as Effect[], f.card ? (obj as unknown as CardDef) : undefined), f.help ? h('p', { class: 'help' }, f.help) : null);
    }
    case 'triggers': {
      const list = (obj[f.key] as Trigger[]) ?? [];
      return h('div', { class: 'fr wide' }, h('label', null, f.label), triggersEditor(list, l => setOrDelete(obj, f.key, l)), f.help ? h('p', { class: 'help' }, f.help) : null);
    }
    case 'modifiers': {
      const list = (obj[f.key] as Modifier[]) ?? [];
      return h('div', { class: 'fr wide' }, h('label', null, f.label), modifiersEditor(list, l => setOrDelete(obj, f.key, l)), f.help ? h('p', { class: 'help' }, f.help) : null);
    }
    case 'statusMap': return row(f.label, numMap(obj, f.key, () => idOptions('statuses')), f.help, true);
    case 'numMap': return row(f.label, numMap(obj, f.key), f.help, true);
    case 'group': {
      const target = f.key ? (obj[f.key] as Obj | undefined) : obj;
      const det = h('details', { class: 'group', open: f.open || (f.optional ? !!target : true) }, h('summary', null, f.label));
      const body = h('div', { class: 'group-body' });
      det.appendChild(body);
      const draw = () => {
        const t = f.key ? (obj[f.key] as Obj | undefined) : obj;
        clear(body);
        if (f.help) body.appendChild(h('p', { class: 'help' }, f.help));
        if (!t && f.optional && f.key) { body.appendChild(button(f.optional, () => { obj[f.key!] = {}; touched(); draw(); })); return; }
        body.appendChild(renderFields(t ?? obj, f.fields));
        if (f.optional && f.key) body.appendChild(button('なくす', () => { delete obj[f.key!]; touched(); draw(); }, 'danger sm'));
      };
      draw();
      return det;
    }
    case 'json': {
      const err = h('span', { class: 'err' });
      const t = textarea(JSON.stringify(obj[f.key] ?? null, null, 2), v => { try { obj[f.key] = JSON.parse(v); err.textContent = ''; touched(); } catch (e) { err.textContent = (e as Error).message; } }, { rows: 6, class: 'mono' });
      return row(f.label, h('div', null, t, err), f.help, true);
    }
    case 'custom': return f.render(obj);
  }
}

/* ----- small composite controls ----- */
export function tags(obj: Obj, key: string, suggest?: () => string[]): HTMLElement {
  const box = h('div', { class: 'tags' });
  const draw = () => {
    const list = (obj[key] as string[]) ?? [];
    clear(box,
      list.map((t, i) => h('span', { class: 'tag' }, t, h('button', { type: 'button', 'aria-label': `${t} を外す`, on: { click: () => { list.splice(i, 1); setOrDelete(obj, key, [...list]); touched(); draw(); } } }, '×'))),
      (() => {
        const dl = suggest ? h('datalist', { id: `dl-${key}-${Math.random().toString(36).slice(2, 7)}` }, suggest().filter(s => !list.includes(s)).map(s => h('option', { value: s }))) : null;
        const inp = h('input', { class: 'mono tag-in', placeholder: '追加…', list: dl?.id, on: { keydown: (e: Event) => { const k = e as KeyboardEvent; if (k.key === 'Enter') { const v = inp.value.trim(); if (v && !list.includes(v)) { setOrDelete(obj, key, [...list, v]); touched(); draw(); } } } } });
        return [inp, dl];
      })(),
    );
  };
  draw();
  return box;
}

function refList(obj: Obj, key: string, to: ListKind): HTMLElement {
  const box = h('div', { class: 'reflist' });
  const draw = () => {
    const list = (obj[key] as string[]) ?? [];
    const counts = new Map<string, number>(); list.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
    const nameOf = (id: string) => (ed.project.find(to, id)?.item.name as string) ?? id;
    clear(box,
      h('div', { class: 'reflist-items' }, [...counts].map(([id, n]) => h('span', { class: `ref-chip${ed.project.find(to, id) ? '' : ' missing'}` },
        h('b', null, nameOf(id)), h('small', { class: 'mono' }, id),
        h('span', { class: 'cnt' },
          h('button', { type: 'button', 'aria-label': '1つ減らす', on: { click: () => { list.splice(list.lastIndexOf(id), 1); setOrDelete(obj, key, [...list]); touched(); draw(); } } }, '−'),
          h('span', { class: 'mono' }, `×${n}`),
          h('button', { type: 'button', 'aria-label': '1つ増やす', on: { click: () => { list.splice(list.lastIndexOf(id) + 1, 0, id); obj[key] = [...list]; touched(); draw(); } } }, '+'))))),
      select('', [['', '＋ 追加する…'], ...idOptions(to)], v => { if (!v) return; obj[key] = [...list, v]; touched(); draw(); }),
    );
  };
  draw();
  return box;
}

function numMap(obj: Obj, key: string, keyOptions?: () => Opt[]): HTMLElement {
  const box = h('div', { class: 'nummap' });
  const draw = () => {
    const m = (obj[key] as Record<string, number>) ?? {};
    const commit = () => { setOrDelete(obj, key, Object.keys(m).length ? { ...m } : undefined); touched(); };
    clear(box,
      Object.entries(m).map(([k, v]) => h('div', { class: 'nm-row' },
        keyOptions ? select(k, keyOptions(), nk => { if (nk === k) return; m[nk] = v; delete m[k]; commit(); draw(); }) : input(k, nk => { if (!nk || nk === k) return; m[nk] = v; delete m[k]; commit(); }, { class: 'mono' }),
        input(v, nv => { m[k] = Number(nv) || 0; commit(); }, { type: 'number', class: 'mono num' }),
        button('×', () => { delete m[k]; commit(); draw(); }, 'icon'))),
      button('＋ 追加', async () => {
        const k = keyOptions ? keyOptions()[0]?.[0] : await prompt('追加', '名前');
        if (!k) return; m[k] = keyOptions ? 1 : 0; obj[key] = m; commit(); draw();
      }, 'sm'),
    );
  };
  draw();
  return box;
}

/* ----- asset picker: thumbnail, key choice, upload ----- */
export function assetPicker(obj: Obj, key: string, prefix: string, audio = false, onSet?: (v: string | undefined) => void): HTMLElement {
  const box = h('div', { class: 'asset-pick' });
  const draw = () => {
    const cur = obj[key] as string | undefined;
    const url = ed.project.assetUrl(cur);
    const keys = [...ed.project.assetMap().keys()].filter(k => k.startsWith(prefix + '.') || k === cur).sort();
    const fileIn = h('input', { type: 'file', accept: audio ? 'audio/*' : 'image/*', hidden: true, on: { change: async () => {
      const file = fileIn.files?.[0]; if (!file) return;
      let k = cur && cur.startsWith(prefix) ? cur : '';
      if (!k) { k = await prompt('新しい素材のキー', `キー（${prefix}. で始める）`, `${prefix}.${file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_')}`) ?? ''; if (!k) return; }
      ed.project.setAsset(k, file, file.name, k.split('.')[0]);
      obj[key] = k; onSet?.(k); touched(); draw(); toast(`${file.name} を ${k} に入れました`, 'ok');
    } } }) as HTMLInputElement;
    clear(box,
      audio ? (url ? h('audio', { src: url, controls: true, class: 'aud' }) : h('span', { class: 'thumb empty' }, '音なし'))
        : h('span', { class: `thumb${url ? '' : ' empty'}` }, url ? h('img', { src: url, alt: '' }) : 'なし'),
      h('div', { class: 'asset-ctl' },
        select(cur ?? '', [['', '（なし）'], ...keys.map(k => [k, k] as Opt)], v => { setOrDelete(obj, key, v); onSet?.(v || undefined); touched(); draw(); }, { class: 'mono' }),
        h('span', { class: 'btnrow' }, button(audio ? '音を選ぶ…' : '画像を選ぶ…', () => fileIn.click(), 'sm'), fileIn)),
    );
  };
  draw();
  return box;
}

/* ----- effects ----- */
function opOptions(): { group: string; items: Opt[] }[] {
  const groups = new Map<string, Opt[]>();
  for (const [op, d] of Object.entries(EFFECTS)) { const g = EFFECT_GROUPS[d.group] ?? d.group; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push([op, d.label]); }
  return [...groups].map(([group, items]) => ({ group, items }));
}
function defaultsFor(op: string, keepTo?: unknown): Effect {
  const e: Effect = { op };
  for (const [k, s] of Object.entries(EFFECTS[op]?.params ?? {})) {
    if (k === 'to') continue;
    if (s.required) e[k] = s.default ?? (s.type === 'num' ? 1 : s.type === 'effects' ? [] : s.type === 'status' ? 'strength' : s.type === 'card' || s.type === 'cardOrSelf' ? (ed.project.ids('cards')[0] ?? '') : '');
    else if (s.type === 'effects') e[k] = [];
  }
  if (keepTo && EFFECTS[op]?.params.to) e.to = keepTo as Effect['to'];
  return e;
}

function paramControl(e: Effect, k: string, s: ParamSpec, redraw: () => void, card?: CardDef): HTMLElement {
  const set = (v: unknown) => { setOrDelete(e as Obj, k, v); touched(); };
  switch (s.type) {
    case 'num': case 'int': return exprInput(e[k], v => set(v), { placeholder: s.default !== undefined ? String(s.default) : '' });
    case 'cond': return exprInput(e[k], v => set(v), { cond: true });
    case 'string': return input(e[k] as string, v => set(v), { placeholder: s.default !== undefined ? String(s.default) : '' });
    case 'bool': return checkbox(!!e[k], '', v => set(v || undefined));
    case 'enum': return select(String(e[k] ?? s.default ?? ''), s.options ?? [], v => set(v === String(s.default ?? '') ? undefined : v));
    case 'status': return select(String(e[k] ?? ''), [['$self', 'この状態自身（$self）'], ...idOptions('statuses')], v => set(v));
    case 'card': return select(String(e[k] ?? ''), idOptions('cards'), v => set(v));
    case 'cardOrSelf': return select(String(e[k] ?? ''), [['$self', 'このカードのコピー（$self）'], ...idOptions('cards')], v => set(v));
    case 'target': {
      const def = EFFECTS[e.op]?.defaultTo;
      const defLabel = typeof def === 'string' ? TARGET_LABELS[def] : def === null ? '—' : '効果に合わせる';
      return select(String(e[k] ?? ''), [['', `既定（${card?.target === 'all_enemies' && def === 'target' ? '敵全体' : defLabel}）`], ...Object.entries(TARGET_LABELS) as Opt[]], v => set(v || undefined));
    }
    case 'effects': { const list = (e[k] as Effect[]) ?? (e[k] = []); return effectsEditor(list as Effect[], card); }
  }
  void redraw;
  return h('span');
}

export function effectsEditor(list: Effect[], card?: CardDef): HTMLElement {
  const box = h('div', { class: 'effects' });
  const draw = () => {
    clear(box);
    list.forEach((e, i) => {
      const op = EFFECTS[e.op];
      const desc = h('p', { class: 'eff-desc' });
      const updateDesc = () => {
        if (!ed.content) return;
        try { desc.textContent = '→ ' + describeEffect(ed.content, e, card ?? null).map(p => p.t).join(''); } catch { desc.textContent = ''; }
      };
      const params = h('div', { class: 'eff-params' });
      for (const [k, s] of Object.entries(op?.params ?? {})) {
        const ctl = paramControl(e, k, s, draw, card);
        const wide = s.type === 'effects';
        params.appendChild(h('div', { class: `ep${wide ? ' wide' : ''}`, title: s.help ?? '' }, h('span', { class: 'ep-l' }, s.label), ctl));
      }
      params.addEventListener('input', () => setTimeout(updateDesc, 0));
      params.addEventListener('change', () => setTimeout(updateDesc, 0));
      const head = h('div', { class: 'eff-head' },
        h('span', { class: 'eff-n mono' }, String(i + 1)),
        select(e.op, op ? opOptions() : [[e.op, `${e.op}（未登録）`], ...opOptions().flatMap(g => g.items)], v => { list[i] = defaultsFor(v, e.to); touched(); draw(); }, { class: 'eff-op' }),
        h('span', { class: 'eff-tools' },
          button('↑', () => { if (i) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; touched(); draw(); } }, 'icon', { title: '上へ', disabled: !i }),
          button('↓', () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; touched(); draw(); } }, 'icon', { title: '下へ', disabled: i === list.length - 1 }),
          button('⧉', () => { list.splice(i + 1, 0, structuredClone(e)); touched(); draw(); }, 'icon', { title: '複製' }),
          button('×', () => { list.splice(i, 1); touched(); draw(); }, 'icon danger', { title: '削除' })));
      box.appendChild(h('div', { class: 'eff' }, head, params, desc));
      updateDesc();
    });
    box.appendChild(h('div', { class: 'eff-add' }, select('', [['', '＋ 効果を追加…'], ...opOptions()], v => { if (!v) return; list.push(defaultsFor(v)); touched(); draw(); })));
  };
  draw();
  return box;
}

/* ----- triggers ----- */
export function triggersEditor(list: Trigger[], commit: (l: Trigger[]) => void): HTMLElement {
  const box = h('div', { class: 'triggers' });
  const draw = () => {
    clear(box);
    list.forEach((t, i) => {
      t.if ??= {};
      const cond = t.if as Obj;
      const setIf = (k: string, v: unknown) => { setOrDelete(cond, k, v); if (!Object.keys(cond).length) delete t.if; else t.if = cond as Trigger['if']; commit(list); touched(); };
      box.appendChild(h('div', { class: 'trg' },
        h('div', { class: 'trg-head' },
          h('span', { class: 'trg-when' }, 'いつ'),
          select(t.on, EVENTS, v => { t.on = v as Trigger['on']; commit(list); touched(); }),
          select(t.by ?? 'self', BY, v => { if (v === 'self') delete t.by; else t.by = v as Trigger['by']; commit(list); touched(); }),
          button('×', () => { list.splice(i, 1); commit(list); touched(); draw(); }, 'icon danger', { title: 'このトリガーを削除' })),
        h('div', { class: 'trg-cond' },
          h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, 'カードの種類'), select(String(cond.cardType ?? ''), [['', '問わない'], ...CARD_TYPES], v => setIf('cardType', v))),
          h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, '除く種類'), select(String(cond.cardTypeNot ?? ''), [['', 'なし'], ...CARD_TYPES], v => setIf('cardTypeNot', v))),
          h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, 'N回ごと'), input(cond.every as number, v => setIf('every', v ? Number(v) : undefined), { type: 'number', class: 'mono num', min: 1 })),
          h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, 'ターン'), input(cond.turn as number, v => setIf('turn', v ? Number(v) : undefined), { type: 'number', class: 'mono num', min: 1, placeholder: '毎' })),
          h('div', { class: 'ep wide' }, h('span', { class: 'ep-l' }, '条件式'), exprInput(t.when, v => { if (v === undefined) delete t.when; else t.when = String(v); commit(list); touched(); }, { cond: true, placeholder: '例: amount > 0' }))),
        h('div', { class: 'trg-do' }, h('span', { class: 'trg-when' }, 'すること'), effectsEditor(t.effects ??= []))));
    });
    box.appendChild(button('＋ トリガーを追加', () => { list.push({ on: 'turnStart', effects: [] }); commit(list); touched(); draw(); }, 'sm'));
  };
  draw();
  return box;
}

/* ----- modifiers ----- */
export function modifiersEditor(list: Modifier[], commit: (l: Modifier[]) => void): HTMLElement {
  const box = h('div', { class: 'mods' });
  const draw = () => {
    clear(box);
    list.forEach((m, i) => box.appendChild(h('div', { class: 'mod' },
      select(m.stat, STATS, v => { m.stat = v as Modifier['stat']; commit(list); touched(); }),
      select(m.op, MOD_OPS, v => { m.op = v as Modifier['op']; commit(list); touched(); }),
      exprInput(m.value, v => { m.value = v ?? 0; commit(list); touched(); }, { placeholder: 'stacks' }),
      exprInput(m.when, v => { if (v === undefined) delete m.when; else m.when = String(v); commit(list); touched(); }, { cond: true, placeholder: '条件（任意）' }),
      button('×', () => { list.splice(i, 1); commit(list); touched(); draw(); }, 'icon danger'))));
    box.appendChild(button('＋ 補正を追加', () => { list.push({ stat: 'attackDealt', op: 'add', value: 'stacks' }); commit(list); touched(); draw(); }, 'sm'));
  };
  draw();
  return box;
}

