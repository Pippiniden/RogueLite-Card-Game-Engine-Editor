# データリファレンス

> このファイルは `npm run docs`（tools/gen-reference.ts）が**コードの登録表から自動生成**しています。手で編集しないでください。

エディターのフォームに出る項目はすべてここにある名前の JSON として保存されます。

## 効果（effects）

カードの `effects`、敵の行動、状態・レリックの `triggers[].effects` に並べる部品です。

```json
{ "op": "damage", "amount": 6, "times": 2, "to": "target" }
```

- 数値の項目（num）には数値のほか**式**も書けます（例 `"X"`、`"self.block"`、`"stacks * 2"`）。
- `to` を省くと各効果の既定の受け手になります。

### 攻撃

#### `damage` — ダメージを与える

既定の受け手: `target`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | ダメージ量 |
| `times` | num | `1` | 回数 |
| `kind` | enum | `"attack"` | 種類 `attack`=攻撃（筋力・弱体・脆弱が効く） / `raw`=そのまま（補正なし・ブロックは効く） |
| `strengthMul` | num | `1` | 筋力の倍率（3 にすると筋力が3倍で効く） |
| `to` | target |  | 対象 |

#### `loseHp` — HPを失う（ブロック無視）

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | 量 |
| `to` | target |  | 対象 |

### 防御・回復

#### `block` — ブロックを得る

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | ブロック量 |
| `raw` | bool | `false` | 敏捷・衰弱の影響を受けない |
| `to` | target |  | 対象 |

#### `multiplyBlock` — ブロックを倍にする

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `factor` | num | `2` | 倍率 |
| `to` | target |  | 対象 |

#### `heal` — HPを回復

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | 回復量 |
| `to` | target |  | 対象 |

### 状態

#### `applyStatus` — 状態を付与・増減

既定の受け手: （内容による）

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `status` * | status |  | 状態（$self = この状態自身（状態のトリガーの中で使う）） |
| `stacks` * | num |  | 量（マイナスで減らす） |
| `to` | target |  | 対象 |

#### `removeStatus` — 状態を消す

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `status` * | status |  | 状態 |
| `to` | target |  | 対象 |

#### `removeDebuffs` — 弱体をすべて消す

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `to` | target |  | 対象 |

#### `multiplyStatus` — 状態を倍にする

既定の受け手: `self`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `status` * | status |  | 状態 |
| `factor` | num | `2` | 倍率 |
| `to` | target |  | 対象 |

### カード操作

#### `draw` — カードを引く

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `count` * | num |  | 枚数 |

#### `addCard` — カードを加える

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `card` * | cardOrSelf |  | カード（$self = このカードのコピー） |
| `pile` | enum | `"discard"` | 加える先 `hand`=手札 / `draw`=山札（ランダムな位置） / `drawTop`=山札の一番上 / `discard`=捨て札 |
| `count` | num | `1` | 枚数 |
| `upgraded` | bool | `false` | 強化済み |
| `free` | bool | `false` | このターンはコスト0 |

#### `moveCards` — カードを移す（廃棄・捨てる・戻す）

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `from` | enum | `"hand"` | 元 `hand`=手札 / `draw`=山札 / `discard`=捨て札 / `exhaust`=廃棄 |
| `dest` | enum | `"exhaust"` | 先 `hand`=手札 / `draw`=山札 / `discard`=捨て札 / `exhaust`=廃棄 / `drawTop`=山札の一番上 |
| `select` | enum | `"choose"` | 選び方 `choose`=プレイヤーが選ぶ / `random`=ランダム / `top`=上から / `all`=すべて |
| `count` | num | `1` | 枚数 |
| `filter` | enum | `""` | 種類 `""`=どれでも / `attack`=アタック / `skill`=スキル / `power`=パワー / `status`=状態異常 / `curse`=呪い |
| `prompt` | string |  | 選ぶときの案内文（空なら自動） |

#### `upgradeCards` — カードを強化（この戦闘中）

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `pile` | enum | `"hand"` | 場所 `hand`=手札 / `draw`=山札 / `discard`=捨て札 / `all`=すべての山 |
| `select` | enum | `"choose"` | 選び方 `choose`=プレイヤーが選ぶ / `random`=ランダム / `top`=上から / `all`=すべて |
| `count` | num | `1` | 枚数 |

