import type { App } from './app.ts';
import type { ActionName } from './registry-names.ts';
import { newRun, leaveNode, restHeal } from '../engine/run.ts';
import { beginBattle, endTurn, confirmChoice } from './battle.ts';

/* ===== Actions the layout can call with on="tap: name(args) → TARGET".
   Return false to stop the automatic move to TARGET (the action navigates itself).
   Plugins can add more with registerAction(name, fn). ===== */

export type Action = (app: App, args: string[], target: string) => void | false;

export function resumeRun(app: App): void {
  const run = app.run!;
  switch (run.phase) {
    case 'battle': beginBattle(app); return;
    case 'reward': case 'treasure': app.go('REWARD'); return;
    case 'rest': app.ui.restDone = false; app.go('REST'); return;
    case 'won': case 'lost': app.go('RESULT'); return;
    default: app.go('MAP');
  }
}

export function startRunWith(app: App, charId: string) {
  app.run = newRun(app.content, charId);
  app.save();
  app.go('MAP');
}

const BUILTIN: Record<Exclude<ActionName, 'open' | 'close'>, Action> = {
  newRun(app) {
    const chars = app.playableCharacters();
    if (chars.length > 1 && app.layout.screens.has('CHARSELECT')) { app.ui.charId ||= chars[0].id; app.go('CHARSELECT'); return false; }
    startRunWith(app, chars[0].id);
    return false;
  },
  startRun(app) { startRunWith(app, app.ui.charId || app.playableCharacters()[0].id); return false; },
  continueRun(app) {
    const r = app.loadSave(); if (!r) return false;
    app.run = r;
    resumeRun(app);
    return false;
  },
  abandonRun(app) { app.clearSave(); app.run = null; app.refresh(); },
  toTitle(app) { app.run = null; },
  showPile(app, args) { app.ui.pile = (args[0] as 'draw' | 'discard' | 'exhaust') || 'draw'; },
  endTurn(app) { endTurn(app); },
  confirmChoice(app) { confirmChoice(app); },
  leaveNode(app) { if (app.run) { leaveNode(app.run); app.save(); } },
  restHeal(app) {
    if (!app.run || app.ui.restDone) return;
    const n = restHeal(app.content, app.run);
    app.ui.restDone = true; app.save();
    app.setFace('happy', 1200);
    app.sound.se('heal');
    app.vfx.float(app.node('player.hp'), `+${n}`, 'heal');
    app.refresh();
  },
  toggleSound(app) { app.sound.toggle(); app.refresh(); },
};

export const ACTIONS: Record<string, Action> = { ...BUILTIN };
export function registerAction(name: string, fn: Action) { ACTIONS[name] = fn; }
