/* npm run sim [-- runs=300] — a simple bot plays whole runs with the current packs and reports balance numbers.
   The bot is deliberately plain (no lookahead), so treat win rates as a lower bound for a careful human. */
import { loadNodeContent } from './node-content.ts';
import { newRun, reachable, enterNode, startCombat, finishCombat, takeGold, takeRelic, takeCard, leaveNode, restHeal, upgradeCard } from '../src/engine/run.ts';
import { canUpgrade } from '../src/engine/content.ts';
import type { Combat } from '../src/engine/combat.ts';
import { Rng } from '../src/engine/rng.ts';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const RUNS = Number(args.runs ?? 300);
const { content: c } = await loadNodeContent();
const charId = String(args.char ?? [...c.characters.keys()][0]);

function botTurn(cb: Combat) {
  for (let guard = 0; guard < 40 && cb.phase === 'player' && !cb.over; guard++) {
    const incoming = cb.enemies.filter(e => e.alive).reduce((s, e) => { const i = cb.intentInfo(e); return s + (i?.damage ?? 0) * (i?.times ?? 1); }, 0);
    const needBlock = incoming - cb.player.block;
    const options = cb.hand.map((card, i) => ({ i, v: cb.view(card) })).filter(o => cb.canPlay(cb.hand[o.i]));
    if (!options.length) break;
    const score = (o: typeof options[number]) => {
      const v = o.v; let s = 0;
      if (v.type === 'power') s += 30;
      for (const e of v.effects) {
        if (e.op === 'damage') s += 10;
        if (e.op === 'block') s += needBlock > 0 ? 14 : 2;
        if (e.op === 'draw' || e.op === 'gainEnergy') s += 12;
        if (e.op === 'applyStatus') s += 6;
      }
      if (cb.costOf(cb.hand[o.i]) === 0) s += 3;
      if (v.cost === null || v.type === 'status' || v.type === 'curse') s = v.type === 'status' && v.cost !== null ? 1 : -1;
      return s;
    };
    options.sort((a, b) => score(b) - score(a));
    const best = options[0];
    if (score(best) < 0) break;
    const target = cb.enemies.filter(e => e.alive).sort((a, b) => a.hp - b.hp)[0];
    cb.play(best.i, target?.uid);
    while (cb.choice) cb.choose(cb.choice.cards.slice(0, cb.choice.max).map(x => x.uid));
  }
  if (!cb.over) cb.endTurn();
}

const deaths = new Map<string, number>();
let wins = 0, floors = 0, turns = 0, battles = 0;
const t0 = Date.now();
for (let r = 0; r < RUNS; r++) {
  const run = newRun(c, charId, 1000 + r);
  const pick = new Rng(77 + r);
  while (run.phase !== 'won' && run.phase !== 'lost') {
    const next = reachable(run);
    if (!next.length) throw new Error('行き止まりのマップ');
    enterNode(c, run, pick.pick(next));
    if (run.phase === 'battle') {
      const cb = startCombat(c, run); cb.start(); battles++;
      let n = 0; while (!cb.over && n++ < 80) botTurn(cb);
      turns += cb.turn;
      finishCombat(c, run, cb);
      if (run.phase === 'lost') deaths.set(run.encounter!, (deaths.get(run.encounter!) || 0) + 1);
    }
    if (run.phase === 'reward' || run.phase === 'treasure') {
      takeGold(run); takeRelic(c, run);
      const p = run.pending!;
      if (p.cards.length) takeCard(run, p.cards[pick.int(0, p.cards.length - 1)].uid);
      leaveNode(run);
    } else if (run.phase === 'rest') {
      if (run.hp < run.maxHp * 0.6) restHeal(c, run);
      else { const u = run.deck.find(x => canUpgrade(c, x)); if (u) upgradeCard(c, run, u.uid); else restHeal(c, run); }
      leaveNode(run);
    }
  }
  if (run.phase === 'won') wins++;
  floors += run.stats.floors;
}
console.log(`${RUNS} ラン（${Date.now() - t0}ms）: 勝率 ${(wins / RUNS * 100).toFixed(1)}% · 平均到達 ${(floors / RUNS).toFixed(1)}階 · 1戦の平均 ${(turns / battles).toFixed(1)}ターン`);
console.log('負けた遭遇: ' + [...deaths].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / '));
