# RogueLite Card Game Engine & Editor

Slay the Spire 型のデッキ構築ローグライトを、**データとアセットの差し替えだけで作り変えられる**ゲームエンジンと、そのための**エディター**です。

- ゲーム: スマホ縦持ち・フロントビュー。GitHub Pages でそのまま遊べる
- エディター: PC のブラウザで、カード・敵・状態・レリック・主人公・文言・画像・音・UI・画面配置をすべて編集。編集中の内容をそのままプレイテスト
- Python 不要。必要なのは Node.js 22 以上だけ

| | URL（GitHub Pages） |
| --- | --- |
| ゲーム | `https://pippiniden.github.io/RogueLite-Card-Game-Engine-Editor/` |
| エディター | `https://pippiniden.github.io/RogueLite-Card-Game-Engine-Editor/editor.html` |

## 動かす

```bash
npm install
npm run dev      # ゲーム http://localhost:5173/  エディター http://localhost:5173/editor.html
npm test         # 戦闘の仕組みの自動テスト
npm run check    # データの参照切れ・式の誤り・画像の欠け・画面配置の問題を調べる
npm run sim      # ボットに300ラン遊ばせて勝率などを出す（runs=1000 char=rio で指定）
npm run docs     # docs/reference.md（データリファレンス）を作り直す
npm run build    # dist/ に公開用ファイルを作る
```

同じ Wi-Fi のスマホから `npm run dev` の Network の URL を開けば実機で遊べます。

## GitHub Pages で公開する

1. リポジトリの **Settings → Pages → Source** を「**GitHub Actions**」にする
2. `main` に push するたびに `.github/workflows/deploy.yml` が `check` → `build` → 公開まで行う

相対パスでビルドしているので、どのリポジトリ名・サブパスでも動きます。

## エディター

`editor.html` を開くと、サイトに置かれた packs を読み込んで編集できます。

| 操作 | |
| --- | --- |
| **開く…** | フォルダ（このリポジトリか `public/packs`）・zip・サイトの packs から読み込む |
| **保存** | フォルダを開いていればそこへ直接書き込む（Chrome / Edge）。それ以外は zip で書き出す |
| **zipで書き出し** | `packs.zip` を作る。展開して `public/packs/` に上書きすれば反映 |
| **▶ プレイテスト** | 右に本物のゲームを開く。**保存前の編集もそのまま反映**。タイトルから／主人公を選んで冒険／遭遇を選んで戦闘／イベント／ショップ／第N幕から |
| 元に戻す・やり直す | Ctrl+Z / Ctrl+Shift+Z。保存は Ctrl+S |

| 画面 | 編集できるもの |
| --- | --- |
| カード | コスト・種類・レアリティ・キーワード・**効果の組み合わせ**・強化後・変数・使用条件・手札にある間の効果。説明文は効果から自動生成（手書きも可）。プレビューと「戦闘テスト」 |
| 状態 | バフ・デバフ。重なり方・減り方・数値補正・トリガー・旗（ブロック維持・ドロー不可など）・アイコン |
| レリック | 補正・トリガー・入手時の効果（イベントと同じ効果）・ショップの値引き・出現する主人公 |
| ポーション | 戦闘での効果・戦闘の外での効果・対象（敵1体なら投げる）・レアリティ・アイコン。「このポーションで戦闘テスト」 |
| イベント | 「？」マスの出来事。絵・ページ・選択肢（表示条件／選べる条件）・起きること・変数・出る階と主人公。スマホと同じ見た目のプレビューと「このイベントを試す」 |
| 敵 / 遭遇 | 行動・AI（順番／重み付き・条件付き）・大きさ・演出と音・最初の状態 / 敵の組み合わせ・出現階層・背景・音楽 |
| 主人公 | HP・エネルギー・初期デッキ・レリック・表情ごとの顔・選択画面の絵・報酬の候補（cardPools） |
| ルール | 手札上限・マップ（マスの出やすさ・出る階・「？」の中身）・報酬・**ショップ（品数・値段・セール・カード削除）**・焚き火・**幕（名前・マップ・幕の間の回復・幕ごとの背景と音楽）**・**ポーション（枠・出る確率・値段）**・敵の陣形と大きさ |
| 演出 / 見た目・UIスキン / サウンド / 素材 | 演出プリセット / 色・フォント・背景・**UIの画像スキン** / 効果音と音楽 / 画像と音の差し替え（規格チェック付き） |
| CSS | パックの追加CSS。**読み込み・書き出し**、部品ごとの説明、ルールの確認、説明つきのひな形、**LLM への依頼文のコピー** |
| 文言 / 画面配置 | UI の固定メッセージ・キーワード説明・効果の説明文テンプレート / QLAYOUT の配置とスキンの割り当て |
| プラグイン / パック / 検証 | 効果を JavaScript で追加 / 上書き用パックの作成 / `npm run check` と同じ検査 |

