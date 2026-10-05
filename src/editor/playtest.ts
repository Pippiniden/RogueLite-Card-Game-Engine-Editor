import { ed } from './state.ts';
import { h, button, clear, select } from './ui.ts';
import type { PlayStart } from '../game/main.ts';

/* Play test: the real game in a phone-sized frame, fed the files being edited (unsaved edits included). */

let panel: HTMLElement | null = null;
let frameBox: HTMLElement | null = null;
let last: PlayStart | undefined;
let statusEl: HTMLElement | null = null;
let listener: ((ev: MessageEvent) => void) | null = null;
const W = 390, H = 844;

/** fit the 390×844 frame into the panel (CSS cannot divide lengths portably) */
function fit() {
  const hold = frameBox?.querySelector<HTMLElement>(".pt-hold"), f = hold?.firstElementChild as HTMLElement | null;
  if (!frameBox || !hold || !f) return;
  const k = Math.min(1, (frameBox.clientWidth - 36) / W, (frameBox.clientHeight - 36) / H);
  f.style.transform = `scale(${k})`;
  Object.assign(hold.style, { width: `${W * k}px`, height: `${H * k}px` });
}

function ensurePanel(): HTMLElement {
  if (panel) return panel;
  frameBox = h('div', { class: 'phone' });
  statusEl = h('span', { class: 'pt-status' });
  panel = h('aside', { class: 'playtest', 'aria-label': 'プレイテスト' },
    h('div', { class: 'pt-bar' },
      h('b', null, 'プレイテスト'),
      statusEl,
      h('span', { class: 'pt-tools' },
        button('タイトルから', () => playtest({ screen: 'TITLE' }), 'sm'),
        button('同じ条件でもう一度', () => playtest(last), 'sm'),
        button('閉じる', () => { panel!.hidden = true; clear(frameBox!); document.body.classList.remove('pt-open'); }, 'sm'))),
    frameBox);
  document.body.appendChild(panel);
  new ResizeObserver(fit).observe(frameBox);
  return panel;
}

export function playtest(start?: PlayStart) {
  last = start;
  const p = ensurePanel();
  p.hidden = false;
  document.body.classList.add('pt-open');
  const iframe = h('iframe', { src: `${import.meta.env.BASE_URL}index.html#embed`, title: 'ゲーム', class: 'pt-frame' }) as HTMLIFrameElement;
  clear(frameBox!, h("div", { class: "pt-hold" }, iframe));
  fit();
  statusEl!.textContent = '起動中…';
  const onMsg = (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    if (ev.data?.type === 'rlce:ready') iframe.contentWindow!.postMessage({ type: 'rlce:load', ...ed.project.playPayload(), start }, '*');
    if (ev.data?.type === 'rlce:started') {
      const bad = (ev.data.plugins as { ok: boolean; path: string }[]).filter(x => !x.ok);
      statusEl!.textContent = bad.length ? `プラグインのエラー: ${bad.map(b => b.path).join(', ')}` : '保存前の編集も反映しています';
    }
    if (ev.data?.type === 'rlce:error') statusEl!.textContent = `起動できません: ${ev.data.message}`;
  };
  if (listener) removeEventListener('message', listener);
  listener = onMsg;
  addEventListener('message', onMsg);
}

/** a small launcher with choices (used by the header button) */
export function playtestMenu(): HTMLElement {
  const c = ed.content;
  const chars = [...(c?.characters.values() ?? [])].map(x => [x.id, x.name] as [string, string]);
  const encs = [...(c?.encounters.values() ?? [])].map(x => [x.id, `${x.id}（${x.enemies.join('・')}）`] as [string, string]);
  let ch = chars[0]?.[0] ?? '', en = encs[0]?.[0] ?? '';
  return h('div', { class: 'pt-menu' },
    button('タイトルから遊ぶ', () => playtest({ screen: 'TITLE' }), 'primary'),
    h('div', { class: 'pt-row' }, select(ch, chars, v => { ch = v; }), button('で冒険', () => playtest({ run: { char: ch } }))),
    h('div', { class: 'pt-row' }, select(en, encs, v => { en = v; }), button('と戦闘', () => playtest({ battle: { encounter: en, char: ch } }))));
}
