# プラグイン — 自分で新しい効果を足す

組み込みの効果（[reference.md](reference.md)）の組み合わせで足りないときは、**JavaScript を1ファイル**書いて新しい効果を足せます。
ビルドし直す必要はありません。足した効果は、組み込みの効果と同じように**エディターの「効果を追加」メニューに出て、入力欄も自動で作られます**。

## 1. 置き場所と読み込み

```
public/packs/<パック>/plugins/my-effects.js
```

`pack.json` の `plugins` に書くと、ゲーム・エディター・`npm run check`・`npm run sim` のどれでも読み込まれます。

```json
{ "id": "my_mod", "plugins": ["plugins/my-effects.js"], ... }
```

エディターでは「拡張 → プラグイン」で新規作成・編集できます（ひな形あり）。保存しなくてもプレイテストに反映されます。
読み込みに失敗したプラグインは、エディターの「検証」とプレイテストの上部に理由が出ます。ゲームは止まりません。

**決まりごと**

- ES モジュールで、`export default function (api) { … }` を1つ書く。
- **1ファイルで完結させる**（他のファイルを `import` しない。エディターでは一時的な URL から読むため相対パスが使えない）。
- DOM に触ってよいのは `registerFx` / `registerWidget` / `registerAction` の中だけ（効果はブラウザ以外のチェッカーやシミュレーターでも動くため）。
- 乱数は `cb.rng` を使う（`Math.random` を使うとシード固定の再現ができなくなる）。

## 2. 効果を足す: `api.registerEffect(op, 定義)`

```js
export default function (api) {
  api.registerEffect('lifesteal', {
    label: '吸収攻撃（削った分だけ回復）',   // メニューに出る名前
    params: {                                  // 入力欄（JSON の項目）
      amount: { type: 'num', required: true, label: 'ダメージ量' },
      ratio:  { type: 'num', default: 1, label: '回復の割合', help: '0.5 なら半分' },
      to:     { type: 'target', label: '対象' },
    },
    defaultTo: 'target',                       // to を省いた時の受け手（null なら受け手を使わない）
    text: '{amount}ダメージを与え、削ったHPの分だけ回復する',  // カードの説明文
    run(cb, ctx, e, who) {
      const amount = Math.floor(api.evalNum(e.amount, ctx.vars));
      let total = 0;
      for (const t of who) { const before = t.hp; cb.attack(ctx.source, t, amount); total += before - t.hp; }
      cb.heal(ctx.source, Math.floor(total * api.evalNum(e.ratio, ctx.vars, 1)));
    },
  });
}
```

カードでは組み込みと同じように使えます。

```json
{ "id": "soul_reaver", "effects": [{ "op": "lifesteal", "amount": 8, "ratio": 0.5 }] }
```

### params の型

| type | 入力欄 | 値 |
| --- | --- | --- |
| `num` | 数値か式 | `6`、`"X"`、`"self.block * 2"` → `api.evalNum(e.x, ctx.vars)` で数にする |
| `int` | 整数 | そのまま数 |
| `bool` | チェック | true / false |
| `string` | 文字 | |
| `cond` | 条件式 | `api.evalCond(e.x, ctx.vars)` で真偽にする |
| `enum` | 選択肢 | `options: [['値', 'ラベル'], …]` |
| `status` / `card` | 状態・カードのID（一覧から選ぶ） | チェッカーが存在を確かめる |
| `cardOrSelf` | カードIDか `$self`（このカード） | |
| `target` | 受け手 | `to` に使う。`who` に解決済みの相手が入る |
| `effects` | 効果の入れ子 | `yield* cb.runEffects(e.x, ctx)` で実行 |

`required: true` の項目が空なら、チェッカーとエディターがエラーを出します。`help` は入力欄の下に出る説明です。

### run の引数

| 引数 | 中身 |
| --- | --- |
| `cb` | 戦闘（Combat）。下の「使える操作」を呼ぶ |
| `ctx` | `source`（使った人）、`target`（選んだ相手・イベントの相手）、`vars`（式の変数）、`card` / `cardDef`（使ったカード）、`statusId`（状態のトリガーなら自分のID） |
| `e` | この効果の JSON そのまま（`e.amount` など） |
| `who` | `to` を解決した相手の配列（`defaultTo: null` なら空） |

### 使える操作（`cb.…`）

ダメージやブロックは必ずこれらを通してください。筋力・脆弱・ブロック・トリガー・演出がすべて正しく働きます。

