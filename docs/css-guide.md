# CSS ガイド（パックの追加CSS）

> このファイルは `npm run docs` が src/engine/css-guide.ts から**自動生成**しています。ルールと部品の一覧は、エディターの「CSS」画面と、書き出した .css ファイルの冒頭にも同じものが入ります。

## しくみ

- パックの `pack.json` に `"styles": ["styles/custom.css"]` と書くと、そのCSSがゲームの組み込みのCSSの**後に**読まれます。後に読むパックのCSSほど強くなります。
- 色とフォントは theme.json（エディターの「見た目・UIスキン」）、窓枠・ボタン・カード枠を画像にするのは theme.json の `skins`（[asset-spec.md](asset-spec.md#3-uiスキン窓枠ボタンなど)）。CSS はそれ以外の見た目を変えるためのものです。
- 色の変数を CSS で上書きする時は `:root` ではなく `#stage` に書きます（theme.json の色は `<html>` に直接入るので、`:root` より強い）。
- 画面ごとに変えたい時は `[data-screen="BATTLE"] …` のように画面IDで絞ります。

## 画面の作り

```html
<div id="stage">                       <!-- 390×844 の画面。スマホに合わせて縮む -->
  <div class="q-host">
    <div class="q-screen" data-screen="BATTLE">
      <!-- 画面配置の要素: 種類が t-◯◯、IDが data-qid、部品名が data-bind -->
      <button class="q t-button sk-button" data-qid="E4" data-bind="battle.endTurn">ターン終了</button>
      <div class="q t-canvas" data-qid="F" data-bind="hand"> <div class="card ct-attack cr-common in-hand">…</div> </div>
```

位置と大きさ（left / top / width / height）は画面配置ツールの座標がそのまま入ります。CSS で変えるのは見た目だけです。

## 守るルール

エディターの「CSS」と `npm run check` が確かめます。「必ず」はエラー、「なるべく」は注意として出ます。

### 必ず: 位置と大きさは画面配置で決める

画面配置の要素（.q、.t-*、[data-qid]、[data-bind]）に position・left・top・right・bottom・inset・width・height を書かない。位置と大きさは画面配置ツールの座標がそのまま使われる。中の部品（例: [data-bind="hand"] .card）は変えてよい。

### 必ず: 画面の土台に触らない

html・body・#stage・.q-host・.q-screen には CSS変数（--で始まる名前）と background だけを書く。スマホの画面に合わせて縮める仕組みが壊れる。

### 必ず: 外のファイルを読まない

@import と、http(s):// や // で始まる url() を使わない（GitHub Pages・オフライン・プライバシーのため）。画像は素材（assets/manifest.json）と theme.json の skins で使う。data: の url() はよい。

### 必ず: 括弧を閉じる

{ } と ( ) と引用符はかならず閉じる。閉じていないと、それ以降の CSS がすべて効かなくなる。

### なるべく: 要素を消さない

画面配置の要素に display:none・visibility:hidden・opacity:0 を書かない。出す・出さないは画面配置の show（表示条件）で決まる。消すとボタンが押せなくなる。

### なるべく: 要素を動かさない

画面配置の要素に transform・translate・scale・rotate・margin を書かない（:active の押し込みは例外）。タップできる場所と見た目がずれる。

### なるべく: !important を使わない

!important は、重ね表示を隠す [hidden] や「動きを減らす」設定などの組み込みのルールを上書きしてしまう。詳しいセレクター（[data-screen="BATTLE"] …）で勝つ。

### なるべく: 押せるものを押せなくしない

ボタン・カード・マップのノード・選択肢・ポーションに pointer-events:none を書かない。

### なるべく: 小さすぎる文字にしない

font-size は 11px 以上（スマホで読める大きさ）。

### なるべく: 広すぎるセレクターを使わない

* や button・div・img などタグ名だけのセレクターは、すべての画面と組み込みの部品に効いてしまう。クラスか [data-bind] で絞る。

### なるべく: 重なり順を上げすぎない

z-index は 100 以下。重ね表示は 40、知らせの帯は 45、演出の文字は 80〜90。それより上にすると演出やダイアログが隠れる。

## 部品の一覧

### 色と文字

#### 色とフォントの変数

`#stage`

色とフォントは theme.json（エディターの「見た目・UIスキン」）で決めるのが基本。CSS で上書きする時は :root ではなく #stage に書く（:root より theme.json の方が強いため）。--c-bg 背景 / --c-ink 文字 / --c-muted 弱い文字 / --c-parchment 羊皮紙色 / --c-ember 差し色 / --c-hp HP / --c-block ブロック / --c-energy エネルギー / --f-display 見出しの書体 / --f-body 本文の書体

```css
#stage {
  --c-ember: #e8913a;
  --c-parchment: #e9dcbf;
  --f-display: "Shippori Mincho", serif;
}
```

### 画面

#### 画面の背景

`[data-screen="MAP"]`

画面ごとの背景。画面IDは TITLE CHARSELECT MAP BATTLE REWARD REST SHOP EVENT RESULT。絵の背景は theme.json の backgrounds か幕の backgrounds で指定する（ここでは色やグラデーション）。

```css
[data-screen="MAP"] {
  background: linear-gradient(#161922, #0c0d12);
}
```

#### 上部バー

`[data-qid="A"].t-frame`

顔・HP・階層・所持金の帯。画像にしたい時は theme.json の skins の topbar を使う。

```css
[data-qid="A"].t-frame {
  background: linear-gradient(rgba(10,11,15,.9), rgba(10,11,15,.55));
  border-bottom: 1px solid #2b2f3a;
}
```

### ボタン

#### ボタン全般

`.t-button`

画面配置の button すべて。押した時は :active、押せない時は :disabled。押せる広さは画面配置で決まるので、ここで変えるのは色・枠・文字だけ。

```css
.t-button {
  border-radius: 10px;
  border: 1px solid #5a4a36;
  background: linear-gradient(#3a3226, #2a241c);
  color: var(--c-parchment);
  font-size: 16px;
}
```

#### 押せないボタン

`.t-button:disabled`

お金が足りない・選べない時など。薄くするのが基本（消さない）。

```css
.t-button:disabled {
  opacity: .4;
}
```

#### ターン終了ボタン

`[data-bind="battle.endTurn"]`

戦闘で一番よく押すボタン。目立つ色にしておく。

```css
[data-bind="battle.endTurn"] {
  background: linear-gradient(#b8642a, var(--c-emberDeep));
  border-color: #e8a060;
  color: #fff4e2;
}
```

### 文字

#### 見出し（報酬・焚き火・結果）

`[data-bind="reward.title"], [data-bind="rest.title"], [data-bind="result.title"]`

大きな見出し。長い見出し（幕の突破など）は .long が付いて小さくなる。

```css
[data-bind="reward.title"], [data-bind="rest.title"], [data-bind="result.title"] {
  font-family: var(--f-display);
  font-size: 30px;
  letter-spacing: .2em;
  color: var(--c-parchment);
}
```

#### 知らせの帯

`[data-bind="battle.banner"]`

「敵のターン」「〇〇を手に入れた」「第二幕」などを短く出す帯。

```css
[data-bind="battle.banner"] {
  font-size: 24px;
  background: linear-gradient(90deg, transparent, rgba(10,11,15,.88) 20%, rgba(10,11,15,.88) 80%, transparent);
}
```

### ゲージ

#### HPゲージの溝と中身

`.gauge-bar, .gauge-bar i`

.gauge-bar が溝、中の i が減っていく中身。ブロックがある時は .has-block が付く。

```css
.gauge-bar, .gauge-bar i {
  /* .gauge-bar */ border-radius: 6px;
  /* .gauge-bar i */ background: linear-gradient(#e0574c, var(--c-hp) 60%, #8e2a24);
}
```

#### エネルギーの玉

`.energy`

中の b が残り、small が最大値。使い切ると .empty が付く。

```css
.energy {
  background: radial-gradient(circle at 40% 35%, #ffe7a6, var(--c-energy) 45%, #8a5a14 100%);
  color: #2a1a06;
}
```

### カード

#### カードの外枠

`.card`

カードの一番外側。種類で .ct-attack .ct-skill .ct-power .ct-status .ct-curse、レアリティで .cr-common .cr-uncommon .cr-rare、強化済みで .up が付く。大きさは置き場所（手札・一覧）が決めるので、幅や高さは書かない。

```css
.card {
  border-radius: 9px;
  box-shadow: 0 0 0 1px #000, 0 6px 14px rgba(0,0,0,.5);
}
```

#### カードの名前の帯

`.card-name`

名前の帯。文字の大きさはカードの幅に対する割合（cqw）で書くと、どの大きさのカードでも同じ見た目になる。

```css
.card-name {
  font-family: var(--f-display);
  font-size: 13cqw;
  background: linear-gradient(#f3ead6, #ddcca8);
}
```

#### カードの絵

`.card-art`

16:9 の絵の枠。中の img は object-fit: cover で切り抜かれる。

```css
.card-art {
  background: #2a2622;
}
```

#### カードの説明文

`.card-text`

効果の文。数字は b.p-num、筋力などで増えた数字は b.p-up、減った数字は b.p-down、キーワードは b.p-kw。

```css
.card-text {
  font-size: 9.6cqw;
  line-height: 1.25;
}
```

#### コストの玉

`.card-cost`

左上のコスト。今だけ変わっている時は .changed が付く。画像にしたい時は skins の card.cost。

```css
.card-cost {
  background: radial-gradient(circle at 40% 35%, #ffe7a6, var(--c-energy) 50%, #8a5a14);
  color: #2a1a06;
}
```

#### 手札のカード

`[data-bind="hand"] .card`

手札。扇形の位置は --x --y --r で毎回計算されるので transform は書かない。選んだカードは .selected、使えないカードは .cant。

```css
[data-bind="hand"] .card {
  /* .selected */ filter: drop-shadow(0 0 10px rgba(232,145,58,.8));
}
```

### 戦闘

#### 敵

`.enemy`

敵1体。中に .enemy-intent（頭上の予告）、.enemy-body（絵）、.enemy-hp（HPゲージ）、.enemy-st（状態）。倒れると .dead。位置は陣形（ルール）で決まる。

```css
.enemy {
  /* .enemy-intent b */ color: #ffe6d0;
  /* .enemy-body img */ filter: drop-shadow(0 6px 10px rgba(0,0,0,.5));
}
```

#### 状態アイコン

`.st`

筋力・脆弱などのアイコン。数字は中の b。弱体は .st-debuff。

```css
.st {
  /* .st b */ background: #0b0c11;
}
```

### マップ

#### マップのノード

`.map-node`

丸いノード。種類で .n-battle .n-elite .n-rest .n-treasure .n-shop .n-event .n-boss、進める所は .reach、通った所は .visited、今いる所は .current。

```css
.map-node {
  border: 2px solid #4a4434;
  background: #1b1d25;
  /* .reach */ border-color: var(--c-parchment);
}
```

#### マップの道

`.map-lines line`

ノードをつなぐ線（SVG）。通った道は .walked。

```css
.map-lines line {
  stroke: #5b5444;
  stroke-dasharray: 3 6;
}
```

### 報酬・ショップ・イベント

#### 報酬などの1行

`.reward-item`

報酬のゴールド・レリック・ポーション、ショップのレリックの行。画像にしたい時は skins の reward.item。

```css
.reward-item {
  border-radius: 10px;
  border: 1px solid #4a4030;
  background: #201d18;
}
```

#### ショップの値札

`.price`

値段。お金が足りない時は .short。セールのカードは .shop-item.sale の中。

```css
.price {
  font-weight: 800;
  color: var(--c-parchment);
  /* .short */ color: #e07a6a;
}
```

#### 店主のひとこと

`[data-bind="shop.say"]`

吹き出し。::before が左向きのしっぽ。

```css
[data-bind="shop.say"] {
  background: #1d2028;
  border: 1px solid #333846;
}
```

#### イベントの選択肢

`.event-option`

選択肢のボタン。b がボタンの文字、small が効果の説明、small.why が選べない理由。

```css
.event-option {
  border: 1px solid #4a4030;
  background: #201d18;
  /* small.why */ color: #e07a6a;
}
```

#### イベントの文章

`[data-bind="event.text"]`

物語の文。1行ずつ p になる。

```css
[data-bind="event.text"] {
  font-size: 15px;
  line-height: 1.75;
}
```

### ポーション

#### ポーションの枠

`.potion-slot`

上部の枠1つ。空きは .empty、敵を選んで投げる途中は .aiming。

```css
.potion-slot {
  border: 1px solid #4a4030;
  background: #17181d;
  /* .empty */ border-style: dashed;
}
```

### 重ね表示

#### ダイアログ

`.t-dialog`

重ね表示の枠（デッキ一覧・詳細・購入確認・ポーション）。画像にしたい時は skins の dialog。

```css
.t-dialog {
  border-radius: 14px;
  background: linear-gradient(#1f222c, #171920);
}
```

#### ダイアログの後ろの暗幕

`.q-scrim`

ダイアログの後ろを暗くする幕。

```css
.q-scrim {
  background: rgba(5,6,9,.62);
}
```

### 演出

#### ダメージなどの数字

`.fx-float`

飛び出す数字。種類で .fx-dmg（ダメージ）.fx-blk（ブロック）.fx-heal（回復）.fx-poison（毒）.fx-buff .fx-debuff。

```css
.fx-float {
  font-family: var(--f-display);
  font-size: 28px;
  /* .fx-heal */ color: var(--c-good);
}
```

## LLM に頼む時

1. エディターの「CSS」→「LLM への依頼文をコピー」で、どう変えたいかを書いてコピーする（ルール・部品の説明・今のCSSが入る）
2. Claude などに貼り、返ってきたCSSをファイルに保存する
3. 「読み込む…」で戻す。ルールに反する所は一覧に出るので、その行を直すか、もう一度頼む

書き出した .css ファイルの冒頭にもルールが入っているので、ファイルをそのまま渡しても同じように守ってもらえます。