#### `modifyCost` — コストを変える

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `which` | enum | `"this"` | どのカード `this`=このカード / `hand`=手札から選ぶ / `handAll`=手札すべて |
| `mode` | enum | `"add"` | 変え方 `add`=増減 / `set`=この値にする / `random`=0〜値のランダム |
| `value` * | num |  | 値 |
| `duration` | enum | `"combat"` | 期間 `turn`=このターン / `combat`=この戦闘中 |
| `select` | enum | `"choose"` | 選び方（手札から選ぶ時） `choose`=プレイヤーが選ぶ / `random`=ランダム / `top`=上から / `all`=すべて |
| `count` | num | `1` | 枚数（手札から選ぶ時） |

#### `cardVar` — このカードの数値を変える

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `name` * | string |  | 変数名（式から card.名前 で読める） |
| `add` * | num |  | 増減 |

#### `replayCard` — このカードをもう一度使う

既定の受け手: なし

### エネルギー

#### `gainEnergy` — エネルギーを得る

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | 量 |

### 冒険全体

#### `gainGold` — ゴールドを得る

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | 量 |

#### `gainMaxHp` — 最大HPを増やす

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | 量 |

### 組み合わせ

#### `repeat` — 繰り返す

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `times` * | num |  | 回数 |
| `effects` | effects |  | 繰り返す効果 |

#### `if` — 条件で分ける

既定の受け手: なし

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `cond` * | cond |  | 条件（例: target.vulnerable > 0） |
| `then` | effects |  | 成り立つとき |
| `else` | effects |  | 成り立たないとき |

### プラグイン

#### `lifesteal` — 吸収攻撃（削った分だけ回復）

既定の受け手: `target`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | ダメージ量 |
| `ratio` | num | `1` | 回復の割合（0.5 なら削った量の半分） |
| `to` | target |  | 対象 |

#### `execute` — とどめ（HPが少ない相手を倒す）

既定の受け手: `target`

| 項目 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `amount` * | num |  | ダメージ量 |
| `threshold` | num | `25` | HP割合のしきい値(%) |
| `to` | target |  | 対象 |

`*` は必須。型の意味: num=数値か式 / int=整数 / bool=真偽 / string=文字 / cond=条件式 / enum=選択肢 / status=状態ID / card=カードID / cardOrSelf=カードIDか `$self` / target=受け手 / effects=効果の入れ子

### 受け手（to）

| 値 | 意味 |
| --- | --- |
| `target` | 対象（選んだ敵／敵から見たプレイヤー／イベントの相手） |
| `self` | 自分 |
| `allEnemies` | 相手全員 |
| `randomEnemy` | ランダムな相手 |
| `allAllies` | 味方全員 |
| `all` | 全員 |

## トリガー（triggers）

状態・レリック・カード（手札にある間 `handTriggers`）に付けます。

```json
{ "on": "attacked", "by": "self", "when": "amount > 0", "if": { "cardType": "attack" }, "effects": [ { "op": "damage", "amount": "stacks", "kind": "raw", "to": "target" } ] }
```

- `when`: 条件式（成り立つ時だけ）。`if`: `cardType` / `cardTypeNot` / `every`（N回に1回）/ `turn`（Nターン目）
- 状態のトリガーでは `stacks` が自分の量、`"status": "$self"` が自分の状態IDを指します。

### いつ（on）

| 値 | 意味 |
| --- | --- |
| `battleStart` | 戦闘開始時 |
| `battleEnd` | 戦闘勝利時 |
| `turnStart` | ターン開始時 |
| `turnEnd` | ターン終了時 |
| `cardPlayed` | カードを使った時 |
| `cardDrawn` | カードを引いた時 |
| `cardExhausted` | カードが廃棄された時 |
| `cardDiscarded` | 手札からカードを捨てた時 |
| `shuffle` | 山札をシャッフルした時 |
| `attacked` | 攻撃された時（ブロックされても） |
| `attackDealt` | 攻撃した時 |
| `damaged` | HPを失った時 |
| `blockGained` | ブロックを得た時 |
| `debuffApplied` | 相手に弱体を与えた時 |
| `statusGained` | 状態が増えた時 |
| `death` | 倒れた時 |

### 誰に起きた時（by）