| 呼び方 | 働き |
| --- | --- |
| `attack(src, t, 量, { kind: 'attack' \| 'raw', strengthMul })` | 攻撃（補正・ブロック・被弾トリガー込み） |
| `loseHp(t, 量, src?)` | ブロックを無視して HP を減らす |
| `heal(t, 量)` | 回復 |
| `gainBlock(t, 量, 補正するか)` | ブロック |
| `addStatus(t, 状態ID, 量, src?)` | 状態を与える（人工物などの打ち消しも働く）。負の数で減らす |
| `removeStatus(t, 状態ID)` | 状態を消す |
| `gainEnergy(量)` / `draw(枚数)` | エネルギー・ドロー |
| `addCards(カードID, 'hand' \| 'draw' \| 'drawTop' \| 'discard', 枚数, { up, free })` | カードを作る |
| `moveCards(カード配列, 元, 先)` | 束の間を移す（`exhaust` へ移すと廃棄トリガーが働く） |
| `changeCost(カード, 'add' \| 'set', 値, 'turn' \| 'combat')` | コストを変える |
| `pileOf('hand' \| 'draw' \| 'discard' \| 'exhaust')` | 束の配列 |
| `player` / `enemies` / `rng` | 主人公・敵の配列・乱数（`rng.int(最小, 最大)`、`rng.shuffle(a)`） |
| `exprVars(ctx)` | 式の変数を今の状態で作り直す |

`t.hp` `t.maxHp` `t.block` `t.statuses`（ID → 量）が相手の状態です。

### プレイヤーに選ばせる

`run` をジェネレーター（`*run`）にして `cb.pickCards` を `yield*` すると、ゲームはカード選択の窓を出して答えを待ちます。

```js
api.registerEffect('discardThenDraw', {
  label: '選んで捨て、同じ枚数引く',
  params: { count: { type: 'int', default: 2, label: '枚数' } },
  defaultTo: null,
  text: '手札を{count}枚捨て、{count}枚引く',
  *run(cb, ctx, e) {
    const picked = yield* cb.pickCards(ctx, { pile: 'hand', select: 'choose', count: e.count ?? 2, filter: '', prompt: '捨てるカードを選ぶ' });
    cb.moveCards(picked, 'hand', 'discard');
    cb.draw(picked.length);
  },
});
```

- `select`: `choose`（選ばせる）/ `random` / `top` / `all`
- `filter`: `''`（すべて）/ カードの種類（`attack` など）/ `upgradable`（強化できる）/ `costed`（コストがある）
- 選ぶ枚数は `count` ちょうど（候補が少なければ候補の数）。
- 敵のターンやシミュレーターなど、選べない場面では自動でランダムに選ばれます。

### 説明文

`text` に `{項目名}` を書くと値が入ります。`text.ja.json → effects` に同じ op のキーがあればそちらが優先されるので、文言は後から翻訳・差し替えできます。

## 3. 画面側の拡張（ブラウザだけ）

チェッカーやシミュレーターでは呼ばれないので、`if (api.registerFx)` で確かめてから使います。

```js
// 演出: vfx.json で { "fx": "spin", "ms": 400 } と書けるようになる
api.registerFx?.('spin', (el, step) => el.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: step.ms ?? 400 }));

// 部品: 画面配置で bind="my.turnCounter" と書いた要素の中身
api.registerWidget?.('my.turnCounter', { update(n, app) { n.el.textContent = `${app.view?.turn ?? 0} ターン目`; } });

// アクション: 画面配置で on="tap: shout(やあ)"
api.registerAction?.('shout', (app, args) => { app.banner(args[0] ?? ''); return false; }); // false で画面遷移しない
```

## 4. ほかに使えるもの

| `api.…` | 中身 |
| --- | --- |
| `version` | プラグイン API の版（いまは `1`）。互換が崩れる変更をしたら上がる |
| `content` | 読み込んだ全データ（`content.cards.get('strike')` など） |
| `effects` | 登録済みの全効果。既存の効果の `run` を呼んで組み合わせることもできる |
| `evalNum(式, 変数, 既定)` / `evalCond(式, 変数)` | 式の計算 |
| `log(…)` | `[plugin パス]` 付きでコンソールに出す |

## 5. 確かめ方

1. `npm run check` — プラグインの読み込み失敗・必須項目の抜けが出る
2. `npm test` — 組み込みの仕組みの自動テスト（自分のテストも `tools/test-mechanics.ts` に足せる）
3. エディターで効果を付けたカードを選び「戦闘テスト」
4. `npm run sim` — ボットに遊ばせて、強すぎ・弱すぎを勝率で見る

見本: `public/packs/base/plugins/example-effects.js`（吸収攻撃・とどめ）。