## ゲームを変える

内容はすべて `public/packs/` にあります。ビルドし直す必要はありません。

```
public/packs/
  index.json          読み込むパックの順番。後のパックが同じIDを上書きする
  base/               基本パック
    pack.json         このパックのファイル一覧・プラグイン
    cards.json  statuses.json  relics.json  enemies.json  encounters.json  characters.json  events.json  potions.json
    rules.json  vfx.json  theme.json  audio.json  text.ja.json  layout.qlayout
    assets/manifest.json   画像・音の論理キー → ファイル
    plugins/          追加の効果（JavaScript）
    styles/custom.css 追加のCSS（説明つきのひな形。docs/css-guide.md）
  skin-demo/          UIを画像スキンにする見本（任意）
```

### カードは「数値 × 効果」の組み合わせ

```json
{ "id": "twin_slash", "name": "二連斬", "type": "attack", "cost": 1, "target": "enemy",
  "effects": [{ "op": "damage", "amount": 5, "times": 2 }],
  "upgrade": { "effects": [{ "op": "damage", "amount": 7, "times": 2 }] } }
```

- 数値には式も書けます: `"amount": "self.block"`、`"times": "X"`、`"amount": "6 + card.growth"`
- 戦闘の組み込みの効果は 21 種（ダメージ・ブロック・状態付与・カード移動・コスト変更・繰り返し・条件分岐など）。一覧は **[docs/reference.md](docs/reference.md)**
- 状態（筋力・敏捷・脆弱・弱体・衰弱・毒・棘・金属化・人工物・霊体化・不壊・儀式・バリケード・拘束 など 60 種）は `statuses.json` のデータで、数値補正とトリガーの組み合わせでできています。新しい状態もデータだけで作れます

### ショップとイベント

マップには **ショップ** と **「？」マス** が出ます（出やすさは `rules.json → map.weights`、出る最初の階は `map.minFloor`）。

- **ショップ**: この主人公のカード5枚＋共通カード2枚（1枚はセール）、レリック3つ、カード削除（使うたびに値上がり）。数と値段は `rules.json → shop`。レアリティ「ショップ」のレリックはここにだけ並び、`shop.discount`（値引き）や `shop.removalPrice`（削除料金）でショップを変えられます。
  スマホ向けに、品物は「カード」「レリック・サービス」のタブに分け、タップすると確認シート（大きな表示と購入ボタン）が出てから買う作りです。
- **「？」マス**: 入った時に `rules.json → unknown` の比でイベント・戦闘・ショップ・宝箱に分かれます。イベントは `events.json` に、ページと選択肢として書きます。

```json
{ "id": "ev_spring", "name": "澄んだ泉", "art": "event.spring",
  "pages": {
    "start": { "text": "回廊の割れ目から湧き出す泉。", "options": [
      { "label": "水を飲む", "effects": [{ "op": "heal", "amount": "floor(maxHp * 0.3)" }], "next": "drank" },
      { "label": "カードを一枚沈める", "enableIf": "deck > 5", "disabledText": "デッキが少なすぎる", "effects": [{ "op": "removeCards", "count": 1 }], "next": "sank" },
      { "label": "立ち去る" } ] },
    "drank": { "text": "疲れが抜けていく。", "options": [] },
    "sank":  { "text": "足取りが軽い。", "options": [] } } }
```

