/* ===== Content definitions (static data, loaded from packs) =====
   Every number a designer might want to tune lives in these shapes, never in engine code. */

/** A number, or an expression string evaluated at run time ("stacks", "X * 2", "6 + self.strength"). */
export type Num = number | string;

/** One step of behaviour. `op` names an entry in the effect registry (effects.ts or a plugin). */
export interface Effect {
  op: string;
  /** who receives it */
  to?: TargetSel;
  [param: string]: unknown;
}
/**
 * target       the chosen enemy (cards) / the player (enemy moves) / the other party of an event (triggers)
 * self         the one using the card, move, status or relic
 * allEnemies   everyone on the other side
 * randomEnemy  one random living opponent (re-rolled per hit)
 * allAllies    everyone on the user's own side (enemies buffing each other)
 * all          everyone alive
 */
export type TargetSel = 'target' | 'self' | 'allEnemies' | 'randomEnemy' | 'allAllies' | 'all';

export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'curse';
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'special';
export type CardTarget = 'enemy' | 'all_enemies' | 'self' | 'none';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  /** energy cost; "X" spends all energy; null = cannot be played */
  cost: number | 'X' | null;
  target: CardTarget;
  effects: Effect[];
  /** exhaust, ethereal, retain, innate */
  keywords?: string[];
  /** extra condition to be playable, e.g. "hand.attack == hand.count" */
  playIf?: string;
  /** effects that run while the card sits in hand (Burn-like status cards) */
  handTriggers?: Trigger[];
  /** fields replaced when the card is upgraded */
  upgrade?: Partial<Pick<CardDef, 'name' | 'cost' | 'effects' | 'keywords' | 'target' | 'text' | 'playIf' | 'art'>>;
  /** reward pools this card belongs to (a character draws rewards from its cardPools) */
  pools?: string[];
  art?: string;                 // asset key
  /** optional description; {0}, {1}… are the computed amounts of effects[0], effects[1]… */
  text?: string;
  /** card-local counters with their starting values (read as card.<name>) */
  vars?: Record<string, number>;
}

/**
 * attackDealt / attackTaken  attack damage (add first, then mul, then cap)
 * blockGained                block from cards and effects (not raw block)
 * hpLoss                     any HP loss after block (cap 1 = intangible)
 * drawPerTurn / energyPerTurn  start-of-turn draw and energy
 * healReceived               healing
 */
export type StatName = 'attackDealt' | 'attackTaken' | 'blockGained' | 'hpLoss' | 'drawPerTurn' | 'energyPerTurn' | 'healReceived';
export interface Modifier { stat: StatName; op: 'add' | 'mul' | 'cap'; value: Num; when?: string }

export type EventName =
  | 'battleStart' | 'battleEnd' | 'turnStart' | 'turnEnd'
  | 'cardPlayed' | 'cardDrawn' | 'cardExhausted' | 'cardDiscarded' | 'shuffle'
  | 'attacked' | 'attackDealt' | 'damaged' | 'blockGained' | 'debuffApplied' | 'statusGained' | 'death';
/** whose event fires the trigger, relative to the owner: self (default), opponent, ally, any */
export type EventBy = 'self' | 'opponent' | 'ally' | 'any';
export interface Trigger {
  on: EventName;
  by?: EventBy;
  /** expression that must be non-zero, e.g. "amount > 0", "stacks <= 1", "card.type == 'attack'" is written as cardType */
  when?: string;
  /** simple conditions; all must hold */
  if?: { cardType?: CardType; cardTypeNot?: CardType; every?: number; turn?: number };
  effects: Effect[];
}

/**
 * Flags with engine meaning:
 *  retainBlock     block is not removed at the start of the owner's turn
 *  noDraw          cannot draw cards
 *  negateDebuff    the next debuff is cancelled and this status loses 1
 *  preventHpLoss   the next HP loss is cancelled and this status loses 1
 *  cannotPlay:<type>  cards of that type cannot be played (attack / skill / power)
 *  hidden          not shown in the status row
 */
export type StatusFlag = string;
export type Decay = 'none' | 'turnStart' | 'turnEnd' | 'clearTurnStart' | 'clearTurnEnd';

