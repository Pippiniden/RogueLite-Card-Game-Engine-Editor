/* npm test — small scenario tests for the combat rules (statuses, choices, plugins).
   Each test builds a battle against a training dummy and checks numbers. */
import { loadNodeContent } from './node-content.ts';
import { Combat } from '../src/engine/combat.ts';
import { registerEffect } from '../src/engine/effects.ts';
import { newRun, enterNode, startCombat, finishCombat } from '../src/engine/run.ts';
import { registerRunEffect, runRunEffects, makeShop, buyCard, startRemoval, resolveChoice, removalPrice, shopPrice, startEvent, eventOptions, chooseEventOption, applyPick, makeCtx } from '../src/engine/run-effects.ts';
import { Rng } from '../src/engine/rng.ts';
import { evalNum } from '../src/engine/expr.ts';
import type { CardInst, CardDef, EnemyDef } from '../src/engine/types.ts';

const { content: c } = await loadNodeContent();
c.enemies.set('dummy', { id: 'dummy', name: '木人', hp: [100, 100], size: 'medium', art: 'enemy.golem', moves: { wait: { name: '待機', intent: 'unknown', effects: [] }, hit: { name: '殴る', intent: 'attack', effects: [{ op: 'damage', amount: 10 }] } }, ai: { type: 'sequence', order: ['hit'] } } as EnemyDef);
const char = [...c.characters.keys()][0];

let uid = 1;
function battle(hand: string[], o: { enemyStatuses?: Record<string, number>; playerHp?: number } = {}) {
  const deck: CardInst[] = hand.map(id => ({ uid: uid++, id: id.replace('+', ''), up: id.endsWith('+') }));
  const cb = new Combat(c, { charId: char, hp: o.playerHp ?? 70, maxHp: 70, deck, relics: [], enemies: ['dummy'], seeds: { battle: 1, ai: 1 } });
  cb.enemies[0].statuses = { ...(o.enemyStatuses ?? {}) };
  cb.start();
  return cb;
}
const play = (cb: Combat, id: string) => { const i = cb.hand.findIndex(x => x.id === id); if (i < 0) throw new Error(`${id} が手札にない`); cb.play(i, cb.enemies[0].uid); };
let fails = 0, passes = 0;
function expect(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passes++; return; }
  fails++; console.log(`✗ ${name}: ${JSON.stringify(got)}（期待値 ${JSON.stringify(want)}）`);
}

{ const cb = battle(['strike']); play(cb, 'strike'); expect('斬撃 6', cb.enemies[0].hp, 94); }
{ const cb = battle(['strike'], { enemyStatuses: { vulnerable: 2 } }); play(cb, 'strike'); expect('脆弱で1.5倍', cb.enemies[0].hp, 91); }
{ const cb = battle(['shield_bash'], { enemyStatuses: { artifact: 1 } }); play(cb, 'shield_bash'); expect('結界が脆弱を防ぐ', [cb.enemies[0].statuses.vulnerable ?? 0, cb.enemies[0].statuses.artifact ?? 0], [0, 0]); }
{ const cb = battle(['double_strike_stance', 'strike']); play(cb, 'double_strike_stance'); play(cb, 'strike'); expect('連撃の構えで2回', cb.enemies[0].hp, 88); }
{ const cb = battle(['strike'], { enemyStatuses: { thorns: 3 } }); play(cb, 'strike'); expect('棘で3返される', cb.player.hp, 67); }
{ const cb = battle(['strike'], { enemyStatuses: { intangible: 1 } }); play(cb, 'strike'); expect('霊体化で1', cb.enemies[0].hp, 99); }
{ const cb = battle(['twin_slash'], { enemyStatuses: { invincible: 7 } }); play(cb, 'twin_slash'); expect('不壊で7まで', cb.enemies[0].hp, 93); }
{ const cb = battle(['strike', 'strike'], { enemyStatuses: { plated_armor: 4 } }); play(cb, 'strike'); expect('装甲板が1減る', cb.enemies[0].statuses.plated_armor, 3); }
{ const cb = battle(['heavy_blade']); cb.player.statuses.strength = 2; play(cb, 'heavy_blade'); expect('大剣: 筋力3倍', cb.enemies[0].hp, 100 - (14 + 6)); }
{ const cb = battle(['body_slam', 'defend']); play(cb, 'defend'); play(cb, 'body_slam'); expect('体当たり=ブロック', cb.enemies[0].hp, 95); }
{ const cb = battle(['rampage', 'rampage']); play(cb, 'rampage'); const r = cb.discard.find(x => x.id === 'rampage')!; expect('暴走の変数', r.vars?.growth, 5); }
{
  const cb = battle(['burning_pact', 'strike', 'defend', 'strike', 'defend', 'strike']);
  play(cb, 'burning_pact');
  expect('選択待ち', !!cb.choice, true);
  const pick = cb.choice!.cards.find(x => x.id === 'defend')!;
  cb.choose([pick.uid]);
  expect('選んだカードが廃棄', cb.exhaustPile.map(x => x.id), ['defend']);
  expect('選択後に引く（山札の残り1枚）', cb.hand.length, 4);
}
{ const cb = battle(['soul_reaver'], { playerHp: 50 }); play(cb, 'soul_reaver'); expect('プラグイン: 吸収攻撃', [cb.enemies[0].hp, cb.player.hp], [96, 54]); }
{ const cb = battle(['coup_de_grace']); cb.enemies[0].hp = 20; play(cb, 'coup_de_grace'); expect('プラグイン: とどめ', cb.enemies[0].alive, false); }
{ const cb = battle(['dropkick', 'strike', 'strike', 'strike', 'strike'], { enemyStatuses: { vulnerable: 1 } }); const e0 = cb.energy; play(cb, 'dropkick'); expect('跳び蹴り: 脆弱ならエネルギー戻る', cb.energy, e0); }
{ const cb = battle(['strike']); cb.player.statuses.entangled = 1; expect('拘束でアタック不可', cb.canPlay(cb.hand[0]), false); }
{ const cb = battle(['flex', 'strike']); play(cb, 'flex'); cb.endTurn(); expect('力みはターン終了で戻る', cb.player.statuses.strength ?? 0, 0); }
{ const cb = battle(['defend', 'strike']); cb.player.statuses.barricade = 1; play(cb, 'defend'); cb.enemies[0].intent = 'wait'; cb.endTurn(); expect('防壁でブロック維持', cb.player.block, 5); }

