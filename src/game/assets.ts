import type { Content } from '../engine/content.ts';

/* Logical asset keys → URLs. A key with no file gets a generated stand-in so the game always runs. */

const placeholderCache = new Map<string, string>();

function hue(s: string) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }

export function placeholder(key: string, label = ''): string {
  const k = key + '|' + label;
  let u = placeholderCache.get(k);
  if (u) return u;
  const h = hue(key);
  const text = (label || key.split('.').pop() || '?').slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="12" fill="hsl(${h} 30% 28%)"/><path d="M0 100 L100 0" stroke="hsl(${h} 30% 40%)" stroke-width="6"/><text x="50" y="60" font-size="30" text-anchor="middle" fill="hsl(${h} 40% 85%)" font-family="sans-serif">${text.replace(/[<&]/g, '')}</text></svg>`;
  u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  placeholderCache.set(k, u);
  return u;
}

export function assetUrl(c: Content, key: string | undefined, label = ''): string {
  if (!key) return placeholder('none', label);
  return c.assets.get(key) ?? placeholder(key, label);
}

export function img(c: Content, key: string | undefined, label = '', cls = ''): HTMLImageElement {
  const el = document.createElement('img');
  el.src = assetUrl(c, key, label);
  el.alt = label;
  el.draggable = false;
  if (cls) el.className = cls;
  el.onerror = () => { el.onerror = null; el.src = placeholder(key || 'none', label); };
  return el;
}
