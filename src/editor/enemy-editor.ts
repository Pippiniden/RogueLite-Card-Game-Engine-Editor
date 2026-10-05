import type { EnemyDef, MoveDef, AiDef } from '../engine/types.ts';
import { effectsEditor, exprInput, assetPicker } from './fields.ts';
import { h, input, select, button, clear, row } from './ui.ts';
import { touched, ed } from './state.ts';
import { INTENTS, type Opt } from './labels.ts';

/* Moves and AI of an enemy, plus its effect presets and sounds. */

export function movesEditor(obj: Record<string, unknown>): HTMLElement {
  const d = obj as unknown as EnemyDef;
  d.moves ??= {};
  const box = h('div', { class: 'fr wide' }, h('label', null, '行動'));
  const list = h('div', { class: 'moves' });
  const draw = () => {
    clear(list);
    for (const [key, mv] of Object.entries(d.moves)) {
      const rename = (nk: string) => {
        nk = nk.trim(); if (!nk || nk === key || d.moves[nk]) return;
        const moves: Record<string, MoveDef> = {};
        for (const [k, v] of Object.entries(d.moves)) moves[k === key ? nk : k] = v;
        d.moves = moves;
        if (d.ai.type === 'sequence') d.ai.order = d.ai.order.map(x => x === key ? nk : x);
        else { d.ai.table.forEach(t => { if (t.move === key) t.move = nk; }); if (d.ai.first === key) d.ai.first = nk; }
        touched(); draw();
      };
      list.appendChild(h('div', { class: 'move' },
        h('div', { class: 'move-head' },
          h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, 'ID'), h('input', { class: 'mono', value: key, on: { change: (e: Event) => rename((e.target as HTMLInputElement).value) } })),
          h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, '名前'), input(mv.name, v => { mv.name = v; touched(); })),
          h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, '予告の種類'), select(mv.intent, INTENTS, v => { mv.intent = v as MoveDef['intent']; touched(); })),
          button('×', () => { delete d.moves[key]; touched(); draw(); drawAi(); }, 'icon danger', { title: 'この行動を削除' })),
        effectsEditor(mv.effects ??= [])));
    }
    list.appendChild(button('＋ 行動を追加', () => { let k = 'move', n = 2; while (d.moves[k]) k = `move${n++}`; d.moves[k] = { name: '新しい行動', intent: 'attack', effects: [{ op: 'damage', amount: 6 }] }; touched(); draw(); drawAi(); }, 'sm'));
  };
  const ai = h('div', { class: 'ai' });
  const moveOpts = (): Opt[] => Object.entries(d.moves).map(([k, m]) => [k, `${m.name}（${k}）`]);
  const drawAi = () => {
    clear(ai);
    d.ai ??= { type: 'sequence', order: Object.keys(d.moves).slice(0, 1) };
    ai.appendChild(row('行動の決め方', select(d.ai.type, [['sequence', '決まった順番'], ['weighted', '重み付きの抽選']], v => {
      d.ai = v === 'sequence' ? { type: 'sequence', order: Object.keys(d.moves) } : { type: 'weighted', table: Object.keys(d.moves).map(m => ({ move: m, weight: 50 })) };
      touched(); drawAi();
    })));
    if (d.ai.type === 'sequence') {
      const s = d.ai as Extract<AiDef, { type: 'sequence' }>;
      ai.appendChild(h('div', { class: 'seq' }, s.order.map((m, i) => h('span', { class: `seq-chip${d.moves[m] ? '' : ' missing'}` },
        h('small', { class: 'mono' }, String(i + 1)), d.moves[m]?.name ?? m,
        button('←', () => { if (i) { [s.order[i - 1], s.order[i]] = [s.order[i], s.order[i - 1]]; touched(); drawAi(); } }, 'icon', { title: '前へ' }),
        button('×', () => { s.order.splice(i, 1); touched(); drawAi(); }, 'icon danger'))),
        select('', [['', '＋ 順番に追加…'], ...moveOpts()], v => { if (v) { s.order.push(v); touched(); drawAi(); } })));
      ai.appendChild(row('最後まで行ったら戻る位置', input((s.loopFrom ?? 0) + 1, v => { s.loopFrom = Math.max(0, (Number(v) || 1) - 1); if (!s.loopFrom) delete s.loopFrom; touched(); }, { type: 'number', min: 1, class: 'mono num' }), '1 なら最初から繰り返す。2 なら最初の行動は1回だけ'));
    } else {
      const w = d.ai as Extract<AiDef, { type: 'weighted' }>;
      ai.appendChild(row('最初の行動', select(w.first ?? '', [['', '抽選する'], ...moveOpts()], v => { if (v) w.first = v; else delete w.first; touched(); })));
      ai.appendChild(h('div', { class: 'wtable' },
        h('div', { class: 'wrow head' }, h('span', null, '行動'), h('span', null, '重み'), h('span', null, '連続の上限'), h('span', null, '条件'), h('span')),
        w.table.map((t, i) => h('div', { class: 'wrow' },
          select(t.move, moveOpts(), v => { t.move = v; touched(); }),
          input(t.weight, v => { t.weight = Number(v) || 0; touched(); }, { type: 'number', class: 'mono num', min: 0 }),
          input(t.maxRepeat ?? '', v => { if (v === '') delete t.maxRepeat; else t.maxRepeat = Number(v); touched(); }, { type: 'number', class: 'mono num', min: 1, placeholder: '無制限' }),
          exprInput(t.when, v => { if (v === undefined) delete t.when; else t.when = String(v); touched(); }, { cond: true, placeholder: '例: self.hpPct < 50' }),
          button('×', () => { w.table.splice(i, 1); touched(); drawAi(); }, 'icon danger'))),
        button('＋ 行を追加', () => { w.table.push({ move: Object.keys(d.moves)[0], weight: 50 }); touched(); drawAi(); }, 'sm')));
    }
  };
  draw(); drawAi();
  box.append(list, h('label', { class: 'sub' }, '行動パターン（AI）'), ai);
  return box;
}

export function enemyFxEditor(obj: Record<string, unknown>): HTMLElement {
  const d = obj as unknown as EnemyDef;
  const vfx = (d.vfx ??= {}) as Record<string, string>;
  const sfx = (d.sfx ??= {}) as Record<string, string>;
  const presets = (): Opt[] => Object.keys(ed.project.obj('vfx')).filter(k => !k.startsWith('$')).map(k => [k, k]);
  const clean = () => { if (!Object.keys(vfx).length) delete d.vfx; if (!Object.keys(sfx).length) delete d.sfx; };
  const sel = (k: string, def: string) => select(vfx[k] ?? '', [['', `標準（${def}）`], ...presets()], v => { if (v) vfx[k] = v; else delete vfx[k]; clean(); touched(); });
  return h('details', { class: 'group' }, h('summary', null, '演出と効果音'),
    h('div', { class: 'group-body fields' },
      row('被弾の演出', sel('hit', 'enemy.hit')),
      row('攻撃の演出', sel('attack', 'enemy.attack')),
      row('強化の演出', sel('buff', 'enemy.buff')),
      row('倒れる演出', sel('death', 'enemy.death')),
      row('被弾の音', assetPicker(sfx, 'hit', 'se', true)),
      row('攻撃の音', assetPicker(sfx, 'attack', 'se', true)),
      row('倒れる音', assetPicker(sfx, 'death', 'se', true))));
}
