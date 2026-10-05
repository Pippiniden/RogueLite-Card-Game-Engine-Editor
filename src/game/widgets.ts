import type { App } from './app.ts';
import type { Node } from './layout.ts';
import type { WidgetName } from './registry-names.ts';
import type { CardInst, Combatant, MapNode } from '../engine/types.ts';
import { canUpgrade } from '../engine/content.ts';
import { currentNode, reachable, enterNode, takeGold, takeRelic, takeCard, upgradeCard } from '../engine/run.ts';
import { statusText, glossary } from '../engine/describe.ts';
import { img, assetUrl } from './assets.ts';
import { renderCard, fillCard } from './cards.ts';
import { skinClass } from './skins.ts';
import { beginBattle, selectCard, playCard, tapEnemy } from './battle.ts';

/* ===== Widgets: what fills an element with a given bind.
   update() runs on every refresh, so each one only touches the DOM when its data changed.
   Plugins can add more with registerWidget(bind, { mount?, update }). ===== */

export interface Widget { mount?(n: Node, app: App): void; update(n: Node, app: App): void }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** set innerHTML only when the content signature changed */
export function paint(el: HTMLElement, sig: string, draw: () => void) { if (el.dataset.sig === sig) return; el.dataset.sig = sig; draw(); }
const text = (fn: (app: App, n: Node) => string): Widget => ({ update(n, app) { const t = fn(app, n); if (n.el.textContent !== t) n.el.textContent = t; } });

