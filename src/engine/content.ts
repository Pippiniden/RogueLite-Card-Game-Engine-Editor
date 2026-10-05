import type {
  CardDef, StatusDef, RelicDef, EnemyDef, EncounterDef, CharacterDef, Rules, VfxPresets, Theme, TextTable, AudioDef,
  PackManifest, ContentKind, CardInst,
} from './types.ts';

/* ===== Content database =====
   Packs are loaded in order (packs/index.json). A later pack replaces an entry with the same id,
   or merges into it when the entry has "$patch": true. Object files (rules, theme, text, vfx) are deep-merged. */

export interface Content {
  packs: PackManifest[];
  cards: Map<string, CardDef>;
  statuses: Map<string, StatusDef>;
  relics: Map<string, RelicDef>;
  enemies: Map<string, EnemyDef>;
  encounters: Map<string, EncounterDef>;
  characters: Map<string, CharacterDef>;
  rules: Rules;
  vfx: VfxPresets;
  theme: Theme;
  text: TextTable;
  audio: AudioDef;
  /** plugin module paths, in load order */
  plugins: string[];
  /** QLAYOUT text of the last pack that has one */
  layout: string;
  /** logical asset key → URL */
  assets: Map<string, string>;
}

const LIST_KINDS = ['cards', 'statuses', 'relics', 'enemies', 'encounters', 'characters'] as const;
const OBJ_KINDS = ['rules', 'vfx', 'theme', 'text', 'audio'] as const;

export type ReadText = (path: string) => Promise<string>;

function isObj(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}

/** `only` replaces the pack order from index.json (the game passes ?packs=base,skin-demo) */
export async function loadContent(root: string, read: ReadText, only?: string[]): Promise<Content> {
  const idx = only?.length ? { packs: only } : JSON.parse(await read(`${root}/index.json`)) as { packs: string[] };
  const c: Content = {
    packs: [], cards: new Map(), statuses: new Map(), relics: new Map(), enemies: new Map(),
    encounters: new Map(), characters: new Map(),
    rules: {} as Rules, vfx: {}, theme: {} as Theme,
    text: { ui: {}, keywords: {}, effects: {}, intents: {}, nodes: {}, cardTypes: {}, rarities: {} },
    audio: { se: {}, bgm: {} }, plugins: [], layout: '', assets: new Map(),
  };
  for (const packId of idx.packs) {
    const dir = `${root}/${packId}`;
    const man = JSON.parse(await read(`${dir}/pack.json`)) as PackManifest;
    c.packs.push(man);
    for (const kind of [...LIST_KINDS, ...OBJ_KINDS] as ContentKind[]) {
      const f = man.files[kind]; if (!f) continue;
      for (const file of Array.isArray(f) ? f : [f]) {
        const data = JSON.parse(await read(`${dir}/${file}`));
        if ((LIST_KINDS as readonly string[]).includes(kind)) {
          const map = c[kind as typeof LIST_KINDS[number]] as Map<string, { id: string }>;
          for (const item of data as ({ id: string; $patch?: boolean })[]) {
            if (item.$patch && map.has(item.id)) { const { $patch, ...rest } = item; map.set(item.id, deepMerge(map.get(item.id)!, rest)); }
            else map.set(item.id, item);
          }
        } else {
          (c as unknown as Record<string, unknown>)[kind] = deepMerge((c as unknown as Record<string, unknown>)[kind], data);
        }
      }
    }
    for (const p of man.plugins ?? []) c.plugins.push(`${dir}/${p}`);
    if (man.layout) c.layout = await read(`${dir}/${man.layout}`);
    if (man.assets) {
      const m = JSON.parse(await read(`${dir}/${man.assets}`)) as Record<string, string>;
      const base = man.assets.includes('/') ? man.assets.slice(0, man.assets.lastIndexOf('/') + 1) : '';
      for (const [k, v] of Object.entries(m)) if (!k.startsWith('$')) c.assets.set(k, /^(https?:|data:)/.test(v) ? v : `${dir}/${base}${v}`);
    }
  }
  // older packs used a single cardPool string
  for (const ch of c.characters.values()) {
    const legacy = (ch as unknown as { cardPool?: string }).cardPool;
    if (!ch.cardPools) ch.cardPools = legacy ? [legacy] : [];
  }
  return c;
}

/** the effective definition of a card instance (upgrade applied) */
export function cardView(c: Content, inst: Pick<CardInst, 'id' | 'up'>): CardDef {
  const d = c.cards.get(inst.id);
  if (!d) return { id: inst.id, name: `?${inst.id}`, type: 'status', rarity: 'special', cost: null, target: 'none', effects: [] };
  if (!inst.up || !d.upgrade) return d;
  const u = d.upgrade;
  return { ...d, ...u, name: u.name ?? d.name + '+', effects: u.effects ?? d.effects, keywords: u.keywords ?? d.keywords };
}
export const canUpgrade = (c: Content, inst: CardInst) => !inst.up && !!c.cards.get(inst.id)?.upgrade;
