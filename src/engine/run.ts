import type { Content } from './content.ts';
import { canUpgrade } from './content.ts';
import type { CardInst, MapData, MapNode, NodeType, RunState, Rarity, EncounterDef, Effect, UnknownOutcome, ActDef, Rules } from './types.ts';
import { deepMerge } from './content.ts';
import { Rng, deriveSeed } from './rng.ts';
import { Combat } from './combat.ts';
import { makeCtx, runRunEffects, saveRng, pickRelic, makeShop, pickEvent, startEvent, runRng, potionRules, pickPotion, givePotion } from './run-effects.ts';

/* ----- acts ----- */
export const actCount = (c: Content) => Math.max(1, c.rules.acts?.length ?? 1);
export const actDef = (c: Content, i: number): ActDef => c.rules.acts?.[i] ?? { name: '' };
/** rules.map with this act's overrides */
export const actMap = (c: Content, i: number): Rules['map'] => deepMerge(c.rules.map, actDef(c, i).map ?? {});
export const isLastAct = (c: Content, run: RunState) => (run.act ?? 0) >= actCount(c) - 1;

/* ===== One run: map, nodes, rewards. Pure data in, pure data out (RunState is saved as JSON). ===== */

export function newRun(c: Content, charId: string, seed = (Math.random() * 2 ** 32) >>> 0): RunState {
  const ch = c.characters.get(charId);
  if (!ch) throw new Error(`キャラクター ${charId} がありません`);
  let uid = 1;
  const run: RunState = {
    v: 1, seed, char: charId, hp: ch.hp, maxHp: ch.hp, gold: ch.gold,
    deck: ch.deck.map(id => ({ uid: uid++, id, up: false })),
    relics: [...ch.relics],
    map: { floors: [], boss: { floor: 0, col: 0, type: 'boss', next: [], x: 0.5 } },
    at: null,
    path: [],
    rng: { map: deriveSeed(seed, 'map'), battle: deriveSeed(seed, 'battle'), reward: deriveSeed(seed, 'reward'), ai: deriveSeed(seed, 'ai') },
    nextUid: uid,
    phase: 'map',
    stats: { floors: 0, kills: 0, elites: 0, startedAt: new Date().toISOString() },
    act: 0, floorBase: 0,
  };
  const P = potionRules(c);
  run.potions = Array(Math.max(0, ch.potionSlots ?? P.slots)).fill(null);
  run.potionChance = P.dropChance;
  for (const id of ch.potions ?? []) if (c.potions.has(id)) givePotion(run, id);
  for (const r of run.relics) applyRunEffects(c, run, c.relics.get(r)?.onPickup, false);
  const rng = new Rng(run.rng.map);
  run.map = generateMap(c, rng, 0);
  run.rng.map = rng.state;
  return run;
}

/** after an act's boss: new map, heal part of the missing HP */
export function startAct(c: Content, run: RunState, act: number) {
  const prev = run.act ?? 0;
  run.floorBase = (run.floorBase ?? 0) + actMap(c, prev).floors + 1;
  run.act = act;
  const rng = new Rng(run.rng.map);
  run.map = generateMap(c, rng, act);
  run.rng.map = rng.state;
  run.at = null; run.path = []; run.stats.floors = 0;
  const pct = actDef(c, act).healPercent ?? 100;
  run.hp = Math.min(run.maxHp, run.hp + Math.ceil((run.maxHp - run.hp) * pct / 100));
  run.phase = 'map';
}