| 値 | 意味 |
| --- | --- |
| `self` | 自分に起きた時 |
| `opponent` | 相手に起きた時 |
| `ally` | 味方に起きた時 |
| `any` | 誰に起きても |

## 数値補正（modifiers）

```json
{ "stat": "attackDealt", "op": "mul", "value": 0.75, "when": "" }
```

### 補正する数値（stat）

| 値 | 意味 |
| --- | --- |
| `attackDealt` | 与える攻撃ダメージ |
| `attackTaken` | 受ける攻撃ダメージ |
| `blockGained` | 得るブロック |
| `hpLoss` | 失うHP（ブロック後） |
| `drawPerTurn` | ターン開始時に引く枚数 |
| `energyPerTurn` | ターン開始時のエネルギー |
| `healReceived` | 回復量 |

### 演算（op）

| 値 | 意味 |
| --- | --- |
| `add` | 足す |
| `mul` | 掛ける |
| `cap` | 上限にする |

### 状態の旗（flags）

| 値 | 意味 |
| --- | --- |
| `retainBlock` | ブロックがターン開始時に消えない |
| `noDraw` | カードを引けない |
| `negateDebuff` | 次の弱体を無効にして1減る（結界） |
| `preventHpLoss` | 次のHP減少を防いで1減る（緩衝） |
| `cannotPlay:attack` | アタックを使えない |
| `cannotPlay:skill` | スキルを使えない |
| `cannotPlay:power` | パワーを使えない |
| `hidden` | 状態アイコンに出さない |

### 重なり方（stacking）

| 値 | 意味 |
| --- | --- |
| `intensity` | 強さ（数値がそのまま効く） |
| `duration` | ターン数（毎ターン減る想定） |
| `counter` | 回数・印（1なら数字を出さない） |

### 減り方（decay）

| 値 | 意味 |
| --- | --- |
| `none` | 減らない |
| `turnStart` | 持ち主のターン開始時に1減る |
| `turnEnd` | 持ち主のターン終了時に1減る |
| `clearTurnStart` | ターン開始時に消える |
| `clearTurnEnd` | ターン終了時に消える |

## 式で使える変数

```
式で使える変数:
X（Xコストで払ったエネルギー） / stacks（状態の量） / amount（イベントの量: 受けたダメージなど） / turn / energy
hand.count・hand.attack… / draw.count / discard.count / exhaust.count / enemies（生きている敵の数）
cardsThisTurn / attacksThisTurn / skillsThisTurn / cardsThisCombat
self.hp / self.maxHp / self.hpPct / self.block / self.<状態ID>（例: self.strength）/ self.hpLostThisTurn
target.…（同じ形。target.intentAttack は相手が攻撃予定なら1）/ player.…
card.<変数名>（カードの変数）/ card.upgraded / card.cost
演算: + - * / %、比較 < <= > >= == !=、&& || !、a ? b : c、min max floor ceil round abs
```

### カードのキーワード（keywords）

| 値 | 意味 |
| --- | --- |
| `exhaust` | 廃棄 |
| `ethereal` | エセリアル |
| `retain` | 保留 |
| `innate` | 天賦 |

### カードの対象（target）

| 値 | 意味 |
| --- | --- |
| `enemy` | 敵1体を選ぶ |
| `all_enemies` | 敵全体 |
| `self` | 自分 |
| `none` | 対象なし |

### 敵の予告（intent）

| 値 | 意味 |
| --- | --- |
| `attack` | 攻撃 |
| `defend` | 防御 |
| `buff` | 強化 |
| `debuff` | 弱体化 |
| `attack_defend` | 攻撃と防御 |
| `attack_debuff` | 攻撃と弱体化 |
| `attack_buff` | 攻撃と強化 |
| `defend_buff` | 防御と強化 |
| `sleep` | 眠り |
| `escape` | 逃走 |
| `unknown` | 不明 |

## 基本パックの状態

