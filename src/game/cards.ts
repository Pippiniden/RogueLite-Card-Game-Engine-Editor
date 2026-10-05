import type { Content } from '../engine/content.ts';
import { cardView } from '../engine/content.ts';
import type { CardDef, CardInst, Combatant } from '../engine/types.ts';
import type { Combat } from '../engine/combat.ts';
import { describeCard, type Part } from '../engine/describe.ts';
import { img } from './assets.ts';
import { skinClass } from './skins.ts';

/* Card face, built from the definition + theme. One function for the hand, lists, rewards,
   previews and the editor. Frame / cost gem / text panel use 9-slice skins when provided. */

const esc = (s: string) => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!));
export function partsHtml(lines: Part[][]): string {
  return lines.map(l => `<span class="ln">${l.map(p => p.k ? `<b class="p-${p.k}">${esc(p.t)}</b>` : esc(p.t)).join('')}</span>`).join('');
}

export interface CardOpts { combat?: Combat; target?: Combatant; playable?: boolean }

export function renderCard(c: Content, card: CardInst | CardDef, opts: CardOpts = {}): HTMLElement {
  const inst = 'uid' in card ? card : null;
  const d = inst ? cardView(c, inst) : (card as CardDef);
  const el = document.createElement('div');
  const len = [...d.name].length;
  el.className = `card ct-${d.type} cr-${d.rarity} ${skinClass(`card.frame.${d.type}`)}${inst?.up ? ' up' : ''}${len > 6 ? ' name-xl' : len > 4 ? ' name-l' : ''}`;
  if (inst) el.dataset.uid = String(inst.uid);
  el.innerHTML = `
    <div class="card-in ${skinClass('card.panel')}">
      <div class="card-art"></div>
      <div class="card-name"><span>${esc(d.name)}</span></div>
      <div class="card-type">${esc(c.text.cardTypes[d.type] ?? d.type)}</div>
      <div class="card-text"></div>
    </div>
    <div class="card-cost ${skinClass('card.cost')}"></div>`;
  el.querySelector('.card-art')!.appendChild(img(c, d.art, d.name));
  fillCard(c, el, card, opts);
  return el;
}

/** refresh the parts that change during combat (numbers, cost) without rebuilding the card */
export function fillCard(c: Content, el: HTMLElement, card: CardInst | CardDef, opts: CardOpts) {
  const inst = 'uid' in card ? card : null;
  const d = inst ? cardView(c, inst) : (card as CardDef);
  const text = el.querySelector('.card-text');
  if (text) text.innerHTML = partsHtml(describeCard(c, d, opts.combat, opts.target));
  const costEl = el.querySelector<HTMLElement>('.card-cost')!;
  const cost = inst && opts.combat ? opts.combat.costOf(inst) : d.cost;
  costEl.hidden = cost === null;
  costEl.textContent = cost === null ? '' : String(cost);
  costEl.classList.toggle('changed', typeof d.cost === 'number' && typeof cost === 'number' && cost !== d.cost);
  el.classList.toggle('cant', opts.playable === false);
}
export const refreshCardText = fillCard;
