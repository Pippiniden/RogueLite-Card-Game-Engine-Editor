import { ed, touched, onContent } from './state.ts';
import { h, row, input, textarea, select, checkbox, button, clear, prompt, toast, modal } from './ui.ts';
import { assetPicker, exprInput } from './fields.ts';
import { SCREENS, SE_MOMENTS, BGM_SLOTS, FX_KINDS, type Opt } from './labels.ts';
import { SKIN_PARTS, WIDGET_INFO, ACTION_INFO } from '../game/registry-names.ts';
import { parseDoc, exportText, type QLScreen, type QLProject } from '../game/qlayout-core.js';
import { Vfx } from '../game/vfx.ts';
import { applyThemeVars } from './preview.ts';
import type { SkinDef } from '../engine/types.ts';
import type { ObjKind } from './project.ts';

/* ===== Sections for everything that is not a list of items ===== */

type Obj = Record<string, unknown>;
const getPath = (o: unknown, path: string[]) => path.reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Obj)[k] : undefined), o);
function setPath(o: Obj, path: string[], v: unknown) {
  let cur = o;
  for (const k of path.slice(0, -1)) { if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k] as Obj; }
  const last = path[path.length - 1];
  if (v === undefined) delete cur[last]; else cur[last] = v;
}
/** read from the merged object, write into the active pack's own copy */
const val = (kind: ObjKind, path: string[]) => getPath(ed.project.obj(kind), path);
const put = (kind: ObjKind, path: string[], v: unknown) => { setPath(ed.project.ownObj(kind), path, v); touched(); };
const numIn = (kind: ObjKind, path: string[], attrs: Obj = {}) => input(val(kind, path) as number, v => put(kind, path, v === '' ? undefined : Number(v)), { type: 'number', class: 'mono num', ...attrs });
const page = (title: string, intro: string, ...body: (Node | null)[]) => h('div', { class: 'page' }, h('header', { class: 'page-head' }, h('h2', null, title), h('p', null, intro)), ...body);
const card = (title: string, ...body: (Node | null | string)[]) => h('section', { class: 'box' }, h('h3', null, title), ...body);