export interface StatusDef {
  id: string;
  name: string;
  icon?: string;
  kind: 'buff' | 'debuff';
  /** intensity: stacks are a strength; duration: stacks are turns left; counter: a counter shown as is */
  stacking: 'intensity' | 'duration' | 'counter';
  /** when stacks go down by 1 (or are cleared) during the owner's turn */
  decay?: Decay;
  /** can stacks be negative (strength, dexterity) — negative counts as a debuff */
  allowNegative?: boolean;
  desc: string;                 // {stacks} is replaced
  flags?: StatusFlag[];
  modifiers?: Modifier[];
  triggers?: Trigger[];
  /** vfx preset played when gained */
  vfx?: string;
}

export interface RelicDef {
  id: string;
  name: string;
  icon?: string;
  rarity: 'starter' | 'common' | 'uncommon' | 'rare' | 'boss' | 'shop' | 'special';
  desc: string;
  /** pools the relic can appear in; empty = every character */
  pools?: string[];
  modifiers?: Modifier[];
  triggers?: Trigger[];
  /** run-level effects when picked up (the same effects as events) */
  onPickup?: Effect[];
  /** shop price changes while you own it */
  shop?: { discount?: number; removalPrice?: number };
}

export type Intent = 'attack' | 'defend' | 'buff' | 'debuff' | 'attack_defend' | 'attack_debuff' | 'attack_buff' | 'defend_buff' | 'unknown' | 'sleep' | 'escape';
export interface MoveDef { name: string; intent: Intent; effects: Effect[] }
export type AiDef =
  | { type: 'sequence'; order: string[]; loopFrom?: number }
  | { type: 'weighted'; first?: string; table: { move: string; weight: number; maxRepeat?: number; when?: string }[] };

export type EnemySize = 'small' | 'medium' | 'large' | 'boss';
export interface EnemyDef {
  id: string;
  name: string;
  hp: [number, number];
  size: EnemySize;
  art: string | { idle: string; hurt?: string; attack?: string };
  /** vertical anchor tweak: fraction of the image height to push the feet down (shadows, tails) */
  footOffset?: number;
  vfx?: Partial<Record<'hit' | 'attack' | 'death' | 'buff', string>>;
  sfx?: Partial<Record<'hit' | 'attack' | 'death', string>>;
  moves: Record<string, MoveDef>;
  ai: AiDef;
  /** statuses the enemy starts with */
  statuses?: Record<string, number>;
}

export interface EncounterDef {
  id: string;
  pool: 'normal' | 'elite' | 'boss';
  enemies: string[];
  weight?: number;
  minFloor?: number;
  maxFloor?: number;
  bg?: string;
  bgm?: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  title?: string;
  hp: number;
  gold: number;
  energy: number;
  draw: number;
  deck: string[];
  relics: string[];
  /** reward pools (cards and relics) this character draws from, e.g. ["hero", "colorless"] */
  cardPools: string[];
  /** expression name → asset key (normal / hurt / pinch / happy …) */
  portrait: Record<string, string>;
  /** large art for the character select screen (falls back to portrait.normal) */
  selectArt?: string;
  intro?: string;
  /** UI accent colour for this character */
  color?: string;
  /** hidden until unlocked (future use) */
  locked?: boolean;
}

export type NodeType = 'battle' | 'elite' | 'rest' | 'treasure' | 'shop' | 'event' | 'boss';
/** what a "?" (event) node turns into when entered */
export type UnknownOutcome = 'event' | 'battle' | 'elite' | 'shop' | 'treasure';
export interface Rules {
  maxHand: number;
  map: {
    floors: number;
    width: number;
    paths: number;
    restFloor: 'last' | number;
    treasureFloor: number;
    weights: Partial<Record<NodeType, number>>;
    eliteMinFloor: number;
    restMinFloor: number;
    /** first floor (0-based) each node type may appear on; overrides eliteMinFloor / restMinFloor */
    minFloor?: Partial<Record<NodeType, number>>;
  };
  /** "?" nodes: weights of what they turn into */
  unknown?: Partial<Record<UnknownOutcome, number>>;
  shop?: ShopRules;
  rewards: {
    cardChoices: number;
    rarity: Record<'normal' | 'elite' | 'boss', Partial<Record<Rarity, number>>>;
    gold: Record<'normal' | 'elite' | 'boss', [number, number]>;
    upgradedChance: number;
    /** relic rarity weights (treasure, elite, events); missing = every relic equally likely */
    relicRarity?: Partial<Record<RelicDef['rarity'], number>>;
  };
  rest: { healPercent: number };
  formations: Record<string, { x: number; y: number; scale?: number }[]>;
  sizes: Record<EnemySize, number>;
}