選択肢の下の小さな説明（「HPを21回復」など）は効果から自動で作られます。使える効果（ゴールド・HP・カードを選んで取り除く／強化／変化・カードを見せて選ばせる・レリック・確率で・戦闘を始める・ページへ進む など）は [docs/reference.md](docs/reference.md#冒険の効果イベントレリックを拾った時) にあります。

### ポーション

戦闘で1回使える道具です。上部の枠（最初は3つ）をタップすると説明と「使う」「捨てる」が出ます。敵1体に投げるものは、敵が2体以上いれば敵をタップして選びます。
`mapEffects` を書いたもの（癒やしの薬・果実の汁）はマップやショップでも使えます。

- 手に入る所: 戦闘の報酬（出る確率は出るたびに下がり、出ないと上がる）、ショップ（3つ）、イベント（効果 `gainPotion`）
- 数値は `rules.json → potions`（枠・確率・レアリティ比・値段）、主人公ごとの枠は `characters.json → potionSlots`
- レリックは `potionUsed`（ポーションを使った時）で反応でき、`addPotionSlots` で枠を増やせます

### 複数の幕

`rules.json → acts` に幕を並べると、ボスを倒すたびに次の幕へ進みます（最後の幕のボスでクリア）。基本パックは2幕です。

```json
"acts": [
  { "name": "第一幕 灯火の回廊" },
  { "name": "第二幕 沈んだ大書庫", "healPercent": 75, "map": { "floors": 12 }, "backgrounds": { "MAP": "bg.act2" }, "bgm": { "battle": "bgm.act2" } }
]
```

- 遭遇とイベントは `"acts": [2]` で出る幕を選びます（書かなければすべての幕）
- 幕の途中のボスを倒すと、ゴールド・レアカードに加えて、**ボスのレリック（レアリティ boss）を3つから1つ**選べます
- 次の幕に入る時、失ったHPの `healPercent`%（既定100）を回復します。画面の階層は「2-5階」のように出ます

### 見た目を CSS で変える

色とフォント（theme.json）や画像の枠（skins）で足りない所は、パックの CSS で変えます。エディターの「CSS」で編集・読み込み・書き出しができ、
**部品ごとの説明**と**守るルール**（位置と大きさは画面配置で決める、外のファイルを読まない など）が付いています。
書き出した .css ファイルの冒頭にもルールが入るので、LLM に渡しても崩れにくくなっています。→ **[docs/css-guide.md](docs/css-guide.md)**

### 自分で新しい効果を足す（プラグイン）

組み合わせで足りなければ JavaScript を1ファイル書きます。戦闘の効果もイベントの効果も足せて、エディターのメニューにそのまま出ます。→ **[docs/plugins.md](docs/plugins.md)**

### 主人公を増やす

`characters.json` に1人足すだけです。2人以上になるとタイトルの次に**主人公選択画面**が自動で出ます。

1. エディターの「主人公」→「＋ 新規」（または `characters.json` に追記）
2. 専用カードには `"pools": ["自分のプール名"]` を付け、主人公の `cardPools` に同じ名前を書く（共通カードは `colorless`）
3. 専用レリックも同じく `pools` で指定。`locked: true` にすると選択画面に出さない

### 画像・UI・音

- 画像はすべて**論理キー**で呼ばれ、`assets/manifest.json` の右側を変えるだけで差し替わります。無いキーは仮の絵になります
- **UI（窓枠・ボタン・カード枠など）は、画像が無ければ CSS、あれば画像（9スライス）**で描かれます
- 作る画像のサイズ・形式・余白の決まりは **[docs/asset-spec.md](docs/asset-spec.md)**
- スキンの見本はゲームの URL に `?packs=base,skin-demo` を付けると試せます

### 別パックで上書きする

`public/packs/my_mod/pack.json` を作り `index.json` の `packs` に足すと、同じ ID の定義を置き換えます。`"$patch": true` で一部だけ変えられます。

```json
[{ "id": "strike", "$patch": true, "effects": [{ "op": "damage", "amount": 8 }] }]
```

## 画面配置ツールとの連携

画面の位置は `public/packs/base/layout.qlayout` にあり、画面配置ツール（QLAYOUT）と同じ形式・同じパーサで読んでいます。

- **ツール → ゲーム**: ツールの「テキストをコピー」→ エディターの「画面配置」に貼る（または `layout.qlayout` に保存）。スマホで試すだけならゲームの URL に `#dev` を付けて右上の「配置」から
- **ゲーム → ツール**: エディターの「画面配置」→ テキストをツールの「読み込み」へ
- `bind`（部品）・`on="tap: アクション(引数) → 遷移先"`・`show`（表示条件）・`skin`（UIスキン）が使えます。一覧は [docs/reference.md](docs/reference.md#画面部品アクション)

## 構成

```
src/engine/   ルールだけの純粋な TypeScript（DOM なし。Node でもブラウザでも動く）
  effects.ts    効果の登録表（エディターのフォームとチェッカーもここから作られる）
  combat.ts     戦闘。行動ごとに「フレーム」（イベント＋状態）を返す。選択は一時停止して待つ
  run.ts        冒険：マップ・報酬・焚き火    describe.ts  効果から説明文を自動生成
  run-effects.ts  戦闘の外の効果・ショップ・イベント・ポーション
  css-guide.ts    パックCSSのルール・部品の説明・チェック
  expr.ts       安全な式の計算               plugins.ts   プラグインの読み込み
  validate.ts   データの検査（CLI とエディター共通）
src/game/     スマホ画面（QLAYOUT の画面に bind 名で部品を差し込む。ショップ・イベントは run-screens.ts）
src/editor/   エディター
tools/        test / check / sim / docs / 仮画像とスキン見本の生成
docs/         asset-spec.md（素材規格）・plugins.md・reference.md と css-guide.md（自動生成）
```
