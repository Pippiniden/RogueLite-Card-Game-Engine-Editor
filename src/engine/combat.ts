import type { Content } from './content.ts';
import { cardView } from './content.ts';
import type { CardDef, CardInst, Combatant, CombatEvent, Effect, StatName, TargetSel, Trigger, EventName, Intent } from './types.ts';
import { Rng } from './rng.ts';
import { evalNum, evalCond } from './expr.ts';
import { EFFECTS, type EffectCtx, type ChoiceReq } from './effects.ts';

export interface CombatSetup {
  charId: string;
  hp: number;
  maxHp: number;
  deck: CardInst[];
  relics: string[];
  enemies: string[];
  seeds: { battle: number; ai: number };
}

/** what the screen needs after each step; plain data so it can be cloned and replayed */
export interface CombatView {
  turn: number;
  energy: number;
  maxEnergy: number;
  player: Combatant;
  enemies: Combatant[];
  hand: CardInst[];
  draw: CardInst[];
  discard: CardInst[];
  exhaust: CardInst[];
  phase: 'player' | 'enemy' | 'won' | 'lost';
  /** the player must pick cards before anything else happens */
  choice?: ChoiceReq;
}
export interface Frame { events: CombatEvent[]; view: CombatView }
export interface IntentInfo { intent: Intent; name: string; damage?: number; times?: number }

type Gen = Generator<ChoiceReq, void, CardInst[]>;
interface FireExtra { other?: Combatant; amount?: number; blocked?: number; card?: CardInst; cardDef?: CardDef }

const MAX_DEPTH = 24;

export class Combat {
  content: Content;
  rng: Rng;
  ai: Rng;
  player: Combatant;
  enemies: Combatant[] = [];
  relics: string[];
  hand: CardInst[] = [];
  drawPile: CardInst[] = [];
  discard: CardInst[] = [];
  exhaustPile: CardInst[] = [];
  energy = 0;
  maxEnergy: number;
  drawPerTurn: number;
  turn = 0;
  phase: CombatView['phase'] = 'player';
  over = false;
  /** run-level changes made during combat (applied by finishCombat) */
  runDelta = { gold: 0, maxHp: 0 };
  /** tallies readable from expressions */
  tally = { cardsThisTurn: 0, attacksThisTurn: 0, skillsThisTurn: 0, powersThisTurn: 0, cardsThisCombat: 0 };
  private pending: { req: ChoiceReq; gen: Gen } | null = null;
  private ending = false;
  private depth = 0;
  private events: CombatEvent[] = [];
  private frames: Frame[] = [];
  private uidSeq = 100000;
  private counters = new Map<string, number>();

  constructor(content: Content, s: CombatSetup) {
    this.content = content;
    this.rng = new Rng(s.seeds.battle);
    this.ai = new Rng(s.seeds.ai);
    const ch = content.characters.get(s.charId)!;
    this.player = { uid: 1, side: 'player', def: s.charId, name: ch.name, hp: s.hp, maxHp: s.maxHp, block: 0, statuses: {}, alive: true, hpLostThisTurn: 0 };
    this.maxEnergy = ch.energy;
    this.drawPerTurn = ch.draw;
    this.relics = [...s.relics];
    s.enemies.forEach((id, i) => {
      const d = content.enemies.get(id)!;
      const hp = this.ai.int(d.hp[0], d.hp[1]);
      this.enemies.push({ uid: 10 + i, side: 'enemy', def: id, name: d.name, hp, maxHp: hp, block: 0, statuses: { ...(d.statuses || {}) }, alive: true, history: [], hpLostThisTurn: 0 });
    });
    const deck = s.deck.map(c => ({ ...c, vars: c.vars ? { ...c.vars } : undefined }));
    this.rng.shuffle(deck);
    const innate = deck.filter(c => this.view(c).keywords?.includes('innate'));
    this.drawPile = [...deck.filter(c => !innate.includes(c)), ...innate];
  }

  /* ===== public API (each returns the frames to animate) ===== */

  start(): Frame[] {
    this.fire('battleStart', this.player);
    for (const e of this.enemies) this.fire('battleStart', e);
    this.enemies.forEach(e => this.chooseIntent(e));
    this.checkpoint();
    this.startPlayerTurn();
    return this.flush();
  }