/** tap / long-press / swipe-up on one element */
export function pressable(el: HTMLElement, h: { tap?: () => void; long?: () => void; swipeUp?: () => void }) {
  let timer = 0, sx = 0, sy = 0, fired = false, swiped = false, down = false;
  el.addEventListener('pointerdown', ev => {
    down = true; fired = false; swiped = false; sx = ev.clientX; sy = ev.clientY;
    if (h.long) timer = window.setTimeout(() => { fired = true; h.long!(); }, 450);
  });
  el.addEventListener('pointermove', ev => {
    if (!down) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(timer);
    if (h.swipeUp && dy < -45 && Math.abs(dy) > Math.abs(dx) && !swiped) { swiped = true; h.swipeUp(); }
  });
  const end = () => { down = false; clearTimeout(timer); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('click', ev => { ev.stopPropagation(); if (fired || swiped) return; h.tap?.(); });
  el.addEventListener('contextmenu', ev => ev.preventDefault());
}

function gauge(el: HTMLElement, cur: number, max: number, block = 0) {
  paint(el, `${cur}/${max}/${block}`, () => {
    el.classList.add('gauge');
    el.innerHTML = `<div class="gauge-bar ${skinClass('gauge.track')}${block ? ' has-block' : ''}"><i class="${skinClass('gauge.fill')}" style="width:${Math.max(0, Math.min(100, cur / max * 100))}%"></i></div><span class="gauge-num">${cur}/${max}</span>${block ? `<b class="blk-badge">${block}</b>` : ''}`;
  });
}

function statusIcons(app: App, el: HTMLElement, sts: Record<string, number>, onTap: () => void) {
  const entries = Object.entries(sts).filter(([id, v]) => v !== 0 && !app.content.statuses.get(id)?.flags?.includes('hidden'));
  paint(el, JSON.stringify(entries), () => {
    el.innerHTML = '';
    for (const [id, v] of entries) {
      const d = app.content.statuses.get(id);
      const s = document.createElement('span');
      s.className = `st st-${d?.kind === 'debuff' || v < 0 ? 'debuff' : 'buff'}`;
      s.appendChild(img(app.content, d?.icon, d?.name ?? id));
      if (d?.stacking !== 'counter' || v !== 1) { const b = document.createElement('b'); b.textContent = String(v); s.appendChild(b); }
      s.title = d ? `${d.name}: ${statusText(app.content, id, v)}` : id;
      el.appendChild(s);
    }
    el.onclick = ev => { ev.stopPropagation(); if (entries.length) onTap(); };
  });
}

function cardList(app: App, el: HTMLElement, cards: CardInst[], sig: string, onTap: (c: CardInst) => void, long?: (c: CardInst) => void, picked?: Set<number>) {
  paint(el, sig, () => {
    el.innerHTML = '';
    el.classList.add('card-grid');
    if (!cards.length) { el.innerHTML = `<p class="empty">${esc(app.t('list.empty'))}</p>`; return; }
    for (const c of cards) {
      const cel = renderCard(app.content, c, { combat: app.combat ?? undefined });
      if (picked?.has(c.uid)) cel.classList.add('picked');
      pressable(cel, { tap: () => onTap(c), long: long ? () => long(c) : undefined });
      el.appendChild(cel);
    }
  });
}
const sortCards = (app: App, list: CardInst[]) => [...list].sort((a, b) => {
  const da = app.content.cards.get(a.id), db = app.content.cards.get(b.id);
  const order = ['attack', 'skill', 'power', 'status', 'curse'];
  return order.indexOf(da?.type ?? '') - order.indexOf(db?.type ?? '') || (da?.name ?? '').localeCompare(db?.name ?? '') || Number(b.up) - Number(a.up);
});

const char = (app: App) => app.content.characters.get(app.run?.char ?? app.ui.charId) ?? [...app.content.characters.values()][0];
const hpOf = (app: App) => app.view ? { hp: app.view.player.hp, max: app.view.player.maxHp } : { hp: app.run?.hp ?? 0, max: app.run?.maxHp ?? 1 };

/* ----- map ----- */
const ROW = 66;
function stepTo(app: App, node: MapNode) {
  const run = app.run!;
  enterNode(app.content, run, node);
  app.save();
  if (run.phase === 'battle') beginBattle(app);
  else if (run.phase === 'rest') { app.ui.restDone = false; app.go('REST'); }
  else app.go('REWARD');
}
function drawMap(n: Node, app: App) {
  const run = app.run; if (!run) return;
  const el = n.el, W = n.spec.w, F = run.map.floors.length;
  const H = (F + 1) * ROW + 70;
  const pos = (m: MapNode) => m.type === 'boss' ? { x: W / 2, y: 44 } : { x: Math.max(30, Math.min(W - 30, m.x * W)), y: H - 40 - m.floor * ROW };
  const next = new Set(reachable(run));
  const visited = new Set((run.path ?? []).map(p => `${p.floor}:${p.col}`));
  const cur = currentNode(run);
  paint(el, JSON.stringify([run.path, run.phase]), () => {
    el.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'map-inner';
    inner.style.height = H + 'px';
    let lines = '';
    const all: MapNode[] = [];
    run.map.floors.forEach(row => row.forEach(m => { if (m) all.push(m); }));
    for (const m of all) {
      const a = pos(m);
      const targets = m.floor === F - 1 ? [run.map.boss] : m.next.map(c => run.map.floors[m.floor + 1][c]!).filter(Boolean);
      for (const t of targets) {
        const b = pos(t);
        const walked = visited.has(`${m.floor}:${m.col}`) && (t.type === 'boss' ? visited.has(`${F}:${t.col}`) : visited.has(`${t.floor}:${t.col}`));
        lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? 'walked' : ''}"/>`;
      }
    }
    inner.innerHTML = `<svg class="map-lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${lines}</svg>`;
    for (const m of [...all, run.map.boss]) {
      const p = pos(m);
      const b = document.createElement('button');
      b.type = 'button';
      const key = m.type === 'boss' ? `${F}:${m.col}` : `${m.floor}:${m.col}`;
      b.className = `map-node n-${m.type} ${skinClass(m.type === 'boss' ? 'map.node.boss' : 'map.node')}${next.has(m) ? ' reach' : ''}${visited.has(key) ? ' visited' : ''}${cur === m ? ' current' : ''}`;
      Object.assign(b.style, { left: `${p.x}px`, top: `${p.y}px` });
      const label = app.content.text.nodes[m.type] ?? m.type;
      b.appendChild(img(app.content, `node.${m.type}`, label));
      b.setAttribute('aria-label', label);
      if (next.has(m)) b.addEventListener('click', () => { app.sound.se('click'); stepTo(app, m); }); else b.disabled = true;
      inner.appendChild(b);
    }
    el.appendChild(inner);
    const focusY = next.size ? Math.max(...[...next].map(m => pos(m).y)) : cur ? pos(cur).y : H;
    requestAnimationFrame(() => { el.scrollTop = Math.max(0, focusY - el.clientHeight * 0.7); });
  });
}

