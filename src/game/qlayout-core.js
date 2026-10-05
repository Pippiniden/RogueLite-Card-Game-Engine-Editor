/* ===== QLAYOUT core (format 1 + project / patch / drop extensions) =====
   Pure functions only: parsing, tree, serializing, applying edits, diff, checks, code generation. */
const ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const BLOCK_RESERVED = new Set(['screen','note','end']);
const RESERVED = new Set(['screen','note','notes','end','patch','project','set','move','rm','drop']);
const ATTR_KEYS = ['repeat','layer','anchor','layout','scroll','show','bind','on','note'];
const HEADER = '#QLAYOUT 1';
let _uid = 0;
const uid = () => 'u' + (++_uid) + Math.random().toString(36).slice(2, 5);
const newKey = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

const TYPES = [
  ['frame','枠','box'],['spacer','未定','box'],
  ['label','見出し','txt'],['text','文章','txt'],['image','画像','txt'],['icon','アイコン','txt'],['canvas','描画領域','txt'],
  ['button','ボタン','ctl'],['input','入力欄','ctl'],['select','プルダウン','ctl'],['check','チェック','ctl'],['slider','スライダー','ctl'],['tabs','タブ','ctl'],
  ['list','リスト','data'],['table','表','data'],['grid','タイル','data'],['timer','タイマー','data'],['gauge','ゲージ','data'],
  ['dialog','ダイアログ','ovl']
];
const CATS = ['box','txt','ctl','data','ovl'];
const CAT_NAMES = { box:'構造', txt:'表示', ctl:'操作', data:'データ', ovl:'重ね' };
const TYPE_MAP = Object.fromEntries(TYPES.map(([k, n, c]) => [k, { name:n, cat:c }]));
function typeInfo(t, project){
  if (TYPE_MAP[t]) return TYPE_MAP[t];
  const p = project?.types?.find(x => x.key === t);
  return p ? { name:p.name || p.key, cat:CATS.includes(p.cat) ? p.cat : 'box', custom:true } : null;
}
const catOf = (t, project) => typeInfo(t, project)?.cat || 'box';

function defaultProject(){
  return { name:'', size:null, safe:{ t:0, r:0, b:0, l:0 }, url:'', context:'', states:[], types:[], attrs:[] };
}