{ // the choice example from docs/plugins.md
  registerEffect('discardThenDraw', {
    label: '選んで捨て、同じ枚数引く', group: 'plugin',
    params: { count: { type: 'int', default: 2, label: '枚数' } },
    defaultTo: null,
    *run(cb, ctx, e) {
      const picked = yield* cb.pickCards(ctx, { pile: 'hand', select: 'choose', count: Number(e.count ?? 2), filter: '', prompt: '捨てるカードを選ぶ' });
      cb.moveCards(picked, 'hand', 'discard');
      cb.draw(picked.length);
    },
  });
  c.cards.set('doc_example', { id: 'doc_example', name: '見本', type: 'skill', rarity: 'special', cost: 0, target: 'none', art: '', effects: [{ op: 'discardThenDraw', count: 2 }] } as unknown as CardDef);
  const cb = battle(['doc_example', 'strike', 'defend', 'strike', 'defend', 'strike', 'defend', 'strike']);
  const handBefore = cb.hand.length;
  play(cb, 'doc_example');
  expect('docs の選択例: 2枚選ばせる', [cb.choice?.min, cb.choice?.max], [2, 2]);
  cb.choose(cb.choice!.cards.slice(0, 2).map(x => x.uid));
  expect('docs の選択例: 捨てて引く', [cb.hand.length, cb.discard.length], [handBefore - 1, 3]);
}