/* ----- enemies ----- */
function drawEnemies(n: Node, app: App) {
  const v = app.view; if (!v) return;
  const el = n.el, W = n.spec.w, H = n.spec.h, R = app.content.rules;
  const form = R.formations[String(v.enemies.length)] ?? R.formations['1'];
  const selected = app.combat?.hand.find(c => c.uid === app.ui.selected);
  const targeting = !!selected && app.combat!.view(selected).target === 'enemy';
  el.classList.toggle('targeting', targeting);
  v.enemies.forEach((e, i) => {
    let box = el.querySelector<HTMLElement>(`.enemy[data-uid="${e.uid}"]`);
    const d = app.content.enemies.get(e.def)!;
    if (!box) {
      box = document.createElement('div');
      box.className = 'enemy';
      box.dataset.uid = String(e.uid);
      const f = form[i] ?? { x: (i + 0.5) / v.enemies.length, y: 0.85 };
      const h = (R.sizes[d.size] ?? 0.5) * H * (f.scale ?? 1);
      Object.assign(box.style, { left: `${f.x * W}px`, top: `${f.y * H}px` });
      box.innerHTML = `<div class="enemy-intent"></div><div class="enemy-body" style="height:${h}px;margin-bottom:${-(d.footOffset ?? 0) * h}px"></div><div class="enemy-hp"></div><div class="enemy-st"></div>`;
      const art = typeof d.art === 'string' ? d.art : d.art.idle;
      box.querySelector('.enemy-body')!.appendChild(img(app.content, art, d.name));
      pressable(box, { tap: () => tapEnemy(app, e.uid), long: () => app.showInfo({ kind: 'enemy', uid: e.uid }) });
      el.appendChild(box);
    }
    box.classList.toggle('dead', !e.alive);
    box.classList.toggle('targetable', targeting && e.alive);
    gauge(box.querySelector('.enemy-hp')!, e.hp, e.maxHp, e.block);
    statusIcons(app, box.querySelector('.enemy-st')!, e.statuses, () => app.showInfo({ kind: 'enemy', uid: e.uid }));
    const intentEl = box.querySelector<HTMLElement>('.enemy-intent')!;
    const info = e.alive && v.phase === 'player' && app.combat ? app.combat.intentInfo(e as Combatant) : null;
    paint(intentEl, info ? `${info.intent}/${info.damage}/${info.times}` : '-', () => {
      intentEl.innerHTML = '';
      if (!info) return;
      const [main, sub] = info.intent.split('_');
      intentEl.appendChild(img(app.content, `intent.${main}`, app.content.text.intents[info.intent] ?? ''));
      if (info.damage !== undefined) { const b = document.createElement('b'); b.textContent = info.times && info.times > 1 ? `${info.damage}×${info.times}` : String(info.damage); intentEl.appendChild(b); }
      if (sub) intentEl.appendChild(img(app.content, `intent.${sub}`, '', 'intent-sub'));
    });
  });
}

