import type { App } from './app.ts';
import type { RunWidgetName, RunActionName } from './registry-names.ts';
import type { CardInst } from '../engine/types.ts';
import { WIDGETS, paint, pressable, esc, cardList, sortCards, type Widget } from './widgets.ts';
import { ACTIONS, type Action } from './actions.ts';
import { renderCard } from './cards.ts';
import { img, assetUrl } from './assets.ts';
import { skinClass } from './skins.ts';
import { beginBattle, drinkPotion } from './battle.ts';
import { takeRelicChoice } from '../engine/run.ts';
import { glossary } from '../engine/describe.ts';
import {
  potionText, shopPrice, removalPrice, buyCard, buyRelic, buyPotion, startRemoval, resolveChoice, choiceCandidates, usePotionOutside, discardPotion,
  eventOptions, chooseEventOption, leaveEvent, describeRun, fillText, eventVars, type RunLog,
} from '../engine/run-effects.ts';

/* ===== Shop, events, and picking cards from the deck outside combat.
   Phone-first: every purchase goes through a confirm sheet (a big preview and one buy button)
   so a stray tap never spends gold, and the shop is split into two tabs instead of one wide table. ===== */

const text = (fn: (app: App) => string): Widget => ({ update(n, app) { const t = fn(app); if (n.el.textContent !== t) n.el.textContent = t; } });
const priceTag = (app: App, price: number) => `<span class="price${(app.run?.gold ?? 0) < price ? ' short' : ''}"><i class="coin"></i>${price}</span>`;

/** gold / HP floats, sounds and a short banner for what a run effect did */
export function showLog(app: App, log: RunLog[]) {
  const c = app.content;
  const card = (id: string) => c.cards.get(id)?.name ?? id;
  let gold = 0, hp = 0, maxHp = 0;
  const msgs: string[] = [];
  for (const l of log) {
    if (l.t === 'gold') gold += l.n;
    else if (l.t === 'hp') hp += l.n;
    else if (l.t === 'maxHp') maxHp += l.n;
    else if (l.t === 'card') msgs.push(app.t('log.card', { name: card(l.id) + (l.up ? '+' : '') }));
    else if (l.t === 'remove') msgs.push(app.t('log.remove', { name: card(l.id) }));
    else if (l.t === 'upgrade') msgs.push(app.t('log.upgrade', { name: card(l.id) }));
    else if (l.t === 'transform') msgs.push(app.t('log.transform', { from: card(l.from), to: card(l.to) }));
    else if (l.t === 'relic') msgs.push(app.t('log.relic', { name: c.relics.get(l.id)?.name ?? l.id }));
    else if (l.t === 'potion') msgs.push(app.t('log.potion', { name: c.potions.get(l.id)?.name ?? l.id }));
    else if (l.t === 'potionFull') msgs.push(app.t('log.potionFull', { name: c.potions.get(l.id)?.name ?? l.id }));
  }
  const sign = (v: number) => (v > 0 ? '+' : '') + v;
  if (gold) { app.vfx.float(app.node('run.gold'), sign(gold), gold > 0 ? 'buff' : 'debuff'); app.sound.se('coin'); }
  if (hp) { app.vfx.float(app.node('player.hp'), sign(hp), hp > 0 ? 'heal' : 'dmg'); app.sound.se(hp > 0 ? 'heal' : 'playerHit'); app.setFace(hp > 0 ? 'happy' : 'hurt', 900); }
  if (maxHp) app.vfx.float(app.node('player.hp'), app.t('log.maxHp', { n: sign(maxHp) }), maxHp > 0 ? 'heal' : 'dmg');
  if (log.some(l => l.t === 'relic')) app.sound.se('relic');
  else if (log.some(l => l.t === 'upgrade')) app.sound.se('upgrade');
  else if (log.some(l => l.t === 'card' || l.t === 'transform')) app.sound.se('cardPlay');
  if (msgs.length) app.banner(msgs.join('\n'), 1500);
}

/** after a run effect: save, then follow the run to where it went */
function after(app: App, status: string) {
  const run = app.run!;
  app.save();
  if (status === 'fight' || run.phase === 'battle') { beginBattle(app); return; }
  if (run.phase === 'map') { app.go('MAP'); return; }
  app.refresh();
}

/* ----- potions ----- */
/** the belt as the screen should show it (live combat state during battle) */
const belt = (app: App) => app.combat?.potions ?? app.run?.potions ?? [];
const potionDef = (app: App, slot: number | null) => slot === null ? undefined : app.content.potions.get(belt(app)[slot] ?? '');
function canDrinkNow(app: App, slot: number): boolean {
  const d = potionDef(app, slot); if (!d) return false;
  if (app.combat) return app.combat.canUsePotion(slot) && !app.ui.busy;
  return !!d.mapEffects?.length && !app.run?.choice;
}

