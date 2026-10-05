/* node tools/gen-skin-demo.mjs
   Writes public/packs/skin-demo: an optional pack that only re-skins the UI with 9-slice images,
   to show the image route of docs/asset-spec.md. Enable it by adding "skin-demo" after "base" in packs/index.json. */
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = new URL('../public/packs/skin-demo/', import.meta.url);
mkdirSync(new URL('assets/ui/', OUT), { recursive: true });
const files = {};
const put = (key, name, w, h, body) => { files[key] = `ui/${name}.svg`; writeFileSync(new URL(`assets/ui/${name}.svg`, OUT), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`); };

// all drawn at @2x; corners hold the ornament, edges are plain so they stretch cleanly
const frame = (w, h, r, outer, inner, fill, gold) => `
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${r}" fill="${fill}" stroke="${outer}" stroke-width="4"/>
  <rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="${Math.max(2, r - 8)}" fill="none" stroke="${inner}" stroke-width="2"/>
  ${gold ? [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].map(([x, y]) => `<path d="M${x} ${y - 7} l7 7 l-7 7 l-7 -7z" fill="${gold}"/>`).join('') : ''}`;
put('ui.dialog', 'dialog', 96, 96, frame(96, 96, 16, '#6b5536', '#a8875a', '#1b1a1f', '#d8b46a'));
put('ui.button', 'button', 96, 64, frame(96, 64, 12, '#5a4a36', '#8a7250', '#2c261e', null));
put('ui.button.primary', 'button_primary', 96, 64, frame(96, 64, 12, '#e8a060', '#ffd29a', '#a8541d', '#fff0c8'));
put('ui.button.disabled', 'button_disabled', 96, 64, frame(96, 64, 12, '#3a3a40', '#4a4a50', '#222226', null));
put('ui.topbar', 'topbar', 64, 48, `<rect width="64" height="48" fill="#121318"/><rect y="40" width="64" height="4" fill="#6b5536"/><rect y="44" width="64" height="2" fill="#d8b46a"/>`);
put('ui.banner', 'banner', 128, 64, `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".25" stop-color="#2a1a10" stop-opacity=".92"/><stop offset=".75" stop-color="#2a1a10" stop-opacity=".92"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="128" height="64" fill="url(#g)"/><rect y="4" width="128" height="2" fill="#d8b46a" opacity=".7"/><rect y="58" width="128" height="2" fill="#d8b46a" opacity=".7"/>`);
const card = (c1, c2) => frame(192, 268, 18, '#111', c2, c1, '#e9d18a');
put('ui.card.attack', 'card_attack', 192, 268, card('#8e3226', '#e2a080'));
put('ui.card.skill', 'card_skill', 192, 268, card('#24527a', '#90b8e0'));
put('ui.card.power', 'card_power', 192, 268, card('#7a5a1e', '#e8c878'));
put('ui.card.status', 'card_status', 192, 268, card('#44444a', '#9a9aa0'));
put('ui.card.curse', 'card_curse', 192, 268, card('#4b2a52', '#b08ac0'));
put('ui.card.cost', 'card_cost', 64, 64, `<circle cx="32" cy="32" r="29" fill="#3a2410"/><circle cx="32" cy="32" r="25" fill="#f0b23f"/><circle cx="26" cy="24" r="8" fill="#ffe7a6" opacity=".8"/>`);

const S = (image, slice, extra = {}) => ({ image, slice, scale: 2, fill: true, ...extra });
const theme = {
  skins: {
    'dialog': S('ui.dialog', [32, 32, 32, 32]),
    'button': S('ui.button', [24, 24, 24, 24]),
    'button.primary': S('ui.button.primary', [24, 24, 24, 24], { css: { color: '#fff4e2' } }),
    'button.disabled': S('ui.button.disabled', [24, 24, 24, 24]),
    'topbar': S('ui.topbar', [0, 0, 8, 0]),
    'banner': S('ui.banner', [8, 40, 8, 40]),
    'card.frame.attack': S('ui.card.attack', [28, 28, 28, 28]),
    'card.frame.skill': S('ui.card.skill', [28, 28, 28, 28]),
    'card.frame.power': S('ui.card.power', [28, 28, 28, 28]),
    'card.frame.status': S('ui.card.status', [28, 28, 28, 28]),
    'card.frame.curse': S('ui.card.curse', [28, 28, 28, 28]),
    'card.cost': S('ui.card.cost', [0, 0, 0, 0]),
  },
};
writeFileSync(new URL('theme.json', OUT), JSON.stringify(theme, null, 2) + '\n');
writeFileSync(new URL('assets/manifest.json', OUT), JSON.stringify({ $comment: 'UIスキンの見本（docs/asset-spec.md の規格どおり @2x で描いた9スライス）', ...files }, null, 2) + '\n');
writeFileSync(new URL('pack.json', OUT), JSON.stringify({ id: 'skin-demo', name: 'UIスキンの見本', version: '0.1.0', files: { theme: 'theme.json' }, assets: 'assets/manifest.json' }, null, 2) + '\n');
console.log(`skin-demo: ${Object.keys(files).length} 個の部品`);