/* ----- map ----- */
export function generateMap(c: Content, rng: Rng, act = 0): MapData {
  const R = actMap(c, act), F = R.floors, W = R.width;
  const grid: (MapNode | null)[][] = Array.from({ length: F }, () => Array(W).fill(null));
  const edges: [number, number, number][] = []; // floor, from col, to col
  const crosses = (f: number, a: number, b: number) => edges.some(([ef, ea, eb]) => ef === f && ((ea < a && eb > b) || (ea > a && eb < b)));
  const starts: number[] = [];
  for (let p = 0; p < R.paths; p++) {
    let col = rng.int(0, W - 1);
    if (p === 1) { let tries = 0; while (starts.includes(col) && tries++ < 10) col = rng.int(0, W - 1); }
    starts.push(col);
    for (let f = 0; f < F; f++) {
      grid[f][col] ??= { floor: f, col, type: 'battle', next: [], x: (col + 0.5 + (rng.next() - 0.5) * 0.3) / W };
      if (f === F - 1) break;
      const options = [col - 1, col, col + 1].filter(n => n >= 0 && n < W && !crosses(f, col, n));
      const nc = options.length ? rng.pick(options) : col;
      if (!edges.some(([ef, ea, eb]) => ef === f && ea === col && eb === nc)) edges.push([f, col, nc]);
      const node = grid[f][col]!;
      if (!node.next.includes(nc)) node.next.push(nc);
      col = nc;
    }
  }
  // node types
  const restFloor = R.restFloor === 'last' ? F - 1 : R.restFloor;
  const parents = (n: MapNode) => n.floor === 0 ? [] : grid[n.floor - 1].filter(p => p && p.next.includes(n.col)) as MapNode[];
  const kinds = Object.entries(R.weights) as [NodeType, number][];
  const minFloor = (k: NodeType) => R.minFloor?.[k] ?? (k === 'elite' ? R.eliteMinFloor : k === 'rest' ? R.restMinFloor : 0);
  for (let f = 0; f < F; f++) for (const n of grid[f]) {
    if (!n) continue;
    if (f === 0) { n.type = 'battle'; continue; }
    if (f === restFloor) { n.type = 'rest'; continue; }
    if (f === R.treasureFloor) { n.type = 'treasure'; continue; }
    const ps = parents(n);
    const allowed = kinds.filter(([k]) => {
      if (f < minFloor(k)) return false;
      if (k === 'rest' && f === restFloor - 1) return false;
      // no two elites / rests / shops in a row
      if ((k === 'elite' || k === 'rest' || k === 'shop') && ps.some(p => p.type === k)) return false;
      return k !== 'boss' && k !== 'treasure';
    });
    n.type = rng.weighted(allowed, ([, w]) => w)?.[0] ?? 'battle';
  }
  return { floors: grid, boss: { floor: F, col: Math.floor(W / 2), type: 'boss', next: [], x: 0.5 } };
}

export function currentNode(run: RunState): MapNode | null {
  if (!run.at) return null;
  if (run.at.floor >= run.map.floors.length) return run.map.boss;
  return run.map.floors[run.at.floor][run.at.col];
}
/** nodes the player may step to next */
export function reachable(run: RunState): MapNode[] {
  if (run.phase !== 'map') return [];
  if (!run.at) return run.map.floors[0].filter(Boolean) as MapNode[];
  const n = currentNode(run)!;
  if (n.type === 'boss') return [];
  if (n.floor === run.map.floors.length - 1) return [run.map.boss];
  return n.next.map(col => run.map.floors[n.floor + 1][col]!).filter(Boolean);
}

/* ----- entering a node ----- */
export function enterNode(c: Content, run: RunState, node: MapNode): void {
  run.at = { floor: node.floor, col: node.col };
  (run.path ??= []).push({ floor: node.floor, col: node.col });
  run.stats.floors = node.floor + 1;
  run.pending = undefined;
  run.resolved = undefined; run.fight = undefined; run.shop = undefined; run.event = undefined; run.choice = undefined;
  let type: NodeType = node.type;
  if (type === 'event') {
    // a "?" node: usually an event, sometimes something else (rules.unknown)
    const rng = runRng(run);
    let out = rng.weighted(Object.entries(c.rules.unknown ?? { event: 1 }) as [UnknownOutcome, number][], ([, w]) => w)?.[0] ?? 'event';
    if (out === 'event') {
      const ev = pickEvent(c, run, rng);
      if (ev) startEvent(c, run, ev); else out = 'battle';
    }
    saveRng(run, rng);
    run.resolved = out;
    if (out === 'event') return;
    type = out;
  }
  if (type === 'shop') {
    const rng = runRng(run);
    run.shop = makeShop(c, run, rng);
    saveRng(run, rng);
    run.phase = 'shop';
    return;
  }
  if (type === 'battle' || type === 'elite' || type === 'boss') {
    const pool = type === 'battle' ? 'normal' : type;
    const rng = new Rng(run.rng.reward);
    const enc = pickEncounter(c, rng, pool, node.floor, (run.act ?? 0) + 1);
    run.rng.reward = rng.state;
    run.encounter = enc.id;
    run.phase = 'battle';
  } else if (type === 'rest') run.phase = 'rest';
  else if (type === 'treasure') {
    const rng = new Rng(run.rng.reward);
    const relic = pickRelic(c, run, rng);
    run.rng.reward = rng.state;
    run.pending = { gold: 0, cards: [], relic };
    run.phase = 'treasure';
  }
}

