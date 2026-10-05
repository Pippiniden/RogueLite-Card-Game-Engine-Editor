import type { App } from './app.ts';
import type { Frame } from '../engine/combat.ts';
import { startCombat, finishCombat } from '../engine/run.ts';
import type { CombatEvent } from '../engine/types.ts';

/* ===== Battle flow on screen: play the engine's frames with effects and sound, handle input ===== */

const sleep = (ms: number) => new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.min(ms, 120) : ms));

export function beginBattle(app: App) {
  const cb = startCombat(app.content, app.run!);
  app.combat = cb;
  app.view = cb.snapshot();
  app.go('BATTLE');
  void playFrames(app, cb.start());
}

export const enemyEl = (app: App, uid: number) => app.screen?.root.querySelector<HTMLElement>(`.enemy[data-uid="${uid}"] .enemy-body`) ?? null;
const playerEl = (app: App) => app.node('player.hpBlock') ?? app.node('player.face');
const targetEl = (app: App, uid: number) => uid === 1 ? playerEl(app) : enemyEl(app, uid);

let chain: Promise<void> = Promise.resolve();
export function playFrames(app: App, frames: Frame[]): Promise<void> {
  chain = chain.then(() => run(app, frames));
  return chain;
}

async function run(app: App, frames: Frame[]) {
  app.ui.busy = true;
  app.refreshBinds('battle.endTurn', 'hand');
  for (const f of frames) await playFrame(app, f);
  app.ui.busy = false;
  if (app.view?.choice) app.ui.picked = new Set();
  app.refresh();
  if (app.combat?.over) await endBattle(app);
}

async function playFrame(app: App, f: Frame) {
  const c = app.content;
  const mv = f.events.find((e): e is Extract<CombatEvent, { t: 'move' }> => e.t === 'move');
  if (mv) {
    const d = c.enemies.get(app.view?.enemies.find(e => e.uid === mv.actor)?.def ?? '');
    const isAttack = mv.intent.startsWith('attack');
    app.vfx.play(isAttack ? d?.vfx?.attack ?? 'enemy.attack' : d?.vfx?.buff ?? 'enemy.buff', enemyEl(app, mv.actor));
    app.sound.se(isAttack ? d?.sfx?.attack ?? 'enemyAttack' : 'buff');
    await sleep(isAttack ? 200 : 120);
  }
  app.view = f.view;
  app.refresh();
  let wait = 140;
  const defOf = (uid: number) => c.enemies.get(app.view?.enemies.find(e => e.uid === uid)?.def ?? '');
  for (const ev of f.events) {
    switch (ev.t) {
      case 'card': app.sound.se('cardPlay'); break;
      case 'draw': app.sound.se('draw'); break;
      case 'shuffle': app.sound.se('shuffle'); break;
      case 'damage': {
        if (ev.target === 1) {
          if (ev.amount > 0) { app.vfx.play('player.hit', app.stage); app.setFace('hurt', 750); app.sound.se('playerHit'); }
          else if (ev.blocked > 0) { app.vfx.play('player.block', app.stage); app.sound.se('blocked'); }
          app.vfx.float(playerEl(app), ev.amount > 0 ? `-${ev.amount}` : app.t('fx.blocked'), ev.amount > 0 ? 'dmg' : 'blk');
        } else {
          const def = defOf(ev.target);
          app.vfx.play(def?.vfx?.hit ?? 'enemy.hit', enemyEl(app, ev.target));
          app.sound.se(def?.sfx?.hit ?? (ev.amount > 0 ? 'hit' : 'blocked'));
          app.vfx.float(enemyEl(app, ev.target), ev.amount > 0 ? String(ev.amount) : app.t('fx.blocked'), ev.amount > 0 ? 'dmg' : 'blk');
        }
        wait = Math.max(wait, 360);
        break;
      }
      case 'loseHp':
        app.vfx.float(targetEl(app, ev.target), `-${ev.amount}`, 'poison');
        if (ev.target === 1) app.setFace('hurt', 600);
        wait = Math.max(wait, 320);
        break;
      case 'block':
        app.vfx.float(targetEl(app, ev.target), `+${ev.amount}`, 'blk');
        app.sound.se('block');
        wait = Math.max(wait, 240);
        break;
      case 'heal':
        app.vfx.float(targetEl(app, ev.target), `+${ev.amount}`, 'heal');
        app.sound.se('heal');
        wait = Math.max(wait, 260);
        break;
      case 'status': {
        const st = c.statuses.get(ev.status);
        if (st && ev.delta > 0 && !st.flags?.includes('hidden')) {
          const el = targetEl(app, ev.target);
          app.vfx.float(el, `${st.name}+${ev.delta}`, st.kind === 'buff' ? 'buff' : 'debuff');
          if (st.vfx) app.vfx.play(st.vfx, el);
          app.sound.se(st.kind === 'buff' ? 'buff' : 'debuff');
          wait = Math.max(wait, 260);
        }
        break;
      }
      case 'negated': {
        const by = c.statuses.get(ev.by);
        app.vfx.float(targetEl(app, ev.target), app.t('fx.negated', { name: by?.name ?? ev.by }), 'buff');
        wait = Math.max(wait, 260);
        break;
      }
      case 'death': {
        const def = defOf(ev.target);
        app.vfx.play(def?.vfx?.death ?? 'enemy.death', enemyEl(app, ev.target)?.closest('.enemy') as HTMLElement);
        app.sound.se(def?.sfx?.death ?? 'death');
        wait = Math.max(wait, 650);
        break;
      }
      case 'turn':
        app.banner(ev.side === 'enemy' ? app.t('battle.enemyTurn') : app.t('battle.turn', { n: ev.turn }), 700);
        app.sound.se('turn');
        wait = Math.max(wait, ev.side === 'enemy' ? 600 : 450);
        break;
      case 'relic': {
        const r = app.screen?.root.querySelector<HTMLElement>(`.relic[data-id="${ev.relic}"]`);
        r?.animate([{ scale: '1' }, { scale: '1.4', filter: 'brightness(1.6)' }, { scale: '1' }], { duration: 450 });
        app.sound.se('relic');
        break;
      }
      case 'end':
        if (ev.result === 'won') { app.setFace('happy'); app.sound.se('victory'); } else app.sound.se('defeat');
        wait = Math.max(wait, 700);
        break;
    }
  }
  await sleep(wait);
}

