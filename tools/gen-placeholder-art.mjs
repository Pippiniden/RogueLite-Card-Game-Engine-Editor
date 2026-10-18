/* node tools/gen-placeholder-art.mjs
   Writes the base pack's stand-in art (SVG) and assets/manifest.json.
   Replace any file with a PNG/WebP of your own and point the manifest key at it — data files never change. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const OUT = new URL('../public/packs/base/assets/', import.meta.url);
const files = {};
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
const put = (key, path, content) => { files[key] = path; mkdirSync(new URL(path.slice(0, path.lastIndexOf('/') + 1), OUT), { recursive: true }); writeFileSync(new URL(path, OUT), content); };

/* ===== portrait: Rio, four expressions ===== */
function portrait(expr) {
  const skin = '#f2d2b6', skinShade = '#d9ae8e', hair = '#22404a', hairHi = '#33606b', iris = '#d98b2b';
  const eyes = {
    normal: `
      <path d="M86 132 q16 -12 32 0 q-16 9 -32 0z" fill="#fff"/><circle cx="102" cy="131" r="8" fill="${iris}"/><circle cx="102" cy="131" r="4" fill="#2a1a10"/><circle cx="99" cy="128" r="2.4" fill="#fff"/>
      <path d="M138 132 q16 -12 32 0 q-16 9 -32 0z" fill="#fff"/><circle cx="154" cy="131" r="8" fill="${iris}"/><circle cx="154" cy="131" r="4" fill="#2a1a10"/><circle cx="151" cy="128" r="2.4" fill="#fff"/>
      <path d="M84 131 q18 -16 36 -2" stroke="#2b1d16" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M136 129 q18 -14 36 2" stroke="#2b1d16" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    hurt: `
      <path d="M88 124 l26 8 l-26 8" stroke="#2b1d16" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M168 124 l-26 8 l26 8" stroke="#2b1d16" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    pinch: `
      <path d="M86 134 q16 -10 32 0 q-16 8 -32 0z" fill="#fff"/><circle cx="102" cy="133" r="5.5" fill="${iris}"/><circle cx="102" cy="133" r="2.6" fill="#2a1a10"/>
      <path d="M138 134 q16 -10 32 0 q-16 8 -32 0z" fill="#fff"/><circle cx="154" cy="133" r="5.5" fill="${iris}"/><circle cx="154" cy="133" r="2.6" fill="#2a1a10"/>
      <path d="M84 133 q18 -12 36 -2" stroke="#2b1d16" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M136 131 q18 -10 36 2" stroke="#2b1d16" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    happy: `
      <path d="M88 134 q14 -14 28 0" stroke="#2b1d16" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M140 134 q14 -14 28 0" stroke="#2b1d16" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  }[expr];
  const brows = {
    normal: `<path d="M88 112 q14 -6 28 -2" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M140 110 q14 -4 28 2" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    hurt: `<path d="M88 106 l28 10" stroke="${hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M168 106 l-28 10" stroke="${hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    pinch: `<path d="M88 114 q14 -10 28 -12" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M140 102 q14 2 28 12" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    happy: `<path d="M88 108 q14 -8 28 -2" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M140 106 q14 -6 28 2" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  }[expr];
  const mouth = {
    normal: `<path d="M118 168 q10 5 20 0" stroke="#8a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    hurt: `<path d="M114 168 q14 -8 28 0 q-14 10 -28 0z" fill="#7a2a22"/><path d="M118 167 h20" stroke="#fff" stroke-width="2.5"/>`,
    pinch: `<path d="M116 170 q6 -5 12 0 q6 5 12 0" stroke="#8a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    happy: `<path d="M112 162 q16 18 32 0z" fill="#7a2a22"/><path d="M118 170 q10 6 20 0" fill="#e07a6a"/>`,
  }[expr];
  const extra = {
    normal: '',
    hurt: `<path d="M182 92 q8 12 0 18 q-8 -6 0 -18z" fill="#9fd3f0" opacity=".9"/>`,
    pinch: `<path d="M178 104 q9 13 0 20 q-9 -7 0 -20z" fill="#9fd3f0" opacity=".9"/><path d="M70 150 l10 -3 M70 158 l10 -1" stroke="#c96a5a" stroke-width="2" opacity=".6"/>`,
    happy: `<ellipse cx="92" cy="152" rx="11" ry="6" fill="#ef8e7c" opacity=".55"/><ellipse cx="164" cy="152" rx="11" ry="6" fill="#ef8e7c" opacity=".55"/>`,
  }[expr];
  const defs = `<radialGradient id="glow" cx="30%" cy="85%" r="75%"><stop offset="0" stop-color="#f4a948" stop-opacity=".75"/><stop offset=".55" stop-color="#5b3b2a" stop-opacity=".35"/><stop offset="1" stop-color="#181a22" stop-opacity="0"/></radialGradient>`;
  return svg(256, 256, `
    <rect width="256" height="256" fill="#1c2029"/><rect width="256" height="256" fill="url(#glow)"/>
    <path d="M70 70 q58 -60 118 0 q22 40 12 96 l-20 30 h-104 l-18 -30 q-10 -56 12 -96z" fill="${hair}"/>
    <path d="M40 256 q8 -62 88 -68 q80 6 88 68z" fill="#2c3445"/>
    <path d="M60 256 q10 -40 68 -46 q58 6 68 46z" fill="#384257"/>
    <path d="M108 172 h40 v30 q-20 14 -40 0z" fill="${skinShade}"/>
    <path d="M78 206 q50 26 100 0 l8 18 q-58 30 -116 0z" fill="#b8452f"/>
    <path d="M150 214 l14 40 l-18 0 l-6 -36z" fill="#9a3626"/>
    <ellipse cx="128" cy="132" rx="56" ry="62" fill="${skin}"/>
    <path d="M74 140 q4 32 54 52 q50 -20 54 -52 q-2 46 -54 60 q-52 -14 -54 -60z" fill="${skinShade}" opacity=".5"/>
    ${extra && expr === 'happy' ? extra : ''}
    ${eyes}${brows}
    <path d="M126 148 q2 6 -2 9" stroke="${skinShade}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${mouth}
    <path d="M68 118 q4 -64 60 -66 q58 2 62 66 q-14 -22 -26 -26 q-2 16 -14 22 q4 -14 -2 -26 q-12 18 -36 24 q10 -12 10 -26 q-14 20 -40 30 q6 -10 6 -20 q-12 10 -20 22z" fill="${hair}"/>
    <path d="M96 62 q22 -10 52 -4 q-30 0 -52 18z" fill="${hairHi}" opacity=".9"/>
    ${extra && expr !== 'happy' ? extra : ''}
  `, defs);
}
for (const e of ['normal', 'hurt', 'pinch', 'happy']) put(`portrait.rio.${e}`, `portrait/rio_${e}.svg`, portrait(e));

/* ===== enemies (front view, feet on the bottom edge) ===== */
const eye = (x, y, r = 6, c = '#fff', p = '#1a1a1a') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y + 1}" r="${r * 0.5}" fill="${p}"/>`;
const enemies = {
  slime: svg(256, 256, `
    <ellipse cx="128" cy="248" rx="96" ry="8" fill="#000" opacity=".25"/>
    <path d="M30 246 q-6 -70 50 -118 q48 -40 96 0 q56 48 50 118z" fill="#6fbf6a"/>
    <path d="M44 240 q0 -60 46 -100 q-30 50 -20 100z" fill="#9ad88f" opacity=".7"/>
    <ellipse cx="96" cy="150" rx="18" ry="10" fill="#d9f5cf" opacity=".7"/>
    ${eye(104, 186, 11)}${eye(152, 186, 11)}
    <path d="M114 214 q14 10 28 0" stroke="#2c5a2a" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  rat: svg(256, 256, `
    <ellipse cx="128" cy="248" rx="80" ry="7" fill="#000" opacity=".25"/>
    <ellipse cx="128" cy="196" rx="70" ry="54" fill="#7d7a82"/>
    <circle cx="70" cy="110" r="34" fill="#7d7a82"/><circle cx="70" cy="110" r="20" fill="#d39a9a"/>
    <circle cx="186" cy="110" r="34" fill="#7d7a82"/><circle cx="186" cy="110" r="20" fill="#d39a9a"/>
    <ellipse cx="128" cy="150" rx="54" ry="46" fill="#8e8b93"/>
    <path d="M120 112 l8 -52 l8 52z" fill="#e8dcc0"/>
    ${eye(106, 146, 8, '#ff5a4a', '#3a0d0a')}${eye(150, 146, 8, '#ff5a4a', '#3a0d0a')}
    <ellipse cx="128" cy="176" rx="12" ry="9" fill="#e28c8c"/>
    <path d="M118 188 h20 v12 h-20z" fill="#f5f0e2"/><path d="M128 188 v12" stroke="#8e8b93" stroke-width="2"/>
    <path d="M84 176 l-40 -6 M84 184 l-40 4 M172 176 l40 -6 M172 184 l40 4" stroke="#ccc" stroke-width="2"/>
    <ellipse cx="92" cy="244" rx="18" ry="8" fill="#6a676e"/><ellipse cx="164" cy="244" rx="18" ry="8" fill="#6a676e"/>`),
  mushroom: svg(256, 256, `
    <ellipse cx="128" cy="248" rx="70" ry="7" fill="#000" opacity=".25"/>
    <path d="M86 248 q-8 -60 8 -110 h68 q16 50 8 110z" fill="#e9dcc2"/>
    <path d="M24 140 q8 -110 104 -114 q96 4 104 114 q-104 22 -208 0z" fill="#b53a2e"/>
    <circle cx="80" cy="84" r="14" fill="#f1e6cf"/><circle cx="138" cy="60" r="11" fill="#f1e6cf"/><circle cx="184" cy="100" r="16" fill="#f1e6cf"/><circle cx="112" cy="110" r="9" fill="#f1e6cf"/>
    ${eye(110, 178, 8)}${eye(146, 178, 8)}
    <path d="M114 206 q14 -8 28 0" stroke="#5a3c2a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="40" cy="190" r="4" fill="#c7d97a" opacity=".8"/><circle cx="214" cy="170" r="5" fill="#c7d97a" opacity=".8"/><circle cx="200" cy="214" r="3" fill="#c7d97a" opacity=".8"/>`),
  golem: svg(256, 256, `
    <ellipse cx="128" cy="248" rx="96" ry="8" fill="#000" opacity=".3"/>
    <path d="M58 248 l10 -60 h120 l10 60z" fill="#5d5f68"/>
    <path d="M40 120 l18 -20 h140 l18 20 l-10 88 h-156z" fill="#7b7e88"/>
    <rect x="12" y="116" width="40" height="96" rx="10" fill="#6b6e78"/><rect x="204" y="116" width="40" height="96" rx="10" fill="#6b6e78"/>
    <rect x="78" y="34" width="100" height="76" rx="12" fill="#888b95"/>
    <path d="M96 70 h24 M136 70 h24" stroke="#ffb547" stroke-width="8" stroke-linecap="round"/>
    <path d="M80 150 l40 20 l-14 30 M176 140 l-30 26" stroke="#4d4f57" stroke-width="4" fill="none"/>
    <path d="M118 128 l10 -10 l10 10 l-10 10z" fill="#ffb547"/>`),
  bandit: svg(256, 256, `
    <ellipse cx="128" cy="248" rx="70" ry="7" fill="#000" opacity=".25"/>
    <path d="M70 248 q-6 -110 58 -126 q64 16 58 126z" fill="#4b3a2f"/>
    <path d="M78 128 q50 -110 100 0 q-50 24 -100 0z" fill="#3a2f2a"/>
    <ellipse cx="128" cy="116" rx="34" ry="38" fill="#c79a78"/>
    <path d="M92 124 h72 v28 q-36 14 -72 0z" fill="#2a2a2e"/>
    <path d="M100 104 q10 -6 20 0 M136 104 q10 -6 20 0" stroke="#2a1a10" stroke-width="5" stroke-linecap="round"/>
    <path d="M86 84 q42 -40 86 0 l-10 8 q-34 -24 -66 0z" fill="#2c2420"/>
    <path d="M196 150 l30 -60 l6 4 l-26 62z" fill="#cfd4dc"/><rect x="186" y="150" width="20" height="12" rx="3" fill="#6b4a2a"/>`),
  cultist: svg(256, 256, `
    <ellipse cx="128" cy="248" rx="80" ry="7" fill="#000" opacity=".25"/>
    <path d="M56 248 q4 -120 72 -150 q68 30 72 150z" fill="#6f6a66"/>
    <path d="M72 120 q56 -120 112 0 l-8 12 q-48 -30 -96 0z" fill="#58534f"/>
    <ellipse cx="128" cy="120" rx="30" ry="34" fill="#1d1b1f"/>
    <circle cx="116" cy="118" r="5" fill="#ff8a3a"/><circle cx="140" cy="118" r="5" fill="#ff8a3a"/>
    <path d="M100 150 q28 20 56 0 l-6 92 h-44z" fill="#8b847f"/>
    <path d="M42 240 l8 -150" stroke="#4a3a2a" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="86" r="10" fill="#c9b9a0"/>
    <path d="M150 180 q14 -6 30 0" stroke="#a2302a" stroke-width="4" fill="none"/>`),
  knight: svg(256, 256, `
    <ellipse cx="128" cy="250" rx="100" ry="6" fill="#000" opacity=".3"/>
    <path d="M60 250 l12 -90 h112 l12 90z" fill="#5c6472"/>
    <path d="M44 110 q84 -40 168 0 l-12 70 h-144z" fill="#7d8796"/>
    <path d="M86 34 q42 -26 84 0 l6 70 q-48 22 -96 0z" fill="#9aa4b2"/>
    <rect x="96" y="66" width="64" height="8" rx="3" fill="#1b1d22"/><path d="M128 40 v24" stroke="#c4ccd6" stroke-width="4"/>
    <path d="M128 18 q22 -14 30 10 q-14 -6 -30 2z" fill="#a83a32"/>
    <path d="M150 120 h84 v78 q-42 40 -84 0z" fill="#6a4b2e"/><path d="M162 130 h60 v62 q-30 26 -60 0z" fill="#b8913f"/><path d="M192 136 v76 M166 160 h52" stroke="#6a4b2e" stroke-width="6"/>
    <path d="M30 230 l20 -150 l8 0 l-12 150z" fill="#cfd4dc"/>`),
  witch: svg(256, 256, `
    <ellipse cx="128" cy="250" rx="90" ry="6" fill="#000" opacity=".3"/>
    <path d="M50 250 q10 -130 78 -140 q68 10 78 140z" fill="#3b2b4a"/>
    <ellipse cx="128" cy="104" rx="32" ry="36" fill="#cbb7c6"/>
    <path d="M118 102 q-8 -4 -14 2 M138 102 q8 -4 14 2" stroke="#2a1530" stroke-width="4" stroke-linecap="round"/>
    <circle cx="112" cy="106" r="3" fill="#b45cff"/><circle cx="144" cy="106" r="3" fill="#b45cff"/>
    <path d="M116 124 q12 6 24 0" stroke="#5a2a4a" stroke-width="3" fill="none"/>
    <path d="M60 86 h136 l-16 -10 l-40 -70 q-10 30 -40 50 l-20 20z" fill="#271c33"/>
    <path d="M76 78 h104" stroke="#8a5ab4" stroke-width="5"/>
    <circle cx="200" cy="168" r="22" fill="#9b5cff" opacity=".85"/><circle cx="194" cy="160" r="7" fill="#e6d4ff" opacity=".8"/>
    <path d="M182 180 q-20 30 -30 70" stroke="#2a1d33" stroke-width="6" fill="none"/>`),
  dragon: svg(256, 256, `
    <ellipse cx="128" cy="250" rx="110" ry="6" fill="#000" opacity=".35"/>
    <path d="M128 140 q-60 -80 -120 -60 q30 10 36 40 q-30 -6 -40 10 q34 8 40 40 q-20 0 -30 20 q60 0 114 -10z" fill="#4a3d3a"/>
    <path d="M128 140 q60 -80 120 -60 q-30 10 -36 40 q30 -6 40 10 q-34 8 -40 40 q20 0 30 20 q-60 0 -114 -10z" fill="#4a3d3a"/>
    <path d="M70 250 q-10 -90 58 -110 q68 20 58 110z" fill="#6b5a52"/>
    <path d="M100 250 q0 -70 28 -84 q28 14 28 84z" fill="#c9a77a"/>
    <path d="M100 196 h56 M98 216 h60 M100 236 h56" stroke="#a8875f" stroke-width="3"/>
    <path d="M76 70 q52 -40 104 0 l-8 70 q-44 30 -88 0z" fill="#7a6860"/>
    <path d="M78 66 l-26 -50 l40 34z M178 66 l26 -50 l-40 34z" fill="#d8ccb8"/>
    <path d="M92 92 l26 8 l-24 6z" fill="#ffb03a"/><path d="M164 92 l-26 8 l24 6z" fill="#ffb03a"/>
    <path d="M100 132 q28 16 56 0 l-6 14 q-22 8 -44 0z" fill="#2a1d1a"/><path d="M108 132 l4 8 l4 -7 M140 132 l4 8 l4 -8" fill="#f2ead8"/>
    <circle cx="118" cy="118" r="3" fill="#2a1d1a"/><circle cx="138" cy="118" r="3" fill="#2a1d1a"/>`),
};
/* act 2 */
const shadow = (rx = 90) => `<ellipse cx="128" cy="248" rx="${rx}" ry="8" fill="#000" opacity=".25"/>`;
Object.assign(enemies, {
  rust_golem: svg(256, 256, `${shadow(96)}
    <rect x="58" y="96" width="140" height="130" rx="18" fill="#8a5a3a"/><rect x="70" y="108" width="116" height="40" rx="8" fill="#a8704a"/>
    <rect x="30" y="120" width="34" height="96" rx="14" fill="#7a4a2e"/><rect x="192" y="120" width="34" height="96" rx="14" fill="#7a4a2e"/>
    <rect x="86" y="40" width="84" height="64" rx="14" fill="#9a6440"/><rect x="98" y="62" width="60" height="14" rx="6" fill="#2a1a12"/>
    <circle cx="112" cy="69" r="5" fill="#7ad6f0"/><circle cx="144" cy="69" r="5" fill="#7ad6f0"/>
    <rect x="76" y="226" width="40" height="20" fill="#6a3e26"/><rect x="140" y="226" width="40" height="20" fill="#6a3e26"/>
    <circle cx="90" cy="180" r="6" fill="#c08a5a"/><circle cx="168" cy="196" r="4" fill="#c08a5a"/>`),
  shade: svg(256, 256, `${shadow(60)}
    <path d="M128 40 q60 30 56 120 q-4 60 -20 86 q-14 -18 -20 -2 q-8 -18 -16 0 q-8 -18 -16 0 q-6 -16 -20 2 q-16 -26 -20 -86 q-4 -90 56 -120z" fill="#2a2440" opacity=".92"/>
    <path d="M128 60 q40 24 40 80 q-20 -40 -40 -40 q-20 0 -40 40 q0 -56 40 -80z" fill="#3e3660"/>
    ${eye(108, 128, 9, '#d9c8ff', '#4a2a8a')}${eye(148, 128, 9, '#d9c8ff', '#4a2a8a')}`),
  bone_archer: svg(256, 256, `${shadow(70)}
    <rect x="112" y="120" width="32" height="84" rx="10" fill="#e3dccb"/><path d="M112 140 h32 M112 160 h32 M112 180 h32" stroke="#a69e8a" stroke-width="4"/>
    <path d="M118 204 l-14 42 M138 204 l14 42" stroke="#e3dccb" stroke-width="12" stroke-linecap="round"/>
    <circle cx="128" cy="84" r="34" fill="#efe8d6"/><circle cx="116" cy="82" r="9" fill="#2a2420"/><circle cx="142" cy="82" r="9" fill="#2a2420"/><path d="M116 104 h24" stroke="#2a2420" stroke-width="4"/>
    <path d="M188 70 q40 70 0 140" stroke="#7a5a2a" stroke-width="8" fill="none"/><path d="M188 70 v140" stroke="#ddd" stroke-width="2"/>
    <path d="M144 140 l44 -4" stroke="#e3dccb" stroke-width="10" stroke-linecap="round"/>`),
  mire_slug: svg(256, 256, `${shadow(110)}
    <path d="M14 244 q-4 -80 60 -110 q60 -26 120 10 q52 34 50 100z" fill="#5a7a3a"/>
    <path d="M30 236 q10 -60 70 -84 q-40 40 -40 84z" fill="#7a9a4a" opacity=".8"/>
    <path d="M176 144 l14 -60 M200 154 l26 -52" stroke="#5a7a3a" stroke-width="10" stroke-linecap="round"/>
    <circle cx="190" cy="80" r="11" fill="#e8f0a0"/><circle cx="228" cy="98" r="11" fill="#e8f0a0"/><circle cx="190" cy="80" r="5" fill="#2a3010"/><circle cx="228" cy="98" r="5" fill="#2a3010"/>
    <circle cx="90" cy="200" r="8" fill="#a8c070" opacity=".7"/><circle cx="130" cy="214" r="5" fill="#a8c070" opacity=".7"/>`),
  lantern_wraith: svg(256, 256, `${shadow(70)}
    <path d="M128 24 q74 40 70 140 q-6 56 -30 82 q-12 -16 -22 0 q-10 -18 -18 0 q-8 -18 -18 0 q-10 -16 -22 0 q-24 -26 -30 -82 q-4 -100 70 -140z" fill="#1e2a36" opacity=".95"/>
    <path d="M128 50 q44 30 44 90 q-20 -30 -44 -30 q-24 0 -44 30 q0 -60 44 -90z" fill="#2e4256"/>
    ${eye(108, 116, 10, '#9ff0ff', '#0a4a5a')}${eye(148, 116, 10, '#9ff0ff', '#0a4a5a')}
    <rect x="114" y="160" width="28" height="40" rx="6" fill="#1a1612"/><rect x="119" y="166" width="18" height="28" rx="4" fill="#7af0ff"/><circle cx="128" cy="180" r="30" fill="#7af0ff" opacity=".18"/>`),
  abyss_warden: svg(320, 320, `<ellipse cx="160" cy="312" rx="130" ry="9" fill="#000" opacity=".3"/>
    <path d="M40 312 q-6 -150 120 -200 q126 50 120 200z" fill="#1a1e2e"/>
    <path d="M70 312 q0 -120 90 -164 q90 44 90 164z" fill="#262c44"/>
    <path d="M100 120 l-30 -70 l50 40z M220 120 l30 -70 l-50 40z" fill="#3a4060"/>
    <circle cx="160" cy="130" r="54" fill="#2e3452"/><path d="M118 132 h84" stroke="#1a1e2e" stroke-width="14"/>
    <circle cx="140" cy="132" r="8" fill="#ff9a5a"/><circle cx="180" cy="132" r="8" fill="#ff9a5a"/>
    <path d="M60 220 q-30 20 -36 60 M260 220 q30 20 36 60" stroke="#3a4060" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M120 230 h80 M126 250 h68 M132 270 h56" stroke="#ff9a5a" stroke-width="3" opacity=".6"/>`),
});
for (const [k, v] of Object.entries(enemies)) put(`enemy.${k}`, `enemy/${k}.svg`, v);

/* ===== card art: a glyph on a tinted vignette (the card frame supplies the type colour) ===== */
const G = {
  sword: '<path d="M60 118 l58 -58 l8 4 l4 8 l-58 58z" fill="#d9dee6"/><path d="M50 116 l18 18 M44 130 l12 -12 l10 10 l-12 12z" stroke="#7a5a2a" stroke-width="8" stroke-linecap="round"/>',
  shield: '<path d="M90 32 q26 14 46 10 q0 64 -46 100 q-46 -36 -46 -100 q20 4 46 -10z" fill="#9bb2c9"/><path d="M90 46 q18 8 32 8 q-2 44 -32 70 q-30 -26 -32 -70 q14 0 32 -8z" fill="#5d7d9e"/>',
  bash: '<path d="M64 40 q26 14 46 10 q0 64 -46 100 q-46 -36 -46 -100 q20 4 46 -10z" fill="#9bb2c9"/><path d="M118 54 l30 -12 M120 78 l36 0 M118 102 l30 12" stroke="#f0c060" stroke-width="7" stroke-linecap="round"/>',
  twin: '<path d="M40 126 l70 -70 l8 8 l-70 70z M72 132 l70 -70 l8 8 l-70 70z" fill="#d9dee6"/>',
  sweep: '<path d="M26 110 q64 -90 128 0" stroke="#d9dee6" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M40 118 q50 -60 100 0" stroke="#f0c060" stroke-width="4" fill="none" opacity=".7"/>',
  wind: '<path d="M30 70 h80 q24 0 24 -20 q0 -16 -16 -16 M30 96 h110 q20 0 20 18 q0 16 -16 16 M40 122 h50" stroke="#cfe6e0" stroke-width="9" fill="none" stroke-linecap="round"/>',
  knife: '<path d="M44 132 l66 -66 l20 -6 l-6 20 l-66 66z" fill="#d9dee6"/><path d="M36 140 l16 -16" stroke="#7a5a2a" stroke-width="10" stroke-linecap="round"/><path d="M130 38 l14 -8 M140 54 l16 -2" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>',
  charge: '<path d="M30 90 l70 -40 v24 h50 v32 h-50 v24z" fill="#f0c060"/><path d="M20 70 h20 M14 90 h20 M20 110 h20" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/>',
  wall: '<path d="M26 50 h128 v80 h-128z" fill="#8c8f99"/><path d="M26 76 h128 M26 104 h128 M60 50 v26 M110 50 v26 M84 76 v28 M134 76 v28 M60 104 v26 M110 104 v26" stroke="#4d4f57" stroke-width="4"/>',
  spark: '<path d="M90 24 l12 46 l46 -14 l-34 34 l34 34 l-46 -14 l-12 46 l-12 -46 l-46 14 l34 -34 l-34 -34 l46 14z" fill="#ffcf5a"/><circle cx="90" cy="90" r="14" fill="#fff4c8"/>',
  eye: '<path d="M20 90 q70 -80 140 0 q-70 80 -140 0z" fill="#e8e2d0"/><circle cx="90" cy="90" r="28" fill="#4c8fb8"/><circle cx="90" cy="90" r="13" fill="#132230"/><circle cx="82" cy="82" r="6" fill="#fff"/>',
  guard: '<path d="M40 50 q20 10 36 6 q0 50 -36 78 q-36 -28 -36 -78 q16 4 36 -6z" fill="#9bb2c9" transform="translate(30 0)"/><path d="M98 132 l50 -50 l8 8 l-50 50z" fill="#d9dee6"/>',
  lantern: '<rect x="66" y="50" width="48" height="70" rx="10" fill="#3a2f22"/><rect x="74" y="58" width="32" height="54" rx="6" fill="#ffc35a"/><circle cx="90" cy="86" r="30" fill="#ffc35a" opacity=".25"/><path d="M76 50 q14 -26 28 0" stroke="#3a2f22" stroke-width="6" fill="none"/>',
  flurry: '<path d="M30 140 l60 -110 M60 150 l60 -110 M90 156 l60 -110" stroke="#d9dee6" stroke-width="8" stroke-linecap="round"/><path d="M40 150 l60 -110" stroke="#f0c060" stroke-width="3" opacity=".7"/>',
  flame: '<path d="M90 24 q40 40 30 80 q20 -10 18 -30 q20 30 0 60 q-20 26 -48 26 q-40 0 -52 -36 q-8 -34 22 -56 q-4 20 10 30 q-4 -50 20 -74z" fill="#f08a3a"/><path d="M92 96 q20 20 10 40 q-12 10 -24 0 q-10 -20 14 -40z" fill="#ffd27a"/>',
  poison: '<path d="M70 40 h40 v20 q30 20 30 54 q0 36 -50 36 q-50 0 -50 -36 q0 -34 30 -54z" fill="#6fae4a"/><rect x="66" y="32" width="48" height="12" rx="4" fill="#7a5a2a"/><circle cx="80" cy="110" r="8" fill="#c8f2a0" opacity=".7"/><circle cx="104" cy="96" r="5" fill="#c8f2a0" opacity=".7"/>',
  wound: '<path d="M40 50 l100 80 M60 40 l80 64 M40 80 l80 60" stroke="#b03a30" stroke-width="10" stroke-linecap="round"/>',
  slime: '<path d="M30 140 q-4 -50 40 -80 q30 -20 60 0 q40 30 30 80z" fill="#6fbf6a"/><circle cx="76" cy="104" r="6" fill="#203a20"/><circle cx="110" cy="104" r="6" fill="#203a20"/>',
};
for (const [k, g] of Object.entries(G)) {
  // 640×360 (16:9) per docs/asset-spec.md: the 180×180 glyph is centred and scaled to the height
  put(`card.${k}`, `card/${k}.svg`, svg(640, 360, `<rect width="640" height="360" fill="url(#v)"/><g transform="translate(150 0) scale(2)">${g}</g>`,
    `<radialGradient id="v" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#000000" stop-opacity=".35"/></radialGradient>`));
}

/* ===== small icons: statuses, relics, intents, map nodes ===== */
const icon = (body, bg = 'none') => svg(64, 64, `${bg !== 'none' ? `<circle cx="32" cy="32" r="30" fill="${bg}"/>` : ''}${body}`);
const STATUS = {
  strength: icon('<path d="M18 40 q0 -14 14 -16 q-4 -10 6 -14 q10 2 8 14 q10 6 4 18 q-8 10 -22 8 q-10 -2 -10 -10z" fill="#f0b23f"/>', '#5a2a1c'),
  dexterity: icon('<path d="M14 44 l18 -24 l18 24" stroke="#bfe6a8" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', '#24452f'),
  vulnerable: icon('<path d="M32 12 l20 8 q0 24 -20 34 q-20 -10 -20 -34z" fill="#c9c2b0"/><path d="M26 18 l8 14 l-6 6 l8 12" stroke="#7a1d18" stroke-width="4" fill="none"/>', '#4a1d1a'),
  weak: icon('<path d="M16 44 l30 -30" stroke="#c9c2b0" stroke-width="6" stroke-linecap="round"/><path d="M30 46 q10 -10 18 -2" stroke="#8fa1c9" stroke-width="5" fill="none"/>', '#1f2a46'),
  frail: icon('<path d="M32 14 l18 8 q0 20 -18 30 q-18 -10 -18 -30z" fill="#8f9bb0"/><path d="M24 26 l16 16 M40 26 l-16 16" stroke="#2a1d1a" stroke-width="4"/>', '#3a3040'),
  poison: icon('<path d="M32 12 q16 20 16 30 q0 12 -16 12 q-16 0 -16 -12 q0 -10 16 -30z" fill="#7ccc4a"/>', '#1f3a1c'),
  metallicize: icon('<rect x="16" y="16" width="32" height="32" rx="4" fill="#a6aebb"/><path d="M16 28 h32 M16 38 h32" stroke="#5b616c" stroke-width="3"/>', '#2b2f38'),
  ritual: icon('<circle cx="32" cy="32" r="14" fill="none" stroke="#ff8a3a" stroke-width="4"/><path d="M32 12 v40 M12 32 h40" stroke="#ff8a3a" stroke-width="3"/>', '#3a1d14'),
  thorns: icon('<path d="M10 40 l10 -14 l6 10 l6 -18 l6 18 l6 -10 l10 14z" fill="#9cc77a"/>', '#24331d'),
};
for (const [k, v] of Object.entries(STATUS)) put(`status.${k}`, `icon/status_${k}.svg`, v);
// every other status gets a lettered badge (first character of its name), red for debuffs
const glyph = (ch, ring, bg) => svg(64, 64, `<circle cx="32" cy="32" r="29" fill="${bg}" stroke="${ring}" stroke-width="3"/><text x="32" y="43" font-size="30" font-weight="700" text-anchor="middle" fill="${ring}" font-family="'Hiragino Mincho ProN','Noto Serif CJK JP',serif">${ch}</text>`);
const statusDefs = JSON.parse(readFileSync(new URL('../public/packs/base/statuses.json', import.meta.url), 'utf8'));
for (const st of statusDefs) {
  if (STATUS[st.id]) continue;
  const debuff = st.kind === 'debuff';
  put(`status.${st.id}`, `icon/status_${st.id}.svg`, glyph([...st.name][0], debuff ? '#f2a59c' : '#f3d58a', debuff ? '#3a1a1c' : '#2a2416'));
}
const RELIC = {
  lantern: icon('<rect x="22" y="20" width="20" height="28" rx="5" fill="#3a2f22"/><rect x="26" y="24" width="12" height="20" rx="3" fill="#ffc35a"/><path d="M26 20 q6 -12 12 0" stroke="#c9b48a" stroke-width="3" fill="none"/>', '#2a2420'),
  stone: icon('<path d="M14 42 q-2 -16 14 -22 q16 -4 24 8 q6 12 -4 18 q-16 6 -34 -4z" fill="#8c8f99"/>', '#22252c'),
  whetstone: icon('<rect x="12" y="28" width="40" height="14" rx="4" fill="#9a8a6a"/><path d="M18 22 l28 -8" stroke="#d9dee6" stroke-width="4"/>', '#2a2620'),
  ring: icon('<circle cx="32" cy="34" r="14" fill="none" stroke="#c4ccd6" stroke-width="6"/><path d="M26 16 l6 -6 l6 6 l-6 6z" fill="#5d8fd6"/>', '#1e2633'),
  bell: icon('<path d="M20 44 q0 -24 12 -26 q12 2 12 26z" fill="#d9a441"/><circle cx="32" cy="48" r="4" fill="#d9a441"/>', '#2a2214'),
  drum: icon('<ellipse cx="32" cy="24" rx="16" ry="6" fill="#e9dcbf"/><path d="M16 24 v18 q16 10 32 0 v-18" fill="#9c3b2e"/><path d="M16 24 l32 18 M48 24 l-32 18" stroke="#e9dcbf" stroke-width="2"/>', '#2a1a16'),
  thorn: icon('<circle cx="32" cy="32" r="14" fill="none" stroke="#7a9a5a" stroke-width="5"/><path d="M32 12 v8 M32 44 v8 M12 32 h8 M44 32 h8" stroke="#9cc77a" stroke-width="4"/>', '#1d2a18'),
  vial: icon('<path d="M26 14 h12 v10 q10 6 10 16 q0 12 -16 12 q-16 0 -16 -12 q0 -10 10 -16z" fill="#7ccc4a"/>', '#1f2a1c'),
};
RELIC.nut = icon('<ellipse cx="32" cy="36" rx="14" ry="16" fill="#9a6a3a"/><path d="M22 28 q10 -16 20 0" fill="#6a4a2a"/><path d="M32 14 v8" stroke="#5a8a3a" stroke-width="4"/>', '#22201a');
RELIC.tally = icon('<rect x="18" y="12" width="28" height="40" rx="4" fill="#c9a86a"/><path d="M24 22 h16 M24 30 h16 M24 38 h10" stroke="#5a3e1e" stroke-width="3"/><circle cx="40" cy="44" r="5" fill="#c8443b"/>', '#2a2214');
RELIC.mask = icon('<path d="M14 24 q18 -10 36 0 q2 22 -18 30 q-20 -8 -18 -30z" fill="#e9dcbf"/><path d="M22 30 q4 -4 8 0 M34 30 q4 -4 8 0" stroke="#2a1d1a" stroke-width="3" fill="none"/><path d="M24 40 q8 8 16 0" stroke="#2a1d1a" stroke-width="3" fill="none"/>', '#2a2420');
RELIC.heart = icon('<path d="M32 50 q-20 -14 -20 -28 q0 -12 12 -12 q8 0 8 8 q0 -8 8 -8 q12 0 12 12 q0 14 -20 28z" fill="#e0522a"/><path d="M28 22 q4 6 0 12 q8 -2 6 -12" fill="#ffd27a"/>', '#2a1410');
RELIC.crown = icon('<path d="M12 44 l4 -24 l10 10 l6 -14 l6 14 l10 -10 l4 24z" fill="#d9a441"/><rect x="12" y="44" width="40" height="6" fill="#b8862a"/><circle cx="32" cy="38" r="3" fill="#c8443b"/>', '#24201a');
RELIC.astrolabe = icon('<circle cx="32" cy="32" r="18" fill="none" stroke="#c9b48a" stroke-width="3"/><ellipse cx="32" cy="32" rx="18" ry="7" fill="none" stroke="#7ab6d6" stroke-width="2" transform="rotate(30 32 32)"/><circle cx="32" cy="32" r="4" fill="#f0c060"/>', '#1a2030');
RELIC.belt = icon('<rect x="8" y="26" width="48" height="12" rx="3" fill="#8a6440"/><rect x="14" y="20" width="9" height="16" rx="3" fill="#c8443b"/><rect x="27" y="20" width="9" height="16" rx="3" fill="#5d8fd6"/><rect x="40" y="20" width="9" height="16" rx="3" fill="#6fae4a"/>', '#24201a');
RELIC.core = icon('<path d="M32 12 l16 20 l-16 20 l-16 -20z" fill="#7ab6d6"/><path d="M28 22 l6 10 l-4 4 l6 8" stroke="#1d2a33" stroke-width="2.5" fill="none"/>', '#16202a');
for (const [k, v] of Object.entries(RELIC)) put(`relic.${k}`, `icon/relic_${k}.svg`, v);
const INTENT = {
  attack: icon('<path d="M14 50 l30 -30 l6 0 l0 6 l-30 30z" fill="#e9dcbf"/><path d="M12 44 l8 8" stroke="#c8443b" stroke-width="6" stroke-linecap="round"/>'),
  defend: icon('<path d="M32 10 q14 8 22 6 q0 30 -22 42 q-22 -12 -22 -42 q8 2 22 -6z" fill="#5d8fd6"/>'),
  buff: icon('<path d="M32 10 l14 18 h-8 v24 h-12 v-24 h-8z" fill="#f0b23f"/>'),
  debuff: icon('<path d="M32 54 l14 -18 h-8 v-24 h-12 v24 h-8z" fill="#9b6ad6"/>'),
  unknown: icon('<text x="32" y="46" font-size="40" text-anchor="middle" fill="#e9dcbf" font-family="serif">?</text>'),
};
for (const [k, v] of Object.entries(INTENT)) put(`intent.${k}`, `icon/intent_${k}.svg`, v);
const NODE = {
  battle: icon('<path d="M18 46 l26 -26 M46 46 l-26 -26" stroke="#e9dcbf" stroke-width="6" stroke-linecap="round"/>'),
  elite: icon('<path d="M32 10 q18 6 18 24 q0 18 -18 22 q-18 -4 -18 -22 q0 -18 18 -24z" fill="#c8443b"/><path d="M24 30 l6 4 M40 30 l-6 4 M26 44 q6 -4 12 0" stroke="#1a0f0d" stroke-width="3" fill="none"/>'),
  rest: icon('<path d="M20 50 l24 -10 M20 40 l24 10" stroke="#8a6440" stroke-width="5" stroke-linecap="round"/><path d="M32 12 q12 12 8 24 q-4 6 -8 6 q-8 0 -8 -8 q0 -10 8 -22z" fill="#f08a3a"/>'),
  treasure: icon('<rect x="14" y="26" width="36" height="24" rx="3" fill="#8a6440"/><path d="M14 30 q18 -16 36 0" fill="#a8783c"/><rect x="28" y="32" width="8" height="8" fill="#f0c060"/>'),
  boss: icon('<path d="M10 22 l10 10 l12 -16 l12 16 l10 -10 l-4 30 h-36z" fill="#f0c060"/>'),
  shop: icon('<circle cx="32" cy="32" r="19" fill="#f0c060" stroke="#8a5a14" stroke-width="3"/><circle cx="32" cy="32" r="13" fill="none" stroke="#c48a2a" stroke-width="2"/><text x="32" y="40" font-size="20" font-weight="800" text-anchor="middle" fill="#7a4a10" font-family="serif">G</text>'),
  event: icon('<text x="32" y="47" font-size="40" font-weight="700" text-anchor="middle" fill="#c9b8f0" font-family="serif">?</text>'),
};
for (const [k, v] of Object.entries(NODE)) put(`node.${k}`, `icon/node_${k}.svg`, v);

/* ===== potions: a flask in the potion's colour ===== */
const flask = (c1, c2, shape = 'round') => icon((shape === 'round'
  ? '<path d="M26 12 h12 v10 q12 6 12 18 q0 14 -18 14 q-18 0 -18 -14 q0 -12 12 -18z" fill="#dfe6ee" opacity=".35"/><path d="M15 38 q2 -6 17 -6 q15 0 17 6 q0 14 -17 14 q-17 0 -17 -14z" fill="' + c1 + '"/>'
  : shape === 'tall' ? '<path d="M27 10 h10 v14 l6 6 v20 q0 4 -4 4 h-14 q-4 0 -4 -4 v-20 l6 -6z" fill="#dfe6ee" opacity=".35"/><path d="M21 34 h22 v16 q0 4 -4 4 h-14 q-4 0 -4 -4z" fill="' + c1 + '"/>'
  : '<path d="M24 12 h16 v8 l10 22 q2 10 -8 10 h-20 q-10 0 -8 -10 l10 -22z" fill="#dfe6ee" opacity=".35"/><path d="M18 36 h28 l4 6 q2 10 -8 10 h-20 q-10 0 -8 -10z" fill="' + c1 + '"/>')
  + '<rect x="25" y="8" width="14" height="6" rx="2" fill="#7a5a2a"/><circle cx="26" cy="40" r="3" fill="' + c2 + '" opacity=".8"/>', '#1e1c22');
const POTION = {
  fire: flask('#f06a2a', '#ffd27a'), explosive: flask('#e8a020', '#fff0a0', 'cone'), block: flask('#5d8fd6', '#cfe0ff', 'tall'),
  strength: flask('#c8443b', '#ffb0a0'), dexterity: flask('#6fae4a', '#d0f0a0', 'tall'), weak: flask('#8a7ad6', '#e0d8ff', 'cone'),
  fear: flask('#5a3a7a', '#c8a0e8'), energy: flask('#f0c040', '#fff4c0', 'tall'), swift: flask('#4ac0c8', '#c0f4f8', 'cone'),
  poison: flask('#7ccc4a', '#e0ffb0'), heal: flask('#e85a8a', '#ffd0e0'), fruit: flask('#f08a3a', '#ffe0a0', 'tall'),
};
for (const [k, v] of Object.entries(POTION)) put(`potion.${k}`, `icon/potion_${k}.svg`, v);

/* ===== scenes ===== */
put('scene.campfire', 'scene/campfire.svg', svg(200, 200, `
  <circle cx="100" cy="120" r="80" fill="#f08a3a" opacity=".12"/>
  <path d="M50 170 l100 -26 M50 144 l100 26" stroke="#6a4a2a" stroke-width="12" stroke-linecap="round"/>
  <path d="M100 40 q44 44 30 96 q-10 18 -30 18 q-24 0 -32 -20 q-10 -40 32 -94z" fill="#f08a3a"/>
  <path d="M100 86 q22 26 12 54 q-6 8 -12 8 q-14 0 -16 -14 q0 -24 16 -48z" fill="#ffd27a"/>`));

put('scene.merchant', 'scene/merchant.svg', svg(200, 200, `
  <circle cx="100" cy="110" r="84" fill="#f0c060" opacity=".08"/>
  <path d="M40 196 q4 -86 60 -96 q56 10 60 96z" fill="#3b3346"/>
  <path d="M62 96 q38 -76 76 0 q-6 22 -38 26 q-32 -4 -38 -26z" fill="#4a4058"/>
  <ellipse cx="100" cy="98" rx="24" ry="18" fill="#14111a"/>
  <circle cx="91" cy="98" r="3.5" fill="#ffd27a"/><circle cx="109" cy="98" r="3.5" fill="#ffd27a"/>
  <rect x="128" y="132" width="22" height="30" rx="5" fill="#2a2016"/><rect x="132" y="137" width="14" height="20" rx="3" fill="#ffc35a"/>
  <circle cx="139" cy="147" r="20" fill="#ffc35a" opacity=".22"/>`));

/* ===== event art: 780×440 (about 16:9, shown full width above the text) ===== */
const scene = (sky, ground, body) => svg(780, 440, `<rect width="780" height="440" fill="url(#sky)"/><path d="M0 330 q390 -40 780 0 v110 h-780z" fill="${ground}"/>${body}<rect width="780" height="440" fill="url(#vig)"/>`,
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient><radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`);
const EVENT = {
  shrine: scene(['#1c2430', '#2c3a2c'], '#1d261a', '<path d="M300 330 v-120 h180 v120" fill="#4d4f57"/><path d="M280 214 l110 -70 l110 70z" fill="#5c5e68"/><rect x="368" y="236" width="44" height="64" rx="8" fill="#2a2016"/><rect x="376" y="244" width="28" height="44" rx="5" fill="#f0c060"/><circle cx="390" cy="266" r="60" fill="#f0c060" opacity=".15"/><path d="M300 330 q-30 -20 -60 0 M480 330 q30 -20 60 0" stroke="#3a5a2c" stroke-width="16" fill="none"/>'),
  spring: scene(['#14202e', '#1e3a44'], '#162a26', '<ellipse cx="390" cy="352" rx="220" ry="42" fill="#5ab6c9" opacity=".75"/><ellipse cx="390" cy="346" rx="150" ry="22" fill="#bfeef5" opacity=".5"/><circle cx="300" cy="200" r="6" fill="#bfeef5"/><circle cx="470" cy="160" r="4" fill="#bfeef5"/><circle cx="420" cy="230" r="5" fill="#bfeef5"/><path d="M120 330 q20 -140 60 -200 M660 330 q-20 -150 -50 -210" stroke="#2c4a3a" stroke-width="22" fill="none"/>'),
  smith: scene(['#1e1614', '#3a2218'], '#22160f', '<rect x="300" y="250" width="180" height="40" rx="6" fill="#4d4f57"/><path d="M330 290 h120 l-20 40 h-80z" fill="#3a3c44"/><path d="M420 160 l70 -70 l14 14 l-70 70z" fill="#8c8f99"/><path d="M380 250 q10 -40 40 -40" stroke="#f08a3a" stroke-width="6" fill="none"/><circle cx="420" cy="244" r="40" fill="#f08a3a" opacity=".25"/><path d="M220 330 q0 -150 60 -170 q40 20 30 170" fill="#c9d2dc" opacity=".25"/>'),
  gambler: scene(['#191424', '#2a1e34'], '#1a1420', '<rect x="250" y="250" width="280" height="24" rx="6" fill="#5a3e1e"/><path d="M270 274 v56 M510 274 v56" stroke="#5a3e1e" stroke-width="12"/><circle cx="390" cy="160" r="46" fill="#e9dcbf"/><circle cx="374" cy="156" r="10" fill="#191424"/><circle cx="406" cy="156" r="10" fill="#191424"/><path d="M372 186 h36" stroke="#191424" stroke-width="5"/><rect x="330" y="226" width="26" height="26" rx="5" fill="#e9dcbf" transform="rotate(-12 343 239)"/><rect x="420" y="228" width="26" height="26" rx="5" fill="#e9dcbf" transform="rotate(10 433 241)"/><circle cx="343" cy="239" r="3" fill="#c8443b"/><circle cx="428" cy="236" r="3" fill="#191424"/><circle cx="438" cy="246" r="3" fill="#191424"/>'),
  ambush: scene(['#0f1216', '#1c2026'], '#121418', '<path d="M140 330 v-240 h60 v240 M580 330 v-260 h70 v260" fill="#262a30"/><circle cx="560" cy="210" r="6" fill="#f2a59c"/><circle cx="584" cy="210" r="6" fill="#f2a59c"/><circle cx="220" cy="240" r="5" fill="#f2a59c"/><circle cx="238" cy="240" r="5" fill="#f2a59c"/>'),
  library: scene(['#1a1714', '#2e2620'], '#1d1814', '<rect x="180" y="110" width="420" height="220" fill="#3a2c20"/><path d="M180 180 h420 M180 250 h420" stroke="#5a4430" stroke-width="10"/><path d="M200 172 v-56 M226 172 v-48 M260 172 v-60 M300 172 v-40 M480 172 v-58 M520 172 v-50 M220 242 v-52 M250 242 v-60 M440 242 v-46 M560 242 v-56" stroke="#8a6440" stroke-width="18"/><path d="M330 330 l60 -40 l60 40z" fill="#c9b48a"/><path d="M360 300 l60 30" stroke="#5a4430" stroke-width="3"/>'),
};
for (const [k, v] of Object.entries(EVENT)) put(`event.${k}`, `event/${k}.svg`, v);

const manifest = { $comment: '論理キー → ファイル。差し替えは右側のパスを変えるだけ（PNG/WebP/SVG）。無いキーは仮の絵で表示される', ...files };
writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${Object.keys(files).length} 個の画像を書き出しました`);
