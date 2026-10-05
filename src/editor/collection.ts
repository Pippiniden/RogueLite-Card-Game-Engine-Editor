import { KINDS } from './schemas.ts';
import { renderFields } from './fields.ts';
import { preview } from './preview.ts';
import { ed, touched, onContent } from './state.ts';
import { h, input, select, button, clear, prompt, modal, toast, debounce } from './ui.ts';
import type { ListKind } from './project.ts';

/* A content kind as list + form + live preview. */

export function collectionSection(kind: ListKind): HTMLElement {
  const def = KINDS[kind];
  const root = h('div', { class: 'coll' });
  const listPane = h('div', { class: 'list-pane' });
  const formPane = h('div', { class: 'form-pane' });
  const pvPane = h('div', { class: 'pv-pane' });
  root.append(listPane, formPane, pvPane);

  let q = '';
  const filters: Record<string, string> = {};
  const ul = h('ul', { class: 'items', role: 'listbox', 'aria-label': def.label });

  const drawList = () => {
    const all = ed.project.merged(kind);
    const shown = all.filter(({ item }) =>
      (!q || `${item.id} ${item.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
      Object.entries(filters).every(([k, v]) => !v || item[k] === v));
    const issues = new Map<string, string>();
    for (const i of ed.issues) if (i.kind === kind) issues.set(i.id, issues.get(i.id) === 'error' ? 'error' : i.sev);
    clear(ul, shown.map(({ item, pack }) => {
      const sev = issues.get(item.id);
      return h('li', { role: 'option', 'aria-selected': String(item.id === ed.selected), class: item.id === ed.selected ? 'on' : '', on: { click: () => { ed.selected = item.id; drawList(); drawForm(); drawPreview(); } } },
        thumbFor(kind, item),
        h('span', { class: 'it-main' }, h('b', null, String(item.name ?? item.id)), h('small', null, def.sub(item))),
        h('span', { class: 'it-side' }, h('code', null, item.id), pack !== ed.project.active ? h('span', { class: 'badge' }, pack) : null, sev ? h('span', { class: `dot ${sev}`, title: sev === 'error' ? 'エラーがあります' : '警告があります' }) : null));
    }));
    count.textContent = `${shown.length} / ${all.length}`;
  };
  const count = h('span', { class: 'count mono' });
  clear(listPane,
    h('div', { class: 'list-tools' },
      input('', v => { q = v; drawList(); }, { type: 'search', placeholder: '名前かIDで検索', 'aria-label': '検索' }),
      (def.filters ?? []).map(f => select('', [['', f.label], ...f.options], v => { filters[f.key] = v; drawList(); }, { 'aria-label': f.label })),
      h('span', { class: 'list-actions' }, count, button('＋ 新規', async () => {
        const id = await prompt(`${def.label}を追加`, 'ID（英数字と _。あとから変えられます）', ed.project.uniqueId(kind, `new_${kind.slice(0, -1)}`));
        if (!id) return;
        if (ed.project.find(kind, id)) { toast('そのIDはもうあります', 'err'); return; }
        ed.project.add(kind, def.make(id) as { id: string });
        ed.selected = id; touched(); drawList(); drawForm(); drawPreview();
      }, 'primary sm'))),
    ul);

  const drawForm = () => {
    clear(formPane);
    const id = ed.selected;
    const found = id ? ed.project.find(kind, id) : undefined;
    if (!found) { formPane.appendChild(h('div', { class: 'empty-state' }, h('p', null, `左の一覧から${def.label}を選ぶか、「＋ 新規」で作ります。`))); return; }
    const { item, pack } = found;
    const own = pack === ed.project.active;
    formPane.appendChild(h('div', { class: 'form-head' },
      h('div', null, h('h2', null, String(item.name ?? item.id)), h('code', null, item.id), h('span', { class: 'badge' }, `パック: ${pack}`)),
      h('div', { class: 'btnrow' },
        own ? button('IDを変える', async () => {
          const to = await prompt('IDを変える', '新しいID', item.id);
          if (!to || to === item.id) return;
          if (ed.project.find(kind, to)) { toast('そのIDはもうあります', 'err'); return; }
          const n = ed.project.rename(kind, item.id, to);
          ed.selected = to; touched(); drawList(); drawForm(); toast(`IDを変えました（参照 ${n} か所も更新）`, 'ok');
        }, 'sm') : null,
        own ? button('複製', () => {
          const copy = structuredClone(item); copy.id = ed.project.uniqueId(kind, `${item.id}_copy`);
          if (typeof copy.name === 'string') copy.name += '（複製）';
          ed.project.add(kind, copy); ed.selected = copy.id; touched(); drawList(); drawForm(); drawPreview();
        }, 'sm') : null,
        own ? button('削除', async () => {
          const ok = await modal(`${item.name ?? item.id} を削除しますか？`, h('p', null, '参照しているカード・主人公・遭遇は「検証」でエラーになります。元に戻す（Ctrl+Z）で戻せます。'), [['やめる', null], ['削除する', 'yes', 'danger']]);
          if (!ok) return;
          ed.project.remove(kind, item.id); ed.selected = null; touched(); drawList(); drawForm(); drawPreview();
        }, 'danger sm') : null)));
    if (!own) {
      formPane.appendChild(h('div', { class: 'notice' }, `この${def.label}はパック「${pack}」のものです。編集すると、いま編集中のパック「${ed.project.active}」に上書き用のコピーを作ります。`,
        button('コピーして編集', () => { ed.project.override(kind, item.id); touched(); drawList(); drawForm(); }, 'primary sm')));
      formPane.appendChild(h('fieldset', { disabled: true, class: 'ro' }, renderFields(item, def.fields)));
      return;
    }
    formPane.appendChild(renderFields(item, def.fields));
    const issues = ed.issues.filter(i => i.kind === kind && i.id === item.id);
    if (issues.length) formPane.appendChild(h('ul', { class: 'issues-inline' }, issues.map(i => h('li', { class: i.sev }, i.msg))));
  };
  const drawPreview = () => { clear(pvPane, ed.selected ? preview(kind, ed.selected) : null); };

  const relist = debounce(drawList, 200);
  const unsub = onContent(() => { if (!root.isConnected) { unsub(); return; } relist(); drawPreview(); });
  if (!ed.selected || !ed.project.find(kind, ed.selected)) ed.selected = ed.project.merged(kind)[0]?.item.id ?? null;
  drawList(); drawForm(); drawPreview();
  return root;
}

function thumbFor(kind: ListKind, item: Record<string, unknown>): HTMLElement {
  const key = kind === 'cards' ? item.art : kind === 'statuses' || kind === 'relics' ? item.icon : kind === 'enemies' ? (typeof item.art === 'string' ? item.art : (item.art as { idle?: string } | undefined)?.idle) : kind === 'characters' ? (item.portrait as Record<string, string> | undefined)?.normal : kind === 'encounters' ? (() => { const e = ed.project.find('enemies', (item.enemies as string[])?.[0] ?? ''); return e ? (typeof e.item.art === 'string' ? e.item.art : '') : ''; })() : '';
  const url = ed.project.assetUrl(key as string | undefined);
  return h('span', { class: `it-thumb t-${kind}${kind === 'cards' ? ' ct-' + item.type : ''}` }, url ? h('img', { src: url, alt: '', loading: 'lazy' }) : null);
}
