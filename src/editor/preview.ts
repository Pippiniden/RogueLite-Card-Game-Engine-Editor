import { renderCard } from '../game/cards.ts';
import { installSkins } from '../game/skins.ts';
import { describeEffect, statusText, glossary } from '../engine/describe.ts';
import type { CardDef, EnemyDef, CharacterDef, RelicDef, StatusDef, EncounterDef } from '../engine/types.ts';
import { ed } from './state.ts';
import { h, button } from './ui.ts';
import { playtest } from './playtest.ts';
import type { ListKind } from './project.ts';
import type { EventDef } from '../engine/types.ts';
import { newRun } from '../engine/run.ts';
import { startEvent, fillText, describeRun, eventVars } from '../engine/run-effects.ts';
import { evalCond } from '../engine/expr.ts';

/* Live previews next to the form, drawn with the game's own card renderer and theme. */

export function applyThemeVars(el: HTMLElement) {
  const c = ed.content; if (!c) return;
  for (const [k, v] of Object.entries(c.theme.colors ?? {})) el.style.setProperty(`--c-${k}`, v);
  for (const [k, v] of Object.entries(c.theme.cardTypeColors ?? {})) el.style.setProperty(`--type-${k}`, v);
  for (const [k, v] of Object.entries(c.theme.rarityColors ?? {})) el.style.setProperty(`--rar-${k}`, v);
  if (c.theme.fonts) { el.style.setProperty('--f-display', c.theme.fonts.display); el.style.setProperty('--f-body', c.theme.fonts.body); }
  installSkins(c);
}

const firstChar = () => [...(ed.content?.characters.keys() ?? [])][0] ?? '';