/* ----- rules ----- */
export function rulesSection(): HTMLElement {
  const R = 'rules' as const;
  const form = () => {
    const f = val(R, ['formations']) as Record<string, { x: number; y: number; scale?: number }[]> ?? {};
    const box = h('div', { class: 'formations' });
    const draw = () => {
      clear(box);
      for (const n of ['1', '2', '3', '4']) {
        const list = f[n] ?? [];
        const W = 220, H = 220 * 345 / 390;
        const stage = h('div', { class: 'fm-stage', style: { width: `${W}px`, height: `${H}px` } }, list.map((p, i) => h('span', { class: 'fm-dot', style: { left: `${p.x * W}px`, top: `${p.y * H}px`, height: `${36 * (p.scale ?? 1)}px` } }, String(i + 1))));
        box.appendChild(h('div', { class: 'fm' }, h('b', null, `敵${n}体`), stage,
          h('div', { class: 'fm-rows' }, list.map((p, i) => h('div', { class: 'fm-row' }, h('span', { class: 'mono' }, `${i + 1}`),
            'x', input(p.x, v => { p.x = Number(v); put(R, ['formations', n], list); draw(); }, { type: 'number', step: 0.01, class: 'mono num' }),
            'y', input(p.y, v => { p.y = Number(v); put(R, ['formations', n], list); draw(); }, { type: 'number', step: 0.01, class: 'mono num' }),
            '大きさ', input(p.scale ?? 1, v => { p.scale = Number(v); put(R, ['formations', n], list); draw(); }, { type: 'number', step: 0.05, class: 'mono num' }))))));
      }
    };
    draw();
    return box;
  };
  const rarity = (kind: string) => h('div', { class: 'inline' }, ['common', 'uncommon', 'rare'].map(r => h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, r), numIn(R, ['rewards', 'rarity', kind, r], { min: 0 }))));
  const gold = (kind: string) => { const g = (val(R, ['rewards', 'gold', kind]) as number[]) ?? [0, 0]; return h('span', { class: 'range' }, input(g[0], v => { g[0] = Number(v); put(R, ['rewards', 'gold', kind], g); }, { type: 'number', class: 'mono num' }), '〜', input(g[1], v => { g[1] = Number(v); put(R, ['rewards', 'gold', kind], g); }, { type: 'number', class: 'mono num' })); };
  return page('ルール', '冒険と戦闘の数値。ここで変えた値は次のプレイから効きます。',
    card('戦闘', h('div', { class: 'fields' }, row('手札の上限', numIn(R, ['maxHand'], { min: 1 })))),
    card('マップ', h('div', { class: 'fields' },
      row('階層の数（ボスの前まで）', numIn(R, ['map', 'floors'], { min: 3 })),
      row('横幅（列）', numIn(R, ['map', 'width'], { min: 3 })),
      row('道の本数', numIn(R, ['map', 'paths'], { min: 1 })),
      row('宝箱の階（0始まり）', numIn(R, ['map', 'treasureFloor'])),
      row('焚き火だけの階', input(String(val(R, ['map', 'restFloor']) ?? 'last'), v => put(R, ['map', 'restFloor'], v === 'last' ? 'last' : Number(v)), { class: 'mono' }), '"last" ならボスの直前'),
      row('エリートが出る最初の階', numIn(R, ['map', 'eliteMinFloor'])),
      row('焚き火が出る最初の階', numIn(R, ['map', 'restMinFloor'])),
      row('ノードの出やすさ', h('div', { class: 'inline' }, ['battle', 'elite', 'rest'].map(k => h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, ({ battle: '戦闘', elite: 'エリート', rest: '焚き火' } as Obj)[k] as string), numIn(R, ['map', 'weights', k], { min: 0 }))))))),
    card('報酬', h('div', { class: 'fields' },
      row('カードの候補数', numIn(R, ['rewards', 'cardChoices'], { min: 1 })),
      row('強化済みで出る確率', numIn(R, ['rewards', 'upgradedChance'], { step: 0.01, min: 0, max: 1 })),
      row('通常戦のレアリティ比', rarity('normal')), row('エリート戦のレアリティ比', rarity('elite')), row('ボス戦のレアリティ比', rarity('boss')),
      row('通常戦のゴールド', gold('normal')), row('エリート戦のゴールド', gold('elite')), row('ボス戦のゴールド', gold('boss')))),
    card('焚き火', h('div', { class: 'fields' }, row('休むと回復する割合(%)', numIn(R, ['rest', 'healPercent'], { min: 0, max: 100 })))),
    card('敵の大きさ（敵の配置領域の高さに対する割合）', h('div', { class: 'inline' }, ['small', 'medium', 'large', 'boss'].map(k => h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, k), numIn(R, ['sizes', k], { step: 0.02 }))))),
    card('陣形（敵の足元の位置。x・y は敵の配置領域の 0〜1）', form()));
}

