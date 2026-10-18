import type { EventDef, EventPage, EventOption } from '../engine/types.ts';
import { effectsEditor, exprInput, assetPicker } from './fields.ts';
import { h, input, textarea, select, button, clear, prompt } from './ui.ts';
import { touched } from './state.ts';
import type { Opt } from './labels.ts';

/* Pages and options of an event ("?" room), and its variables. */

const ID_RE = /^[A-Za-z_][\w]*$/;

/** values fixed when the event starts: { cost: "floor(maxHp * 0.1)" } */
export function varsEditor(obj: Record<string, unknown>): HTMLElement {
  const box = h('div', { class: 'fr wide' }, h('label', null, '変数（イベントが始まった時に決まる値）'));
  const list = h('div', { class: 'kv' });
  const draw = () => {
    clear(list);
    const vars = (obj.vars as Record<string, string | number>) ?? {};
    for (const [k, v] of Object.entries(vars)) {
      list.appendChild(h('div', { class: 'kv-row' },
        h('input', { class: 'mono', value: k, 'aria-label': '変数名', on: { change: (e: Event) => {
          const nk = (e.target as HTMLInputElement).value.trim();
          if (!ID_RE.test(nk) || nk in vars) { (e.target as HTMLInputElement).value = k; return; }
          const out: Record<string, string | number> = {};
          for (const [a, b] of Object.entries(vars)) out[a === k ? nk : a] = b;
          obj.vars = out; touched(); draw();
        } } }),
        h('span', { class: 'kv-eq' }, '='),
        exprInput(v, nv => { vars[k] = nv ?? 0; obj.vars = vars; touched(); }, { placeholder: '例: 40 + floor * 2' }),
        button('×', () => { delete vars[k]; if (!Object.keys(vars).length) delete obj.vars; touched(); draw(); }, 'icon danger', { title: 'この変数を削除' })));
    }
    list.appendChild(button('＋ 変数を追加', async () => {
      const k = await prompt('変数を追加', '名前（英数字。文章や式で {名前} / 名前 として使う）');
      if (!k || !ID_RE.test(k)) return;
      obj.vars = { ...vars, [k]: 0 }; touched(); draw();
    }, 'sm'));
  };
  draw();
  box.append(list, h('p', { class: 'help' }, '式では gold・hp・maxHp・floor・deck・deck.upgradable などが使えます。文章とボタンの文字では {名前} に値が入ります（{name} は主人公の名前）。'));
  return box;
}