export interface ShopRules {
  /** cards from the character's own pools, and from "colorless" */
  cards: number;
  colorless: number;
  /** rarity weights of the shop's cards */
  rarity: Partial<Record<Rarity, number>>;
  /** price range per card rarity (gold) */
  cardPrice: Partial<Record<Rarity, [number, number]>>;
  /** colorless cards cost this much more (1.2 = +20%) */
  colorlessMarkup: number;
  /** how many cards are on sale, and the price factor (0.5 = half price) */
  sale: { count: number; factor: number };
  relics: number;
  relicPrice: Partial<Record<RelicDef['rarity'], [number, number]>>;
  /** card removal: first price, and how much it goes up after each use */
  removal: { price: number; step: number };
}

/* ----- events ("?" rooms) ----- */
export interface EventOption {
  label: string;
  /** shown under the label; empty = generated from the effects */
  desc?: string;
  /** hide the option unless this is true */
  when?: string;
  /** show the option greyed out unless this is true */
  enableIf?: string;
  disabledText?: string;
  /** run effects (gainGold, removeCards, gainRelic, fight, chance, goto…) */
  effects?: Effect[];
  /** page to show after the effects; none = the event ends */
  next?: string;
}
export interface EventPage {
  text: string;
  /** art for this page (falls back to the event art) */
  art?: string;
  options: EventOption[];
}
export interface EventDef {
  id: string;
  name: string;
  art?: string;
  minFloor?: number;
  maxFloor?: number;
  weight?: number;
  /** only for these characters (empty = everyone) */
  chars?: string[];
  /** extra condition, e.g. "gold >= 50" */
  when?: string;
  /** can appear again in the same run */
  repeatable?: boolean;
  /** values fixed when the event starts, usable in expressions and text as {name}: { "cost": "floor(maxHp * 0.1)" } */
  vars?: Record<string, string | number>;
  /** must contain "start" */
  pages: Record<string, EventPage>;
}

export interface VfxStep { fx: string; [k: string]: unknown }
export type VfxPresets = Record<string, VfxStep[]>;

/** a UI part drawn from an image (9-slice) instead of CSS — see docs/asset-spec.md */
export interface SkinDef {
  image: string;                       // asset key
  slice: [number, number, number, number]; // top right bottom left, in source pixels
  /** source pixels per CSS pixel (2 = drawn at @2x) */
  scale?: number;
  fill?: boolean;
  repeat?: 'stretch' | 'round' | 'repeat' | 'space';
  /** extra CSS for this part (padding, colour of text on it…) */
  css?: Record<string, string>;
}

export interface Theme {
  fonts: { display: string; body: string; googleFonts?: string };
  colors: Record<string, string>;
  cardTypeColors: Record<CardType, string>;
  rarityColors: Partial<Record<Rarity, string>>;
  /** part name → 9-slice image; parts not listed are drawn with CSS */
  skins?: Record<string, SkinDef | null>;
  /** full-screen backgrounds per screen ID (asset keys) */
  backgrounds?: Record<string, string>;
}

export interface AudioDef {
  /** moment name → sound asset key */
  se: Record<string, string>;
  /** screen ID or "battle" / "elite" / "boss" → music asset key */
  bgm: Record<string, string>;
  /** per-asset settings */
  tracks?: Record<string, { volume?: number; loopStart?: number; loopEnd?: number }>;
  volume?: { master?: number; se?: number; bgm?: number };
}

export interface TextTable {
  ui: Record<string, string>;
  keywords: Record<string, { name: string; desc: string }>;
  effects: Record<string, string>;
  intents: Record<string, string>;
  nodes: Record<string, string>;
  cardTypes: Record<string, string>;
  rarities: Record<string, string>;
}

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  /** content files; each is an array of definitions (or an object for rules/theme/text/vfx/audio) */
  files: Partial<Record<ContentKind, string | string[]>>;
  layout?: string;
  assets?: string;
  /** JavaScript modules that register new effects, fx, widgets or actions */
  plugins?: string[];
}
export type ContentKind = 'cards' | 'statuses' | 'relics' | 'enemies' | 'encounters' | 'characters' | 'events' | 'rules' | 'vfx' | 'theme' | 'text' | 'audio';