/* ----- shop ----- */
{
  const run = newRun(c, char, 5); run.gold = 500;
  const shop = makeShop(c, run, new Rng(3)); run.shop = shop; run.phase = 'shop';
  const S = c.rules.shop!;
  expect('ショップ: カード 5+2 枚', shop.cards.length, S.cards + S.colorless);
  expect('ショップ: セールは1枚', shop.cards.filter(x => x.sale).length, 1);
  expect('ショップ: レリック3つ', shop.relics.length, 3);
  const inRange = shop.cards.every((x, i) => { if (x.sale) return true; const [a, b] = S.cardPrice[c.cards.get(x.card.id)!.rarity]!; const k = i >= S.cards ? S.colorlessMarkup : 1; return x.price >= Math.round(a * k) && x.price <= Math.round(b * k); });
  expect('ショップ: 値段がレアリティの範囲内', inRange, true);
  const g = run.gold, n = run.deck.length, price = shop.cards[0].price;
  expect('ショップ: 買える', buyCard(c, run, 0).ok, true);
  expect('ショップ: 代金とデッキ', [run.gold, run.deck.length], [g - price, n + 1]);
  expect('ショップ: 売り切れは買えない', buyCard(c, run, 0).ok, false);
  run.gold = 10;
  expect('ショップ: お金が足りない', buyCard(c, run, 1), { ok: false, reason: 'gold' });
  run.gold = 500;
  expect('削除: 最初は75', removalPrice(c, run), 75);
  startRemoval(c, run);
  expect('削除: やめると無料', [resolveChoice(c, run, []).status, run.gold, run.shop.removal.used ?? false], ['done', 500, false]);
  startRemoval(c, run);
  const victim = run.deck.find(x => x.id === 'strike')!;
  resolveChoice(c, run, [victim.uid]);
  expect('削除: 払って1枚減る', [run.gold, run.deck.includes(victim), run.shop.removal.used], [425, false, true]);
  expect('削除: 次は100', removalPrice(c, run), 100);
  run.relics.push('merchant_tally');
  expect('割符で半額', shopPrice(c, run, 150), 75);
  run.relics.push('smiling_mask');
  expect('笑う仮面で削除50', removalPrice(c, run), 50);
}
/* ----- events ----- */
const evRun = (id: string, gold = 200) => { const run = newRun(c, char, 9); run.gold = gold; run.stats.floors = 5; run.at = { floor: 4, col: run.map.floors[4].findIndex(Boolean) }; startEvent(c, run, c.events.get(id)!); return run; };
{
  const run = evRun('ev_gambler', 20);
  expect('イベント: 変数 bet=50', run.event!.vars.bet, 50);
  expect('イベント: お金が足りないと選べない', eventOptions(c, run)[0].enabled, false);
  expect('イベント: 選べない選択肢は無効', chooseEventOption(c, run, 0).status, 'invalid');
}
{
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 30; seed++) {
    const run = evRun('ev_gambler'); run.seed = seed; run.rng.event = seed * 7919;
    chooseEventOption(c, run, 0);
    const page = run.event!.page;
    outcomes.add(page);
    if (page === 'win' && run.gold !== 200 - 50 + 120) expect('賭けに勝つと120', run.gold, 270);
    if (page === 'lose' && run.gold !== 150) expect('賭けに負けると-50', run.gold, 150);
  }
  expect('イベント: 確率で両方のページに分かれる', [...outcomes].sort(), ['lose', 'win']);
}
{
  const run = evRun('ev_smith');
  const r1 = chooseEventOption(c, run, 0);
  expect('イベント: 強化はカードを選ばせる', [r1.status, run.choice?.op], ['choice', 'upgrade']);
  const target = run.deck.find(x => x.id === 'strike')!;
  resolveChoice(c, run, [target.uid]);
  expect('イベント: 選んだカードが強化され次のページへ', [target.up, run.event?.page], [true, 'forged']);
}
{
  const run = evRun('ev_library');
  chooseEventOption(c, run, 0);
  const n = run.deck.length;
  expect('イベント: 3枚から選ぶ', run.choice?.cards?.length, 3);
  resolveChoice(c, run, []);
  expect('イベント: 選ばずに済ませる', [run.deck.length, run.event?.page], [n, 'read']);
}
{
  const run = evRun('ev_ambush');
  expect('イベント: 戦闘になる', [chooseEventOption(c, run, 0).status, run.phase, run.fight?.reward], ['fight', 'battle', 'elite']);
  const cb = startCombat(c, run); cb.start();
  cb.enemies.forEach(e => { e.hp = 0; e.alive = false; });
  (cb as unknown as { phase: string }).phase = 'won';
  finishCombat(c, run, cb);
  expect('イベントの戦闘: エリート扱いでレリック付き', [run.phase, !!run.pending?.relic], ['reward', true]);
}
{
  const run = evRun('ev_spring');
  chooseEventOption(c, run, 2);
  expect('イベント: 立ち去るとマップへ', [run.phase, run.event], ['map', undefined]);
}
{
  const saved = c.rules.unknown;
  c.rules.unknown = { shop: 1 };
  const run = newRun(c, char, 4);
  enterNode(c, run, { floor: 3, col: 0, type: 'event', next: [], x: 0 });
  expect('「？」マスがショップになる', [run.phase, run.resolved, !!run.shop], ['shop', 'shop', true]);
  c.rules.unknown = saved;
}
{
  const run = newRun(c, char, 4);
  const ctx = makeCtx(c, run, 'relic', false);
  applyPick(ctx, { op: 'duplicate', count: 1, prompt: '', from: 'relic' }, [run.deck[0]]);
  expect('複製', run.deck.filter(x => x.id === run.deck[0].id).length >= 2, true);
}

{ // the run-effect example from docs/plugins.md
  registerRunEffect('tithe', {
    label: '所持金の割合を失う', params: { percent: { type: 'num', required: true, default: 25, label: '割合(%)' } }, text: '所持金の{percent}%を失う',
    run(ctx, e) { const vars = { gold: ctx.run.gold, ...ctx.vars }; const n = Math.floor(ctx.run.gold * evalNum(e.percent as never, vars, 25) / 100); ctx.run.gold -= n; ctx.log.push({ t: 'gold', n: -n }); },
  });
  const run = newRun(c, char, 4); run.gold = 200;
  const ctx = makeCtx(c, run, 'event', false);
  runRunEffects(ctx, [{ op: 'tithe', percent: 25 }]);
  expect('docs の冒険の効果の例', [run.gold, ctx.log], [150, [{ t: 'gold', n: -50 }]]);
}

console.log(fails ? `${fails} 件失敗 / ${passes} 件成功` : `すべて成功（${passes} 件）`);
process.exit(fails ? 1 : 0);