export function pagesEditor(obj: Record<string, unknown>): HTMLElement {
  const ev = obj as unknown as EventDef;
  ev.pages ??= { start: { text: '', options: [] } };
  const box = h('div', { class: 'fr wide' }, h('label', null, 'ページ'));
  const list = h('div', { class: 'pages' });
  const pageIds = () => Object.keys(ev.pages);

  const renamePage = (from: string, to: string) => {
    const pages: Record<string, EventPage> = {};
    for (const [k, v] of Object.entries(ev.pages)) pages[k === from ? to : k] = v;
    ev.pages = pages;
    // follow the rename in "next" and goto effects
    const walk = (l?: { op: string; page?: unknown; then?: unknown; else?: unknown }[]) => (l ?? []).forEach(e => {
      if (e.op === 'goto' && e.page === from) e.page = to;
      walk(e.then as never); walk(e.else as never);
    });
    for (const p of Object.values(ev.pages)) for (const o of p.options) { if (o.next === from) o.next = to; walk(o.effects as never); }
  };

  const optionEditor = (page: EventPage, o: EventOption, i: number) => {
    const nextOpts: Opt[] = [['', '（イベントを終える）'], ...pageIds().map(p => [p, p] as Opt)];
    return h('div', { class: 'ev-opt' },
      h('div', { class: 'ev-opt-head' },
        h('span', { class: 'eff-n mono' }, String(i + 1)),
        input(o.label, v => { o.label = v; touched(); }, { class: 'ev-label', placeholder: 'ボタンの文字（{bet}ゴールド賭ける のように変数も使える）' }),
        h('span', { class: 'eff-tools' },
          button('↑', () => { if (i) { [page.options[i - 1], page.options[i]] = [page.options[i], page.options[i - 1]]; touched(); draw(); } }, 'icon', { title: '上へ', disabled: !i }),
          button('↓', () => { if (i < page.options.length - 1) { [page.options[i + 1], page.options[i]] = [page.options[i], page.options[i + 1]]; touched(); draw(); } }, 'icon', { title: '下へ', disabled: i === page.options.length - 1 }),
          button('×', () => { page.options.splice(i, 1); touched(); draw(); }, 'icon danger', { title: 'この選択肢を削除' }))),
      h('div', { class: 'eff-params' },
        h('div', { class: 'ep wide' }, h('span', { class: 'ep-l' }, '説明（空なら効果から自動）'), input(o.desc, v => { if (v) o.desc = v; else delete o.desc; touched(); })),
        h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, '表示する条件'), exprInput(o.when, v => { if (v === undefined || v === '') delete o.when; else o.when = String(v); touched(); }, { cond: true, placeholder: '常に' })),
        h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, '選べる条件'), exprInput(o.enableIf, v => { if (v === undefined || v === '') delete o.enableIf; else o.enableIf = String(v); touched(); }, { cond: true, placeholder: '例: gold >= 50' })),
        h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, '選べない時の文字'), input(o.disabledText, v => { if (v) o.disabledText = v; else delete o.disabledText; touched(); }, { placeholder: 'ゴールドが足りない' })),
        h('div', { class: 'ep' }, h('span', { class: 'ep-l' }, '次のページ'), select(o.next ?? '', nextOpts, v => { if (v) o.next = v; else delete o.next; touched(); })),
        h('div', { class: 'ep wide' }, h('span', { class: 'ep-l' }, '起きること'), effectsEditor(o.effects ??= [], undefined, { run: true, pages: pageIds }))));
  };

  const draw = () => {
    clear(list);
    for (const [pid, page] of Object.entries(ev.pages)) {
      page.options ??= [];
      const isStart = pid === 'start';
      list.appendChild(h('div', { class: 'ev-page' },
        h('div', { class: 'ev-page-head' },
          h('b', { class: 'mono' }, pid),
          isStart ? h('span', { class: 'badge' }, '最初のページ') : null,
          h('span', { class: 'eff-tools' },
            isStart ? null : button('名前を変える', async () => {
              const to = await prompt('ページの名前', '英数字', pid);
              if (!to || to === pid || !ID_RE.test(to) || ev.pages[to]) return;
              renamePage(pid, to); touched(); draw();
            }, 'sm'),
            isStart ? null : button('削除', () => { delete ev.pages[pid]; touched(); draw(); }, 'sm danger'))),
        h('div', { class: 'ev-page-body' },
          h('div', { class: 'ev-text' }, h('span', { class: 'ep-l' }, '文章（改行そのまま。{変数} が使える）'), textarea(page.text, v => { page.text = v; touched(); }, { rows: 4 })),
          h('div', { class: 'ev-art' }, h('span', { class: 'ep-l' }, 'このページの絵（空ならイベントの絵）'), assetPicker(page as unknown as Record<string, unknown>, 'art', 'event'))),
        h('div', { class: 'ev-opts' },
          page.options.map((o, i) => optionEditor(page, o, i)),
          page.options.length ? null : h('p', { class: 'help' }, '選択肢がないページには「先へ進む」ボタンだけが出て、押すとイベントが終わります。'),
          button('＋ 選択肢を追加', () => { page.options.push({ label: '新しい選択肢' }); touched(); draw(); }, 'sm'))));
    }
    list.appendChild(button('＋ ページを追加', async () => {
      const id = await prompt('ページを追加', '名前（英数字。例: win, lose）');
      if (!id || !ID_RE.test(id) || ev.pages[id]) return;
      ev.pages[id] = { text: '', options: [] }; touched(); draw();
    }, 'sm'));
  };
  draw();
  box.append(list, h('p', { class: 'help' }, '選択肢を押すと「起きること」を上から順に実行し、「次のページ」へ進みます。確率で分けたい時は効果「確率で」の中に「イベントのページへ進む」を入れます。'));
  return box;
}