/* ----- shop ----- */
const shopCard = (app: App, i: number) => app.run?.shop?.cards[i];
const shopRelic = (app: App, i: number) => app.run?.shop?.relics[i];
const shopPotion = (app: App, i: number) => app.run?.shop?.potions?.[i];
function itemPrice(app: App): number | null {
  const it = app.ui.shopItem, run = app.run; if (!it || !run) return null;
  const base = it.kind === 'card' ? shopCard(app, it.i)?.price : it.kind === 'relic' ? shopRelic(app, it.i)?.price : shopPotion(app, it.i)?.price;
  return base === undefined ? null : shopPrice(app.content, run, base);
}
const say = (app: App, key: string) => { app.ui.shopSay = app.t(key); };

const W: Record<RunWidgetName, Widget> = {
  'run.potions': {
    update(n, app) {
      const list = belt(app), c = app.content;
      paint(n.el, JSON.stringify([list, app.ui.potionTarget]), () => {
        n.el.innerHTML = '';
        n.el.classList.add('potion-belt');
        list.forEach((id, i) => {
          const d = id ? c.potions.get(id) : undefined;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `potion-slot${d ? '' : ' empty'}${app.ui.potionTarget === i ? ' aiming' : ''}`;
          b.setAttribute('aria-label', d?.name ?? app.t('potion.empty'));
          if (d) b.appendChild(img(c, d.icon, d.name));
          b.addEventListener('click', ev => {
            ev.stopPropagation();
            if (!d) return;
            app.sound.se('click');
            if (app.ui.potionTarget === i) { app.ui.potionTarget = null; app.ui.banner = ''; app.refresh(); return; }
            app.ui.potion = i; app.refresh();
          });
          n.el.appendChild(b);
        });
      });
    },
  },
  'reward.relicTitle': text(app => app.t('reward.bossRelic')),
  'reward.relicChoices': {
    update(n, app) {
      const p = app.run?.pending, c = app.content; if (!p?.relicChoices) return;
      paint(n.el, JSON.stringify([p.relicChoices, p.relicTaken]), () => {
        n.el.innerHTML = '';
        for (const id of p.relicChoices!) {
          const r = c.relics.get(id); if (!r) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `reward-item boss-relic ${skinClass('reward.item')}`;
          b.innerHTML = `<img src="${assetUrl(c, r.icon, r.name)}" alt=""><span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span>`;
          b.addEventListener('click', ev => {
            ev.stopPropagation();
            const st = takeRelicChoice(c, app.run!, id);
            app.ui.relicPick = false;
            app.sound.se('relic');
            showLog(app, [{ t: 'relic', id }]);
            after(app, st ?? 'done');
          });
          n.el.appendChild(b);
        }
      });
    },
  },
  'potion.info': {
    update(n, app) {
      const d = potionDef(app, app.ui.potion), c = app.content;
      paint(n.el, d?.id ?? '', () => {
        n.el.innerHTML = '';
        if (!d) return;
        n.el.innerHTML = `<div class="info-relic potion-info"><img src="${assetUrl(c, d.icon, d.name)}" alt=""><div><h3>${esc(d.name)}</h3><small>${esc(c.text.rarities[d.rarity] ?? d.rarity)}</small><p>${esc(potionText(c, d)).replace(/\n/g, '<br>')}</p></div></div>`;
      });
    },
  },
  'potion.use': {
    update(n, app) {
      const slot = app.ui.potion, d = potionDef(app, slot); if (!d || slot === null) return;
      const ok = canDrinkNow(app, slot);
      (n.el as HTMLButtonElement).disabled = !ok;
      const alive = app.combat?.enemies.filter(e => e.alive).length ?? 0;
      const t = ok ? (app.combat && d.target === 'enemy' && alive > 1 ? app.t('potion.throw') : app.t('potion.use'))
        : !app.combat && !d.mapEffects?.length ? app.t('potion.combatOnly') : app.t('potion.notNow');
      if (n.el.textContent !== t) n.el.textContent = t;
    },
  },
  'shop.merchant': { update(n, app) { paint(n.el, 'merchant', () => { n.el.innerHTML = ''; n.el.classList.add('merchant'); n.el.appendChild(img(app.content, 'scene.merchant', app.t('shop.title'))); }); } },
  'shop.title': text(app => app.t('shop.title')),
  'shop.say': text(app => app.ui.shopSay || app.t('shop.greeting')),
  'shop.tab.cards': { update(n, app) { n.el.classList.toggle('on', app.ui.tab === 'cards'); if (n.el.textContent !== app.t('shop.tab.cards')) n.el.textContent = app.t('shop.tab.cards'); } },
  'shop.tab.other': { update(n, app) { n.el.classList.toggle('on', app.ui.tab === 'other'); if (n.el.textContent !== app.t('shop.tab.other')) n.el.textContent = app.t('shop.tab.other'); } },
  'shop.cards': {
    update(n, app) {
      const run = app.run, shop = run?.shop; if (!run || !shop) return;
      paint(n.el, JSON.stringify([shop.cards.map(x => [x.card.uid, x.sold]), run.gold, run.relics.length]), () => {
        n.el.innerHTML = '';
        n.el.classList.add('card-grid', 'shop-grid');
        shop.cards.forEach((it, i) => {
          if (it.sold) return;
          const box = document.createElement('div');
          box.className = 'shop-item' + (it.sale ? ' sale' : '');
          box.appendChild(renderCard(app.content, it.card));
          box.insertAdjacentHTML('beforeend', `${it.sale ? `<b class="sale-badge">${esc(app.t('shop.sale'))}</b>` : ''}${priceTag(app, shopPrice(app.content, run, it.price))}`);
          pressable(box, { tap: () => { app.ui.shopItem = { kind: 'card', i }; app.refresh(); }, long: () => app.showInfo({ kind: 'card', card: it.card }) });
          n.el.appendChild(box);
        });
        if (!n.el.children.length) n.el.innerHTML = `<p class="empty">${esc(app.t('shop.sold'))}</p>`;
      });
    },
  },
  'shop.relics': {
    update(n, app) {
      const run = app.run, shop = run?.shop; if (!run || !shop) return;
      const c = app.content;
      paint(n.el, JSON.stringify([shop.relics.map(x => [x.id, x.sold]), (shop.potions ?? []).map(x => x.sold), run.gold, run.relics.length]), () => {
        n.el.innerHTML = `<h4 class="shop-h">${esc(app.t('shop.relicsTitle'))}</h4>`;
        shop.relics.forEach((it, i) => {
          if (it.sold) return;
          const r = c.relics.get(it.id); if (!r) return;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `reward-item shop-relic ${skinClass('reward.item')}`;
          b.innerHTML = `<img src="${assetUrl(c, r.icon, r.name)}" alt=""><span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span>${priceTag(app, shopPrice(c, run, it.price))}`;
          b.addEventListener('click', ev => { ev.stopPropagation(); app.sound.se('click'); app.ui.shopItem = { kind: 'relic', i }; app.refresh(); });
          n.el.appendChild(b);
        });
        if (n.el.children.length === 1) n.el.insertAdjacentHTML('beforeend', `<p class="empty">${esc(app.t('shop.sold'))}</p>`);
        const pots = (shop.potions ?? []).map((it, i) => ({ it, i })).filter(x => !x.it.sold);
        if (pots.length) n.el.insertAdjacentHTML('beforeend', `<h4 class="shop-h">${esc(app.t('shop.potionsTitle'))}</h4>`);
        for (const { it, i } of pots) {
          const d = c.potions.get(it.id); if (!d) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `reward-item shop-relic ${skinClass('reward.item')}`;
          b.innerHTML = `<img src="${assetUrl(c, d.icon, d.name)}" alt=""><span><b>${esc(d.name)}</b><small>${esc(potionText(c, d))}</small></span>${priceTag(app, shopPrice(c, run, it.price))}`;
          b.addEventListener('click', ev => { ev.stopPropagation(); app.sound.se('click'); app.ui.shopItem = { kind: 'potion', i }; app.refresh(); });
          n.el.appendChild(b);
        }
      });
    },
  },
  'shop.removal': {
    update(n, app) {
      const run = app.run, shop = run?.shop; if (!run || !shop) return;
      const used = !!shop.removal.used, price = removalPrice(app.content, run);
      (n.el as HTMLButtonElement).disabled = used;
      paint(n.el, `${used}/${price}/${run.gold}`, () => {
        n.el.classList.add('shop-service');
        n.el.innerHTML = `<span><b>${esc(app.t('shop.removal'))}</b><small>${esc(used ? app.t('shop.removalUsed') : app.t('shop.removalDesc'))}</small></span>${used ? '' : priceTag(app, price)}`;
      });
    },
  },
  'shop.preview': {
    update(n, app) {
      const it = app.ui.shopItem, c = app.content;
      paint(n.el, JSON.stringify(it), () => {
        n.el.innerHTML = '';
        if (!it) return;
        if (it.kind === 'card') {
          const s = shopCard(app, it.i); if (!s) return;
          const wrap = document.createElement('div'); wrap.className = 'info-card shop-preview-card';
          wrap.appendChild(renderCard(c, s.card));
          const def = c.cards.get(s.card.id);
          const ul = document.createElement('ul'); ul.className = 'info-list';
          ul.innerHTML = (def ? glossary(c, def) : []).map(x => `<li><div><b>${esc(x.name)}</b><p>${esc(x.desc)}</p></div></li>`).join('');
          n.el.append(wrap, ul);
        } else if (it.kind === 'potion') {
          const s = shopPotion(app, it.i); const d = s && c.potions.get(s.id); if (!d) return;
          n.el.innerHTML = `<div class="info-relic shop-preview-relic"><img src="${assetUrl(c, d.icon, d.name)}" alt=""><div><h3>${esc(d.name)}</h3><p>${esc(potionText(c, d)).replace(/\n/g, '<br>')}</p></div></div>`;
        } else {
          const s = shopRelic(app, it.i); const r = s && c.relics.get(s.id); if (!r) return;
          n.el.innerHTML = `<div class="info-relic shop-preview-relic"><img src="${assetUrl(c, r.icon, r.name)}" alt=""><div><h3>${esc(r.name)}</h3><p>${esc(r.desc)}</p></div></div>`;
        }
      });
    },
  },
  'shop.buy': {
    update(n, app) {
      const p = itemPrice(app); if (p === null) return;
      const short = (app.run?.gold ?? 0) < p;
      (n.el as HTMLButtonElement).disabled = short;
      const t = short ? app.t('shop.cantBuy', { price: p }) : app.t('shop.buy', { price: p });
      if (n.el.textContent !== t) n.el.textContent = t;
    },
  },

  /* ----- events ----- */
  'event.art': {
    update(n, app) {
      const st = app.run?.event; const ev = st && app.content.events.get(st.id); if (!ev || !st) return;
      const key = ev.pages[st.page]?.art ?? ev.art;
      paint(n.el, key ?? '', () => { n.el.innerHTML = ''; n.el.classList.add('event-art'); n.el.appendChild(img(app.content, key, ev.name)); });
    },
  },
  'event.name': text(app => { const st = app.run?.event; return st ? app.content.events.get(st.id)?.name ?? '' : ''; }),
  'event.text': {
    update(n, app) {
      const run = app.run, st = run?.event; const ev = st && app.content.events.get(st.id); if (!ev || !st || !run) return;
      const t = fillText(app.content, run, ev.pages[st.page]?.text ?? '');
      paint(n.el, st.id + st.page + t, () => { n.el.innerHTML = t.split('\n').map(l => `<p>${esc(l) || '&nbsp;'}</p>`).join(''); n.el.scrollTop = 0; });
    },
  },
  'event.options': {
    update(n, app) {
      const run = app.run, st = run?.event; if (!run || !st) return;
      const c = app.content;
      const opts = eventOptions(c, run);
      paint(n.el, JSON.stringify([st.id, st.page, opts.map(o => [o.index, o.enabled]), run.gold, run.hp, run.deck.length]), () => {
        n.el.innerHTML = '';
        const btn = (html: string, enabled: boolean, on: () => void) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `event-option ${skinClass('button')}`;
          b.disabled = !enabled;
          b.innerHTML = html;
          b.addEventListener('click', ev => { ev.stopPropagation(); if (app.ui.busy) return; app.sound.se('click'); on(); });
          n.el.appendChild(b);
        };
        if (!opts.length) { btn(`<b>${esc(app.t('event.continue'))}</b>`, true, () => { leaveEvent(run); after(app, 'done'); }); return; }
        const vars = eventVars(c, run);
        for (const o of opts) {
          const desc = o.option.desc !== undefined ? fillText(c, run, o.option.desc) : describeRun(c, o.option.effects, vars);
          const why = !o.enabled && o.option.disabledText ? `<small class="why">${esc(fillText(c, run, o.option.disabledText))}</small>` : '';
          btn(`<b>${esc(fillText(c, run, o.option.label))}</b>${desc ? `<small>${esc(desc)}</small>` : ''}${why}`, o.enabled, () => {
            const res = chooseEventOption(c, run, o.index);
            if (res.status === 'invalid') return;
            showLog(app, res.log);
            after(app, res.status);
          });
        }
      });
    },
  },

  /* ----- picking cards from the deck (event / shop removal / relic pick-up) ----- */
  'deckpick.title': text(app => app.run?.choice?.prompt ?? ''),
  'deckpick.cards': {
    update(n, app) {
      const run = app.run, ch = run?.choice; if (!run || !ch) return;
      let list: CardInst[] = choiceCandidates(app.content, run, ch);
      if (!ch.cards) list = sortCards(app, list);
      // show what an upgrade would give
      if (ch.op === 'upgrade') list = list.map(x => ({ ...x, up: true }));
      const picked = app.ui.picked;
      cardList(app, n.el, list, `${ch.op}|${list.map(x => x.uid).join(',')}|${[...picked].join(',')}`, x => {
        if (picked.has(x.uid)) picked.delete(x.uid);
        else { if (ch.count === 1) picked.clear(); if (picked.size < ch.count) picked.add(x.uid); }
        app.refreshBinds('deckpick.cards', 'deckpick.confirm');
      }, x => app.showInfo({ kind: 'card', card: x }), picked);
    },
  },
  'deckpick.confirm': {
    update(n, app) {
      const run = app.run, ch = run?.choice; if (!run || !ch) return;
      const need = Math.min(ch.count, choiceCandidates(app.content, run, ch).length);
      (n.el as HTMLButtonElement).disabled = app.ui.picked.size < need;
      const t = ch.price ? app.t('deckpick.confirmPrice', { price: ch.price }) : app.t('deckpick.confirm', { n: app.ui.picked.size, max: need });
      if (n.el.textContent !== t) n.el.textContent = t;
    },
  },
  'deckpick.cancel': text(app => app.run?.choice?.op === 'take' ? app.t('deckpick.skip') : app.t('deckpick.cancel')),
};

