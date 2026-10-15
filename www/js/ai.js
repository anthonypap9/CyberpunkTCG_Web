// AI opponent. It never needs per-card knowledge: every candidate action is simulated with the real
// rules engine and the resulting position is scored by a simple evaluation function.
//   Learner  - often plays a random legal move, blocks at random, never plans ahead.
//   Standard - greedy: plays the move whose resulting position scores best.
//   Sharp    - same, plus a second-move lookahead and it assumes you will respond with your best defence.

import { act, legalActions, power, def, rival, hasBlocker } from './engine.js';

export const LEVELS = ['learner', 'standard', 'sharp'];

function sideScore(S, p) {
  const P = S.players[p];
  let s = 0;
  for (const c of P.hand) s += 0.9 + 0.1 * (def(c).cost || 0);
  for (const e of P.eddies) s += e.spent ? 1.0 : 1.4;
  for (const u of P.field) {
    const v = 1.5 + 0.8 * power(S, u) + (hasBlocker(u) ? 1.2 : 0) + 0.4 * u.gear.length;
    s += u.spent ? v * 0.7 : v;
  }
  for (const l of P.legends) s += l.faceUp ? 1.2 : 0.3;
  return s;
}

export function evaluate(S, me) {
  if (S.winner != null) return S.winner === me ? 1e6 : -1e6;
  const M = S.players[me], R = S.players[rival(me)];
  const gigs = (P) => P.gigs.reduce((a, d) => a + 11 + 0.25 * d.sides, 0);
  return gigs(M) - gigs(R) + sideScore(S, me) - sideScore(S, rival(me));
}

function tryAct(S, a) {
  const r = act(S, a);
  return r.ok ? r.state : null;
}

// Resolve small decisions that follow an action, so we can score the settled position.
// Our own decisions are chosen greedily; the rival's are chosen adversarially (worst for us).
function settleDecisions(T, me, budget = 12) {
  for (let i = 0; i < budget && T.winner == null; i++) {
    const pd = T.pending;
    if (!pd || (pd.kind !== 'react' && pd.kind !== 'choose')) break;
    const options = legalActions(T);
    if (!options.length) break;
    let best = null, bestScore = pd.player === me ? -Infinity : Infinity;
    for (const a of options) {
      // for reactions we look only one step ahead and treat "pass" as the default continuation
      let N = tryAct(T, a);
      if (!N) continue;
      if (N.pending && N.pending.kind === 'react' && a.type !== 'pass') N = tryAct(N, { type: 'pass', player: N.pending.player }) || N;
      const sc = evaluate(N, me);
      if (pd.player === me ? sc > bestScore : sc < bestScore) { best = N; bestScore = sc; }
    }
    if (!best) break;
    T = best;
  }
  return T;
}

function simulate(S, a, me) {
  const N = tryAct(S, a);
  return N ? settleDecisions(N, me) : null;
}

const sellableCount = (hand) => hand.filter((c) => def(c).sell).length;

function mulliganChoice(S, p) {
  const hand = S.players[p].hand;
  const cheap = hand.filter((c) => def(c).cost != null && def(c).cost <= 3 && def(c).type !== 'program').length;
  return !(sellableCount(hand) >= 2 && cheap >= 1);
}

/** Pick an action for whoever has to decide now. `rand` is injectable for tests. */
export function aiAct(S, level = 'standard', rand = Math.random) {
  const acts = legalActions(S);
  if (!acts.length) return null;
  const pd = S.pending;
  const me = pd ? pd.player : S.active;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  if (pd) {
    switch (pd.kind) {
      case 'chooseOrder': return pick(acts);
      case 'mulligan': return acts.find((a) => a.mulligan === mulliganChoice(S, me));
      case 'gainGig': return pick(acts);
      default: break;
    }
    if (level === 'learner' && rand() < 0.5) return pick(acts);
    let best = acts[0], bestScore = -Infinity;
    for (const a of acts) {
      let T = tryAct(S, a);
      if (!T) continue;
      if (T.pending && T.pending.kind === 'react' && a.type !== 'pass') T = tryAct(T, { type: 'pass', player: T.pending.player }) || T;
      T = settleDecisions(T, me);
      const sc = evaluate(T, me) + rand() * 0.01;
      if (sc > bestScore) { best = a; bestScore = sc; }
    }
    return best;
  }

  // ---- main phase
  const end = acts.find((a) => a.type === 'endTurn');
  const moves = acts.filter((a) => a.type !== 'endTurn');
  if (!moves.length) return end;
  if (level === 'learner') {
    if (rand() < 0.3) return end;
    return pick(moves);
  }
  const base = evaluate(S, me);
  const scored = [];
  for (const a of moves) {
    const T = simulate(S, a, me);
    if (T) scored.push({ a, T, s: evaluate(T, me) + rand() * 0.01 });
  }
  scored.sort((x, y) => y.s - x.s);
  if (level === 'sharp') {
    let bestVal = base + 0.05, bestA = null;
    for (const c of scored.slice(0, 6)) {
      let val = c.s;
      if (!c.T.pending && c.T.winner == null && c.T.active === me) {
        for (const a2 of legalActions(c.T).filter((x) => x.type !== 'endTurn')) {
          const T2 = simulate(c.T, a2, me);
          if (T2) val = Math.max(val, evaluate(T2, me) - 0.01);
        }
      }
      if (val > bestVal && c.s > base + 0.05) { bestVal = val; bestA = c.a; }
    }
    return bestA || end;
  }
  return scored.length && scored[0].s > base + 0.05 ? scored[0].a : end;
}