/* ----- theme & skins ----- */
export function skinStyle(s: SkinDef | null | undefined, url: string | null): Partial<CSSStyleDeclaration> | null {
  if (!s || !url) return null;
  const k = s.scale ?? 2; const [t, r, b, l] = s.slice;
  const w = `${t / k}px ${r / k}px ${b / k}px ${l / k}px`;
  return { borderStyle: 'solid', borderColor: 'transparent', borderWidth: w, borderImage: `url("${url}") ${t} ${r} ${b} ${l}${s.fill === false ? '' : ' fill'} / ${w} / 0 ${s.repeat ?? 'stretch'}`, background: 'none' };
}
export function themeSection(): HTMLElement {
  const T = 'theme' as const;
  const colors = val(T, ['colors']) as Record<string, string> ?? {};
  const colorRow = (path: string[], label: string) => {
    const v = String(val(T, path) ?? '#000000');
    const text = input(v, nv => { put(T, path, nv); pick.value = /^#[0-9a-f]{6}$/i.test(nv) ? nv : pick.value; }, { class: 'mono' });
    const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000', on: { input: (e: Event) => { const nv = (e.target as HTMLInputElement).value; text.value = nv; put(T, path, nv); } } });
    return row(label, h('span', { class: 'color' }, pick, text));
  };
  const COLOR_LABELS: Record<string, string> = { bg: '背景', bgDeep: '背景（奥）', stone: '石', line: '線', ink: '文字', muted: '控えめな文字', parchment: '羊皮紙', parchmentInk: '羊皮紙の文字', ember: 'アクセント', emberDeep: 'アクセント（濃）', hp: 'HP', block: 'ブロック', energy: 'エネルギー', good: '良い', bad: '悪い' };
  const skins = h('div', { class: 'skins' });
  const drawSkins = () => {
    clear(skins);
    for (const [part, label] of Object.entries(SKIN_PARTS)) {
      const s = (val(T, ['skins', part]) as SkinDef | null | undefined) ?? null;
      const url = s ? ed.project.assetUrl(s.image) : null;
      const sample = h('div', { class: 'skin-sample' }, label);
      const st = skinStyle(s, url); if (st) Object.assign(sample.style, st);
      const body = h('div', { class: 'skin-body' });
      if (s) {
        const set = (k: keyof SkinDef, v: unknown) => { const cur = { ...(val(T, ['skins', part]) as SkinDef) }; (cur as unknown as Obj)[k] = v; put(T, ['skins', part], cur); drawSkins(); };
        const holder = { image: s.image } as Obj;
        const picker = assetPicker(holder, 'image', 'ui', false, v => set('image', v ?? ''));
        body.append(
          row('画像', picker),
          row('切り分け（上 右 下 左・元画像のpx）', h('span', { class: 'inline' }, [0, 1, 2, 3].map(i => input(s.slice[i], v => { const sl = [...s.slice] as SkinDef['slice']; sl[i] = Number(v) || 0; set('slice', sl); }, { type: 'number', class: 'mono num', min: 0 })))),
          row('倍率（元画像px ÷ 画面px）', input(s.scale ?? 2, v => set('scale', Number(v) || 2), { type: 'number', class: 'mono num', step: 0.5 })),
          h('div', { class: 'inline' }, checkbox(s.fill !== false, '中央も描く', v => set('fill', v ? undefined : false)),
            select(s.repeat ?? 'stretch', [['stretch', '伸ばす'], ['round', '並べる（合わせる）'], ['repeat', '並べる'], ['space', '間をあけて並べる']], v => set('repeat', v === 'stretch' ? undefined : v))),
          button('CSSに戻す', () => { put(T, ['skins', part], undefined); drawSkins(); }, 'sm danger'));
      } else body.appendChild(button('画像にする', () => { put(T, ['skins', part], { image: '', slice: [16, 16, 16, 16], scale: 2 }); drawSkins(); }, 'sm'));
      skins.appendChild(h('div', { class: 'skin' }, h('div', { class: 'skin-head' }, h('b', null, label), h('code', null, part), h('span', { class: `badge ${s ? 'img' : ''}` }, s ? '画像' : 'CSS')), sample, body));
    }
  };
  drawSkins();
  const unsub = onContent(() => { if (!skins.isConnected) { unsub(); return; } });
  return page('見た目（テーマ・UIスキン・背景）', 'ウィンドウ枠やボタンは、画像を割り当てなければCSSで描かれます。画像の規格は docs/asset-spec.md。',
    card('色', h('div', { class: 'fields cols2' }, Object.keys(colors).map(k => colorRow(['colors', k], COLOR_LABELS[k] ?? k)))),
    card('カードの色', h('div', { class: 'fields cols2' },
      ['attack', 'skill', 'power', 'status', 'curse'].map(k => colorRow(['cardTypeColors', k], `枠: ${k}`)),
      ['starter', 'common', 'uncommon', 'rare', 'special'].map(k => colorRow(['rarityColors', k], `レアリティ: ${k}`)))),
    card('フォント', h('div', { class: 'fields' },
      row('見出し', input(val(T, ['fonts', 'display']) as string, v => put(T, ['fonts', 'display'], v), { class: 'mono' })),
      row('本文', input(val(T, ['fonts', 'body']) as string, v => put(T, ['fonts', 'body'], v), { class: 'mono' })),
      row('Google Fonts のURL', input(val(T, ['fonts', 'googleFonts']) as string, v => put(T, ['fonts', 'googleFonts'], v || undefined), { class: 'mono' }), '空なら読み込まない'))),
    card('画面の背景（780×1688・@2x）', h('div', { class: 'fields cols2' }, SCREENS.map(([id, label]) => {
      const holder = { [id]: val(T, ['backgrounds', id]) } as Obj;
      return row(label, assetPicker(holder, id, 'bg', false, v => put(T, ['backgrounds', id], v)));
    }))),
    card('UIスキン（9スライス）', skins));
}

/* ----- sound ----- */
export function audioSection(): HTMLElement {
  const A = 'audio' as const;
  const mapRow = (group: 'se' | 'bgm', id: string, label: string, prefix: string) => {
    const holder = { v: val(A, [group, id]) } as Obj;
    return row(label, assetPicker(holder, 'v', prefix, true, v => put(A, [group, id], v)));
  };
  const bgmKeys = [...new Set(Object.values((val(A, ['bgm']) as Record<string, string>) ?? {}))];
  return page('サウンド', '場面ごとの効果音と音楽。ファイルの無いものは無音です。規格は docs/asset-spec.md（AAC .m4a か MP3）。',
    card('音量', h('div', { class: 'inline' }, ['master', 'se', 'bgm'].map(k => h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, ({ master: '全体', se: '効果音', bgm: '音楽' } as Obj)[k] as string), numIn(A, ['volume', k], { step: 0.05, min: 0, max: 1 }))))),
    card('効果音', h('div', { class: 'fields cols2' }, SE_MOMENTS.map(([k, l]) => mapRow('se', k, l, 'se')))),
    card('音楽', h('div', { class: 'fields cols2' }, BGM_SLOTS.map(([k, l]) => mapRow('bgm', k, l, 'bgm')))),
    card('ループ位置（秒）', bgmKeys.length ? h('div', { class: 'fields' }, bgmKeys.map(k => row(k, h('span', { class: 'inline' },
      '開始', numIn(A, ['tracks', k, 'loopStart'], { step: 0.01 }), '終了', numIn(A, ['tracks', k, 'loopEnd'], { step: 0.01 }), '音量', numIn(A, ['tracks', k, 'volume'], { step: 0.05 }))))) : h('p', { class: 'help' }, '音楽を割り当てると設定できます')));
}

