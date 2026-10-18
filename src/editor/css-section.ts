import { ed, touched } from './state.ts';
import { h, button, clear, toast, modal, debounce } from './ui.ts';
import { CSS_PARTS, CSS_RULES, cssHeader, cssStarter, stripHeader, lintCss, partSnippet, llmPrompt, type CssIssue } from '../engine/css-guide.ts';
import { playtest } from './playtest.ts';

/* ===== CSS: the active pack's stylesheet, with rules, a parts reference, import / export ===== */

const FILE = 'styles/custom.css';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/css' }));
  const a = h('a', { href: url, download: name }) as HTMLAnchorElement;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function cssSection(): HTMLElement {
  const pm = ed.project.pack;
  const packName = pm.manifest.name || pm.id;
  const own = () => pm.styles[0];
  const editor = h('textarea', { class: 'mono code css-edit', spellcheck: false, rows: 28, 'aria-label': 'このパックの CSS' }) as HTMLTextAreaElement;
  const issuesBox = h('div', { class: 'css-issues' });

  const store = () => {
    const st = own(); if (!st) return;
    st.text = cssHeader(packName) + '\n' + editor.value.replace(/^\s*\n/, '');
    touched();
  };
  const showIssues = (list: CssIssue[]) => {
    clear(issuesBox);
    if (!list.length) { issuesBox.appendChild(h('p', { class: 'ok-line' }, 'ルール違反はありません')); return; }
    for (const i of list) issuesBox.appendChild(h('button', { type: 'button', class: `css-issue ${i.sev}`, on: { click: () => goLine(i.line) } },
      h('span', { class: `sev ${i.sev}` }, i.sev === 'error' ? 'エラー' : '注意'), h('span', { class: 'mono' }, `${i.line}行`), h('span', null, i.msg)));
  };
  const lint = debounce(() => showIssues(lintCss(editor.value)), 250);
  const goLine = (n: number) => {
    const lines = editor.value.split('\n');
    const pos = lines.slice(0, Math.max(0, n - 1)).reduce((s, l) => s + l.length + 1, 0);
    editor.focus(); editor.setSelectionRange(pos, pos + (lines[n - 1]?.length ?? 0));
    editor.scrollTop = Math.max(0, (n - 4) * 18);
  };
  const insertAtCaret = (text: string) => {
    const a = editor.selectionStart ?? editor.value.length, b = editor.selectionEnd ?? a;
    const before = editor.value.slice(0, a), sep = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    editor.setRangeText(sep + text, a, b, 'end');
    store(); lint(); editor.focus();
  };
  editor.addEventListener('input', () => { store(); lint(); });
  editor.addEventListener('keydown', ev => {
    if (ev.key === 'Tab' && !ev.shiftKey) { ev.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); store(); }
  });

  const fileIn = h('input', { type: 'file', accept: '.css,text/css', hidden: true, on: { change: async () => {
    const f = fileIn.files?.[0]; fileIn.value = ''; if (!f) return;
    const body = stripHeader(await f.text());
    const n = lintCss(body);
    const errs = n.filter(x => x.sev === 'error').length, warns = n.length - errs;
    const how = await modal(`「${f.name}」を読み込む`, h('div', null,
      h('p', null, `ルールの確認: エラー ${errs} 件・注意 ${warns} 件${errs ? '（読み込んだ後、下の一覧から直せます）' : ''}`),
      h('p', { class: 'help' }, '冒頭の説明コメントは自動で取り除きます。')),
      [['やめる', null], ['後ろに足す', 'append'], ['置き換える', 'replace', 'primary']]);
    if (!how) return;
    ensureFile();
    editor.value = how === 'replace' ? body : `${editor.value.trimEnd()}\n\n${body}`;
    store(); lint(); toast('CSS を読み込みました', 'ok');
  } } }) as HTMLInputElement;

  const ensureFile = () => {
    if (own()) return;
    pm.styles.push({ file: FILE, text: cssHeader(packName) });
    pm.manifest.styles = pm.styles.map(x => x.file);
    touched();
  };

  const askLlm = async () => {
    const wish = h('textarea', { rows: 4, placeholder: '例: 全体を青白い月明かりの色に。ボタンは角を丸くしすぎず、金色の細い枠に。' }) as HTMLTextAreaElement;
    const ok = await modal('LLM への依頼文を作る', h('div', { class: 'llm-ask' },
      h('p', null, 'ルール・部品の説明・今の CSS をまとめた依頼文をコピーします。Claude などに貼り付けて、返ってきた CSS を「読み込む」で戻してください。'),
      h('label', null, 'どう変えたいか'), wish), [['やめる', null], ['コピー', 'y', 'primary']]);
    if (!ok) return;
    const text = llmPrompt(packName, editor.value, wish.value.trim());
    if (await copy(text)) toast('依頼文をコピーしました', 'ok');
    else { download(`${pm.id}-css-request.md`, text); toast('コピーできなかったのでファイルにしました', 'ok'); }
  };

  // parts reference
  const ref = h('div', { class: 'css-ref' });
  let group = '';
  for (const p of CSS_PARTS) {
    if (p.group !== group) { group = p.group; ref.appendChild(h('h4', null, group)); }
    ref.appendChild(h('div', { class: 'css-part' },
      h('div', { class: 'css-part-head' }, h('b', null, p.title), button('挿入', () => { ensureFile(); insertAtCaret(partSnippet(p)); }, 'sm', { title: 'カーソルの位置に、説明つきのひな形を入れる' })),
      h('code', null, p.selector), h('p', null, p.desc)));
  }
  const rules = h('details', { class: 'css-rules', open: true }, h('summary', null, '守るルール'),
    h('ul', null, CSS_RULES.map(r => h('li', { class: r.sev }, h('b', null, `${r.sev === 'error' ? '必ず' : 'なるべく'}: ${r.title}`), h('p', null, r.text)))));

  // read-only stylesheets of earlier packs
  const others = [...ed.project.packs.values()].filter(x => x !== pm && x.styles.length);
  const otherBox = others.length ? h('details', { class: 'css-others' }, h('summary', null, `ほかのパックの CSS（${others.length}）`),
    others.flatMap(o => o.styles.map(st => h('div', null, h('code', null, `${o.id}/${st.file}`), h('pre', { class: 'mono' }, stripHeader(st.text).slice(0, 4000)))))) : null;

  const body = h('div', { class: 'css-page' });
  const drawEditor = () => {
    clear(body);
    if (!own()) {
      body.appendChild(h('div', { class: 'box' },
        h('p', null, 'このパックにはまだ CSS がありません。作ると、部品ごとに説明がついたひな形から始められます。'),
        h('div', { class: 'btnrow' },
          button('説明つきのひな形で作る', () => { pm.styles.push({ file: FILE, text: cssStarter(packName) }); pm.manifest.styles = pm.styles.map(x => x.file); touched(); drawEditor(); }, 'primary sm'),
          button('空で作る', () => { ensureFile(); drawEditor(); }, 'sm'))));
      return;
    }
    editor.value = stripHeader(own()!.text);
    body.append(
      h('div', { class: 'css-main' },
        h('div', { class: 'css-left' }, h('p', { class: 'help' }, `${pm.id}/${own()!.file} — 冒頭の説明（ルール）は保存・書き出しの時に自動で付きます。`), editor, h('h4', null, 'ルールの確認'), issuesBox),
        h('div', { class: 'css-right' }, rules, h('h4', null, '部品の一覧'), ref)),
      otherBox ?? '');
    showIssues(lintCss(editor.value));
  };
  drawEditor();

  return h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h2', null, 'CSS'),
      h('p', null, '色とフォント（見た目）や画像の枠（UIスキン）で足りない所を CSS で変えます。ゲームの組み込みの CSS の後に読まれます。ルールに反する書き方はここと「検証」に出ます。')),
    h('div', { class: 'btnrow css-tools' },
      button('読み込む…', () => fileIn.click(), 'sm'), fileIn,
      button('書き出す', () => { if (!own()) return toast('まだ CSS がありません', 'err'); download(`${pm.id}-custom.css`, cssHeader(packName) + '\n' + editor.value); }, 'sm'),
      button('説明つきのひな形を書き出す', () => download(`${pm.id}-css-starter.css`, cssStarter(packName)), 'sm'),
      button('LLM への依頼文をコピー', () => askLlm(), 'sm'),
      button('▶ プレイテストで見る', () => playtest({ screen: 'TITLE' }), 'primary sm')),
    body);
}