async function endBattle(app: App) {
  const cb = app.combat!, run = app.run!;
  await sleep(500);
  finishCombat(app.content, run, cb);
  app.combat = null;
  app.view = null;
  app.setFace('normal');
  app.save();
  if (run.phase === 'reward') app.go('REWARD');
  else app.go('RESULT');
}

/* ----- input ----- */
export function selectCard(app: App, uid: number) {
  const cb = app.combat; if (!cb || app.ui.busy || cb.choice) return;
  const card = cb.hand.find(c => c.uid === uid); if (!card) return;
  if (!cb.canPlay(card)) {
    const cost = cb.costOf(card);
    app.banner(cost === null || (typeof cost === 'number' && cost <= cb.energy) ? app.t('battle.unplayable') : app.t('battle.noEnergy'), 900);
    return;
  }
  if (app.ui.selected === uid) {
    const v = cb.view(card); const alive = cb.enemies.filter(e => e.alive);
    if (v.target !== 'enemy') return playCard(app, uid);
    if (alive.length === 1) return playCard(app, uid, alive[0].uid);
    app.banner(app.t('battle.chooseTarget'), 900);
    return;
  }
  app.ui.selected = uid;
  app.refreshBinds('hand', 'enemies');
}

export function playCard(app: App, uid: number, target?: number) {
  const cb = app.combat; if (!cb || app.ui.busy || cb.choice) return;
  const idx = cb.hand.findIndex(c => c.uid === uid); if (idx < 0) return;
  if (!cb.canPlay(cb.hand[idx])) { selectCard(app, uid); return; }
  const v = cb.view(cb.hand[idx]);
  if (v.target === 'enemy' && target === undefined) {
    const alive = cb.enemies.filter(e => e.alive);
    if (alive.length === 1) target = alive[0].uid;
    else { app.ui.selected = uid; app.refreshBinds('hand', 'enemies'); app.banner(app.t('battle.chooseTarget'), 900); return; }
  }
  const el = app.screen?.root.querySelector<HTMLElement>(`[data-bind="hand"] .card[data-uid="${uid}"]`);
  if (el) flyAway(app, el);
  app.ui.selected = null;
  void playFrames(app, cb.play(idx, target));
}

export function confirmChoice(app: App) {
  const cb = app.combat; if (!cb || !cb.choice || app.ui.busy) return;
  const picked = [...app.ui.picked];
  app.ui.picked = new Set();
  void playFrames(app, cb.choose(picked));
}

export function tapEnemy(app: App, uid: number) {
  const cb = app.combat; if (!cb) return;
  if (app.ui.selected !== null) {
    const card = cb.hand.find(c => c.uid === app.ui.selected);
    if (card && cb.view(card).target === 'enemy') return playCard(app, card.uid, uid);
    if (card) return playCard(app, card.uid);
  }
  app.showInfo({ kind: 'enemy', uid });
}

export function endTurn(app: App) {
  const cb = app.combat; if (!cb || app.ui.busy || cb.choice) return;
  app.ui.selected = null;
  void playFrames(app, cb.endTurn());
}

function flyAway(app: App, el: HTMLElement) {
  const r = el.getBoundingClientRect(), sr = app.stage.getBoundingClientRect(), k = sr.width / app.stage.offsetWidth || 1;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add('card-ghost');
  Object.assign(ghost.style, { left: `${(r.left - sr.left) / k}px`, top: `${(r.top - sr.top) / k}px`, width: `${r.width / k}px`, height: `${r.height / k}px`, transform: 'none', rotate: '0deg', translate: '0 0' });
  app.stage.appendChild(ghost);
  el.style.visibility = 'hidden';
  app.vfx.play('card.play', ghost);
  setTimeout(() => ghost.remove(), 400);
}