/* ----- assets ----- */
const SPEC: Record<string, { label: string; w?: number; h?: number; ratio?: number; note: string; audio?: boolean }> = {
  portrait: { label: '顔グラフィック', w: 512, h: 512, note: '512×512・透過可' },
  enemy: { label: '敵', note: '透過・足元が下端中央・高さ small256/medium384/large448/boss576' },
  card: { label: 'カードの絵', w: 640, h: 360, ratio: 16 / 9, note: '640×360（16:9）' },
  status: { label: '状態アイコン', w: 128, h: 128, note: '128×128 透過' },
  relic: { label: 'レリック', w: 128, h: 128, note: '128×128 透過' },
  intent: { label: '敵の予告', w: 128, h: 128, note: '128×128 透過' },
  node: { label: 'マップのノード', w: 128, h: 128, note: '128×128 透過' },
  scene: { label: '場面の絵', note: '400×400 透過' },
  bg: { label: '背景', w: 780, h: 1688, note: '780×1688（@2x）・上94px/下68px/左右10%は隠れることがある' },
  ui: { label: 'UIスキン', note: '9スライス・@2x（docs/asset-spec.md）' },
  se: { label: '効果音', audio: true, note: 'm4a/mp3・2秒以内' },
  bgm: { label: '音楽', audio: true, note: 'm4a/mp3・ループ位置を設定' },
};
export function assetsSection(): HTMLElement {
  const grid = h('div', { class: 'gallery' });
  let q = '';
  const draw = () => {
    clear(grid);
    const all = [...ed.project.assetMap()].filter(([k]) => !q || k.includes(q)).sort(([a], [b]) => a.localeCompare(b));
    const groups = new Map<string, typeof all>();
    for (const e of all) { const g = e[0].split('.')[0]; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(e); }
    for (const [g, items] of groups) {
      const spec = SPEC[g];
      grid.appendChild(h('h3', { class: 'gal-h' }, `${spec?.label ?? g}（${items.length}）`, spec ? h('small', null, ` 規格: ${spec.note}`) : null));
      const row = h('div', { class: 'gal-row' });
      for (const [key, a] of items) {
        const url = ed.project.urlOf(a.path);
        const sizeEl = h('small', { class: 'gal-size mono' });
        const audio = spec?.audio || /\.(mp3|m4a|ogg|wav)$/i.test(a.path);
        const media = audio ? (url ? h('audio', { src: url, controls: true }) : h('span', { class: 'thumb empty' }, 'ファイルなし'))
          : url ? h('img', { src: url, alt: '', loading: 'lazy', on: { load: (e: Event) => {
            const im = e.target as HTMLImageElement; sizeEl.textContent = `${im.naturalWidth}×${im.naturalHeight}`;
            const bad = spec && ((spec.w && (im.naturalWidth !== spec.w || im.naturalHeight !== spec.h) && !/\.svg$/i.test(a.path)) || (spec.ratio && Math.abs(im.naturalWidth / im.naturalHeight - spec.ratio) > 0.05));
            if (bad) { sizeEl.classList.add('warn'); sizeEl.title = `規格: ${spec!.note}`; }
          } } }) : h('span', { class: 'thumb empty' }, 'ファイルなし');
        const fileIn = h('input', { type: 'file', accept: audio ? 'audio/*' : 'image/*', hidden: true, on: { change: () => { const f = fileIn.files?.[0]; if (!f) return; ed.project.setAsset(key, f, f.name, g); touched(); draw(); toast(`${key} を差し替えました`, 'ok'); } } }) as HTMLInputElement;
        row.appendChild(h('div', { class: 'gal-item' }, h('div', { class: 'gal-media' }, media), h('code', null, key), h('small', { class: 'gal-path mono' }, a.path.replace(/^packs\//, '')), sizeEl,
          h('div', { class: 'btnrow' }, button('差し替え', () => fileIn.click(), 'sm'), fileIn,
            a.pack === ed.project.active ? button('削除', async () => { if (await modal(`${key} を削除しますか？`, h('p', null, '使っている所は仮の絵になります。'), [['やめる', null], ['削除', 'y', 'danger']])) { ed.project.removeAsset(key); touched(); draw(); } }, 'sm danger') : h('span', { class: 'badge' }, a.pack))));
      }
      grid.appendChild(row);
    }
  };
  const upload = h('input', { type: 'file', multiple: true, accept: 'image/*,audio/*', hidden: true, on: { change: async () => {
    const files = [...(upload.files ?? [])]; if (!files.length) return;
    const cat = await prompt('素材を追加', `分類（${Object.keys(SPEC).join(' / ')}）`, 'card');
    if (!cat) return;
    for (const f of files) { const key = `${cat}.${f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_')}`; ed.project.setAsset(key, f, f.name, cat); }
    touched(); draw(); toast(`${files.length} 件を追加しました`, 'ok');
  } } }) as HTMLInputElement;
  draw();
  return page('素材（画像と音）', 'キー（例: enemy.slime）でデータから参照します。ファイルを差し替えてもデータはそのまま。サイズが規格と違うものは黄色で示します。',
    h('div', { class: 'list-tools' }, input('', v => { q = v; draw(); }, { type: 'search', placeholder: 'キーで検索' }), button('＋ 素材を追加…', () => upload.click(), 'primary sm'), upload),
    grid);
}

/* ----- texts ----- */
export function textsSection(): HTMLElement {
  const X = 'text' as const;
  let q = '';
  const body = h('div');
  const TABLES: [string, string][] = [['ui', '画面の文言'], ['effects', '効果の説明文テンプレート'], ['keywords', 'キーワード'], ['intents', '敵の予告'], ['nodes', 'マップのノード'], ['cardTypes', 'カードの種類'], ['rarities', 'レアリティ']];
  const draw = () => {
    clear(body);
    for (const [tab, label] of TABLES) {
      const m = (val(X, [tab]) as Record<string, unknown>) ?? {};
      const keys = Object.keys(m).filter(k => !q || k.includes(q) || JSON.stringify(m[k]).includes(q));
      if (!keys.length && q) continue;
      body.appendChild(card(`${label}（${keys.length}）`,
        h('div', { class: 'ttable' }, keys.map(k => tab === 'keywords'
          ? h('div', { class: 'trow' }, h('code', null, k),
            input((m[k] as Obj)?.name as string, v => put(X, [tab, k, 'name'], v)),
            input((m[k] as Obj)?.desc as string, v => put(X, [tab, k, 'desc'], v), { class: 'grow' }))
          : h('div', { class: 'trow' }, h('code', null, k), input(m[k] as string, v => put(X, [tab, k], v), { class: 'grow' })))),
        tab === 'ui' || tab === 'keywords' || tab === 'effects' ? button('＋ キーを追加', async () => { const k = await prompt('キーを追加', 'キー'); if (k) { put(X, [tab, k], tab === 'keywords' ? { name: k, desc: '' } : ''); draw(); } }, 'sm') : null));
    }
  };
  draw();
  return page('文言', '画面に出る固定の文言はすべてここにあります。{n} などの波かっこは数値が入る場所です。画面配置ツールの「ラベル」で書いた文言は「画面配置」で変えます。',
    h('div', { class: 'list-tools' }, input('', v => { q = v; draw(); }, { type: 'search', placeholder: 'キーか文言で検索' })), body);
}

/* ----- layout ----- */
export function layoutSection(): HTMLElement {
  const pm = [...ed.project.index.packs].reverse().map(id => ed.project.packs.get(id)!).find(p => p.layout);
  const text = pm?.layout?.text ?? '';
  const own = () => {
    const a = ed.project.pack;
    if (!a.layout) { a.layout = { file: 'layout.qlayout', text }; a.manifest.layout = 'layout.qlayout'; }
    return a.layout;
  };
  const doc = parseDoc(text);
  const screens = doc.items.filter(i => i.kind === 'screen').map(i => (i as { s: QLScreen }).s);
  const save = () => { own().text = exportText(screens, doc.project as QLProject); touched(); raw.value = own().text; };
  const body = h('div');
  const skinOpts: Opt[] = [['', '標準'], ...Object.entries(SKIN_PARTS).map(([k, l]) => [k, l] as Opt)];
  for (const s of screens) {
    const rows = s.els.map(e => {
      const textual = !e.attrs.bind && ['label', 'text', 'button'].includes(e.type);
      return h('div', { class: 'lrow' },
        h('code', null, e.id), h('span', { class: 'ltype' }, e.type),
        textual ? input(e.label, v => { e.label = v; save(); }, { class: 'grow', 'aria-label': `${e.id} の文言` }) : h('span', { class: 'grow muted' }, e.label),
        e.attrs.bind ? h('span', { class: 'lbind', title: (WIDGET_INFO as Record<string, string>)[e.attrs.bind] ?? '未登録の部品' }, e.attrs.bind) : h('span'),
        select(e.attrs.skin ?? '', skinOpts, v => { if (v) e.attrs.skin = v; else delete e.attrs.skin; save(); }, { 'aria-label': `${e.id} のスキン` }),
        h('span', { class: 'lon mono', title: e.attrs.on ?? '' }, e.attrs.on ?? ''));
    });
    body.appendChild(card(`${s.id} — ${s.title}`, h('div', { class: 'ltable' }, rows)));
  }
  const err = h('span', { class: 'err' });
  const raw = textarea(text, v => { const d = parseDoc(v); err.textContent = d.errors.slice(0, 3).join(' / '); if (!d.errors.length) { own().text = v; touched(); } }, { rows: 16, class: 'mono', spellcheck: false });
  const url = (doc.project as QLProject | null)?.url;
  return page('画面配置', '位置と大きさは画面配置ツールで決めます。ここでは文言とスキンだけ変えられます（保存すると # のコメント行は消えます）。',
    h('div', { class: 'btnrow' },
      url ? h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, '画面配置ツールを開く') : null,
      button('ツールに貼る用にコピー', async () => { try { await navigator.clipboard.writeText(own().text || text); toast('コピーしました。ツールの「読み込み」に貼り付けます', 'ok'); } catch { raw.select(); } }, 'sm')),
    body,
    card('使える部品（bind）とアクション（on）', h('div', { class: 'ref-cols' },
      h('ul', null, Object.entries(WIDGET_INFO).map(([k, v]) => h('li', null, h('code', null, k), ' ', v))),
      h('ul', null, Object.entries(ACTION_INFO).map(([k, v]) => h('li', null, h('code', null, k), ' ', v))))),
    card('QLAYOUT テキスト（上級者向け）', raw, err));
}

/* ----- vfx ----- */
export function vfxSection(): HTMLElement {
  const V = 'vfx' as const;
  const body = h('div');
  const stage = h('div', { class: 'vfx-stage game-theme' }, h('div', { class: 'vfx-target' }, '対象'));
  const fx = new Vfx({}, stage);
  const draw = () => {
    clear(body);
    const presets = ed.project.obj(V) as Record<string, Obj[]>;
    for (const [name, steps] of Object.entries(presets)) {
      if (name.startsWith('$')) continue;
      const commit = () => put(V, [name], steps.map(s => ({ ...s })));
      body.appendChild(card(name,
        h('div', { class: 'vsteps' }, steps.map((s, i) => h('div', { class: 'vstep' },
          select(String(s.fx), FX_KINDS, v => { s.fx = v; commit(); }),
          ['ms', 'px', 'scale', 'color'].map(k => h('span', { class: 'ep' }, h('span', { class: 'ep-l' }, k), input(s[k] as string, v => { if (v === '') delete s[k]; else s[k] = k === 'color' ? v : Number(v); commit(); }, { class: 'mono num' }))),
          button('×', () => { steps.splice(i, 1); commit(); draw(); }, 'icon danger')))),
        h('div', { class: 'btnrow' },
          button('＋ 手順', () => { steps.push({ fx: 'flash', ms: 100 }); commit(); draw(); }, 'sm'),
          button('試す', () => { fx.presets = ed.project.obj(V) as never; fx.play(name, name.startsWith('player') ? stage : stage.querySelector('.vfx-target') as HTMLElement); }, 'primary sm'))));
    }
  };
  draw();
  applyThemeVars(stage);
  return page('演出（VFX）', '被弾の揺れや画面の赤い縁などの組み合わせ。敵ごと・状態ごとに名前で選べます。',
    stage,
    h('div', { class: 'btnrow' }, button('＋ 演出を追加', async () => { const n = await prompt('演出を追加', '名前（例: enemy.hitFire）'); if (n) { put(V, [n], [{ fx: 'flash', ms: 100 }]); draw(); } }, 'sm')),
    body);
}

/* ----- plugins ----- */
const PLUGIN_TEMPLATE = `/* 新しい効果を追加するプラグイン。docs/plugins.md を参照 */
export default function (api) {
  api.registerEffect('my_effect', {
    label: '自作の効果',
    params: {
      amount: { type: 'num', required: true, label: '量' },
      to: { type: 'target', label: '対象' },
    },
    defaultTo: 'target',
    text: '{amount}ダメージを与え、カードを1枚引く',
    run(cb, ctx, e, who) {
      const n = Math.floor(api.evalNum(e.amount, ctx.vars));
      for (const t of who) cb.attack(ctx.source, t, n);
      cb.draw(1);
    },
  });
}
`;
export function pluginsSection(): HTMLElement {
  const body = h('div');
  const draw = () => {
    clear(body);
    for (const pm of ed.project.packs.values()) for (const pl of pm.plugins) {
      const path = `${pm.dir}/${pl.file}`;
      const res = ed.plugins.find(r => r.path === path);
      const status = res ? (res.ok ? h('span', { class: 'badge img' }, `読み込み済み: ${res.added.join(', ') || '（効果の追加なし）'}`) : h('span', { class: 'badge bad' }, `エラー: ${res.error}`)) : h('span', { class: 'badge' }, '未読み込み');
      const own = pm.id === ed.project.active;
      body.appendChild(card(`${pm.id}/${pl.file}`, status,
        textarea(pl.text, v => { pl.text = v; touched(); }, { rows: 18, class: 'mono code', spellcheck: false, readOnly: !own }),
        own ? button('このプラグインを外す', async () => { if (await modal('プラグインを外しますか？', h('p', null, 'ファイルは残ります（pack.json から外すだけ）。'), [['やめる', null], ['外す', 'y', 'danger']])) { pm.plugins = pm.plugins.filter(x => x !== pl); pm.manifest.plugins = pm.plugins.map(x => x.file); touched(); draw(); } }, 'sm danger') : null));
    }
  };
  draw();
  const unsub = onContent(() => { if (!body.isConnected) { unsub(); return; } draw(); });
  return page('プラグイン', 'JavaScript で新しい効果（op）を追加できます。登録した効果はカードや状態の「効果を追加」にそのまま出ます。書き方は docs/plugins.md。',
    h('div', { class: 'btnrow' }, button('＋ プラグインを作る', async () => {
      const name = await prompt('プラグインを作る', 'ファイル名', 'plugins/my-effects.js'); if (!name) return;
      const pm = ed.project.pack; pm.plugins.push({ file: name, text: PLUGIN_TEMPLATE }); pm.manifest.plugins = pm.plugins.map(x => x.file); touched(); draw();
    }, 'primary sm')),
    body);
}

/* ----- packs ----- */
export function packsSection(rerender: () => void): HTMLElement {
  const p = ed.project;
  const list = h('ol', { class: 'packs' }, p.index.packs.map((id, i) => {
    const pm = p.packs.get(id)!;
    return h('li', { class: id === p.active ? 'on' : '' },
      h('div', null, h('b', null, pm.manifest.name), ' ', h('code', null, id), ' ', h('small', null, `v${pm.manifest.version}`)),
      h('div', { class: 'btnrow' },
        id === p.active ? h('span', { class: 'badge img' }, '編集中') : button('このパックを編集', () => { p.active = id; p.changed(); rerender(); }, 'sm'),
        button('↑', () => { if (i) { [p.index.packs[i - 1], p.index.packs[i]] = [p.index.packs[i], p.index.packs[i - 1]]; touched(); rerender(); } }, 'icon', { disabled: !i, title: '先に読む' }),
        button('↓', () => { if (i < p.index.packs.length - 1) { [p.index.packs[i + 1], p.index.packs[i]] = [p.index.packs[i], p.index.packs[i + 1]]; touched(); rerender(); } }, 'icon', { disabled: i === p.index.packs.length - 1, title: '後に読む' })),
      h('div', { class: 'fields' },
        row('名前', input(pm.manifest.name, v => { pm.manifest.name = v; touched(); })),
        row('バージョン', input(pm.manifest.version, v => { pm.manifest.version = v; touched(); }, { class: 'mono' }))));
  }));
  return page('パック', 'パックは上から順に読まれ、後のパックが同じIDの定義を上書きします。追加コンテンツや改造はパックを分けると管理しやすくなります。',
    list,
    h('div', { class: 'btnrow' }, button('＋ 新しいパック', async () => {
      const id = await prompt('新しいパック', 'ID（英数字）', 'my_mod'); if (!id) return;
      if (p.packs.has(id)) { toast('そのIDはもうあります', 'err'); return; }
      p.addPack(id, id); touched(); rerender();
    }, 'primary sm')),
    h('p', { class: 'help' }, '使っていないパック（例: skin-demo）を加えるには、packs/index.json に ID を書き足してから開き直します。'));
}

/* ----- issues ----- */
const KIND_LABEL: Record<string, string> = { cards: 'カード', statuses: '状態', relics: 'レリック', enemies: '敵', encounters: '遭遇', characters: '主人公', layout: '画面配置', theme: '見た目', plugins: 'プラグイン', assets: '素材', project: 'プロジェクト' };
export function issuesSection(go: (sec: string, id?: string) => void): HTMLElement {
  const body = h('div');
  const draw = () => {
    const errs = ed.issues.filter(i => i.sev === 'error'), warns = ed.issues.filter(i => i.sev === 'warn');
    clear(body, h('p', { class: 'help' }, `エラー ${errs.length} 件 · 警告 ${warns.length} 件（エラーがあるとゲームが正しく動かない可能性があります）`),
      h('table', { class: 'issues' }, h('tbody', null, [...errs, ...warns].map(i => h('tr', { class: i.sev, on: { click: () => go(['layout', 'theme', 'plugins'].includes(i.kind) ? i.kind : i.kind, i.id) } },
        h('td', null, h('span', { class: `sev ${i.sev}` }, i.sev === 'error' ? 'エラー' : '警告')), h('td', null, KIND_LABEL[i.kind] ?? i.kind), h('td', null, h('code', null, i.id)), h('td', null, i.msg))))));
  };
  draw();
  const unsub = onContent(() => { if (!body.isConnected) { unsub(); return; } draw(); });
  return page('検証', 'ID の参照切れ、式の書き間違い、足りない画像、画面配置の問題を調べます（npm run check と同じ内容）。行をクリックするとその項目へ移動します。', body);
}

void exprInput;
