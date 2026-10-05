import type { VfxPresets, VfxStep } from '../engine/types.ts';

/* Effect presets from vfx.json, played with the Web Animations API.
   New "fx" kinds are added in FX below; the data decides which preset each moment uses. */

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type FxFn = (el: HTMLElement, s: VfxStep, stage: HTMLElement) => Animation | void;

const FX: Record<string, FxFn> = {
  flash: (el, s) => el.animate([{ filter: 'brightness(2.6) saturate(0)' }, { filter: 'none' }], { duration: Number(s.ms ?? 90) }),
  shake: (el, s) => {
    const px = Number(s.px ?? 6);
    return el.animate([0, -px, px, -px * 0.6, px * 0.4, 0].map(x => ({ translate: `${x}px 0` })), { duration: Number(s.ms ?? 220) });
  },
  lunge: (el, s) => el.animate([{ scale: '1' }, { scale: String(s.scale ?? 1.12), offset: 0.4 }, { scale: '1' }], { duration: Number(s.ms ?? 280), easing: 'ease-out' }),
  glow: (el, s) => el.animate([{ filter: `drop-shadow(0 0 0 ${s.color ?? '#fc6'})` }, { filter: `drop-shadow(0 0 18px ${s.color ?? '#fc6'})` }, { filter: 'none' }], { duration: Number(s.ms ?? 400) }),
  dissolve: (el, s) => el.animate([{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'blur(6px) brightness(1.8)', translate: '0 12px' }], { duration: Number(s.ms ?? 600), fill: 'forwards' }),
  screenShake: (_el, s, stage) => {
    const px = Number(s.px ?? 8);
    return stage.animate([0, px, -px, px * 0.5, -px * 0.3, 0].map((x, i) => ({ translate: `${x}px ${i % 2 ? -x / 2 : x / 3}px` })), { duration: Number(s.ms ?? 250), composite: 'add' });
  },
  vignette: (_el, s, stage) => {
    const v = document.createElement('div');
    v.className = 'fx-vignette';
    v.style.setProperty('--vc', String(s.color ?? 'rgba(200,30,30,.5)'));
    stage.appendChild(v);
    const a = v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Number(s.ms ?? 350) });
    a.onfinish = () => v.remove();
    return a;
  },
  fly: (el, s) => el.animate([{ translate: '0 0', scale: '1', opacity: 1 }, { translate: '0 -120px', scale: '0.8', opacity: 0 }], { duration: Number(s.ms ?? 240), fill: 'forwards' }),
};

export function registerFx(name: string, fn: FxFn) { FX[name] = fn; }

export class Vfx {
  presets: VfxPresets;
  stage: HTMLElement;
  constructor(presets: VfxPresets, stage: HTMLElement) { this.presets = presets; this.stage = stage; }
  play(name: string | undefined, el: HTMLElement | null): void {
    if (!name || !el) return;
    const steps = this.presets[name];
    if (!steps) return;
    for (const s of steps) {
      if (reduce() && s.fx !== 'dissolve' && s.fx !== 'vignette') continue;
      FX[s.fx]?.(el, s, this.stage);
    }
  }
  /** floating number / word over an element */
  float(el: HTMLElement | null, text: string, kind: string) {
    if (!el) return;
    const r = el.getBoundingClientRect(), sr = this.stage.getBoundingClientRect();
    const scale = sr.width / this.stage.offsetWidth || 1;
    const f = document.createElement('div');
    f.className = `fx-float fx-${kind}`;
    f.textContent = text;
    f.style.left = `${(r.left + r.width / 2 - sr.left) / scale}px`;
    f.style.top = `${(r.top + r.height * 0.35 - sr.top) / scale}px`;
    this.stage.appendChild(f);
    const a = f.animate([{ translate: '-50% 0', opacity: 0, scale: '0.6' }, { translate: '-50% -18px', opacity: 1, scale: '1.15', offset: 0.2 }, { translate: '-50% -54px', opacity: 0, scale: '1' }], { duration: 900, easing: 'ease-out' });
    a.onfinish = () => f.remove();
  }
}
