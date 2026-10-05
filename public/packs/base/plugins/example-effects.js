/*
 * プラグインの例。pack.json の "plugins" に書くと読み込まれる。
 * default export の関数が api を受け取り、新しい効果（op）を登録する。
 * 登録した効果はエディターの「効果を追加」にそのまま出てくる（params がフォームになる）。
 * 詳しくは docs/plugins.md。
 */
export default function (api) {
  // 吸収攻撃: ダメージを与え、実際に削ったHPの分だけ回復する
  api.registerEffect('lifesteal', {
    label: '吸収攻撃（削った分だけ回復）',
    params: {
      amount: { type: 'num', required: true, label: 'ダメージ量' },
      ratio: { type: 'num', default: 1, label: '回復の割合', help: '0.5 なら削った量の半分' },
      to: { type: 'target', label: '対象' },
    },
    defaultTo: 'target',
    text: '{amount}ダメージを与え、削ったHPの分だけ回復する',
    run(cb, ctx, e, who) {
      const amount = Math.floor(api.evalNum(e.amount, ctx.vars));
      const ratio = api.evalNum(e.ratio, ctx.vars, 1);
      let total = 0;
      for (const t of who) {
        const before = t.hp;
        cb.attack(ctx.source, t, amount);
        total += before - t.hp;
      }
      cb.heal(ctx.source, Math.floor(total * ratio));
    },
  });

  // とどめ: 対象のHPが一定割合以下なら倒す。そうでなければ通常のダメージ
  api.registerEffect('execute', {
    label: 'とどめ（HPが少ない相手を倒す）',
    params: {
      amount: { type: 'num', required: true, label: 'ダメージ量' },
      threshold: { type: 'num', default: 25, label: 'HP割合のしきい値(%)' },
      to: { type: 'target', label: '対象' },
    },
    defaultTo: 'target',
    text: '{amount}ダメージを与える。HPが{threshold}%以下の相手は倒す',
    run(cb, ctx, e, who) {
      const th = api.evalNum(e.threshold, ctx.vars, 25);
      for (const t of who) {
        if (t.hp / t.maxHp * 100 <= th) cb.loseHp(t, t.hp, ctx.source);
        else cb.attack(ctx.source, t, Math.floor(api.evalNum(e.amount, ctx.vars)));
      }
    },
  });
}