  get choice(): ChoiceReq | null { return this.pending?.req ?? null; }

  costOf(c: CardInst): number | 'X' | null {
    const v = this.view(c);
    if (v.cost === null || v.cost === 'X') return v.cost;
    if (c.costTurn !== undefined) return Math.max(0, c.costTurn);
    return Math.max(0, (c.costSet ?? v.cost) + (c.costMod ?? 0));
  }

  canPlay(c: CardInst): boolean {
    if (this.phase !== 'player' || this.over || this.pending) return false;
    const v = this.view(c);
    const cost = this.costOf(c);
    if (cost === null) return false;
    if (cost !== 'X' && cost > this.energy) return false;
    const flags = this.flags(this.player);
    if (flags.has(`cannotPlay:${v.type}`)) return false;
    if (v.playIf && !evalCond(v.playIf, this.exprVars({ source: this.player, vars: {}, card: c, cardDef: v }))) return false;
    return true;
  }

  play(handIndex: number, targetUid?: number): Frame[] {
    const inst = this.hand[handIndex];
    if (!inst || !this.canPlay(inst)) return [];
    this.drive(this.playGen(inst, targetUid));
    return this.flush();
  }

  /** answer a pending choice with the uids the player picked */
  choose(uids: number[]): Frame[] {
    if (!this.pending) return [];
    const { req, gen } = this.pending;
    const picked = req.cards.filter(c => uids.includes(c.uid)).slice(0, req.max);
    if (picked.length < req.min) return [];
    this.pending = null;
    this.drive(gen, picked);
    return this.flush();
  }