| ID | 名前 | 種類 | 説明 |
| --- | --- | --- | --- |
| `strength` | 筋力 | 強化 | 攻撃のダメージが{stacks}増える（マイナスなら減る） |
| `dexterity` | 敏捷 | 強化 | カードで得るブロックが{stacks}増える（マイナスなら減る） |
| `artifact` | 結界 | 強化 | 次に受ける弱体を{stacks}回まで無効にする |
| `barricade` | 防壁 | 強化 | ターン開始時にブロックが消えない |
| `blur` | 持続防御 | 強化 | あと{stacks}ターン、ターン開始時にブロックが消えない |
| `buffer` | 緩衝 | 強化 | 次にHPを失うのを{stacks}回まで防ぐ |
| `intangible` | 霊体化 | 強化 | 失うHPが1回につき1になる（あと{stacks}ターン） |
| `thorns` | 棘 | 強化 | 攻撃されるたび、攻撃してきた相手に{stacks}ダメージを与える |
| `metallicize` | 鉄の意志 | 強化 | ターン終了時にブロックを{stacks}得る |
| `plated_armor` | 装甲板 | 強化 | ターン終了時にブロックを{stacks}得る。攻撃でHPを失うと1減る |
| `regeneration` | 再生 | 強化 | ターン終了時にHPを{stacks}回復し、再生が1減る |
| `ritual` | 儀式 | 強化 | ターン終了時に筋力を{stacks}得る |
| `vigor` | 気迫 | 強化 | 次に使うアタックのダメージが{stacks}増える |
| `double_damage` | 倍撃 | 強化 | 攻撃のダメージが2倍になる（あと{stacks}ターン） |
| `double_tap` | 連撃の構え | 強化 | 次の{stacks}枚のアタックは2回使われる |
| `burst` | 連続詠唱 | 強化 | 次の{stacks}枚のスキルは2回使われる |
| `rage` | 激昂 | 強化 | このターン、アタックを使うたびにブロックを{stacks}得る |
| `demon_form` | 魔人化 | 強化 | ターン開始時に筋力を{stacks}得る |
| `noxious_fumes` | 毒霧 | 強化 | ターン開始時に相手全員に毒を{stacks}与える |
| `berserk` | 狂戦士 | 強化 | ターン開始時のエネルギーが{stacks}増える |
| `energized` | 充填 | 強化 | 次のターン開始時にエネルギーを{stacks}得る |
| `draw_next` | 準備 | 強化 | 次のターン開始時にカードを{stacks}枚多く引く |
| `next_block` | 次の守り | 強化 | 次のターン開始時にブロックを{stacks}得る |
| `after_image` | 残像 | 強化 | カードを使うたびにブロックを{stacks}得る |
| `thousand_cuts` | 千刃 | 強化 | カードを使うたびに相手全員に{stacks}ダメージを与える |
| `juggernaut` | 重戦車 | 強化 | ブロックを得るたびにランダムな相手に{stacks}ダメージを与える |
| `envenom` | 毒塗り | 強化 | 攻撃でHPを削るたび、その相手に毒を{stacks}与える |
| `feel_no_pain` | 無痛 | 強化 | カードが廃棄されるたびにブロックを{stacks}得る |
| `exhaust_draw` | 廃棄の糧 | 強化 | カードが廃棄されるたびにカードを{stacks}枚引く |
| `evolve` | 進化 | 強化 | 状態異常カードを引くたびにカードを{stacks}枚引く |
| `fire_breathing` | 火の息 | 強化 | 状態異常か呪いのカードを引くたびに相手全員に{stacks}ダメージ |
| `combust` | 燃焼 | 強化 | ターン終了時にHPを1失い、相手全員に{stacks}ダメージを与える |
| `brutality` | 残虐 | 強化 | ターン開始時にHPを{stacks}失い、カードを{stacks}枚引く |
| `panache` | 見栄 | 強化 | 1ターンにカードを5枚使うたびに相手全員に{stacks}ダメージ |
| `sadistic` | 嗜虐 | 強化 | 相手に弱体を与えるたび、その相手に{stacks}ダメージ |
| `malleable` | 可塑 | 強化 | 攻撃でHPを失うたびにブロックを{stacks}得て、可塑が1増える |
| `curl_up` | 丸まり | 強化 | 初めて攻撃でHPを失ったとき、ブロックを{stacks}得る |
| `angry` | 憤怒 | 強化 | 攻撃でHPを失うたびに筋力を{stacks}得る |
| `sharp_hide` | 鋭い皮 | 強化 | 相手がアタックを使うたび、その相手に{stacks}ダメージ |
| `curiosity` | 好奇心 | 強化 | 相手がパワーを使うたびに筋力を{stacks}得る |
| `beat_of_death` | 死の鼓動 | 強化 | 相手がカードを使うたび、その相手に{stacks}ダメージ |
| `spore_cloud` | 胞子雲 | 強化 | 倒れたとき、相手に脆弱を{stacks}与える |
| `flight` | 飛行 | 強化 | 受ける攻撃のダメージが半分になる。攻撃でHPを失うと1減る |
| `invincible` | 不壊 | 強化 | 1ターンに失うHPは合計{stacks}まで |
| `fading` | 消滅 | 強化 | {stacks}ターン後に消える |
| `slow` | 鈍化 | 弱体 | 相手がこのターンに使ったカード1枚につき、受ける攻撃のダメージが10%増える |
| `vulnerable` | 脆弱 | 弱体 | 受ける攻撃のダメージが50%増える（あと{stacks}ターン） |
| `weak` | 弱体 | 弱体 | 与える攻撃のダメージが25%減る（あと{stacks}ターン） |
| `frail` | 衰弱 | 弱体 | 得るブロックが25%減る（あと{stacks}ターン） |
| `poison` | 毒 | 弱体 | ターン開始時にHPを{stacks}失い、毒が1減る |
| `constricted` | 締め付け | 弱体 | ターン終了時にHPを{stacks}失う |
| `entangled` | 拘束 | 弱体 | アタックを使えない（あと{stacks}ターン） |
| `no_draw` | ドロー不可 | 弱体 | このターンはカードを引けない |
| `draw_down` | 手札減少 | 弱体 | ターン開始時に引くカードが1枚減る（あと{stacks}ターン） |
| `hex` | 呪縛 | 弱体 | アタック以外を使うたびに幻惑を{stacks}枚山札に加える |
| `strength_down` | 筋力低下 | 弱体 | ターン終了時に筋力を{stacks}失う |
| `dexterity_down` | 敏捷低下 | 弱体 | ターン終了時に敏捷を{stacks}失う |
| `shackled` | 枷 | 弱体 | ターン終了時に失っていた筋力{stacks}を取り戻す |
| `no_block` | 防御不能 | 弱体 | カードでブロックを得られない（あと{stacks}ターン） |
| `confused` | 混乱 | 弱体 | 引いたカードのコストが0〜3のランダムになる |