/* ===== Runtime state ===== */

export interface CardInst {
  uid: number;
  id: string;
  up: boolean;
  /** combat-only: cost set for the rest of combat / this turn / delta for the rest of combat */
  costSet?: number;
  costTurn?: number;
  costMod?: number;
  /** card-local counters (Rampage-like growth) */
  vars?: Record<string, number>;
  /** created during combat; not added to the deck */
  temp?: boolean;
}

export interface Combatant {
  uid: number;
  side: 'player' | 'enemy';
  def: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Record<string, number>;
  alive: boolean;
  intent?: string;
  history?: string[];
  /** per-turn tallies used by expressions */
  hpLostThisTurn?: number;
}

export type CombatEvent =
  | { t: 'damage'; target: number; source?: number; amount: number; blocked: number; hp: number; kind: 'attack' | 'raw' }
  | { t: 'loseHp'; target: number; amount: number; hp: number }
  | { t: 'block'; target: number; amount: number }
  | { t: 'heal'; target: number; amount: number }
  | { t: 'status'; target: number; status: string; delta: number }
  | { t: 'negated'; target: number; status: string; by: string }
  | { t: 'move'; actor: number; move: string; intent: Intent }
  | { t: 'card'; card: CardInst }
  | { t: 'draw'; cards: number[] }
  | { t: 'exhaust'; cards: number[] }
  | { t: 'death'; target: number }
  | { t: 'turn'; side: 'player' | 'enemy'; turn: number }
  | { t: 'energy'; amount: number }
  | { t: 'relic'; relic: string }
  | { t: 'shuffle' }
  | { t: 'choice'; prompt: string }
  | { t: 'end'; result: 'won' | 'lost' };

export interface ShopState {
  cards: { card: CardInst; price: number; sold?: boolean; sale?: boolean }[];
  relics: { id: string; price: number; sold?: boolean }[];
  removal: { price: number; used?: boolean };
}
export interface EventState {
  id: string;
  page: string;
  vars: Record<string, number>;
  /** where the current option leads (set by "next" or a goto effect; null = the event ends) */
  next?: string | null;
}
export type DeckChoiceOp = 'remove' | 'upgrade' | 'transform' | 'duplicate' | 'take';
export interface DeckChoice {
  op: DeckChoiceOp;
  count: number;
  prompt: string;
  /** cards offered (op "take"); otherwise the deck is shown */
  cards?: CardInst[];
  filter?: string;
  canCancel?: boolean;
  /** gold to pay when confirmed (shop removal) */
  price?: number;
  from: 'shop' | 'event' | 'relic';
  /** effects still to run after the pick */
  then?: Effect[];
}

export interface MapNode { floor: number; col: number; type: NodeType; next: number[]; x: number }
export interface MapData { floors: (MapNode | null)[][]; boss: MapNode }

export interface RunState {
  v: 1;
  seed: number;
  char: string;
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInst[];
  relics: string[];
  map: MapData;
  at: { floor: number; col: number } | null;
  path: { floor: number; col: number }[];
  rng: { map: number; battle: number; reward: number; ai: number; event?: number };
  nextUid: number;
  phase: 'map' | 'battle' | 'reward' | 'rest' | 'treasure' | 'shop' | 'event' | 'won' | 'lost';
  pending?: { gold: number; cards: CardInst[]; relic?: string; cardTaken?: boolean; goldTaken?: boolean; relicTaken?: boolean };
  encounter?: string;
  /** what the current "?" node turned into */
  resolved?: UnknownOutcome;
  /** a fight started by an event: which reward it gives */
  fight?: { reward: 'normal' | 'elite' | 'none' };
  shop?: ShopState;
  event?: EventState;
  /** a pending pick from the deck (or from offered cards) */
  choice?: DeckChoice;
  /** how many times a card was removed at a shop (raises the price) */
  removals?: number;
  seenEvents?: string[];
  stats: { floors: number; kills: number; elites: number; startedAt: string };
}
