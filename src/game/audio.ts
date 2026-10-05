import type { Content } from '../engine/content.ts';

/* ===== Sound: sound effects by moment name, music by screen (audio.json).
   A moment or track without a file is simply silent. Browsers only allow sound after the first tap. */

const MUTE_KEY = 'rlce/muted';

export class Sound {
  private c: Content;
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private bgmSrc: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmKey = '';
  private wanted = '';
  muted: boolean;

  constructor(c: Content) {
    this.c = c;
    let m = false; try { m = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* no storage */ }
    this.muted = m;
    const unlock = () => { this.ensure(); if (this.wanted) this.bgm(this.wanted, true); };
    addEventListener('pointerdown', unlock, { once: true });
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try { this.ctx = new AudioContext(); } catch { return null; }
    return this.ctx;
  }
  private load(key: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (p) return p;
    const url = this.c.assets.get(key);
    const ctx = this.ensure();
    p = !url || !ctx ? Promise.resolve(null) : fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => ctx.decodeAudioData(b)).catch(() => null);
    this.buffers.set(key, p);
    return p;
  }
  private vol(kind: 'se' | 'bgm', key: string) {
    const v = this.c.audio.volume ?? {};
    return (v.master ?? 1) * (v[kind] ?? (kind === 'se' ? 0.8 : 0.5)) * (this.c.audio.tracks?.[key]?.volume ?? 1);
  }

  /** play a sound effect by moment name (audio.json → se) or directly by asset key */
  se(moment: string) {
    if (this.muted) return;
    const key = this.c.audio.se?.[moment] ?? moment;
    if (!this.c.assets.has(key) || !this.ctx) return;
    void this.load(key).then(buf => {
      if (!buf || !this.ctx || this.muted) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = this.vol('se', key);
      src.connect(g).connect(this.ctx.destination); src.start();
    });
  }

  /** switch music to a screen / situation name (audio.json → bgm) or an asset key; null stops it */
  bgm(name: string | null, force = false) {
    this.wanted = name ?? '';
    const key = name ? this.c.audio.bgm?.[name] ?? name : '';
    if (!force && key === this.bgmKey) return;
    this.stopBgm();
    this.bgmKey = key;
    if (!key || this.muted || !this.c.assets.has(key) || !this.ctx) return;
    void this.load(key).then(buf => {
      if (!buf || !this.ctx || this.bgmKey !== key || this.muted) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const t = this.c.audio.tracks?.[key];
      if (t?.loopEnd) { src.loopStart = t.loopStart ?? 0; src.loopEnd = t.loopEnd; }
      const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(this.vol('bgm', key), this.ctx.currentTime + 0.6);
      src.connect(g).connect(this.ctx.destination); src.start();
      this.bgmSrc = src; this.bgmGain = g;
    });
  }
  private stopBgm() {
    const s = this.bgmSrc, g = this.bgmGain;
    if (s && g && this.ctx) { g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4); setTimeout(() => { try { s.stop(); } catch { /* already stopped */ } }, 450); }
    this.bgmSrc = null; this.bgmGain = null;
  }

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.muted) { this.stopBgm(); this.bgmKey = ''; } else { this.ensure(); this.bgm(this.wanted, true); }
  }
}