## 画面・部品・アクション

画面ID: `TITLE` `CHARSELECT` `MAP` `BATTLE` `REWARD` `REST` `RESULT`

### 部品（bind）

| bind | 中身 |
| --- | --- |
| `title.bg` | 背景（theme.backgrounds の画面ごとの絵） |
| `title.name` | ゲームのタイトル |
| `title.sub` | サブタイトル |
| `title.portrait` | 最初の主人公の顔 |
| `title.intro` | 主人公の紹介 |
| `title.start` | 「はじめから」ボタンの文字 |
| `sound.toggle` | 音のオン・オフ |
| `charselect.title` | 主人公選択の見出し |
| `charselect.art` | 選んでいる主人公の絵 |
| `charselect.name` | 名前と肩書 |
| `charselect.info` | 紹介と初期ステータス |
| `charselect.list` | 主人公の一覧（タップで選ぶ） |
| `player.face` | 主人公の顔（表情が変わる） |
| `player.name` | 主人公の名前 |
| `player.hp` | HPゲージ |
| `player.hpBlock` | HPとブロックのゲージ（戦闘） |
| `player.statuses` | 主人公の状態アイコン |
| `run.floor` | 階層 |
| `run.gold` | 所持金 |
| `run.relics` | レリックの一覧 |
| `deck.button` | デッキの枚数ボタン |
| `deck.title` | デッキ一覧の見出し |
| `deck.cards` | デッキのカード一覧 |
| `map` | マップ（スクロール） |
| `enemies` | 敵の配置領域 |
| `hand` | 手札 |
| `battle.energy` | エネルギー |
| `battle.endTurn` | ターン終了ボタン |
| `battle.banner` | ターン表示などの帯 |
| `pile.draw` | 山札ボタン |
| `pile.discard` | 捨て札ボタン |
| `pile.exhaust` | 廃棄ボタン |
| `pile.title` | 山札・捨て札一覧の見出し |
| `pile.cards` | 山札・捨て札のカード一覧 |
| `choice.prompt` | カード選択の案内文 |
| `choice.cards` | 選べるカード |
| `choice.confirm` | カード選択の決定ボタン |
| `info.body` | 長押しで出る詳細 |
| `reward.title` | 報酬の見出し |
| `reward.items` | ゴールド・レリック |
| `reward.cardTitle` | カード選択の見出し |
| `reward.cards` | カードの候補 |
| `reward.next` | 次へボタンの文字 |
| `rest.art` | 焚き火の絵 |
| `rest.title` | 焚き火の見出し |
| `rest.heal` | 休むボタン |
| `rest.upgrade` | 鍛えるボタン |
| `upgrade.title` | 強化するカード一覧の見出し |
| `upgrade.cards` | 強化できるカード |
| `result.portrait` | 結果画面の顔 |
| `result.title` | 勝敗 |
| `result.stats` | 記録 |