function pickEncounter(c: Content, rng: Rng, pool: EncounterDef['pool'], floor: number, act: number): EncounterDef {
  const inPool = [...c.encounters.values()].filter(e => e.pool === pool);
  const inAct = inPool.filter(e => !e.acts?.length || e.acts.includes(act));
  const all = inAct.length ? inAct : inPool;
  const fit = all.filter(e => (e.minFloor ?? 0) <= floor && floor <= (e.maxFloor ?? 999));
  const list = fit.length ? fit : all;
  return rng.weighted(list, e => e.weight ?? 1) ?? list[0];
}

export function startCombat(c: Content, run: RunState): Combat {
  const enc = c.encounters.get(run.encounter!)!;
  const cb = new Combat(c, {
    charId: run.char, hp: run.hp, maxHp: run.maxHp, deck: run.deck, relics: run.relics, enemies: enc.enemies,
    seeds: { battle: run.rng.battle, ai: run.rng.ai }, potions: run.potions ?? [],
  });
  return cb;
}

/** call when the battle is over; moves the run to reward / won / lost */
export function finishCombat(c: Content, run: RunState, cb: Combat): void {
  run.rng.battle = cb.rng.state;
  run.rng.ai = cb.ai.state;
  run.hp = cb.player.hp;
  run.maxHp = cb.player.maxHp;
  run.gold += cb.runDelta.gold;
  run.potions = [...cb.potions];
  run.stats.kills += cb.enemies.filter(e => !e.alive).length;
  if (cb.phase === 'lost') { run.phase = 'lost'; return; }
  const node = currentNode(run)!;
  if (node.type === 'boss') {
    if (isLastAct(c, run)) { run.phase = 'won'; return; }
    // boss of an earlier act: gold, rare cards, and a choice of boss relics, then the next act
    const rng = new Rng(run.rng.reward);
    const [g0, g1] = c.rules.rewards.gold.boss;
    const choices: string[] = [];
    for (let i = 0; i < 3; i++) { const id = pickRelic(c, run, rng, { rarity: 'boss', exclude: choices }); if (id) choices.push(id); }
    run.pending = { gold: rng.int(g0, g1), cards: rollCards(c, run, rng, 'boss'), relicChoices: choices.length ? choices : undefined, nextAct: true };
    run.rng.reward = rng.state;
    run.phase = 'reward';
    return;
  }
  const fight = run.fight;
  run.fight = undefined;
  if (fight?.reward === 'none') { run.pending = { gold: 0, cards: [] }; run.phase = 'reward'; return; }
  const type = node.type === 'event' ? run.resolved : node.type;
  const kind = fight ? fight.reward : type === 'elite' ? 'elite' : 'normal';
  if (kind === 'elite') run.stats.elites++;
  const rng = new Rng(run.rng.reward);
  const [g0, g1] = c.rules.rewards.gold[kind];
  run.pending = { gold: rng.int(g0, g1), cards: rollCards(c, run, rng, kind) };
  if (kind === 'elite') run.pending.relic = pickRelic(c, run, rng);
  rollPotion(c, run, rng);
  run.rng.reward = rng.state;
  run.phase = 'reward';
}