const A: Record<RunActionName, Action> = {
  usePotion(app) {
    const slot = app.ui.potion; if (slot === null) return false;
    app.ui.potion = null;
    if (app.combat) { app.refresh(); drinkPotion(app, slot); return false; }
    const res = usePotionOutside(app.content, app.run!, slot);
    if (res.status === 'invalid') { app.refresh(); return false; }
    app.sound.se('potion');
    showLog(app, res.log);
    after(app, res.status);
    return false;
  },
  discardPotion(app) {
    const slot = app.ui.potion; if (slot === null) return false;
    if (app.combat) app.combat.discardPotion(slot); else if (app.run) { discardPotion(app.run, slot); app.save(); }
    app.ui.potion = null;
    app.refresh();
    return false;
  },
  closePotion(app) { app.ui.potion = null; app.refresh(); return false; },
  closeRelicChoice(app) { app.ui.relicPick = false; app.refresh(); return false; },
  shopTab(app, args) { app.ui.tab = args[0] || 'cards'; app.refresh(); return false; },
  shopCancel(app) { app.ui.shopItem = null; app.refresh(); return false; },
  shopBuy(app) {
    const run = app.run, it = app.ui.shopItem; if (!run || !it) return false;
    const res = it.kind === 'card' ? buyCard(app.content, run, it.i) : it.kind === 'relic' ? buyRelic(app.content, run, it.i) : buyPotion(app.content, run, it.i);
    if (!res.ok) { say(app, res.reason === 'gold' ? 'shop.poor' : res.reason === 'full' ? 'potion.full' : 'shop.sold'); app.refresh(); return false; }
    app.ui.shopItem = null;
    say(app, 'shop.thanks');
    showLog(app, res.log);
    after(app, res.status);
    return false;
  },
  shopRemoval(app) {
    const run = app.run; if (!run) return false;
    const r = startRemoval(app.content, run);
    if (!r.ok) { if (r.reason === 'gold') say(app, 'shop.poor'); app.refresh(); return false; }
    app.ui.picked.clear();
    app.refresh();
    return false;
  },
  confirmDeckChoice(app) {
    const run = app.run; if (!run?.choice) return false;
    const wasShopRemoval = run.choice.from === 'shop' && run.choice.op === 'remove';
    const res = resolveChoice(app.content, run, [...app.ui.picked]);
    if (res.status === 'invalid') return false;
    app.ui.picked.clear();
    if (wasShopRemoval) say(app, 'shop.afterRemoval');
    showLog(app, res.log);
    after(app, res.status);
    return false;
  },
  cancelDeckChoice(app) {
    const run = app.run; if (!run?.choice?.canCancel) return false;
    const res = resolveChoice(app.content, run, []);
    app.ui.picked.clear();
    showLog(app, res.log);
    after(app, res.status);
    return false;
  },
};

Object.assign(WIDGETS, W);
Object.assign(ACTIONS, A);
