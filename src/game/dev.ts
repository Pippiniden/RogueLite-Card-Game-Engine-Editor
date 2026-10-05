import { App, LAYOUT_OVERRIDE_KEY } from './app.ts';
import { parseLayoutText } from './layout.ts';
import type { ScreenId } from './registry-names.ts';

/* Developer panel (open the game with ?dev): paste QLAYOUT text from the layout tool to try it
   on this device without rebuilding, or copy the layout in use back to the tool. */

export function installDevPanel(app: App, packLayout: string, overridden: boolean) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dev-btn';
  btn.textContent = overridden ? '配置（上書き中）' : '配置';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'dev-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <h2>画面配置の差し替え</h2>
    <p>画面配置ツールの「プロジェクト」→「テキストをコピー」で写したテキストを貼り付けます。この端末だけに保存され、パックの layout.qlayout は変わりません。</p>
    <textarea id="dev-text" spellcheck="false"></textarea>
    <p class="dev-msg" id="dev-msg"></p>
    <div class="dev-row">
      <button type="button" id="dev-apply">この配置で表示</button>
      <button type="button" id="dev-copy">いまの配置をコピー</button>
      <button type="button" id="dev-reset">パックの配置に戻す</button>
      <button type="button" id="dev-close">閉じる</button>
    </div>`;
  document.body.appendChild(panel);
  const ta = panel.querySelector<HTMLTextAreaElement>('#dev-text')!;
  const msg = panel.querySelector<HTMLElement>('#dev-msg')!;
  const current = () => { try { return localStorage.getItem(LAYOUT_OVERRIDE_KEY) || packLayout; } catch { return packLayout; } };

  btn.addEventListener('click', () => { ta.value = current(); msg.textContent = ''; panel.hidden = false; });
  panel.querySelector('#dev-close')!.addEventListener('click', () => { panel.hidden = true; });
  panel.querySelector('#dev-copy')!.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(current()); msg.textContent = 'コピーしました。ツールの「読み込み」に貼り付けられます。'; }
    catch { ta.value = current(); ta.select(); msg.textContent = '選択しました。コピーしてください。'; }
  });
  panel.querySelector('#dev-apply')!.addEventListener('click', () => {
    const { layout, errors } = parseLayoutText(ta.value);
    if (errors.length) { msg.textContent = '読み込めません:\n' + errors.slice(0, 6).join('\n'); return; }
    try { localStorage.setItem(LAYOUT_OVERRIDE_KEY, ta.value); } catch { /* keep it for this session only */ }
    app.layout = layout;
    btn.textContent = '配置（上書き中）';
    panel.hidden = true;
    app.go((app.screen?.id ?? 'TITLE') as ScreenId);
  });
  panel.querySelector('#dev-reset')!.addEventListener('click', () => {
    try { localStorage.removeItem(LAYOUT_OVERRIDE_KEY); } catch { /* ignore */ }
    app.layout = parseLayoutText(packLayout).layout;
    btn.textContent = '配置';
    panel.hidden = true;
    app.go((app.screen?.id ?? 'TITLE') as ScreenId);
  });
}
