import type { Content } from '../engine/content.ts';

/* ===== UI skins =====
   Every UI part has a CSS look built in. When theme.json → skins names an image for a part
   (and the image exists), the part is drawn with that image as a 9-slice (CSS border-image) instead.
   Image rules: docs/asset-spec.md. */

export const skinClass = (part: string) => 'sk-' + part.replace(/[^A-Za-z0-9_-]+/g, '-');

export function installSkins(c: Content) {
  const rules: string[] = [];
  const skins = c.theme.skins ?? {};
  for (const [part, s] of Object.entries(skins)) {
    if (!s || part === 'button.disabled') continue;
    const url = c.assets.get(s.image);
    if (!url) continue;
    const k = s.scale ?? 2;
    const [t, r, b, l] = s.slice;
    const w = `${t / k}px ${r / k}px ${b / k}px ${l / k}px`;
    const extra = Object.entries(s.css ?? {}).map(([p, v]) => `${p}:${v}`).join(';');
    rules.push(`.${skinClass(part)}{border-style:solid;border-color:transparent;border-width:${w};border-image:url("${url}") ${t} ${r} ${b} ${l}${s.fill === false ? '' : ' fill'} / ${w} / 0 ${s.repeat ?? 'stretch'};background:none!important;box-shadow:none!important;border-radius:0!important;${extra}}`);
  }
  const dis = skins['button.disabled'];
  const disUrl = dis && c.assets.get(dis.image);
  if (dis && disUrl) rules.push(`.${skinClass('button')}:disabled,.${skinClass('button.primary')}:disabled{border-image-source:url("${disUrl}");opacity:1}`);
  let el = document.getElementById('rlce-skins') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'rlce-skins'; document.head.appendChild(el); }
  el.textContent = rules.join('\n');
}

/** background image for a screen (encounter backgrounds override BATTLE) */
export function backgroundFor(c: Content, screen: string, override?: string): string | null {
  const key = override ?? c.theme.backgrounds?.[screen];
  return key ? c.assets.get(key) ?? null : null;
}