/** potion drop: the chance falls after a drop and rises after a miss */
function rollPotion(c: Content, run: RunState, rng: Rng) {
  const P = potionRules(c);
  const chance = run.potionChance ?? P.dropChance;
  if (rng.next() * 100 < chance) {
    const id = pickPotion(c, run, rng);
    if (id && run.pending) run.pending.potion = id;
    run.potionChance = Math.max(0, chance - P.dropStep);
  } else run.potionChance = Math.min(100, chance + P.dropStep);
}

function rollCards(c: Content, run: RunState, rng: Rng, kind: 'normal' | 'elite' | 'boss'): CardInst[] {
  const pools = c.characters.get(run.char)!.cardPools;
  const inPool = (d: { pools?: string[] }) => !!d.pools?.some(p => pools.includes(p));
  const weights = c.rules.rewards.rarity[kind];
  const out: CardInst[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < c.rules.rewards.cardChoices; i++) {
    const rar = rng.weighted(Object.entries(weights) as [Rarity, number][], ([, w]) => w)?.[0] ?? 'common';
    let cands = [...c.cards.values()].filter(d => inPool(d) && d.rarity === rar && !taken.has(d.id));
    if (!cands.length) cands = [...c.cards.values()].filter(d => inPool(d) && !['starter', 'special'].includes(d.rarity) && !taken.has(d.id));
    if (!cands.length) break;
    const d = rng.pick(cands);
    taken.add(d.id);
    out.push({ uid: run.nextUid++, id: d.id, up: !!d.upgrade && rng.chance(c.rules.rewards.upgradedChance) });
  }
  return out;
}


/** run-level effects outside combat (relic pick-up). Picks are random when canAsk is false. */
export function applyRunEffects(c: Content, run: RunState, list: Effect[] | undefined, canAsk = true) {
  if (!list?.length) return 'done' as const;
  const ctx = makeCtx(c, run, 'relic', canAsk);
  const st = runRunEffects(ctx, list);
  saveRng(run, ctx.rng);
  return st;
}

/* ----- reward / rest actions ----- */
export function takeGold(run: RunState) { if (run.pending && !run.pending.goldTaken) { run.gold += run.pending.gold; run.pending.goldTaken = true; } }
export function takeRelic(c: Content, run: RunState) {
  const p = run.pending; if (!p?.relic || p.relicTaken) return;
  run.relics.push(p.relic); p.relicTaken = true;
  return applyRunEffects(c, run, c.relics.get(p.relic)?.onPickup);
}
/** false when the belt is full (discard one first) */
export function takePotion(run: RunState): boolean {
  const p = run.pending; if (!p?.potion || p.potionTaken) return false;
  if (!givePotion(run, p.potion)) return false;
  p.potionTaken = true; return true;
}
/** boss reward: take one of the offered relics */
export function takeRelicChoice(c: Content, run: RunState, id: string) {
  const p = run.pending; if (!p?.relicChoices?.includes(id) || p.relicTaken) return;
  run.relics.push(id); p.relicTaken = true;
  return applyRunEffects(c, run, c.relics.get(id)?.onPickup);
}
export function takeCard(run: RunState, uid: number) {
  const p = run.pending; if (!p || p.cardTaken) return;
  const card = p.cards.find(x => x.uid === uid); if (!card) return;
  run.deck.push(card); p.cardTaken = true;
}
/** back to the map (or, after an act's boss, on to the next act) */
export function leaveNode(run: RunState, c?: Content) {
  const next = run.pending?.nextAct;
  run.pending = undefined; run.encounter = undefined; run.shop = undefined; run.event = undefined; run.choice = undefined;
  run.fight = undefined; run.resolved = undefined; run.phase = 'map';
  if (next && c) startAct(c, run, (run.act ?? 0) + 1);
}

export function restHeal(c: Content, run: RunState): number {
  const n = Math.min(Math.ceil(run.maxHp * c.rules.rest.healPercent / 100), run.maxHp - run.hp);
  run.hp += n; return n;
}
export function upgradeCard(c: Content, run: RunState, uid: number): boolean {
  const card = run.deck.find(x => x.uid === uid);
  if (!card || !canUpgrade(c, card)) return false;
  card.up = true; return true;
}