  endTurn(): Frame[] {
    if (this.phase !== 'player' || this.over || this.pending) return [];
    // cards that act while held (Burn-like)
    for (const c of [...this.hand]) {
      const v = this.view(c);
      v.handTriggers?.filter(t => t.on === 'turnEnd').forEach(t => this.runSync(this.runEffects(t.effects, { source: this.player, vars: {}, card: c, cardDef: v })));
    }
    const keep: CardInst[] = [];
    for (const c of this.hand) {
      const kw = this.view(c).keywords || [];
      c.costTurn = undefined;
      if (kw.includes('retain')) keep.push(c);
      else if (kw.includes('ethereal')) this.exhaustCard(c);
      else this.discard.push(c);
    }
    this.hand = keep;
    this.fire('turnEnd', this.player);
    this.decay(this.player, 'turnEnd');
    if (this.over) return this.flush();
    this.phase = 'enemy';
    this.emit({ t: 'turn', side: 'enemy', turn: this.turn });
    this.checkpoint();
    for (const e of this.enemies) {
      if (!e.alive || this.over) continue;
      if (!this.flags(e).has('retainBlock')) e.block = 0;
      e.hpLostThisTurn = 0;
      this.fire('turnStart', e);
      this.decay(e, 'turnStart');
      if (!e.alive || this.over) { this.checkpoint(); continue; }
      const d = this.content.enemies.get(e.def)!;
      const mv = d.moves[e.intent || ''];
      if (mv) {
        this.emit({ t: 'move', actor: e.uid, move: e.intent!, intent: mv.intent });
        this.runSync(this.runEffects(mv.effects, { source: e, target: this.player, vars: {} }));
        e.history!.push(e.intent!);
      }
      this.checkpoint();
    }
    if (this.over) return this.flush();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.fire('turnEnd', e);
      this.decay(e, 'turnEnd');
    }
    if (!this.over) {
      this.enemies.filter(e => e.alive).forEach(e => this.chooseIntent(e));
      this.startPlayerTurn();
    }
    return this.flush();
  }

  /* ===== read helpers ===== */

  view(c: Pick<CardInst, 'id' | 'up'>): CardDef { return cardView(this.content, c); }
  text(key: string): string { return this.content.text.ui[key] ?? key; }

  snapshot(): CombatView {
    return JSON.parse(JSON.stringify({
      turn: this.turn, energy: this.energy, maxEnergy: this.maxEnergy, player: this.player, enemies: this.enemies,
      hand: this.hand, draw: this.drawPile, discard: this.discard, exhaust: this.exhaustPile, phase: this.phase,
      choice: this.pending?.req,
    }));
  }

  intentInfo(e: Combatant): IntentInfo | null {
    const d = this.content.enemies.get(e.def); const mv = d?.moves[e.intent || ''];
    if (!mv) return null;
    const info: IntentInfo = { intent: mv.intent, name: mv.name };
    const dmg = mv.effects.find(x => x.op === 'damage' && x.kind !== 'raw');
    if (dmg) {
      const vars = this.exprVars({ source: e, target: this.player, vars: {} });
      info.damage = this.calcAttack(e, this.player, Math.floor(evalNum(dmg.amount as never, vars)), evalNum(dmg.strengthMul as never, vars, 1));
      info.times = Math.floor(evalNum(dmg.times as never, vars, 1));
    }
    return info;
  }

  previewAttack(base: number, target?: Combatant, strengthMul = 1): number { return this.calcAttack(this.player, target, base, strengthMul); }
  previewBlock(base: number): number { return this.calcBlock(this.player, base); }

  /** variables available to expressions in effects, conditions and modifiers */
  exprVars(ctx: Pick<EffectCtx, 'source' | 'target' | 'vars' | 'card' | 'cardDef'>): Record<string, number> {
    const v: Record<string, number> = {
      ...ctx.vars,
      turn: this.turn, energy: this.energy,
      'hand.count': this.hand.length, hand: this.hand.length,
      'draw.count': this.drawPile.length, 'discard.count': this.discard.length, 'exhaust.count': this.exhaustPile.length,
      enemies: this.enemies.filter(e => e.alive).length,
      ...this.tally,
    };
    for (const t of ['attack', 'skill', 'power', 'status', 'curse']) v[`hand.${t}`] = this.hand.filter(c => this.view(c).type === t).length;
    const put = (prefix: string, c?: Combatant) => {
      if (!c) return;
      v[`${prefix}.hp`] = c.hp; v[`${prefix}.maxHp`] = c.maxHp; v[`${prefix}.block`] = c.block;
      v[`${prefix}.hpPct`] = c.maxHp ? Math.floor(c.hp / c.maxHp * 100) : 0;
      v[`${prefix}.hpLostThisTurn`] = c.hpLostThisTurn ?? 0;
      for (const [k, n] of Object.entries(c.statuses)) v[`${prefix}.${k}`] = n;
      if (c.side === 'enemy') v[`${prefix}.intentAttack`] = this.content.enemies.get(c.def)?.moves[c.intent ?? '']?.intent.startsWith('attack') ? 1 : 0;
    };
    put('self', ctx.source); put('target', ctx.target); put('player', this.player);
    if (ctx.card) {
      for (const [k, n] of Object.entries({ ...(ctx.cardDef?.vars ?? {}), ...(ctx.card.vars ?? {}) })) v[`card.${k}`] = n;
      v['card.upgraded'] = ctx.card.up ? 1 : 0;
      const cost = this.costOf(ctx.card); v['card.cost'] = typeof cost === 'number' ? cost : 0;
    }
    return v;
  }

  isDebuff(id: string, stacks: number): boolean {
    const d = this.content.statuses.get(id); if (!d) return false;
    return d.kind === 'debuff' ? stacks > 0 : !!d.allowNegative && stacks < 0;
  }

  /* ===== mechanics used by effects ===== */

  emit(ev: CombatEvent) { this.events.push(ev); }

  resolveTargets(sel: TargetSel, ctx: EffectCtx): Combatant[] {
    const all = [this.player, ...this.enemies].filter(c => c.alive);
    const foes = all.filter(c => c.side !== ctx.source.side);
    const friends = all.filter(c => c.side === ctx.source.side);
    switch (sel) {
      case 'self': return ctx.source.alive || this.ending ? [ctx.source] : [];
      case 'target': return ctx.target && ctx.target.alive ? [ctx.target] : foes.slice(0, 1);
      case 'allEnemies': return foes;
      case 'randomEnemy': return foes.length ? [this.rng.pick(foes)] : [];
      case 'allAllies': return friends;
      case 'all': return all;
    }
  }

  attack(src: Combatant, t: Combatant, base: number, o: { kind?: 'attack' | 'raw'; strengthMul?: number } = {}) {
    if (!t.alive || this.over) return;
    const kind = o.kind ?? 'attack';
    const dmg = kind === 'attack' ? this.calcAttack(src, t, base, o.strengthMul ?? 1) : Math.max(0, Math.floor(base));
    const blocked = Math.min(t.block, dmg);
    t.block -= blocked;
    const lost = this.hpLoss(t, dmg - blocked);
    this.emit({ t: 'damage', target: t.uid, source: src.uid, amount: lost, blocked, hp: t.hp, kind });
    if (kind === 'attack') {
      this.fire('attacked', t, { other: src, amount: lost, blocked });
      this.fire('attackDealt', src, { other: t, amount: lost, blocked });
    }
    if (lost > 0) this.fire('damaged', t, { other: src, amount: lost });
    this.checkDeath(t);
  }
  loseHp(t: Combatant, n: number, src?: Combatant) {
    if (!t.alive || n <= 0 || this.over) return;
    const lost = this.hpLoss(t, n);
    this.emit({ t: 'loseHp', target: t.uid, amount: lost, hp: t.hp });
    if (lost > 0) this.fire('damaged', t, { other: src && src !== t ? src : undefined, amount: lost });
    this.checkDeath(t);
  }
  heal(t: Combatant, n: number) {
    if (!t.alive || n <= 0) return;
    const real = Math.min(this.applyMods(t, 'healReceived', n), t.maxHp - t.hp);
    t.hp += real;
    if (real > 0) this.emit({ t: 'heal', target: t.uid, amount: real });
  }
  gainBlock(t: Combatant, n: number, withMods: boolean) {
    if (!t.alive) return;
    const b = withMods ? this.calcBlock(t, n) : Math.max(0, Math.floor(n));
    if (b <= 0) return;
    t.block += b;
    this.emit({ t: 'block', target: t.uid, amount: b });
    this.fire('blockGained', t, { amount: b });
  }
  addStatus(t: Combatant, id: string, n: number, src?: Combatant) {
    if (!t.alive || !n) return;
    const d = this.content.statuses.get(id);
    if (!d) return;
    if (this.isDebuff(id, n)) {
      // a status with negateDebuff (Artifact-like) cancels it
      const guard = Object.keys(t.statuses).find(s => s !== id && this.content.statuses.get(s)?.flags?.includes('negateDebuff'));
      if (guard) { this.emit({ t: 'negated', target: t.uid, status: id, by: guard }); this.addStatus(t, guard, -1); return; }
    }
    const cur = t.statuses[id] || 0;
    let next = cur + n;
    if (!d.allowNegative && next < 0) next = 0;
    if (next === 0) delete t.statuses[id]; else t.statuses[id] = next;
    if (next === cur) return;
    this.emit({ t: 'status', target: t.uid, status: id, delta: next - cur });
    if (next - cur > 0 || (d.allowNegative && next - cur < 0)) {
      this.fire('statusGained', t, { other: src, amount: next - cur });
      if (src && src !== t && this.isDebuff(id, next - cur)) this.fire('debuffApplied', src, { other: t, amount: Math.abs(next - cur) });
    }
  }
  removeStatus(t: Combatant, id: string) { const n = t.statuses[id]; if (n) { delete t.statuses[id]; this.emit({ t: 'status', target: t.uid, status: id, delta: -n }); } }
  gainEnergy(n: number) { this.energy = Math.max(0, this.energy + n); this.emit({ t: 'energy', amount: n }); }

  draw(n: number) {
    if (this.flags(this.player).has('noDraw')) return;
    const got: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= this.content.rules.maxHand) break;
      if (!this.drawPile.length) {
        if (!this.discard.length) break;
        this.drawPile = this.rng.shuffle(this.discard.splice(0));
        this.emit({ t: 'shuffle' });
        this.fire('shuffle', this.player);
      }
      const c = this.drawPile.pop()!;
      this.hand.push(c); got.push(c.uid);
      const v = this.view(c);
      this.fire('cardDrawn', this.player, { card: c, cardDef: v });
    }
    if (got.length) this.emit({ t: 'draw', cards: got });
  }
  addCards(id: string, pile: string, count: number, o: { up?: boolean; free?: boolean } = {}) {
    if (!this.content.cards.has(id)) return;
    for (let i = 0; i < count; i++) {
      const c: CardInst = { uid: ++this.uidSeq, id, up: !!o.up, temp: true };
      if (o.free) c.costTurn = 0;
      if (pile === 'hand' && this.hand.length < this.content.rules.maxHand) this.hand.push(c);
      else if (pile === 'draw') this.drawPile.splice(this.rng.int(0, this.drawPile.length), 0, c);
      else if (pile === 'drawTop') this.drawPile.push(c);
      else this.discard.push(c);
    }
  }
  pileOf(name: string): CardInst[] {
    return name === 'hand' ? this.hand : name === 'draw' || name === 'drawTop' ? this.drawPile : name === 'discard' ? this.discard : name === 'exhaust' ? this.exhaustPile : [];
  }
  moveCards(cards: CardInst[], from: string, to: string) {
    const src = this.pileOf(from);
    for (const c of cards) {
      const i = src.indexOf(c); if (i < 0) continue;
      src.splice(i, 1);
      if (to === 'exhaust') this.exhaustCard(c);
      else if (to === 'hand' && this.hand.length >= this.content.rules.maxHand) this.discard.push(c);
      else if (to === 'draw') this.drawPile.splice(this.rng.int(0, this.drawPile.length), 0, c);
      else this.pileOf(to).push(c);
      if (to === 'discard' && from === 'hand') this.fire('cardDiscarded', this.player, { card: c, cardDef: this.view(c) });
    }
  }
  changeCost(c: CardInst, mode: string, value: number, duration: 'turn' | 'combat') {
    const base = this.view(c).cost; if (typeof base !== 'number') return;
    const now = this.costOf(c) as number;
    const next = mode === 'set' ? value : mode === 'random' ? this.rng.int(0, Math.max(0, value)) : now + value;
    if (duration === 'turn') c.costTurn = Math.max(0, next);
    else { c.costSet = Math.max(0, next); c.costMod = 0; c.costTurn = undefined; }
  }
  replay(card: CardInst, target?: Combatant) {
    const v = this.view(card);
    const t = target && target.alive ? target : v.target === 'enemy' ? this.enemies.find(e => e.alive) : undefined;
    this.runSync(this.runEffects(v.effects, { source: this.player, target: t, vars: { X: 0 }, card, cardDef: v }, v));
  }

  /** pick cards from a pile: asks the player when allowed, otherwise picks automatically */
  *pickCards(ctx: EffectCtx, o: { pile: string; select: string; count: number; filter: string; prompt: string }): Generator<ChoiceReq, CardInst[], CardInst[]> {
    let cands = o.pile === 'all' ? [...this.hand, ...this.drawPile, ...this.discard] : [...this.pileOf(o.pile)];
    if (ctx.card) cands = cands.filter(c => c !== ctx.card);
    if (o.filter === 'upgradable') cands = cands.filter(c => !c.up && !!this.content.cards.get(c.id)?.upgrade);
    else if (o.filter === 'costed') cands = cands.filter(c => typeof this.costOf(c) === 'number');
    else if (o.filter) cands = cands.filter(c => this.view(c).type === o.filter);
    const n = Math.max(0, o.count);
    if (o.select === 'all' || n >= cands.length && o.select !== 'choose') return cands;
    if (o.select === 'top') return cands.slice(-n).reverse();
    if (o.select === 'random' || !ctx.canAsk) return this.rng.shuffle(cands).slice(0, n);
    if (!cands.length) return [];
    const picked = yield { prompt: o.prompt, cards: cands, min: Math.min(n, cands.length), max: Math.min(n, cands.length) };
    return picked;
  }

  /** run a list of effects; pauses (yields) only for player choices */
  *runEffects(list: Effect[], ctx: EffectCtx, card?: CardDef): Gen {
    if (++this.depth > MAX_DEPTH) { this.depth--; return; }
    try {
      for (const e of list) {
        if (this.over && !this.ending) return;
        const op = EFFECTS[e.op];
        if (!op) continue;
        let sel: TargetSel | null = e.to ?? (typeof op.defaultTo === 'function' ? op.defaultTo(e, this) : op.defaultTo);
        if (!e.to && sel === 'target' && card?.target === 'all_enemies') sel = 'allEnemies';
        const local: EffectCtx = { ...ctx, vars: this.exprVars(ctx) };
        const r = op.run(this, local, e, sel ? this.resolveTargets(sel, local) : []);
        if (r && typeof (r as Gen).next === 'function') yield* (r as Gen);
      }
    } finally { this.depth--; }
  }

  /* ===== internals ===== */

  /** run a generator to the end, answering any choice automatically */
  private runSync(g: Gen) {
    let r = g.next();
    while (!r.done) r = g.next(this.rng.shuffle([...r.value.cards]).slice(0, r.value.max));
  }
  /** drive a generator until it finishes or asks the player */
  private drive(g: Gen, answer?: CardInst[]) {
    const r = answer ? g.next(answer) : g.next();
    if (!r.done) {
      this.pending = { req: r.value, gen: g };
      this.emit({ t: 'choice', prompt: r.value.prompt });
    }
    this.checkpoint();
  }

  private *playGen(inst: CardInst, targetUid?: number): Gen {
    const v = this.view(inst);
    const cost = this.costOf(inst);
    const x = cost === 'X' ? this.energy : 0;
    this.energy -= cost === 'X' ? this.energy : (cost as number);
    this.hand.splice(this.hand.indexOf(inst), 1);
    this.emit({ t: 'card', card: inst });
    let target: Combatant | undefined;
    if (v.target === 'enemy') target = this.enemies.find(e => e.uid === targetUid && e.alive) ?? this.enemies.find(e => e.alive);
    this.tally.cardsThisTurn++; this.tally.cardsThisCombat++;
    if (v.type === 'attack') this.tally.attacksThisTurn++;
    if (v.type === 'skill') this.tally.skillsThisTurn++;
    if (v.type === 'power') this.tally.powersThisTurn++;
    yield* this.runEffects(v.effects, { source: this.player, target, vars: { X: x }, card: inst, cardDef: v, canAsk: true }, v);
    inst.costTurn = undefined;
    if (v.type !== 'power') {
      if (v.keywords?.includes('exhaust')) this.exhaustCard(inst); else this.discard.push(inst);
    }
    if (!this.over) this.fire('cardPlayed', this.player, { card: inst, cardDef: v, other: target });
  }

  private exhaustCard(c: CardInst) {
    this.exhaustPile.push(c);
    this.emit({ t: 'exhaust', cards: [c.uid] });
    this.fire('cardExhausted', this.player, { card: c, cardDef: this.view(c) });
  }

  private startPlayerTurn() {
    this.turn++;
    this.phase = 'player';
    this.tally.cardsThisTurn = this.tally.attacksThisTurn = this.tally.skillsThisTurn = this.tally.powersThisTurn = 0;
    // block from battle-start effects survives into the first turn
    if (this.turn > 1 && !this.flags(this.player).has('retainBlock')) this.player.block = 0;
    this.player.hpLostThisTurn = 0;
    for (const e of this.enemies) e.hpLostThisTurn = 0;
    this.energy = Math.max(0, this.applyMods(this.player, 'energyPerTurn', this.maxEnergy));
    this.emit({ t: 'turn', side: 'player', turn: this.turn });
    this.fire('turnStart', this.player);
    this.decay(this.player, 'turnStart');
    if (this.over) return;
    this.draw(Math.max(0, this.applyMods(this.player, 'drawPerTurn', this.drawPerTurn)));
    this.checkpoint();
  }

  flags(c: Combatant): Set<string> {
    const s = new Set<string>();
    for (const id of Object.keys(c.statuses)) this.content.statuses.get(id)?.flags?.forEach(f => s.add(f));
    return s;
  }

  /** apply every modifier for `stat` on c (statuses, and relics for the player): adds, then muls, then caps */
  private applyMods(c: Combatant, stat: StatName, base: number, other?: Combatant): number {
    let add = 0, mul = 1, cap = Infinity;
    const common = this.exprVars({ source: c, target: other, vars: {} });
    const apply = (m: { stat: StatName; op: string; value: unknown; when?: string }, vars: Record<string, number>) => {
      if (m.stat !== stat) return;
      if (m.when && !evalCond(m.when, vars)) return;
      const v = evalNum(m.value as never, vars);
      if (m.op === 'add') add += v; else if (m.op === 'mul') mul *= v; else if (m.op === 'cap') cap = Math.min(cap, v);
    };
    for (const [id, stacks] of Object.entries(c.statuses)) this.content.statuses.get(id)?.modifiers?.forEach(m => apply(m, { ...common, stacks }));
    if (c.side === 'player') for (const r of this.relics) this.content.relics.get(r)?.modifiers?.forEach(m => apply(m, common));
    return Math.min(cap, Math.floor((base + add) * mul));
  }
  private calcAttack(src: Combatant, t: Combatant | undefined, base: number, strengthMul = 1): number {
    // strength-like additive modifiers can be scaled per card (Heavy Blade)
    let add = 0, mul = 1, cap = Infinity;
    const vars = this.exprVars({ source: src, target: t, vars: {} });
    for (const [id, stacks] of Object.entries(src.statuses)) {
      for (const m of this.content.statuses.get(id)?.modifiers ?? []) {
        if (m.stat !== 'attackDealt' || (m.when && !evalCond(m.when, { ...vars, stacks }))) continue;
        const v = evalNum(m.value, { ...vars, stacks });
        if (m.op === 'add') add += v * (id === 'strength' ? strengthMul : 1); else if (m.op === 'mul') mul *= v; else cap = Math.min(cap, v);
      }
    }
    if (src.side === 'player') for (const r of this.relics) for (const m of this.content.relics.get(r)?.modifiers ?? []) {
      if (m.stat !== 'attackDealt' || (m.when && !evalCond(m.when, vars))) continue;
      const v = evalNum(m.value, vars);
      if (m.op === 'add') add += v; else if (m.op === 'mul') mul *= v; else cap = Math.min(cap, v);
    }
    let v = Math.min(cap, (base + add) * mul);
    if (t) v = this.applyMods(t, 'attackTaken', v, src);
    return Math.max(0, Math.floor(v));
  }
  private calcBlock(t: Combatant, base: number): number { return Math.max(0, this.applyMods(t, 'blockGained', base)); }
  /** HP loss after block: caps (Intangible), prevention (Buffer); returns what was actually lost */
  private hpLoss(t: Combatant, n: number): number {
    if (n <= 0) return 0;
    let lost = Math.max(0, this.applyMods(t, 'hpLoss', n));
    if (lost > 0) {
      const guard = Object.keys(t.statuses).find(s => this.content.statuses.get(s)?.flags?.includes('preventHpLoss'));
      if (guard) { this.emit({ t: 'negated', target: t.uid, status: 'hpLoss', by: guard }); this.addStatus(t, guard, -1); lost = 0; }
    }
    t.hp = Math.max(0, t.hp - lost);
    t.hpLostThisTurn = (t.hpLostThisTurn ?? 0) + lost;
    return lost;
  }

  /** run triggers of every status / relic that listens to `ev` happening to `subject` */
  private fire(ev: EventName, subject: Combatant, x: FireExtra = {}) {
    if (this.over && ev !== 'battleEnd' && ev !== 'death') return;
    if (this.depth > MAX_DEPTH) return;
    const relation = (owner: Combatant) => owner === subject ? 'self' : owner.side === subject.side ? 'ally' : 'opponent';
    const owners = [subject, ...[this.player, ...this.enemies].filter(c => c !== subject && c.alive)];
    for (const owner of owners) {
      if (!owner.alive && !(ev === 'death' && owner === subject)) continue;
      const rel = relation(owner);
      const ok = (tr: Trigger) => tr.on === ev && (tr.by ?? 'self') === rel || (tr.on === ev && tr.by === 'any');
      const run = (key: string, tr: Trigger, vars: Record<string, number>, statusId?: string) => {
        if (!ok(tr)) return;
        const type = x.cardDef?.type;
        if (tr.if?.cardType && tr.if.cardType !== type) return;
        if (tr.if?.cardTypeNot && tr.if.cardTypeNot === type) return;
        if (tr.if?.turn && tr.if.turn !== this.turn) return;
        const target = rel === 'self' ? x.other ?? (owner.side === 'player' ? undefined : this.player) : subject;
        const ctx: EffectCtx = { source: owner, target, vars: { ...vars, amount: x.amount ?? 0, blocked: x.blocked ?? 0 }, card: x.card, cardDef: x.cardDef, statusId };
        if (tr.when && !evalCond(tr.when, this.exprVars(ctx))) return;
        if (tr.if?.every) {
          const n = (this.counters.get(key) || 0) + 1;
          this.counters.set(key, n % tr.if.every);
          if (n % tr.if.every !== 0) return;
        }
        this.runSync(this.runEffects(tr.effects, ctx, x.cardDef));
      };
      for (const [id, stacks] of Object.entries({ ...owner.statuses })) {
        if (!(id in owner.statuses) && ev !== 'death') continue;
        this.content.statuses.get(id)?.triggers?.forEach((tr, i) => run(`${owner.uid}:${id}:${i}`, tr, { stacks }, id));
      }
      if (owner.side === 'player') {
        for (const r of this.relics) {
          this.content.relics.get(r)?.triggers?.forEach((tr, i) => {
            const before = this.events.length;
            run(`relic:${r}:${i}`, tr, {});
            if (this.events.length > before) this.emit({ t: 'relic', relic: r });
          });
        }
      }
    }
  }

  private decay(c: Combatant, when: 'turnStart' | 'turnEnd') {
    if (!c.alive) return;
    for (const id of Object.keys(c.statuses)) {
      const d = this.content.statuses.get(id);
      if (d?.decay === when) this.addStatus(c, id, c.statuses[id] > 0 ? -1 : 1);
      else if (d?.decay === (when === 'turnStart' ? 'clearTurnStart' : 'clearTurnEnd')) this.removeStatus(c, id);
    }
  }

  private chooseIntent(e: Combatant) {
    const d = this.content.enemies.get(e.def)!;
    const h = e.history!;
    const ai = d.ai;
    if (ai.type === 'sequence') {
      const n = ai.order.length, lf = Math.min(ai.loopFrom ?? 0, n - 1);
      const i = h.length < n ? h.length : lf + ((h.length - lf) % (n - lf));
      e.intent = ai.order[i];
      return;
    }
    if (!h.length && ai.first) { e.intent = ai.first; return; }
    const last = h[h.length - 1];
    let run = 0; for (let i = h.length - 1; i >= 0 && h[i] === last; i--) run++;
    const vars = this.exprVars({ source: e, target: this.player, vars: {} });
    const options = ai.table.filter(t => !(t.move === last && t.maxRepeat !== undefined && run >= t.maxRepeat) && evalCond(t.when, vars));
    e.intent = (this.ai.weighted(options.length ? options : ai.table, t => t.weight) ?? ai.table[0]).move;
  }

  private checkDeath(t: Combatant) {
    if (t.hp > 0 || !t.alive) return;
    t.alive = false; t.block = 0;
    this.emit({ t: 'death', target: t.uid });
    if (t.side === 'player') { this.phase = 'lost'; this.over = true; this.emit({ t: 'end', result: 'lost' }); return; }
    this.fire('death', t);
    if (this.enemies.every(e => !e.alive) && !this.over) {
      this.over = true;
      this.phase = 'won';
      this.pending = null;
      this.ending = true;
      this.fire('battleEnd', this.player);
      this.ending = false;
      this.emit({ t: 'end', result: 'won' });
    }
  }

  private checkpoint() {
    if (!this.events.length && this.frames.length) return;
    this.frames.push({ events: this.events, view: this.snapshot() });
    this.events = [];
  }
  private flush(): Frame[] {
    if (this.events.length) this.checkpoint();
    const f = this.frames; this.frames = []; return f;
  }
}