### アクション（on="tap: …"）

| アクション | 働き |
| --- | --- |
| `newRun` | 新しい冒険（主人公が2人以上なら選択画面へ） |
| `startRun` | 選んだ主人公で冒険を始める |
| `continueRun` | 保存した冒険の続き |
| `abandonRun` | 保存を消す |
| `toTitle` | タイトルへ |
| `open` | 重ね表示を開く（open → ID） |
| `close` | 重ね表示を閉じる（close → ID） |
| `showPile` | 山を表示（showPile(draw\|discard\|exhaust)） |
| `endTurn` | ターン終了 |
| `confirmChoice` | カード選択を決定 |
| `leaveNode` | マップへ戻る |
| `restHeal` | 焚き火で休む |
| `toggleSound` | 音のオン・オフ |

### UIスキンの部品（skin）

| 部品名 | 場所 |
| --- | --- |
| `button` | ボタン |
| `button.primary` | 主要ボタン（はじめから・ターン終了） |
| `button.disabled` | 押せないボタン |
| `dialog` | 重ね表示の枠 |
| `panel` | 枠（frame 要素に skin="panel"） |
| `topbar` | 上部バー |
| `banner` | ターン表示の帯 |
| `reward.item` | 報酬の項目 |
| `map.node` | マップのノード |
| `map.node.boss` | ボスのノード |
| `gauge.track` | ゲージの枠 |
| `gauge.fill` | ゲージの中身 |
| `energy` | エネルギーの玉 |
| `card.frame.attack` | カード枠（アタック） |
| `card.frame.skill` | カード枠（スキル） |
| `card.frame.power` | カード枠（パワー） |
| `card.frame.status` | カード枠（状態異常） |
| `card.frame.curse` | カード枠（呪い） |
| `card.cost` | コストの宝石 |
| `card.panel` | カードの文章欄 |

### 演出の種類（vfx.json の fx）

| 値 | 意味 |
| --- | --- |
| `flash` | 白く光る |
| `shake` | 左右に揺れる |
| `lunge` | 手前に迫る |
| `glow` | 光の縁取り |
| `dissolve` | 消える |
| `screenShake` | 画面全体が揺れる |
| `vignette` | 画面の縁に色 |
| `fly` | 上へ飛ぶ（カード） |

### 効果音の場面（audio.json → se）

| 値 | 意味 |
| --- | --- |
| `click` | ボタン |
| `cardPlay` | カードを使う |
| `draw` | カードを引く |
| `shuffle` | シャッフル |
| `hit` | 敵に命中 |
| `playerHit` | 主人公が被弾 |
| `block` | ブロックを得る |
| `blocked` | ブロックで防いだ |
| `buff` | 強化 |
| `debuff` | 弱体 |
| `heal` | 回復 |
| `death` | 敵が倒れる |
| `victory` | 勝利 |
| `defeat` | 敗北 |
| `coin` | ゴールド |
| `relic` | レリック |
| `upgrade` | 強化（焚き火） |
| `turn` | ターンの切り替え |
| `enemyAttack` | 敵の攻撃 |

### 音楽の場面（audio.json → bgm）

| 値 | 意味 |
| --- | --- |
| `TITLE` | タイトル |
| `CHARSELECT` | 主人公選択 |
| `MAP` | マップ |
| `REWARD` | 報酬・宝箱 |
| `REST` | 焚き火 |
| `RESULT` | 結果 |
| `battle` | 通常戦闘 |
| `elite` | エリート戦 |
| `boss` | ボス戦 |