export function preview(kind: ListKind, id: string): HTMLElement {
  const c = ed.content;
  const box = h('div', { class: 'pv game-theme' });
  applyThemeVars(box);
  if (!c) return box;
  const txt = (s: string) => h('p', { class: 'pv-note' }, s);
  switch (kind) {
    case 'cards': {
      const d = c.cards.get(id) as CardDef | undefined; if (!d) break;
      box.append(h('div', { class: 'pv-cards' },
        h('figure', null, renderCard(c, { uid: 0, id, up: false }), h('figcaption', null, '通常')),
        d.upgrade ? h('figure', null, renderCard(c, { uid: 0, id, up: true }), h('figcaption', null, '強化後')) : null));
      const g = glossary(c, d);
      if (g.length) box.appendChild(h('ul', { class: 'pv-gloss' }, g.map(x => h('li', null, h('b', null, x.name), ' ', x.desc))));
      const charId = [...c.characters.values()].find(ch => ch.cardPools.some(p => d.pools?.includes(p)))?.id ?? firstChar();
      box.appendChild(h('div', { class: 'pv-actions' },
        button('このカードで戦闘テスト', () => playtest({ battle: { encounter: '', enemies: [[...c.enemies.keys()][0]], char: charId, deck: [...Array(4).fill(id), ...(c.characters.get(charId)?.deck ?? []).slice(0, 6)] } }), 'primary sm'),
        button('強化版で', () => playtest({ battle: { encounter: '', enemies: [[...c.enemies.keys()][0]], char: charId, deck: [...Array(4).fill(id + '+'), ...(c.characters.get(charId)?.deck ?? []).slice(0, 6)] } }), 'sm')));
      break;
    }
    case 'statuses': {
      const d = c.statuses.get(id) as StatusDef | undefined; if (!d) break;
      const icon = c.assets.get(d.icon ?? '');
      box.append(h('div', { class: 'pv-status' }, icon ? h('img', { src: icon, alt: '' }) : h('span', { class: 'thumb empty' }, 'なし'),
        h('div', null, h('b', null, d.name), h('p', null, statusText(c, id, 3)), h('small', null, '（量3の例）'))));
      const users = [...c.cards.values()].filter(x => JSON.stringify(x).includes(`"status":"${id}"`)).map(x => x.name);
      const ens = [...c.enemies.values()].filter(x => JSON.stringify(x).includes(`"${id}"`)).map(x => x.name);
      if (users.length || ens.length) box.appendChild(txt(`使っているもの: ${[...users, ...ens].join('、')}`));
      break;
    }
    case 'relics': {
      const d = c.relics.get(id) as RelicDef | undefined; if (!d) break;
      const icon = c.assets.get(d.icon ?? '');
      box.append(h('div', { class: 'pv-status' }, icon ? h('img', { src: icon, alt: '' }) : h('span', { class: 'thumb empty' }, 'なし'), h('div', null, h('b', null, d.name), h('p', null, d.desc))));
      break;
    }
    case 'enemies': {
      const d = c.enemies.get(id) as EnemyDef | undefined; if (!d) break;
      const art = c.assets.get(typeof d.art === 'string' ? d.art : d.art?.idle ?? '');
      box.append(h('div', { class: 'pv-enemy' }, art ? h('img', { src: art, alt: '', style: { height: `${(c.rules.sizes?.[d.size] ?? 0.5) * 300}px` } }) : h('span', { class: 'thumb empty' }, '絵なし')),
        h('p', { class: 'pv-note' }, `HP ${d.hp?.join('〜')}`),
        h('ul', { class: 'pv-moves' }, Object.entries(d.moves ?? {}).map(([k, m]) => h('li', null, h('b', null, m.name || k), h('small', null, ` ${c.text.intents[m.intent] ?? m.intent}`), h('p', null, (m.effects ?? []).map(e => describeEffect(c, e, null).map(p => p.t).join('')).join('、') || '何もしない')))),
        h('div', { class: 'pv-actions' }, button('この敵と戦闘テスト', () => playtest({ battle: { encounter: '', enemies: [id], char: firstChar() } }), 'primary sm')));
      break;
    }
    case 'encounters': {
      const d = c.encounters.get(id) as EncounterDef | undefined; if (!d) break;
      const W = 300, H = 300 * 345 / 390;
      const stage = h('div', { class: 'pv-formation', style: { width: `${W}px`, height: `${H}px` } });
      const form = c.rules.formations?.[String(d.enemies.length)] ?? [];
      d.enemies.forEach((e, i) => {
        const ed2 = c.enemies.get(e); const f = form[i]; if (!ed2 || !f) return;
        const art = c.assets.get(typeof ed2.art === 'string' ? ed2.art : ed2.art?.idle ?? '');
        const hh = (c.rules.sizes?.[ed2.size] ?? 0.5) * H * (f.scale ?? 1);
        if (art) stage.appendChild(h('img', { src: art, alt: ed2.name, style: { left: `${f.x * W}px`, top: `${f.y * H}px`, height: `${hh}px` } }));
      });
      if (!form.length) stage.appendChild(txt(`敵${d.enemies.length}体の陣形がありません（ルール → 陣形）`));
      box.append(stage, h('div', { class: 'pv-actions' }, button('この遭遇で戦闘テスト', () => playtest({ battle: { encounter: id, char: firstChar() } }), 'primary sm')));
      break;
    }
    case 'characters': {
      const d = c.characters.get(id) as CharacterDef | undefined; if (!d) break;
      box.append(h('div', { class: 'pv-faces' }, Object.entries(d.portrait ?? {}).map(([k, key]) => { const u = c.assets.get(key); return h('figure', null, u ? h('img', { src: u, alt: '' }) : h('span', { class: 'thumb empty' }, 'なし'), h('figcaption', null, k)); })));
      const counts = new Map<string, number>(); d.deck.forEach(x => counts.set(x, (counts.get(x) ?? 0) + 1));
      box.appendChild(h('div', { class: 'pv-deck' }, [...counts].map(([cid, n]) => { const el = renderCard(c, { uid: 0, id: cid, up: false }); return h('div', { class: 'pv-deck-item' }, el, h('span', { class: 'mono' }, `×${n}`)); })));
      box.appendChild(h('div', { class: 'pv-actions' }, button('この主人公で冒険テスト', () => playtest({ run: { char: id } }), 'primary sm')));
      break;
    }
    case 'events': {
      const ev = c.events.get(id) as EventDef | undefined; if (!ev?.pages?.start) { box.appendChild(txt('ページ「start」がありません')); break; }
      // a sample run (first character, floor 5, 120 gold) so variables and conditions show real numbers
      const run = newRun(c, firstChar(), 1);
      run.gold = 120; run.stats.floors = 5;
      startEvent(c, run, ev);
      const body = h('div', { class: 'pv-event' });
      const tabs = h('div', { class: 'pv-tabs' });
      const show = (pid: string) => {
        run.event!.page = pid;
        const pg = ev.pages[pid]; const vars = eventVars(c, run);
        const art = c.assets.get(pg.art ?? ev.art ?? '');
        body.replaceChildren(
          art ? h('img', { class: 'pv-event-art', src: art, alt: '' }) : h('div', { class: 'pv-event-art empty' }, '絵なし'),
          h('h4', null, ev.name),
          h('div', { class: 'pv-event-text' }, fillText(c, run, pg.text ?? '').split('\n').map(l => h('p', null, l || '\u00a0'))),
          h('div', { class: 'pv-event-opts' }, pg.options.length ? pg.options.map(o => {
            const hidden = o.when && !evalCond(o.when as never, vars);
            const on = !o.enableIf || evalCond(o.enableIf as never, vars);
            const desc = o.desc !== undefined ? fillText(c, run, o.desc) : describeRun(c, o.effects, vars);
            return h('div', { class: `pv-event-opt${on ? '' : ' off'}${hidden ? ' hid' : ''}` }, h('b', null, fillText(c, run, o.label)), desc ? h('small', null, desc) : null,
              !on && o.disabledText ? h('small', { class: 'why' }, fillText(c, run, o.disabledText)) : null, hidden ? h('small', { class: 'why' }, '（今は表示されない）') : null,
              o.next ? h('span', { class: 'pv-next mono' }, `→ ${o.next}`) : null);
          }) : h('div', { class: 'pv-event-opt' }, h('b', null, c.text.ui['event.continue'] ?? '先へ進む'))));
        tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === pid));
      };
      for (const pid of Object.keys(ev.pages)) tabs.appendChild(h('button', { type: 'button', class: 'btn sm', 'data-p': pid, on: { click: () => show(pid) } }, pid));
      box.append(tabs, body, txt(`見本の数値: ${c.characters.get(firstChar())?.name ?? ''}・5階・120ゴールド。変数 ${Object.entries(run.event!.vars).map(([k, v]) => `${k}=${v}`).join(' ') || 'なし'}`),
        h('div', { class: 'pv-actions' }, button('このイベントを試す', () => playtest({ event: { id, char: firstChar(), gold: 120, floor: 5 } }), 'primary sm')));
      show('start');
      break;
    }
  }
  return box;
}