function q(s){ return '"' + String(s ?? '').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n') + '"'; }

function tokenize(line){
  const t = []; let i = 0; const n = line.length;
  const readQ = () => {
    let s = ''; i++;
    while (i < n){
      const c = line[i];
      if (c === '\\' && i + 1 < n){ const d = line[i+1]; s += d === 'n' ? '\n' : d; i += 2; continue; }
      if (c === '"'){ i++; return s; }
      s += c; i++;
    }
    throw new Error('引用符 " が閉じていません');
  };
  while (i < n){
    const c = line[i];
    if (c === ' ' || c === '\t'){ i++; continue; }
    if (c === '"'){ t.push({ q:true, v:readQ() }); continue; }
    let w = '';
    while (i < n && line[i] !== ' ' && line[i] !== '\t' && line[i] !== '"'){ w += line[i]; i++; }
    const eq = w.indexOf('=');
    if (eq > 0){
      const k = w.slice(0, eq); let v = w.slice(eq + 1);
      if (v === '' && line[i] === '"') v = readQ();
      t.push({ k, v });
    } else t.push({ v:w });
  }
  return t;
}
const word = t => t && t.k === undefined && !t.q ? t.v : '';

function parseElLine(toks, ln, errors){
  const [idT, typeT, posT, sizeT, ...rest] = toks;
  const pm = /^(-?\d+),(-?\d+)$/.exec(posT?.v || ''), sm = /^(\d+)x(\d+)$/.exec(sizeT?.v || '');
  if (!word(idT) || !ID_RE.test(idT.v) || BLOCK_RESERVED.has(idT.v) || !word(typeT) || !pm || !sm){
    errors.push(`${ln}行目: 要素は ID 種類 x,y 幅x高さ "ラベル" 属性="値" の形で書きます`); return null;
  }
  const el = { uid:uid(), id:idT.v, type:typeT.v, x:+pm[1], y:+pm[2], w:+sm[1], h:+sm[2], label:'', attrs:{} };
  let labelSet = false;
  for (const t of rest){
    if (t.k !== undefined) el.attrs[t.k] = t.v;
    else if (t.q && !labelSet){ el.label = t.v; labelSet = true; }
    else { errors.push(`${ln}行目: 「${t.v}」を解釈できません`); return null; }
  }
  if (el.attrs.repeat && /^\d+$/.test(el.attrs.repeat)) el.attrs.repeat = '1x' + el.attrs.repeat;
  return el;
}

/* Parse any QLAYOUT text. Returns { project|null, items:[screen|patch|drop], errors }. Items keep text order. */
function parseDoc(text){
  const out = { project:null, items:[], errors:[], header:null };
  const errors = out.errors;
  let mode = null, cur = null;
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const startBlock = (toks, ln) => {
    const head = word(toks[0]);
    if (head === 'screen'){
      const id = toks[1]?.v, m = /^(\d+)x(\d+)$/.exec(toks[2]?.v || '');
      if (!id || !ID_RE.test(id) || RESERVED.has(id) || !m){ errors.push(`${ln}行目: screen 行は screen ID 幅x高さ "名前" の形で書きます`); mode = 'skip'; return; }
      if (out.items.some(it => it.kind === 'screen' && it.s.id === id)) errors.push(`${ln}行目: 画面ID ${id} が重複しています`);
      cur = { id, w:+m[1], h:+m[2], title:toks[3]?.q ? toks[3].v : '', notes:[], els:[] };
      out.items.push({ kind:'screen', s:cur, ln }); mode = 'screen'; return;
    }
    if (head === 'patch'){
      const id = toks[1]?.v;
      if (!id || !ID_RE.test(id)){ errors.push(`${ln}行目: patch の後には画面IDを書きます`); mode = 'skip'; return; }
      cur = { kind:'patch', id, ops:[], ln }; out.items.push(cur); mode = 'patch'; return;
    }
    if (head === 'project'){
      if (out.project) errors.push(`${ln}行目: project ブロックが2つあります`);
      cur = defaultProject(); cur.name = toks[1]?.q ? toks[1].v : ''; cur._ctx = [];
      out.project = cur; mode = 'project'; return;
    }
    if (head === 'drop'){
      const ids = toks.slice(1).map(t => t.v).filter(Boolean);
      if (!ids.length) errors.push(`${ln}行目: drop の後には画面IDを書きます`);
      ids.forEach(id => out.items.push({ kind:'drop', id, ln }));
      return;
    }
    errors.push(`${ln}行目: screen / patch / project / drop ブロックの外に書かれています`);
  };
  lines.forEach((raw, idx) => {
    const ln = idx + 1, body = raw.trim();
    if (!body) return;
    if (body.startsWith('#')){ if (!out.header && /^#QLAYOUT\b/.test(body)) out.header = body; return; }
    let toks;
    try { toks = tokenize(body); } catch (e) { errors.push(`${ln}行目: ${e.message}`); return; }
    const head = word(toks[0]);
    if (mode === null){ startBlock(toks, ln); return; }
    if (head === 'end'){ mode = null; cur = null; return; }
    if (head === 'screen' || head === 'patch' || head === 'project' || (head === 'drop' && mode !== 'patch')){
      mode = null; cur = null; startBlock(toks, ln); return;   // tolerate a missing "end"
    }
    if (mode === 'skip') return;
    if (mode === 'screen'){
      if (head === 'note'){ if (toks[1]?.q) cur.notes.push(toks[1].v); else errors.push(`${ln}行目: note の後には "文" を書きます`); return; }
      const el = parseElLine(toks, ln, errors); if (!el) return;
      if (cur.els.some(e => e.id === el.id)) errors.push(`${ln}行目: 要素ID ${el.id} が重複しています`);
      cur.els.push(el); return;
    }
    if (mode === 'patch'){
      const op = parsePatchOp(toks, ln, errors); if (op) cur.ops.push(op); return;
    }
    if (mode === 'project') parseProjectLine(cur, toks, ln, errors);
  });
  if (out.project){ out.project.context = out.project._ctx.join('\n'); delete out.project._ctx; }
  return out;
}

function kvOf(toks, ln, errors, from){
  const kv = {};
  for (const t of toks.slice(from)){
    if (t.k === undefined){ errors.push(`${ln}行目: 「${t.v}」は key="値" の形で書きます`); return null; }
    kv[t.k] = t.v;
  }
  return kv;
}
function parsePatchOp(toks, ln, errors){
  const head = word(toks[0]);
  if (head === 'set'){
    const id = toks[1]?.v;
    if (!id || (id !== 'screen' && !ID_RE.test(id))){ errors.push(`${ln}行目: set の後には要素ID（画面なら screen）を書きます`); return null; }
    const kv = kvOf(toks, ln, errors, 2); if (!kv) return null;
    if (!Object.keys(kv).length){ errors.push(`${ln}行目: set に変更する項目がありません`); return null; }
    return id === 'screen' ? { kind:'sset', kv, ln } : { kind:'set', id, kv, ln };
  }
  if (head === 'move'){
    const id = toks[1]?.v, m = /^([+-]?\d+),([+-]?\d+)$/.exec(toks[2]?.v || '');
    if (!id || !m){ errors.push(`${ln}行目: move は move ID dx,dy の形で書きます`); return null; }
    return { kind:'move', id, dx:+m[1], dy:+m[2], ln };
  }
  if (head === 'rm'){
    const ids = toks.slice(1).map(t => t.v).filter(Boolean);
    if (!ids.length){ errors.push(`${ln}行目: rm の後には要素IDを書きます`); return null; }
    return { kind:'rm', ids, ln };
  }
  if (head === 'note'){
    if (!toks[1]?.q){ errors.push(`${ln}行目: note の後には "文" を書きます`); return null; }
    return { kind:'note', text:toks[1].v, ln };
  }
  if (head === 'notes'){
    if (toks[1]?.v !== 'clear'){ errors.push(`${ln}行目: 画面メモを消すときは notes clear と書きます`); return null; }
    return { kind:'notesclear', ln };
  }
  const el = parseElLine(toks, ln, errors);
  return el ? { kind:'upsert', el, ln } : null;
}
function parseProjectLine(p, toks, ln, errors){
  const head = word(toks[0]), a = toks[1], b = toks[2], c = toks[3];
  const bad = msg => errors.push(`${ln}行目: ${msg}`);
  if (head === 'size'){ const m = /^(\d+)x(\d+)$/.exec(a?.v || ''); if (!m) return bad('size は size 幅x高さ の形で書きます'); p.size = { w:+m[1], h:+m[2] }; return; }
  if (head === 'safe'){
    const nums = toks.slice(1).map(t => t.v).join(',').split(',').filter(x => x !== '').map(Number);
    if (nums.length !== 4 || nums.some(n => !Number.isFinite(n) || n < 0)) return bad('safe は safe 上,右,下,左 の形で書きます（例: safe 47,0,34,0）');
    p.safe = { t:nums[0], r:nums[1], b:nums[2], l:nums[3] }; return;
  }
  if (head === 'url'){ p.url = a?.v || ''; return; }
  if (head === 'context'){ if (!a?.q) return bad('context の後には "文" を書きます'); p._ctx.push(a.v); return; }
  if (head === 'state'){ if (!a || !ID_RE.test(a.v)) return bad('state の後には状態名（英数字）を書きます'); p.states.push({ id:a.v, desc:b?.q ? b.v : '' }); return; }
  if (head === 'type'){
    if (!a || !ID_RE.test(a.v)) return bad('type は type 名前 分類 "説明" の形で書きます');
    const cat = b && !b.q ? b.v : 'box';
    if (!CATS.includes(cat)) return bad(`type の分類は ${CATS.join(' / ')} のどれかです`);
    const nm = (b?.q ? b.v : c?.q ? c.v : '') || a.v;
    p.types.push({ key:a.v, cat, name:nm }); return;
  }
  if (head === 'attr'){ if (!a || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(a.v)) return bad('attr は attr 名前 "意味" の形で書きます'); p.attrs.push({ key:a.v, desc:b?.q ? b.v : '' }); return; }
  bad(`project ブロックでは size / safe / url / state / type / attr / context が使えます（「${head || toks[0].v}」は不明）`);
}

/* Legacy-shaped helper: screens only. */
function parseQL(text){
  const d = parseDoc(text);
  return { screens:d.items.filter(i => i.kind === 'screen').map(i => i.s), errors:d.errors };
}

/* ===== tree ===== */
const area = e => e.w * e.h;
const contains = (p, e) => p.x <= e.x && p.y <= e.y && p.x + p.w >= e.x + e.w && p.y + p.h >= e.y + e.h;
/* Parent = the smallest element that fully contains this one and comes earlier in drawing order.
   Elements with layer="overlay" never get a parent.
   If an earlier overlay contains the element, only that overlay (the last such one) and elements after it are candidates. */
function buildTree(els){
  const parent = new Map(), kids = new Map(els.map(e => [e.uid, []]));
  els.forEach((e, i) => {
    let best = null;
    if (e.attrs.layer !== 'overlay'){
      let from = 0;
      for (let j = i - 1; j >= 0; j--){ if (els[j].attrs.layer === 'overlay' && contains(els[j], e)){ from = j; break; } }
      for (let j = from; j < i; j++){ const p = els[j]; if (contains(p, e) && (!best || area(p) <= area(best))) best = p; }
    }
    parent.set(e.uid, best ? best.uid : null);
    if (best) kids.get(best.uid).push(e);
  });
  return { roots:els.filter(e => !parent.get(e.uid)), kids, parent };
}
function dfs(els){
  const { roots, kids } = buildTree(els), out = [];
  const walk = (e, d) => { out.push({ e, d }); kids.get(e.uid).forEach(c => walk(c, d + 1)); };
  roots.forEach(r => walk(r, 0));
  return out;
}
const normalize = s => { s.els = dfs(s.els).map(r => r.e); };
function subtreeEls(s, u){
  const rows = dfs(s.els); const i = rows.findIndex(r => r.e.uid === u); if (i < 0) return [];
  const out = [rows[i].e]; for (let j = i + 1; j < rows.length && rows[j].d > rows[i].d; j++) out.push(rows[j].e);
  return out;
}

/* ===== serialize ===== */
function attrStr(e){
  let s = '';
  const keys = [...ATTR_KEYS, ...Object.keys(e.attrs).filter(k => !ATTR_KEYS.includes(k))];
  keys.forEach(k => { const v = e.attrs[k]; if (v !== undefined && v !== '') s += ` ${k}=${q(v)}`; });
  return s;
}
const elBody = e => `${e.type} ${e.x},${e.y} ${e.w}x${e.h} ${q(e.label)}${attrStr(e)}`;
const elLine = e => `${e.id} ${elBody(e)}`;
function serializeScreen(s){
  const rows = dfs(s.els);
  const pos = e => `${e.x},${e.y}`, size = e => `${e.w}x${e.h}`;
  const idW = Math.max(2, ...rows.map(r => r.d * 2 + r.e.id.length));
  const tyW = Math.max(4, ...rows.map(r => r.e.type.length));
  const pW = Math.max(3, ...rows.map(r => pos(r.e).length));
  const sW = Math.max(3, ...rows.map(r => size(r.e).length));
  const lines = [`screen ${s.id} ${s.w}x${s.h} ${q(s.title)}`];
  s.notes.forEach(n => lines.push(`note ${q(n)}`));
  rows.forEach(({ e, d }) => {
    const line = ('  '.repeat(d) + e.id).padEnd(idW) + ' ' + e.type.padEnd(tyW) + ' ' + pos(e).padEnd(pW) + ' ' + size(e).padEnd(sW) + ' ' + q(e.label) + attrStr(e);
    lines.push(line.replace(/\s+$/, ''));
  });
  lines.push('end');
  return lines.join('\n');
}
function projectIsEmpty(p){
  return !p || (!p.name && !p.size && !p.url && !p.context && !p.states.length && !p.types.length && !p.attrs.length && !(p.safe.t || p.safe.r || p.safe.b || p.safe.l));
}
function serializeProject(p){
  if (projectIsEmpty(p)) return '';
  const L = [`project ${q(p.name)}`];
  if (p.size) L.push(`size ${p.size.w}x${p.size.h}`);
  if (p.safe.t || p.safe.r || p.safe.b || p.safe.l) L.push(`safe ${p.safe.t},${p.safe.r},${p.safe.b},${p.safe.l}`);
  if (p.url) L.push(`url ${q(p.url)}`);
  p.states.forEach(s => L.push(`state ${s.id}${s.desc ? ' ' + q(s.desc) : ''}`));
  p.types.forEach(t => L.push(`type ${t.key} ${t.cat} ${q(t.name || t.key)}`));
  p.attrs.forEach(a => L.push(`attr ${a.key}${a.desc ? ' ' + q(a.desc) : ''}`));
  (p.context ? p.context.split('\n') : []).forEach(c => L.push(`context ${q(c)}`));
  L.push('end');
  return L.join('\n');
}
const exportText = (list, project) => {
  const parts = [];
  const pt = project ? serializeProject(project) : ''; if (pt) parts.push(pt);
  list.forEach(s => parts.push(serializeScreen(s)));
  return HEADER + '\n' + parts.join('\n\n') + '\n';
};

/* ===== apply parsed text to a state { project, screens } =====
   Everything or nothing: on any error the original state is untouched. */
function applyDoc(state, parsed){
  const screens = clone(state.screens);
  let project = state.project ? clone(state.project) : defaultProject();
  const errors = [], summary = [], touched = new Map(), dropped = [];
  const touch = (s, u) => { if (!touched.has(s.key)) touched.set(s.key, new Set()); if (u) touched.get(s.key).add(u); };
  if (parsed.project){ project = clone(parsed.project); summary.push('プロジェクト設定を更新'); }
  for (const it of parsed.items){
    if (it.kind === 'screen'){
      const g = clone(it.s); const i = screens.findIndex(s => s.id === g.id);
      if (i >= 0){
        const old = screens[i]; g.key = old.key;
        const keep = new Map(old.els.map(e => [e.id, e.uid]));
        g.els.forEach(e => { if (keep.has(e.id)) e.uid = keep.get(e.id); });
        screens[i] = g; summary.push(`${g.id} を置き換え`);
      } else { g.key = newKey(); screens.push(g); summary.push(`${g.id} を追加`); }
      normalize(g); g.els.forEach(e => touch(g, e.uid)); touch(g);
      continue;
    }
    if (it.kind === 'drop'){
      const i = screens.findIndex(s => s.id === it.id);
      if (i < 0){ errors.push(`${it.ln}行目: 削除する画面 ${it.id} がありません`); continue; }
      dropped.push(screens[i].key); screens.splice(i, 1); summary.push(`${it.id} を削除`); continue;
    }
    const s = screens.find(x => x.id === it.id);
    if (!s){ errors.push(`${it.ln}行目: patch の画面 ${it.id} がありません`); continue; }
    touch(s);
    const cnt = { add:0, chg:0, mv:0, rm:0 };
    const need = (id, ln) => { const e = s.els.find(x => x.id === id); if (!e) errors.push(`${ln}行目: ${s.id} に要素 ${id} がありません`); return e; };
    for (const op of it.ops){
      if (op.kind === 'upsert'){
        const ex = s.els.find(x => x.id === op.el.id);
        if (ex){ Object.assign(ex, { type:op.el.type, x:op.el.x, y:op.el.y, w:op.el.w, h:op.el.h, label:op.el.label, attrs:op.el.attrs }); touch(s, ex.uid); cnt.chg++; }
        else { const e = clone(op.el); e.uid = uid(); s.els.push(e); touch(s, e.uid); cnt.add++; }
      } else if (op.kind === 'set'){
        const e = need(op.id, op.ln); if (!e) continue;
        for (const [k, v] of Object.entries(op.kv)){
          if (k === 'id'){ errors.push(`${op.ln}行目: ID は変更できません（${op.id}）`); continue; }
          if (k === 'label'){ e.label = v; continue; }
          if (k === 'type'){ if (!ID_RE.test(v)) errors.push(`${op.ln}行目: type="${v}" は使えません`); else e.type = v; continue; }
          if (['x','y','w','h'].includes(k)){
            const n = Number(v); if (!Number.isInteger(n) || ((k === 'w' || k === 'h') && n < 1)){ errors.push(`${op.ln}行目: ${k}="${v}" は整数で書きます`); continue; }
            e[k] = n; continue;
          }
          if (k === 'pos'){ const m = /^(-?\d+),(-?\d+)$/.exec(v); if (!m){ errors.push(`${op.ln}行目: pos は "x,y" です`); continue; } e.x = +m[1]; e.y = +m[2]; continue; }
          if (k === 'size'){ const m = /^(\d+)x(\d+)$/.exec(v); if (!m){ errors.push(`${op.ln}行目: size は "幅x高さ" です`); continue; } e.w = +m[1]; e.h = +m[2]; continue; }
          if (v === '') delete e.attrs[k]; else e.attrs[k] = k === 'repeat' && /^\d+$/.test(v) ? '1x' + v : v;
        }
        touch(s, e.uid); cnt.chg++;
      } else if (op.kind === 'move'){
        const e = need(op.id, op.ln); if (!e) continue;
        subtreeEls(s, e.uid).forEach(x => { x.x += op.dx; x.y += op.dy; touch(s, x.uid); });
        cnt.mv++;
      } else if (op.kind === 'rm'){
        for (const id of op.ids){
          const e = need(id, op.ln); if (!e) continue;
          const gone = new Set(subtreeEls(s, e.uid).map(x => x.uid));
          s.els = s.els.filter(x => !gone.has(x.uid)); cnt.rm++;
        }
      } else if (op.kind === 'sset'){
        for (const [k, v] of Object.entries(op.kv)){
          if (k === 'title') s.title = v;
          else if (k === 'size'){ const m = /^(\d+)x(\d+)$/.exec(v); if (!m) errors.push(`${op.ln}行目: size は "幅x高さ" です`); else { s.w = +m[1]; s.h = +m[2]; } }
          else errors.push(`${op.ln}行目: set screen で変えられるのは title と size です`);
        }
        cnt.chg++;
      } else if (op.kind === 'note'){ s.notes.push(op.text); cnt.chg++; }
      else if (op.kind === 'notesclear'){ s.notes = []; cnt.chg++; }
    }
    normalize(s);
    const parts = [cnt.add && `追加${cnt.add}`, cnt.chg && `変更${cnt.chg}`, cnt.mv && `移動${cnt.mv}`, cnt.rm && `削除${cnt.rm}`].filter(Boolean);
    summary.push(`${s.id}: ${parts.join('・') || '変更なし'}`);
  }
  if (errors.length) return { ok:false, errors };
  return { ok:true, screens, project, summary, touched, dropped };
}

/* ===== diff: what changed since a baseline, written as QLAYOUT (patch / screen / drop / project) ===== */
function stateFromText(text){
  const d = parseDoc(text);
  return { project:d.project || defaultProject(), screens:d.items.filter(i => i.kind === 'screen').map(i => ({ ...i.s, key:newKey() })) };
}
function screenDiff(b, s){
  const ops = [];
  const kv = [];
  if (b.title !== s.title) kv.push(`title=${q(s.title)}`);
  if (b.w !== s.w || b.h !== s.h) kv.push(`size="${s.w}x${s.h}"`);
  if (kv.length) ops.push(`set screen ${kv.join(' ')}`);
  if (b.notes.join('\n') !== s.notes.join('\n')){
    const appended = b.notes.length < s.notes.length && b.notes.every((n, i) => s.notes[i] === n);
    if (!appended) ops.push('notes clear');
    s.notes.slice(appended ? b.notes.length : 0).forEach(n => ops.push(`note ${q(n)}`));
  }
  const bm = new Map(b.els.map(e => [e.id, e])), cm = new Map(s.els.map(e => [e.id, e]));
  const removed = new Set(b.els.filter(e => !cm.has(e.id)).map(e => e.id));
  const bt = buildTree(b.els); const byU = new Map(b.els.map(e => [e.uid, e]));
  const ancestorRemoved = e => { let p = bt.parent.get(e.uid); while (p){ const pe = byU.get(p); if (removed.has(pe.id)) return true; p = bt.parent.get(p); } return false; };
  const rmRoots = b.els.filter(e => removed.has(e.id) && !ancestorRemoved(e)).map(e => e.id);
  const survivors = new Set(b.els.filter(e => !removed.has(e.id) && ancestorRemoved(e)).map(e => e.id));
  if (rmRoots.length) ops.push('rm ' + rmRoots.join(' '));
  // A whole subtree shifted by the same offset (and otherwise unchanged) is written as one "move".
  const st = buildTree(s.els);
  const subIds = (tree, list, e) => { const out = []; const walk = u => { tree.kids.get(u).forEach(k => { out.push(k.id); walk(k.uid); }); }; walk(e.uid); return out; };
  const moved = new Set();
  dfs(s.els).forEach(({ e }) => {
    if (moved.has(e.id) || survivors.has(e.id)) return;
    const o = bm.get(e.id); if (!o) return;
    const dx = e.x - o.x, dy = e.y - o.y; if (!dx && !dy) return;
    const same = (a, b) => elBody({ ...a, x:a.x + dx, y:a.y + dy }) === elBody(b);
    if (!same(o, e)) return;
    const ci = subIds(st, s.els, e), bi = subIds(bt, b.els, o);
    if (ci.length !== bi.length || ci.some(id => !bi.includes(id))) return;
    if (!ci.every(id => { const cx = s.els.find(x => x.id === id), bx = bm.get(id); return cx && bx && same(bx, cx); })) return;
    ops.push(`move ${e.id} ${dx},${dy}`); moved.add(e.id); ci.forEach(id => moved.add(id));
  });
  const changed = dfs(s.els).map(r => r.e).filter(e => !moved.has(e.id) && (!bm.has(e.id) || elBody(bm.get(e.id)) !== elBody(e) || survivors.has(e.id)));
  changed.forEach(e => ops.push(elLine(e)));
  if (!ops.length) return null;
  if (s.els.length >= 6 && changed.length + removed.size > s.els.length * 0.6) return serializeScreen(s);
  return [`patch ${s.id}`, ...ops.map(o => '  ' + o), 'end'].join('\n');
}
function diffText(base, cur){
  const out = [];
  const bp = serializeProject(base.project), cp = serializeProject(cur.project);
  if (bp !== cp) out.push(cp || 'project ""\nend');
  const bmap = new Map(base.screens.map(s => [s.id, s]));
  cur.screens.forEach(s => { const b = bmap.get(s.id); if (!b) out.push(serializeScreen(s)); else { const d = screenDiff(b, s); if (d) out.push(d); } });
  const cids = new Set(cur.screens.map(s => s.id));
  const drops = base.screens.filter(b => !cids.has(b.id)).map(b => b.id);
  if (drops.length) out.push('drop ' + drops.join(' '));
  return out;
}

/* ===== attributes for adaptation ===== */
const AX = { left:'left', right:'right', center:'center', middle:'center', stretch:'stretch', fill:'stretch' };
const AY = { top:'top', bottom:'bottom', center:'center', middle:'center', stretch:'stretch', fill:'stretch' };
function parseAnchor(v){
  if (!v) return { x:'left', y:'top', ok:true };
  const w = String(v).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (w.length === 2 && AX[w[0]] && AY[w[1]]) return { x:AX[w[0]], y:AY[w[1]], ok:true };
  if (w.length === 2 && AY[w[0]] && AX[w[1]] && !AX[w[0]]) return { x:AX[w[1]], y:AY[w[0]], ok:true };
  if (w.length === 1){
    const t = w[0];
    if (t === 'left' || t === 'right') return { x:t, y:'top', ok:true };
    if (t === 'top' || t === 'bottom') return { x:'left', y:t, ok:true };
    if (AX[t]) return { x:AX[t], y:AY[t], ok:true };
  }
  return { x:'left', y:'top', ok:false };
}
function parseLayout(v){
  if (!v) return null;
  const w = String(v).trim().split(/\s+/); const dir = w[0];
  if (!['row','column','grid'].includes(dir)) return { ok:false };
  const o = { ok:true, dir, gap:0, cols:0, align:'', justify:'' };
  w.slice(1).forEach(t => { const m = /^(\w+)=(.+)$/.exec(t); if (!m) return; if (m[1] === 'gap' || m[1] === 'cols') o[m[1]] = Math.max(0, parseInt(m[2], 10) || 0); else if (m[1] === 'align' || m[1] === 'justify') o[m[1]] = m[2]; });
  return o;
}
const parseRepeat = v => { const m = /^(\d+)x(\d+)$/.exec(v || ''); return m ? { c:+m[1], r:+m[2] } : null; };

/* Guess layout="..." from how the children sit inside a parent. */
function inferLayout(p, kids){
  if (kids.length < 2) return null;
  const T = 4, med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const tryAxis = dir => {
    const k = [...kids].sort((a, b) => dir === 'row' ? a.x - b.x : a.y - b.y);
    const gaps = [];
    for (let i = 1; i < k.length; i++){ const g = dir === 'row' ? k[i].x - (k[i-1].x + k[i-1].w) : k[i].y - (k[i-1].y + k[i-1].h); if (g < 0) return null; gaps.push(g); }
    const gap = med(gaps); if (gaps.some(g => Math.abs(g - gap) > T)) return null;
    const near = (f) => { const v = k.map(f); return Math.max(...v) - Math.min(...v) <= T; };
    let align = '';
    if (dir === 'row'){ if (near(e => e.y) && near(e => e.h) && Math.abs(k[0].h - (p.h - 2 * (k[0].y - p.y))) <= T) align = 'stretch'; else if (near(e => e.y)) align = 'start'; else if (near(e => e.y + e.h / 2)) align = 'center'; else if (near(e => e.y + e.h)) align = 'end'; else return null; }
    else { if (near(e => e.x) && near(e => e.w) && Math.abs(k[0].w - (p.w - 2 * (k[0].x - p.x))) <= T) align = 'stretch'; else if (near(e => e.x)) align = 'start'; else if (near(e => e.x + e.w / 2)) align = 'center'; else if (near(e => e.x + e.w)) align = 'end'; else return null; }
    return `${dir} gap=${gap}${align && align !== 'start' ? ' align=' + align : ''}`;
  };
  return tryAxis('column') || tryAxis('row');
}
/* Guess anchor="x y" from where the element sits inside its parent box. */
function inferAnchor(e, p){
  const T = 4, l = e.x - p.x, r = p.x + p.w - (e.x + e.w), t = e.y - p.y, b = p.y + p.h - (e.y + e.h);
  const ax = (e.w >= p.w * 0.85 && Math.abs(l - r) <= T) ? 'stretch' : Math.abs(l - r) <= T ? 'center' : r < l ? 'right' : 'left';
  const ay = (e.h >= p.h * 0.85 && Math.abs(t - b) <= T) ? 'stretch' : b < t && b < p.h * 0.25 ? 'bottom' : 'top';
  return `${ax} ${ay}`;
}

/* ===== behavior: where "on" leads ===== */
const TARGET_WORDS = new Set(['back','close','prev','next','none','self','home','exit','open','toggle','show','hide']);
function onTargets(on){
  const out = []; let armed = false;
  String(on || '').split(/\s+\/\s+|\/(?=\s*[A-Za-z])|\n/).forEach(seg => {
    let tgt = null;
    const m = /(?:→|->|=>)\s*(.*)$/.exec(seg);
    if (m){ tgt = m[1]; armed = true; } else if (armed && !/:/.test(seg)) tgt = seg;
    else armed = false;
    if (tgt === null) return;
    const re = /[A-Za-z][A-Za-z0-9_]*(?!\s*\()/g; let x;
    while ((x = re.exec(tgt))){ const before = tgt[x.index - 1]; if (before && /[A-Za-z0-9_.]/.test(before)) continue; if (!out.includes(x[0])) out.push(x[0]); }
  });
  return out;
}
function classifyTarget(t, s, screens, project){
  if (screens.some(x => x.id === t)) return 'screen';
  if (project?.states?.some(x => x.id === t)) return 'state';
  if (s.els.some(e => e.id === t)) return 'element';
  if (TARGET_WORDS.has(t.toLowerCase())) return 'word';
  return 'unknown';
}
function transitions(screens, project){
  const edges = [];
  screens.forEach(s => s.els.forEach(e => onTargets(e.attrs.on).forEach(t => {
    const kind = classifyTarget(t, s, screens, project);
    if (kind === 'screen' || kind === 'state' || kind === 'unknown') edges.push({ from:s.id, to:t, kind, via:e.id });
  })));
  return edges;
}

/* ===== checks ===== */
function lintScreen(s, screens, project){
  const out = [], add = (sev, e, msg) => out.push({ sev, uid:e ? e.uid : null, id:e ? e.id : null, msg });
  const { parent, kids } = buildTree(s.els); const byU = new Map(s.els.map(e => [e.uid, e]));
  const ovRoot = e => { let u = e.uid; while (u){ const x = byU.get(u); if (x.attrs.layer === 'overlay') return u; u = parent.get(u); } return null; };
  const isAnc = (a, b) => { let u = parent.get(b.uid); while (u){ if (u === a.uid) return true; u = parent.get(u); } return false; };
  const sf = project?.safe, useSafe = sf && project.size && project.size.w === s.w && project.size.h === s.h && (sf.t || sf.r || sf.b || sf.l);
  const typeOk = t => !!typeInfo(t, project);
  s.els.forEach(e => {
    if (e.x < 0 || e.y < 0 || e.x + e.w > s.w || e.y + e.h > s.h) add('err', e, `画面の外にはみ出しています（${e.x},${e.y} ${e.w}x${e.h}）`);
    if (e.w < 8 || e.h < 8) add('info', e, `とても小さい要素です（${e.w}x${e.h}）`);
    if (useSafe && !['frame','spacer','image','canvas'].includes(e.type)){
      const hits = [];
      if (sf.t && e.y < sf.t) hits.push(`上${sf.t}px`);
      if (sf.b && e.y + e.h > s.h - sf.b) hits.push(`下${sf.b}px`);
      if (sf.l && e.x < sf.l) hits.push(`左${sf.l}px`);
      if (sf.r && e.x + e.w > s.w - sf.r) hits.push(`右${sf.r}px`);
      if (hits.length) add('warn', e, `安全領域（${hits.join('・')}）に入っています`);
    }
    if (!typeOk(e.type)) add('info', e, `未登録の種類「${e.type}」です（プロジェクト設定で登録できます）`);
    if (e.attrs.repeat && !parseRepeat(e.attrs.repeat)) add('warn', e, `repeat="${e.attrs.repeat}" は 列x行 の形で書きます`);
    if (e.attrs.anchor && !parseAnchor(e.attrs.anchor).ok) add('warn', e, `anchor="${e.attrs.anchor}" を解釈できません（例: "stretch top"）`);
    if (e.attrs.layout && parseLayout(e.attrs.layout)?.ok === false) add('warn', e, `layout="${e.attrs.layout}" を解釈できません（例: "column gap=8"）`);
    if (['list','table','grid','gauge','timer'].includes(e.type) && !e.attrs.bind) add('info', e, '表示データ bind が未設定です');
    onTargets(e.attrs.on).forEach(t => { if (classifyTarget(t, s, screens, project) === 'unknown') add('warn', e, `遷移先 ${t} が画面にも状態にもありません`); });
  });
  for (let i = 0; i < s.els.length; i++) for (let j = i + 1; j < s.els.length; j++){
    const a = s.els[i], b = s.els[j];
    if (ovRoot(a) !== ovRoot(b) || contains(a, b) || contains(b, a) || isAnc(a, b) || isAnc(b, a)) continue;
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 0 && iy > 0) add('warn', b, `${a.id} と ${b.id} が部分的に重なっています`);
  }
  const groups = [null, ...s.els.map(e => e.uid)];
  groups.forEach(g => {
    const sib = g === null ? s.els.filter(e => !parent.get(e.uid)) : (kids.get(g) || []);
    for (let i = 0; i < sib.length; i++) for (let j = i + 1; j < sib.length; j++){
      const a = sib[i], b = sib[j]; if (a.type !== b.type) continue;
      const dw = Math.abs(a.w - b.w), dh = Math.abs(a.h - b.h);
      if ((dw >= 1 && dw <= 7 && dh <= 7) || (dh >= 1 && dh <= 7 && dw <= 7)) add('info', b, `${a.id} と ${b.id} は同じ種類で大きさが少し違います（${a.w}x${a.h} / ${b.w}x${b.h}）`);
    }
  });
  const targeted = new Set(); s.els.forEach(e => onTargets(e.attrs.on).forEach(t => targeted.add(t)));
  s.els.filter(e => e.attrs.layer === 'overlay').forEach(e => { if (!e.attrs.show && !targeted.has(e.id)) add('warn', e, `${e.id} を開く操作がありません（show も、ここを指す on もありません）`); });
  const rank = { err:0, warn:1, info:2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

/* ===== code generation ===== */
function htmlEsc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
function relBox(e, p){ return { x:e.x - p.x, y:e.y - p.y, w:e.w, h:e.h }; }
function anchorCss(e, p){
  const a = parseAnchor(e.attrs.anchor), r = relBox(e, p), css = [], tf = [];
  if (a.x === 'left') css.push(`left:${r.x}px`, `width:${r.w}px`);
  else if (a.x === 'right') css.push(`right:${p.w - r.x - r.w}px`, `width:${r.w}px`);
  else if (a.x === 'stretch') css.push(`left:${r.x}px`, `right:${p.w - r.x - r.w}px`);
  else { const off = r.x + r.w / 2 - p.w / 2; css.push(`left:calc(50% + ${off}px)`, `width:${r.w}px`); tf.push('translateX(-50%)'); }
  if (a.y === 'top') css.push(`top:${r.y}px`, `height:${r.h}px`);
  else if (a.y === 'bottom') css.push(`bottom:${p.h - r.y - r.h}px`, `height:${r.h}px`);
  else if (a.y === 'stretch') css.push(`top:${r.y}px`, `bottom:${p.h - r.y - r.h}px`);
  else { const off = r.y + r.h / 2 - p.h / 2; css.push(`top:calc(50% + ${off}px)`, `height:${r.h}px`); tf.push('translateY(-50%)'); }
  if (tf.length) css.push(`transform:${tf.join(' ')}`);
  return css;
}
function genHTML(list, project){
  const css = [
    '*{box-sizing:border-box}',
    'body{margin:0;padding:24px;background:#e9edf1;font:14px system-ui,sans-serif;color:#1b2430;display:flex;flex-direction:column;gap:32px;align-items:flex-start}',
    'h2.ql-title{font-size:13px;font-weight:600;margin:0 0 6px}',
    '.ql-screen{position:relative;overflow:hidden;background:#fff;box-shadow:0 0 0 1px #c9d1d9}',
    '.ql-screen [data-id]{outline:1px dashed rgba(30,96,145,.35);outline-offset:-1px;font:inherit;color:inherit;margin:0}',
    '.ql-screen button{background:#eef3f7;border:1px solid #9fb2c3;border-radius:6px}',
    '.ql-screen ul{list-style:none;padding:0}',
    '.ql-screen .ql-cell{display:grid;place-items:center;border:1px solid #d5dde4}',
    '.ql-screen [role=dialog]{background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:10}',
    '.ql-screen .ql-img{display:grid;place-items:center;background:#e3e8ed;color:#5b6b7b}',
    '.ql-safe{position:absolute;left:0;right:0;background:repeating-linear-gradient(45deg,rgba(200,60,60,.08) 0 6px,transparent 6px 12px);pointer-events:none}'
  ];
  const body = [];
  list.forEach(s => {
    const sid = 'scr-' + s.id, { roots, kids } = buildTree(s.els);
    const sel = e => `#${sid} .e-${e.id}`;
    css.push(`/* ===== ${s.id} ${s.title} ===== */`, `#${sid}{width:${s.w}px;height:${s.h}px}`);
    const lines = [`<section>`, `  <h2 class="ql-title">${htmlEsc(s.id)} — ${htmlEsc(s.title)}</h2>`, `  <div class="ql-screen" id="${sid}">`];
    s.notes.forEach(n => lines.push(`    <!-- note: ${htmlEsc(n).replace(/--/g, '- -')} -->`));
    const emit = (e, p, pl, d) => {
      const ind = '    ' + '  '.repeat(d), ch = kids.get(e.uid), rep = parseRepeat(e.attrs.repeat), lay = parseLayout(e.attrs.layout);
      const rules = [];
      if (pl && pl.ok){
        const a = parseAnchor(e.attrs.anchor), main = pl.dir === 'row' ? 'x' : 'y';
        rules.push('position:relative', 'flex:none');
        if (pl.dir === 'grid'){ rules.push(`min-height:${e.h}px`); }
        else {
          if (a[main] === 'stretch') rules.push('flex:1 1 0'); else rules.push(main === 'x' ? `width:${e.w}px` : `height:${e.h}px`);
          const cross = main === 'x' ? 'y' : 'x';
          if (a[cross] === 'stretch') rules.push('align-self:stretch'); else rules.push(cross === 'x' ? `width:${e.w}px` : `height:${e.h}px`);
        }
      } else { rules.push('position:absolute', ...anchorCss(e, p)); }
      if (lay && lay.ok && ch.length){
        const minX = Math.min(...ch.map(c => c.x)), minY = Math.min(...ch.map(c => c.y)), maxX = Math.max(...ch.map(c => c.x + c.w)), maxY = Math.max(...ch.map(c => c.y + c.h));
        rules.push(`padding:${minY - e.y}px ${e.x + e.w - maxX}px ${e.y + e.h - maxY}px ${minX - e.x}px`);
        if (lay.dir === 'grid') rules.push('display:grid', `grid-template-columns:repeat(${lay.cols || 2},1fr)`);
        else rules.push('display:flex', `flex-direction:${lay.dir}`);
        if (lay.gap) rules.push(`gap:${lay.gap}px`);
        const map = { start:'flex-start', end:'flex-end', center:'center', stretch:'stretch', between:'space-between' };
        if (lay.align) rules.push(`align-items:${map[lay.align] || lay.align}`);
        if (lay.justify) rules.push(`justify-content:${map[lay.justify] || lay.justify}`);
      }
      if (rep) rules.push('display:grid', `grid-template-columns:repeat(${rep.c},1fr)`, `grid-template-rows:repeat(${rep.r},1fr)`, 'gap:8px');
      if (e.attrs.scroll) rules.push(e.attrs.scroll === 'x' ? 'overflow-x:auto' : 'overflow-y:auto');
      if (e.attrs.layer === 'overlay') rules.push('z-index:10');
      css.push(`${sel(e)}{${rules.join(';')}}`);
      const data = [`data-id="${e.id}"`]; ['bind','on','show'].forEach(k => { if (e.attrs[k]) data.push(`data-${k}="${htmlEsc(e.attrs[k])}"`); });
      Object.keys(e.attrs).filter(k => !ATTR_KEYS.includes(k)).forEach(k => data.push(`data-${k}="${htmlEsc(e.attrs[k])}"`));
      const cls = `class="e-${e.id}"`, L = htmlEsc(e.label), A = `${cls} ${data.join(' ')}`;
      const cmt = e.attrs.note ? `${ind}<!-- ${e.id}: ${htmlEsc(e.attrs.note).replace(/--/g, '- -')} -->` : null;
      if (cmt) lines.push(cmt);
      if (rep){
        const n = Math.min(rep.c * rep.r, 200), cellTag = e.type === 'list' ? 'li' : (e.attrs.on || e.type === 'tabs') ? 'button' : 'div';
        const tag = e.type === 'list' ? 'ul' : 'div', role = e.type === 'tabs' ? ' role="tablist"' : '';
        const cells = Array.from({ length:n }, (_, i) => `${ind}  <${cellTag} class="ql-cell"${cellTag === 'button' ? ' type="button"' : ''}${e.type === 'tabs' ? ' role="tab"' : ''}>${L} ${i + 1}</${cellTag}>`);
        lines.push(`${ind}<${tag} ${A}${role} aria-label="${L}">`, ...cells, `${ind}</${tag}>`);
        return;
      }
      if (ch.length || ['frame','spacer','dialog'].includes(e.type)){
        const role = e.type === 'dialog' || e.attrs.layer === 'overlay' ? ' role="dialog"' : '';
        lines.push(`${ind}<div ${A}${role} aria-label="${L}">`);
        ch.forEach(c => emit(c, e, lay && lay.ok ? lay : null, d + 1));
        lines.push(`${ind}</div>`);
        return;
      }
      const one = {
        button:`<button type="button" ${A}>${L}</button>`,
        input:`<input ${A} placeholder="${L}">`,
        select:`<select ${A} aria-label="${L}"><option>${L}</option></select>`,
        check:`<label ${A}><input type="checkbox"> ${L}</label>`,
        slider:`<input type="range" ${A} aria-label="${L}">`,
        tabs:`<div ${A} role="tablist"><button type="button" role="tab">${L}</button></div>`,
        label:`<div ${A}>${L}</div>`,
        text:`<p ${A}>${L}</p>`,
        image:`<div class="e-${e.id} ql-img" ${data.join(' ')} role="img" aria-label="${L}">${L}</div>`,
        icon:`<span ${A} role="img" aria-label="${L}">◆</span>`,
        canvas:`<canvas ${A} width="${e.w}" height="${e.h}" aria-label="${L}"></canvas>`,
        list:`<ul ${A} aria-label="${L}"><li>${L}</li></ul>`,
        table:`<table ${A}><caption>${L}</caption></table>`,
        grid:`<div ${A} aria-label="${L}">${L}</div>`,
        timer:`<span ${A}>${L}</span>`,
        gauge:`<progress ${A} max="100" value="60" aria-label="${L}"></progress>`
      }[e.type] || `<div ${A}>${L}</div>`;
      lines.push(ind + one);
    };
    roots.forEach(r => emit(r, { x:0, y:0, w:s.w, h:s.h }, null, 0));
    const sf = project?.safe;
    if (project?.size && project.size.w === s.w && project.size.h === s.h && sf){
      if (sf.t) lines.push(`    <div class="ql-safe" style="top:0;height:${sf.t}px"></div>`);
      if (sf.b) lines.push(`    <div class="ql-safe" style="bottom:0;height:${sf.b}px"></div>`);
    }
    lines.push('  </div>', '</section>');
    body.push(lines.join('\n'));
  });
  const name = project?.name || 'QLAYOUT';
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${htmlEsc(name)} — 画面の骨組み</title>\n<!-- QLAYOUT から自動生成。data-bind / data-on / data-show は設計時の指定をそのまま残しています。 -->\n<style>\n${css.join('\n')}\n</style>\n</head>\n<body>\n${body.join('\n\n')}\n</body>\n</html>\n`;
}
function genJSON(list, project){
  const node = (e, p, kids) => {
    const a = parseAnchor(e.attrs.anchor), r = relBox(e, p);
    const ax = { left:[0,0], right:[1,1], center:[.5,.5], stretch:[0,1] }[a.x];
    const ayU = { top:[1,1], bottom:[0,0], center:[.5,.5], stretch:[0,1] }[a.y];   // Unity: y grows upward
    const ayG = { top:[0,0], bottom:[1,1], center:[.5,.5], stretch:[0,1] }[a.y];   // Godot: y grows downward
    const left = r.x, right = r.x + r.w, topU = p.h - r.y, bottomU = p.h - r.y - r.h;
    const o = {
      id:e.id, type:e.type, label:e.label, attrs:e.attrs,
      rect:r, abs:{ x:e.x, y:e.y, w:e.w, h:e.h }, anchor:{ x:a.x, y:a.y },
      unity:{ anchorMin:[ax[0], ayU[0]], anchorMax:[ax[1], ayU[1]], pivot:[.5,.5],
        offsetMin:[left - ax[0] * p.w, bottomU - ayU[0] * p.h], offsetMax:[right - ax[1] * p.w, topU - ayU[1] * p.h] },
      godot:{ anchor_left:ax[0], anchor_top:ayG[0], anchor_right:ax[1], anchor_bottom:ayG[1],
        offset_left:left - ax[0] * p.w, offset_top:r.y - ayG[0] * p.h, offset_right:right - ax[1] * p.w, offset_bottom:r.y + r.h - ayG[1] * p.h }
    };
    const rep = parseRepeat(e.attrs.repeat); if (rep) o.repeat = { cols:rep.c, rows:rep.r };
    const lay = parseLayout(e.attrs.layout); if (lay && lay.ok){ const { ok, ...rest } = lay; o.layout = rest; }
    const ch = kids.get(e.uid); if (ch.length) o.children = ch.map(c => node(c, e, kids));
    return o;
  };
  return JSON.stringify({
    format:'QLAYOUT-JSON 1',
    note:'rect は親からの相対座標（左上原点）。unity は RectTransform（pivot 0.5）に、godot は Control の anchor / offset にそのまま入れられる値。',
    project:project ? { name:project.name, size:project.size, safe:project.safe } : null,
    screens:list.map(s => { const { roots, kids } = buildTree(s.els); return { id:s.id, title:s.title, width:s.w, height:s.h, notes:s.notes, elements:roots.map(r => node(r, { x:0, y:0, w:s.w, h:s.h }, kids)) }; })
  }, null, 2) + '\n';
}

/* ===== short grammar for the LLM (sent with exports instead of the long guide) ===== */
const PRIMER = `# QLAYOUT 1 — screen layout as text. Lines starting with # are comments.
# screen <ID> <W>x<H> "<title>" … end   |  note "<text>" = screen note
# <ID> <type> <x>,<y> <w>x<h> "<label>" key="value"…
#  - x,y are ABSOLUTE design px from the screen's top-left (never parent-relative). Line order = draw order.
#  - Indent = nesting, derived from geometry: parent = smallest earlier element that fully contains it.
#    layer="overlay" elements are always top level; elements inside an earlier overlay belong to it.
#  - label names the part's role, not final wording. Not encoded: colors, fonts, animation.
# types: frame spacer | label text image icon canvas | button input select check slider tabs | list table grid timer gauge | dialog (+project types)
# attrs: repeat="CxR" equal cells, label/bind/on describe one cell | layer="overlay" | show=<condition> | bind=<data>
#  on="<event>: <action> → <target>" (several joined by " / "; target = screen ID, project state, or element ID here)
#  anchor="<left|right|center|stretch> <top|bottom|center|stretch>" vs parent (default left top) | scroll="x|y"
#  layout="row|column|grid [cols=N] gap=N [align=start|center|end|stretch] [justify=…]" lays out children | note
# project … end: size WxH (baseline) / safe T,R,B,L (keep empty) / state ID "…" / type key cat "…" / attr key "…" / context "…"
# TO EDIT, reply with patch blocks only (not whole screens):
# patch <ScreenID>
#   <element line>                 add, or replace the element with that ID
#   set <ID> label="…" x=8 w=120 bind="…"   change fields (also pos="x,y" size="WxH"); key="" removes an attr
#   move <ID> <dx>,<dy>            shift with its children   |  rm <ID> …  delete with children
#   set screen title="…" size="WxH" | note "…" (append) | notes clear
# end
# New screen: a full screen…end block. Delete a screen: drop <ScreenID>.
# Rules: stay inside the screen and safe area; use multiples of 8; never rename IDs.
#  New IDs: top level A,B,…Z,AA; child of A → A1,A2; child of A1 → A1a,A1b.
# "# check:" lines are the tool's own findings; act on them only if asked.`;

const tokenEstimate = s => { let a = 0, j = 0; for (const ch of s){ if (ch.charCodeAt(0) < 128) a++; else j++; } return Math.round(a / 3.6 + j * 1.1); };

/* (tool's CommonJS export line removed here; ESM exports are at the end of this file) */
/* ===== end of QLAYOUT core ===== */

/* ESM exports (added by the game; the block above is copied verbatim from the layout tool so both parse identically) */
export { parseDoc, applyDoc, serializeScreen, serializeProject, exportText, lintScreen, buildTree, dfs, onTargets, parseAnchor, parseLayout, defaultProject };