/* ----- hand ----- */
const CW = 96, CH = 134;
function drawHand(n: Node, app: App) {
  const cb = app.combat, v = app.view; if (!cb || !v) return;
  const el = n.el, W = n.spec.w, H = n.spec.h;
  const hand = v.hand;
  const present = new Set(hand.map(c => c.uid));
  el.querySelectorAll<HTMLElement>('.card').forEach(c => { if (!present.has(Number(c.dataset.uid))) c.remove(); });
  const N = hand.length;
  const step = N > 1 ? Math.min(CW * 0.9, (W - CW - 24) / (N - 1)) : 0;
  const myTurn = v.phase === 'player' && !app.ui.busy && !v.choice;
  hand.forEach((c, i) => {
    let cel = el.querySelector<HTMLElement>(`.card[data-uid="${c.uid}"]`);
    // the live card (combat state) knows its current cost; the view copy is what is on screen
    const live = cb.hand.find(x => x.uid === c.uid) ?? c;
    const playable = myTurn && cb.canPlay(live);
    if (!cel) {
      cel = renderCard(app.content, live, { combat: cb, playable });
      cel.classList.add('in-hand', 'enter');
      pressable(cel, {
        tap: () => selectCard(app, c.uid),
        long: () => app.showInfo({ kind: 'card', card: live }),
        swipeUp: () => playCard(app, c.uid),
      });
      el.appendChild(cel);
      requestAnimationFrame(() => requestAnimationFrame(() => cel!.classList.remove('enter')));
    } else fillCard(app.content, cel, live, { combat: cb, playable });
    const off = i - (N - 1) / 2;
    const sel = app.ui.selected === c.uid;
    const deg = sel ? 0 : off * Math.min(3, 18 / Math.max(1, N));
    // rotating around a point below the card swings its top corner outward; keep that corner on screen
    const lean = CH * 1.2 * Math.sin(Math.abs(deg) * Math.PI / 180);
    const minX = sel ? CW * 0.1 + 6 : 8 + (deg < 0 ? lean : 0);
    const maxX = W - CW - (sel ? CW * 0.1 + 6 : 8 + (deg > 0 ? lean : 0));
    const x = Math.max(minX, Math.min(maxX, W / 2 + off * step - CW / 2));
    const y = H - CH - 8 + Math.min(14, off * off * Math.min(2, 10 / Math.max(1, N)));
    cel.style.setProperty('--x', `${x}px`);
    cel.style.setProperty('--y', `${sel ? y - 44 : y}px`);
    cel.style.setProperty('--r', `${deg}deg`);
    cel.style.zIndex = String(sel ? 60 : 10 + i);
    cel.classList.toggle('selected', sel);
    cel.style.visibility = '';
  });
}

/* ----- info overlay ----- */
function drawInfo(n: Node, app: App) {
  const info = app.ui.info; const el = n.el;
  paint(el, JSON.stringify(info) + JSON.stringify(app.view?.enemies.find(e => info?.kind === 'enemy' && e.uid === info.uid) ?? ''), () => {
    el.innerHTML = '';
    if (!info) return;
    const c = app.content;
    const statusRows = (sts: Record<string, number>) => Object.entries(sts).filter(([id]) => !c.statuses.get(id)?.flags?.includes('hidden')).map(([id, v]) => {
      const d = c.statuses.get(id);
      return `<li><img src="${assetUrl(c, d?.icon, d?.name)}" alt=""><div><b>${esc(d?.name ?? id)} ${v}</b><p>${esc(statusText(c, id, v))}</p></div></li>`;
    }).join('');
    if (info.kind === 'card') {
      const wrap = document.createElement('div'); wrap.className = 'info-card';
      wrap.appendChild(renderCard(c, info.card, { combat: app.combat ?? undefined }));
      const def = app.combat?.view(info.card) ?? c.cards.get(info.card.id);
      const g = def ? glossary(c, def) : [];
      const ul = document.createElement('ul'); ul.className = 'info-list';
      ul.innerHTML = g.map(x => `<li><div><b>${esc(x.name)}</b><p>${esc(x.desc)}</p></div></li>`).join('');
      el.append(wrap, ul);
      return;
    }
    if (info.kind === 'enemy') {
      const e = app.view?.enemies.find(x => x.uid === info.uid); if (!e) return;
      const d = c.enemies.get(e.def)!;
      const ii = app.combat?.intentInfo(e);
      const dmg = ii?.damage !== undefined ? app.t('info.intentDamage', { damage: ii.times && ii.times > 1 ? `${ii.damage}×${ii.times}` : ii.damage }) : '';
      const intent = ii ? `<p class="info-intent">${esc(app.t('info.intent', { name: ii.name, kind: c.text.intents[ii.intent] ?? ii.intent, damage: dmg }))}</p>` : '';
      el.innerHTML = `<h3>${esc(d.name)}</h3><p class="info-hp">${esc(app.t('info.hp', { hp: e.hp, max: e.maxHp }))}${e.block ? ' · ' + esc(app.t('info.block', { block: e.block })) : ''}</p>${intent}<ul class="info-list">${statusRows(e.statuses)}</ul>`;
      return;
    }
    if (info.kind === 'player') {
      const p = app.view?.player;
      el.innerHTML = `<h3>${esc(char(app).name)}</h3>${p ? `<p class="info-hp">${esc(app.t('info.hp', { hp: p.hp, max: p.maxHp }))}</p><ul class="info-list">${statusRows(p.statuses)}</ul>` : ''}`;
      return;
    }
    if (info.kind === 'relic') {
      const r = c.relics.get(info.id);
      el.innerHTML = r ? `<div class="info-relic"><img src="${assetUrl(c, r.icon, r.name)}" alt=""><div><h3>${esc(r.name)}</h3><p>${esc(r.desc)}</p></div></div>` : '';
    }
  });
}

