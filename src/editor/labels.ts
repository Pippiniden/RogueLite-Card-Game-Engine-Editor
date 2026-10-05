/* Japanese labels for every enum the editor shows. */

export type Opt = [string, string];

export const CARD_TYPES: Opt[] = [['attack', 'アタック'], ['skill', 'スキル'], ['power', 'パワー'], ['status', '状態異常'], ['curse', '呪い']];
export const RARITIES: Opt[] = [['starter', '初期'], ['common', 'コモン'], ['uncommon', 'アンコモン'], ['rare', 'レア'], ['special', '特殊（報酬に出ない）']];
export const CARD_TARGETS: Opt[] = [['enemy', '敵1体を選ぶ'], ['all_enemies', '敵全体'], ['self', '自分'], ['none', '対象なし']];
export const KEYWORDS: Opt[] = [['exhaust', '廃棄'], ['ethereal', 'エセリアル'], ['retain', '保留'], ['innate', '天賦']];
export const RELIC_RARITIES: Opt[] = [['starter', '初期'], ['common', 'コモン'], ['uncommon', 'アンコモン'], ['rare', 'レア'], ['boss', 'ボス'], ['shop', 'ショップ'], ['special', '特殊（出ない）']];
export const STATUS_KINDS: Opt[] = [['buff', '強化（バフ）'], ['debuff', '弱体（デバフ）']];
export const STACKING: Opt[] = [['intensity', '強さ（数値がそのまま効く）'], ['duration', 'ターン数（毎ターン減る想定）'], ['counter', '回数・印（1なら数字を出さない）']];
export const DECAY: Opt[] = [['none', '減らない'], ['turnStart', '持ち主のターン開始時に1減る'], ['turnEnd', '持ち主のターン終了時に1減る'], ['clearTurnStart', 'ターン開始時に消える'], ['clearTurnEnd', 'ターン終了時に消える']];
export const FLAGS: Opt[] = [
  ['retainBlock', 'ブロックがターン開始時に消えない'],
  ['noDraw', 'カードを引けない'],
  ['negateDebuff', '次の弱体を無効にして1減る（結界）'],
  ['preventHpLoss', '次のHP減少を防いで1減る（緩衝）'],
  ['cannotPlay:attack', 'アタックを使えない'],
  ['cannotPlay:skill', 'スキルを使えない'],
  ['cannotPlay:power', 'パワーを使えない'],
  ['hidden', '状態アイコンに出さない'],
];
export const STATS: Opt[] = [
  ['attackDealt', '与える攻撃ダメージ'], ['attackTaken', '受ける攻撃ダメージ'], ['blockGained', '得るブロック'],
  ['hpLoss', '失うHP（ブロック後）'], ['drawPerTurn', 'ターン開始時に引く枚数'], ['energyPerTurn', 'ターン開始時のエネルギー'], ['healReceived', '回復量'],
];
export const MOD_OPS: Opt[] = [['add', '足す'], ['mul', '掛ける'], ['cap', '上限にする']];
export const EVENTS: Opt[] = [
  ['battleStart', '戦闘開始時'], ['battleEnd', '戦闘勝利時'], ['turnStart', 'ターン開始時'], ['turnEnd', 'ターン終了時'],
  ['cardPlayed', 'カードを使った時'], ['cardDrawn', 'カードを引いた時'], ['cardExhausted', 'カードが廃棄された時'], ['cardDiscarded', '手札からカードを捨てた時'], ['shuffle', '山札をシャッフルした時'],
  ['attacked', '攻撃された時（ブロックされても）'], ['attackDealt', '攻撃した時'], ['damaged', 'HPを失った時'], ['blockGained', 'ブロックを得た時'],
  ['debuffApplied', '相手に弱体を与えた時'], ['statusGained', '状態が増えた時'], ['death', '倒れた時'],
];
export const BY: Opt[] = [['self', '自分に起きた時'], ['opponent', '相手に起きた時'], ['ally', '味方に起きた時'], ['any', '誰に起きても']];
export const INTENTS: Opt[] = [
  ['attack', '攻撃'], ['defend', '防御'], ['buff', '強化'], ['debuff', '弱体化'], ['attack_defend', '攻撃と防御'], ['attack_debuff', '攻撃と弱体化'],
  ['attack_buff', '攻撃と強化'], ['defend_buff', '防御と強化'], ['sleep', '眠り'], ['escape', '逃走'], ['unknown', '不明'],
];
export const ENEMY_SIZES: Opt[] = [['small', '小'], ['medium', '中'], ['large', '大'], ['boss', 'ボス']];
export const POOLS: Opt[] = [['normal', '通常'], ['elite', 'エリート'], ['boss', 'ボス']];
export const SCREENS: Opt[] = [['TITLE', 'タイトル'], ['CHARSELECT', '主人公選択'], ['MAP', 'マップ'], ['BATTLE', '戦闘'], ['REWARD', '報酬・宝箱'], ['REST', '焚き火'], ['RESULT', '結果']];
export const FX_KINDS: Opt[] = [['flash', '白く光る'], ['shake', '左右に揺れる'], ['lunge', '手前に迫る'], ['glow', '光の縁取り'], ['dissolve', '消える'], ['screenShake', '画面全体が揺れる'], ['vignette', '画面の縁に色'], ['fly', '上へ飛ぶ（カード）']];
export const PORTRAIT_FACES = ['normal', 'hurt', 'pinch', 'happy'];
export const FACE_LABELS: Record<string, string> = { normal: '通常', hurt: '被弾', pinch: 'ピンチ（HP30%以下）', happy: '勝利・回復' };

export const SE_MOMENTS: Opt[] = [
  ['click', 'ボタン'], ['cardPlay', 'カードを使う'], ['draw', 'カードを引く'], ['shuffle', 'シャッフル'], ['hit', '敵に命中'], ['playerHit', '主人公が被弾'],
  ['block', 'ブロックを得る'], ['blocked', 'ブロックで防いだ'], ['buff', '強化'], ['debuff', '弱体'], ['heal', '回復'], ['death', '敵が倒れる'],
  ['victory', '勝利'], ['defeat', '敗北'], ['coin', 'ゴールド'], ['relic', 'レリック'], ['upgrade', '強化（焚き火）'], ['turn', 'ターンの切り替え'], ['enemyAttack', '敵の攻撃'],
];
export const BGM_SLOTS: Opt[] = [...SCREENS.filter(([k]) => k !== 'BATTLE'), ['battle', '通常戦闘'], ['elite', 'エリート戦'], ['boss', 'ボス戦']];

export const VAR_HELP = `式で使える変数:
X（Xコストで払ったエネルギー） / stacks（状態の量） / amount（イベントの量: 受けたダメージなど） / turn / energy
hand.count・hand.attack… / draw.count / discard.count / exhaust.count / enemies（生きている敵の数）
cardsThisTurn / attacksThisTurn / skillsThisTurn / cardsThisCombat
self.hp / self.maxHp / self.hpPct / self.block / self.<状態ID>（例: self.strength）/ self.hpLostThisTurn
target.…（同じ形。target.intentAttack は相手が攻撃予定なら1）/ player.…
card.<変数名>（カードの変数）/ card.upgraded / card.cost
演算: + - * / %、比較 < <= > >= == !=、&& || !、a ? b : c、min max floor ceil round abs`;