function relicRow(n: Node, app: App) {
  const list = app.run?.relics ?? [];
  paint(n.el, list.join(','), () => {
    n.el.innerHTML = '';
    n.el.classList.add('relic-row');
    for (const id of list) {
      const r = app.content.relics.get(id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'relic'; b.dataset.id = id;
      b.appendChild(img(app.content, r?.icon, r?.name ?? id));
      b.setAttribute('aria-label', r?.name ?? id);
      b.addEventListener('click', ev => { ev.stopPropagation(); app.showInfo({ kind: 'relic', id }); });
      n.el.appendChild(b);
    }
  });
}

function pileButton(pile: 'draw' | 'discard' | 'exhaust'): Widget {
  return { update(n, app) { const k = app.view?.[pile].length ?? 0; paint(n.el, String(k), () => { n.el.innerHTML = `<small>${esc(app.t(`pile.${pile}`))}</small><b>${k}</b>`; }); } };
}

/* ----- registry ----- */
const BUILTIN: Record<WidgetName, Widget> = {
  'title.bg': { mount(n) { n.el.classList.add('title-bg'); }, update() {} },
  'title.name': text(app => app.t('game.title')),
  'title.sub': text(app => app.t('game.subtitle')),
  'title.portrait': { update(n, app) { const ch = char(app); if (!ch) return; paint(n.el, ch.id, () => { n.el.innerHTML = ''; n.el.classList.add('portrait', 'portrait-lg'); n.el.appendChild(img(app.content, ch.portrait.normal, ch.name)); }); } },
  'title.intro': { update(n, app) { const ch = char(app); if (!ch) return; paint(n.el, ch.id + (app.flag('multiChar') ? 'm' : ''), () => { n.el.innerHTML = app.flag('multiChar') ? esc(app.t('title.multiIntro', { n: app.playableCharacters().length })) : `<b>${esc(ch.title ?? '')} ${esc(ch.name)}</b><br>${esc(ch.intro ?? '')}`; }); } },
  'title.start': text(app => app.t('title.start')),
  'sound.toggle': { update(n, app) { paint(n.el, String(app.sound.muted), () => { n.el.innerHTML = `<span class="snd ${app.sound.muted ? 'off' : 'on'}"></span>`; n.el.setAttribute('aria-label', app.t(app.sound.muted ? 'sound.off' : 'sound.on')); }); } },

  'charselect.title': text(app => app.t('charselect.title')),
  'charselect.art': { update(n, app) { const ch = char(app); if (!ch) return; paint(n.el, ch.id, () => { n.el.innerHTML = ''; n.el.classList.add('portrait', 'portrait-lg'); n.el.style.setProperty('--accent', ch.color ?? 'var(--c-ember)'); n.el.appendChild(img(app.content, ch.selectArt ?? ch.portrait.normal, ch.name)); }); } },
  'charselect.name': { update(n, app) { const ch = char(app); if (!ch) return; paint(n.el, ch.id, () => { n.el.innerHTML = `<span class="cs-title">${esc(ch.title ?? '')}</span><b>${esc(ch.name)}</b>`; }); } },
  'charselect.info': {
    update(n, app) {
      const ch = char(app); if (!ch) return;
      paint(n.el, ch.id, () => {
        const relics = ch.relics.map(r => app.content.relics.get(r)?.name ?? r).join('・');
        n.el.innerHTML = `<p>${esc(ch.intro ?? '')}</p><p class="cs-stats">${esc(app.t('charselect.stats', { hp: ch.hp, gold: ch.gold, energy: ch.energy, deck: ch.deck.length }))}</p>${relics ? `<p class="cs-stats">${esc(app.t('charselect.relics', { relics }))}</p>` : ''}`;
      });
    },
  },
  'charselect.list': {
    update(n, app) {
      const list = app.playableCharacters();
      paint(n.el, list.map(c => c.id).join(',') + '|' + app.ui.charId, () => {
        n.el.innerHTML = '';
        for (const ch of list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `cs-pick portrait${ch.id === app.ui.charId ? ' on' : ''}`;
          b.style.setProperty('--accent', ch.color ?? 'var(--c-ember)');
          b.appendChild(img(app.content, ch.portrait.normal, ch.name));
          b.setAttribute('aria-label', ch.name);
          b.addEventListener('click', ev => { ev.stopPropagation(); app.ui.charId = ch.id; app.sound.se('click'); app.refresh(); });
          n.el.appendChild(b);
        }
      });
    },
  },

  'player.face': {
    mount(n, app) { n.el.classList.add('portrait'); n.el.addEventListener('click', () => { if (app.view) app.showInfo({ kind: 'player' }); }); },
    update(n, app) {
      const ch = char(app), face = app.currentFace();
      if (!ch) return;
      paint(n.el, ch.id + face, () => { n.el.innerHTML = ''; n.el.appendChild(img(app.content, ch.portrait[face] ?? ch.portrait.normal, ch.name)); n.el.dataset.face = face; });
    },
  },
  'player.name': text(app => char(app)?.name ?? ''),
  'player.hp': { update(n, app) { const h = hpOf(app); gauge(n.el, h.hp, h.max); } },
  'player.hpBlock': { update(n, app) { const p = app.view?.player; if (p) gauge(n.el, p.hp, p.maxHp, p.block); } },
  'player.statuses': { update(n, app) { statusIcons(app, n.el, app.view?.player.statuses ?? {}, () => app.showInfo({ kind: 'player' })); } },

  'run.floor': text(app => { const at = app.run?.at; if (!at) return app.t('hud.floor', { floor: 0 }); return at.floor >= app.run!.map.floors.length ? app.content.text.nodes.boss ?? 'BOSS' : app.t('hud.floor', { floor: at.floor + 1 }); }),
  'run.gold': { update(n, app) { paint(n.el, String(app.run?.gold), () => { n.el.innerHTML = `<span class="coin"></span>${app.run?.gold ?? 0}`; }); } },
  'run.relics': { update: relicRow },

  'deck.button': { update(n, app) { paint(n.el, String(app.run?.deck.length), () => { n.el.innerHTML = `<span class="deck-ico"></span><b>${app.run?.deck.length ?? 0}</b>`; n.el.setAttribute('aria-label', app.t('deck.label')); }); } },
  'deck.title': text(app => app.t('deck.title', { n: app.run?.deck.length ?? 0 })),
  'deck.cards': { update(n, app) { const d = sortCards(app, app.run?.deck ?? []); cardList(app, n.el, d, d.map(c => c.uid + (c.up ? '+' : '')).join(','), c => app.showInfo({ kind: 'card', card: c })); } },

  'map': { update: drawMap },

  'enemies': {
    mount(n, app) { n.el.innerHTML = ''; n.el.addEventListener('click', () => { if (app.ui.selected !== null) { app.ui.selected = null; app.refreshBinds('hand', 'enemies'); } }); },
    update: drawEnemies,
  },
  'hand': {
    mount(n, app) {
      n.el.classList.add('hand');
      app.screen!.root.addEventListener('click', ev => {
        if ((ev.target as HTMLElement).closest('.card,.enemy,.q-overlay')) return;
        if (app.ui.selected !== null) { app.ui.selected = null; app.refreshBinds('hand', 'enemies'); }
      });
    },
    update: drawHand,
  },
  'battle.energy': { update(n, app) { const v = app.view; if (!v) return; paint(n.el, `${v.energy}/${v.maxEnergy}`, () => { n.el.classList.add('energy', skinClass('energy')); n.el.innerHTML = `<b>${v.energy}</b><small>/${v.maxEnergy}</small>`; n.el.classList.toggle('empty', v.energy === 0); }); } },
  'battle.endTurn': { update(n, app) { const b = n.el as HTMLButtonElement; b.textContent = app.t('battle.endTurn'); b.disabled = app.ui.busy || app.view?.phase !== 'player' || !!app.view?.choice; } },
  'battle.banner': text(app => app.ui.banner),

  'pile.draw': pileButton('draw'),
  'pile.discard': pileButton('discard'),
  'pile.exhaust': pileButton('exhaust'),
  'pile.title': text(app => { const p = app.ui.pile; return app.t('pile.listTitle', { pile: app.t(`pile.${p}`), n: (app.view?.[p] ?? []).length }); }),
  'pile.cards': { update(n, app) { const p = app.ui.pile; let list = app.view?.[p] ?? []; if (p === 'draw') list = sortCards(app, list); cardList(app, n.el, list, p + list.map(c => c.uid).join(','), c => app.showInfo({ kind: 'card', card: c })); } },

  'choice.prompt': text(app => app.view?.choice?.prompt ?? ''),
  'choice.cards': {
    update(n, app) {
      const ch = app.view?.choice; if (!ch) return;
      const picked = app.ui.picked;
      cardList(app, n.el, ch.cards, ch.cards.map(c => c.uid).join(',') + '|' + [...picked].join(','), c => {
        const picked = app.ui.picked;
        if (picked.has(c.uid)) picked.delete(c.uid);
        else { if (ch.max === 1) picked.clear(); if (picked.size < ch.max) picked.add(c.uid); }
        app.refreshBinds('choice.cards', 'choice.confirm');
      }, c => app.showInfo({ kind: 'card', card: c }), picked);
    },
  },
  'choice.confirm': {
    update(n, app) {
      const ch = app.view?.choice; if (!ch) return;
      const b = n.el as HTMLButtonElement;
      b.disabled = app.ui.picked.size < ch.min;
      b.textContent = app.t('choice.confirm', { n: app.ui.picked.size, max: ch.max });
    },
  },

  'info.body': { update: drawInfo },

  'reward.title': text(app => app.run?.phase === 'treasure' ? app.t('treasure.title') : app.t('reward.title')),
  'reward.items': {
    update(n, app) {
      const p = app.run?.pending; const c = app.content;
      paint(n.el, JSON.stringify(p ? [p.goldTaken, p.relicTaken, p.gold, p.relic] : null), () => {
        n.el.innerHTML = '';
        if (!p) return;
        const item = (html: string, se: string, on: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.className = `reward-item ${skinClass('reward.item')}`; b.innerHTML = html; b.addEventListener('click', ev => { ev.stopPropagation(); on(); app.sound.se(se); app.save(); app.refresh(); }); n.el.appendChild(b); };
        if (p.gold && !p.goldTaken) item(`<span class="coin"></span>${esc(app.t('reward.gold', { gold: p.gold }))}`, 'coin', () => takeGold(app.run!));
        if (p.relic && !p.relicTaken) { const r = c.relics.get(p.relic)!; item(`<img src="${assetUrl(c, r.icon, r.name)}" alt=""><span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span>`, 'relic', () => takeRelic(c, app.run!)); }
      });
    },
  },
  'reward.cardTitle': text(app => { const p = app.run?.pending; return p && p.cards.length && !p.cardTaken ? app.t('reward.card') : ''; }),
  'reward.cards': {
    update(n, app) {
      const p = app.run?.pending;
      const list = p && !p.cardTaken ? p.cards : [];
      paint(n.el, list.map(c => c.uid).join(','), () => {
        n.el.innerHTML = '';
        for (const card of list) {
          const cel = renderCard(app.content, card);
          pressable(cel, { tap: () => { takeCard(app.run!, card.uid); app.sound.se('cardPlay'); app.save(); app.refresh(); }, long: () => app.showInfo({ kind: 'card', card }) });
          n.el.appendChild(cel);
        }
      });
    },
  },
  'reward.next': text(app => { const p = app.run?.pending; return p && p.cards.length && !p.cardTaken ? app.t('reward.skip') : app.t('reward.next'); }),

  'rest.art': { update(n, app) { paint(n.el, 'fire', () => { n.el.innerHTML = ''; n.el.classList.add('campfire'); n.el.appendChild(img(app.content, 'scene.campfire', app.t('rest.title'))); }); } },
  'rest.title': text(app => app.t('rest.title')),
  'rest.heal': {
    update(n, app) {
      const run = app.run; if (!run) return;
      const amt = Math.min(Math.ceil(run.maxHp * app.content.rules.rest.healPercent / 100), run.maxHp - run.hp);
      (n.el as HTMLButtonElement).disabled = app.ui.restDone;
      paint(n.el, `${amt}/${app.ui.restDone}`, () => { n.el.innerHTML = `<b>${esc(app.t('rest.heal'))}</b><small>${esc(app.t('rest.healDesc', { n: amt }))}</small>`; });
    },
  },
  'rest.upgrade': {
    update(n, app) {
      const any = app.run?.deck.some(c => canUpgrade(app.content, c)) ?? false;
      (n.el as HTMLButtonElement).disabled = app.ui.restDone || !any;
      paint(n.el, String(app.ui.restDone), () => { n.el.innerHTML = `<b>${esc(app.t('rest.upgrade'))}</b><small>${esc(app.t('rest.upgradeDesc'))}</small>`; });
    },
  },
  'upgrade.title': text(app => app.t('rest.chooseUpgrade')),
  'upgrade.cards': {
    update(n, app) {
      const list = sortCards(app, (app.run?.deck ?? []).filter(c => canUpgrade(app.content, c))).map(c => ({ ...c, up: true }));
      cardList(app, n.el, list, 'up' + list.map(c => c.uid).join(','), c => {
        if (app.ui.restDone) return;
        upgradeCard(app.content, app.run!, c.uid);
        app.ui.restDone = true; app.save();
        app.sound.se('upgrade');
        app.close((n.el.closest('.q-overlay') as HTMLElement | null)?.dataset.qid ?? '');
        app.banner(app.t('rest.upgraded', { name: app.content.cards.get(c.id)?.name ?? '' }), 1100);
      }, c => app.showInfo({ kind: 'card', card: c }));
    },
  },

  'result.portrait': { update(n, app) { const ch = char(app); if (!ch) return; const won = app.run?.phase === 'won'; paint(n.el, String(won), () => { n.el.innerHTML = ''; n.el.classList.add('portrait', 'portrait-lg'); n.el.appendChild(img(app.content, won ? ch.portrait.happy ?? ch.portrait.normal : ch.portrait.hurt ?? ch.portrait.normal, ch.name)); }); } },
  'result.title': text(app => app.run?.phase === 'won' ? app.t('result.won') : app.t('result.lost')),
  'result.stats': text(app => { const s = app.run?.stats; return s ? app.t('result.stats', { floors: s.floors, kills: s.kills, elites: s.elites }) : ''; }),
};

/** every widget the layout can bind to (built-in + plugins) */
export const WIDGETS: Record<string, Widget> = { ...BUILTIN };
export function registerWidget(bind: string, w: Widget) { WIDGETS[bind] = w; }
