// Cyberpunk TCG rules engine (Beta rules, Comprehensive Rules of 1 Sep 2026 / Gameplay Guide).
// Pure JS, no DOM. State is plain JSON so it can be cloned for undo and AI search.
//
//   const S = newGame({ decks: [deckA, deckB], seed });
//   const r = act(S, { type: 'sell', player: 0, card: 'c12' });   // -> { ok, state } | { ok:false, error }
//   legalActions(S)                                              // every currently legal action
//
// Anything the engine had to assume because the public rules don't say is marked ASSUMPTION.

import { CARDS, expandMain, displayName } from './cards.js';
import { EFFECTS, ABILITIES } from './effects.js';

export const SIDES = [4, 6, 8, 10, 12, 20];
export const def = (inst) => CARDS[inst.card];
export const rival = (p) => 1 - p;
export const dn = (x) => displayName(x.card ? def(x) : x);

// ---------------------------------------------------------------- RNG (mulberry32, state kept in S.seed)
function rnd(S) {
  S.seed = (S.seed + 0x6d2b79f5) >>> 0;
  let t = S.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (S, n) => Math.floor(rnd(S) * n);
function shuffle(S, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rint(S, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function log(S, text) {
  S.log.push({ turn: S.turnNo, text });
  if (S.log.length > 400) S.log.shift();
}

function mk(S, card, owner) {
  return { id: 'c' + (++S.nextId), card, owner, spent: false, lag: false, gear: [], faceUp: false, tempPower: 0, stole: false };
}

// ---------------------------------------------------------------- setup
export function newGame({ decks, seed = (Date.now() >>> 0), names = ['Player', 'Rival'], first = null }) {
  const S = { seed: seed >>> 0, nextId: 0, players: [], active: 0, turnNo: 0, stage: 'setup', winner: null, winReason: null, overtime: false, pending: null, queue: [], combat: null, after: null, log: [], names, first: null, roll: [0, 0] };
  for (let p = 0; p < 2; p++) {
    const d = decks[p];
    const P = {
      deck: [], hand: [], trash: [], legends: [], field: [], eddies: [], stash: [],
      fixer: SIDES.map((s) => ({ id: `p${p}d${s}`, sides: s, value: s })), gigs: [],
      turnsTaken: 0, sold: false, called: false, gigShield: false, noDefeat: false, arasakaAttacked: false, blueTriggered: false, known: [],
    };
    S.players.push(P);
    P.deck = shuffle(S, expandMain(d.main).map((id) => mk(S, id, p)));
    P.legends = shuffle(S, d.legends.map((id) => mk(S, id, p)));
    for (let i = 0; i < 6; i++) P.hand.push(P.deck.shift());
  }
  do { S.roll = [1 + rint(S, 20), 1 + rint(S, 20)]; } while (S.roll[0] === S.roll[1]);
  const winner = S.roll[0] > S.roll[1] ? 0 : 1;
  log(S, `${names[0]} rolled ${S.roll[0]}, ${names[1]} rolled ${S.roll[1]}. ${names[winner]} chooses who goes first.`);
  if (first === null) S.pending = { kind: 'chooseOrder', player: winner };
  else beginMulligans(S, first);
  return S;
}

function beginMulligans(S, first) {
  S.first = first;
  const P = S.players[first];
  // The first player spends their two left-most Legends; they do not ready on the first turn.
  P.legends.slice(0, 2).forEach((l) => { l.spent = true; l.skipReady = true; });
  S.mulls = [first, rival(first)];
  S.pending = { kind: 'mulligan', player: S.mulls[0] };
}

// Test/tutorial helper: put a fresh card instance into a zone (hand, field, eddies, trash, deck, legends).
export function spawn(S, p, zone, card, o = {}) {
  const inst = mk(S, card, p);
  Object.assign(inst, o);
  S.players[p][zone].push(inst);
  return inst;
}

// ---------------------------------------------------------------- lookups
export function locate(S, id) {
  for (const p of [0, 1]) {
    const P = S.players[p];
    const u = P.field.find((x) => x.id === id); if (u) return { inst: u, owner: p, zone: 'field' };
    const l = P.legends.find((x) => x.id === id); if (l) return { inst: l, owner: p, zone: 'legends' };
  }
  return null;
}
export const find = (S, id) => locate(S, id)?.inst || null;
export function findGear(S, id) {
  for (const p of [0, 1]) {
    const P = S.players[p];
    for (const h of [...P.field, ...P.legends]) { const g = h.gear.find((x) => x.id === id); if (g) return { gear: g, host: h }; }
  }
  return null;
}

export function power(S, inst, attacking = false) {
  const d = def(inst);
  let p = (d.power || 0) + (inst.tempPower || 0);
  for (const g of inst.gear) p += def(g).power || 0;
  if (inst.card === 'royce-psycho-on-the-edge' && S.active === inst.owner) p += 2 * inst.gear.length;
  if (attacking && S.players[inst.owner].field.some((x) => x.card === 'saul-bright-stormrider' && x !== inst)) p += 2;
  if (attacking && d.tags.includes('ARASAKA') && S.players[inst.owner].legends.some((l) => l.faceUp && l.card === 'saburo-arasaka-stubborn-patriarch')) p += 1;
  return Math.max(0, p);
}
export const cred = (S, p) => S.players[p].gigs.reduce((a, d) => a + d.value, 0);
export const hasBlocker = (inst) => !!def(inst).kw.blocker || inst.tempBlocker || inst.gear.some((g) => def(g).kw.blocker);

// Units can't attack the turn they are played (Lag) unless something lets them. Returns null (no),
// or which targets are allowed: 'any' | 'gigs' | 'units'.
export function lagRule(S, u) {
  const R = S.players[rival(u.owner)], M = S.players[u.owner];
  if (R.field.some((x) => x.card === 'maxtac-suppression-team')) return null;
  const d = def(u);
  if (d.kw.adrenaline || u.freeAttack === 'any') return 'any';
  if (u.freeAttack) return u.freeAttack;
  if (u.gear.some((g) => g.card === 'adrenaline-converter') && R.gigs.length >= M.gigs.length + 2) return 'any';
  if (u.card === 'nadia-fighting-through-grief' && R.gigs.length > M.gigs.length) return 'gigs';
  if (u.card === 'sandayu-oda-hanako-s-guardian') return 'units';
  return null;
}

// Printed cost with the card's own reductions (never below 1 when reduced).
export function costOf(S, p, c, { extra = true } = {}) {
  const d = def(c);
  if (d.cost == null) return d.cost;
  const P = S.players[p], R = S.players[rival(p)];
  let cost = d.cost;
  switch (c.card) {
    case 'octant': case 'carnage-at-the-colosseum': cost -= P.gigs.filter((g) => g.value >= 8).length; break;
    case 'trauma-team-operatives': cost -= P.trash.filter((x) => def(x).type === 'unit').length; break;
    case 'maxtac-heavy': cost -= R.field.length; break;
    case 'zetatech-berserk': cost -= P.legends.filter((l) => l.faceUp).length; break;
    case 'we-gotta-live-together': if (R.gigs.length >= P.gigs.length + 2) cost = Math.min(cost, 3); break;
    case 'nocturne-op55-n1': if (!P.fixer.length) cost = 1; break;
    default: break;
  }
  if (extra) {
    if (d.type === 'gear' && d.tags.includes('CYBERWARE') && !P.cyberUsed && P.field.some((u) => u.card === 'viktor-vektor-drop-your-illusions')) cost -= 3;
    if (d.type === 'program' && P.programDiscount) cost -= P.programDiscount;
  }
  if (cost !== d.cost) cost = Math.max(1, cost);
  return cost;
}
export function goSoloCost(S, p, l) {
  let cost = def(l).cost;
  const R = S.players[rival(p)];
  if ([...R.field, ...R.legends].some((h) => h.gear.some((g) => g.card === 'riot-shield'))) cost += 2;
  if (S.players[p].goSoloDiscount) cost = Math.max(1, cost - S.players[p].goSoloDiscount);
  return cost;
}
const isArasaka = (inst) => def(inst).tags.includes('ARASAKA');

// ---------------------------------------------------------------- drawing / winning
function win(S, p, reason) {
  if (S.winner == null) { S.winner = p; S.winReason = reason; log(S, `${S.names[p]} wins: ${reason}`); }
}
function draw(S, p, n) {
  const P = S.players[p];
  for (let i = 0; i < n; i++) {
    if (S.winner != null) return;
    if (!P.deck.length) { win(S, rival(p), `${S.names[p]} had to draw from an empty deck`); return; }
    P.hand.push(P.deck.shift());
  }
  if (n) log(S, `${S.names[p]} draws ${n}.`);
}

// ---------------------------------------------------------------- effect frames
function stepsFor(f) {
  if (f.src === 'internal') return INTERNAL[f.card][f.trig];
  if (f.src === 'legend') return EFFECTS.legendTriggers?.[f.card]?.[f.trig] || [];
  return EFFECTS[f.card]?.[f.trig] || [];
}
function queueFrame(S, card, trig, owner, extra = {}) {
  const src = extra.src || 'card';
  const has = src === 'internal' ? true : src === 'legend' ? !!EFFECTS.legendTriggers?.[card]?.[trig] : !!EFFECTS[card]?.[trig];
  if (!has) return;
  S.queue.push({ card, trig, owner, src, self: extra.self || null, host: extra.host || null, i: 0, answer: null, nextAnswer: null, d: extra.d || {} });
}
const fire = (S, inst, trig) => queueFrame(S, inst.card, trig, inst.owner, { self: inst.id });
function fireGear(S, host, trig) {
  for (const g of host.gear) queueFrame(S, g.card, trig, host.owner, { self: g.id, host: host.id });
}
function legendTrigger(S, p, trig) {
  for (const l of S.players[p].legends) if (l.faceUp) queueFrame(S, l.card, trig, p, { src: 'legend', self: l.id });
}

function spendInst(S, inst) {
  if (inst.spent) return false;
  inst.spent = true;
  fireGear(S, inst, 'spend');
  if (S.players[inst.owner].field.includes(inst)) {
    queueFrame(S, inst.card, 'spent', inst.owner, { self: inst.id });
    for (const u of S.players[inst.owner].field) if (u !== inst) queueFrame(S, u.card, 'friendSpent', u.owner, { self: u.id, d: { equipped: inst.gear.length > 0, by: inst.id } });
  } else if (inst.gear.length) for (const u of S.players[inst.owner].field) queueFrame(S, u.card, 'friendSpent', u.owner, { self: u.id, d: { equipped: true, by: inst.id } });
  return true;
}

function bottomDeck(S, inst) {
  const P = S.players[inst.owner];
  const i = P.field.indexOf(inst);
  if (i < 0) return;
  P.field.splice(i, 1);
  for (const g of inst.gear) P.trash.push(g);
  inst.gear = [];
  log(S, `${dn(inst)} is put on the bottom of its owner's deck.`);
  if (inst.isLegend) return; // removed from the game
  Object.assign(inst, { spent: false, lag: false, tempPower: 0, stole: false, noReady: false, noAttack: false, freeAttack: null, tempBlocker: false, safeFight: false, mustAttack: 0, cyber: false, fought: false, fightBonus: 0, stealMinus: 0, firstWin: false, firstSteal: false, once: {}, hitReady: false, jackieChecked: false });
  P.deck.push(inst);
}
function returnToHand(S, inst) {
  const P = S.players[inst.owner];
  const i = P.field.indexOf(inst);
  if (i < 0) return;
  P.field.splice(i, 1);
  for (const g of inst.gear) P.trash.push(g);
  inst.gear = [];
  log(S, `${dn(inst)} returns to its owner's hand.`);
  if (inst.isLegend) return;
  Object.assign(inst, { spent: false, lag: false, tempPower: 0, stole: false, noReady: false, noAttack: false, freeAttack: null, tempBlocker: false, safeFight: false, mustAttack: 0, cyber: false, fought: false, fightBonus: 0, stealMinus: 0, firstWin: false, firstSteal: false, once: {}, hitReady: false, jackieChecked: false });
  P.hand.push(inst);
}

function defeat(S, inst) {
  const P = S.players[inst.owner];
  const i = P.field.indexOf(inst);
  if (i < 0) return;
  const dm = inst.gear.find((g) => g.card === 'deadman-transmitter');
  if (dm) { inst.gear = inst.gear.filter((g) => g !== dm); P.trash.push(dm); log(S, `Deadman Transmitter is defeated instead of ${dn(inst)}.`); return; }
  if (!inst.isLegend && !inst.jackieChecked) {
    const j = P.field.find((x) => x.card === 'jackie-welles-mama-s-favorite' && x !== inst);
    if (j) { const src = sources(S, inst.owner); if (src.eds.length + src.legs.length >= 1) { queueFrame(S, j.card, 'jackieSave', inst.owner, { self: j.id, d: { unit: inst.id } }); return; } }
  }
  P.field.splice(i, 1);
  log(S, `${dn(inst)} is defeated.`);
  fire(S, inst, 'defeated');
  fireGear(S, inst, 'defeated');
  if (inst.gear.length && !inst.isLegend) legendTrigger(S, inst.owner, 'friendDefeatedEquipped');
  for (const g of inst.gear) P.trash.push(g);
  inst.gear = [];
  if (inst.isLegend) { log(S, `${dn(inst)} is removed from the game.`); return; }
  Object.assign(inst, { spent: false, lag: false, tempPower: 0, stole: false, noReady: false, noAttack: false, freeAttack: null, tempBlocker: false, safeFight: false, mustAttack: 0, cyber: false, fought: false, fightBonus: 0, stealMinus: 0, firstWin: false, firstSteal: false, once: {}, hitReady: false, jackieChecked: false });
  P.trash.push(inst);
}

function doCall(S, p, { free = false, legendId = null } = {}) {
  const P = S.players[p];
  if (P.called) return false;
  const down = P.legends.filter((l) => !l.faceUp);
  if (!down.length) return false;
  const pick = legendId ? down.find((l) => l.id === legendId) : down[rint(S, down.length)];
  if (!pick) return false;
  P.called = true;
  pick.faceUp = true;
  log(S, `${S.names[p]} Calls ${dn(pick)}${free ? ' for free' : ''}.`);
  fire(S, pick, 'call');
  return true;
}

function makeG(S) {
  const G = {
    S,
    def, find: (id) => find(S, id), findGear: (id) => findGear(S, id), dn, power: (u) => power(S, u),
    P: (p) => S.players[p], name: (p) => S.names[p], cred: (p) => cred(S, p), log: (t) => log(S, t),
    draw: (p, n) => draw(S, p, n), defeat: (u) => defeat(S, u), spend: (u) => spendInst(S, u),
    callLegend: (p, o) => doCall(S, p, o),
    canPay: (p, n) => { const x = sources(S, p); return x.eds.length + x.legs.length >= n; },
    pay: (p, n, ids) => pay(S, p, n, ids),
    die: (id) => { for (const P of S.players) { const d = P.gigs.find((x) => x.id === id); if (d) return d; } return null; },
    dieOwner: (id) => S.players.findIndex((P) => P.gigs.some((x) => x.id === id)),
    reroll(d) { const from = d.value; d.value = 1 + rint(S, d.sides); log(S, `A d${d.sides} is rerolled: ${from} → ${d.value}.`); },
    touch(actor, gigOwner) { if (gigOwner < 0 || gigOwner === actor) return; for (const u of S.players[gigOwner].field) queueFrame(S, u.card, 'rivalTouched', u.owner, { self: u.id }); },
    trigger: (inst, trig, d = {}) => queueFrame(S, inst.card, trig, inst.owner, { self: inst.id, d }),
    discard(p, id) {
      const P = S.players[p]; const i = P.hand.findIndex((c) => c.id === id);
      if (i >= 0) { const [c] = P.hand.splice(i, 1); P.trash.push(c); log(S, `${S.names[p]} discards ${dn(c)}.`); }
    },
    trashGear(gear, host) {
      host.gear = host.gear.filter((g) => g !== gear);
      S.players[gear.owner].trash.push(gear);
      log(S, `${dn(gear)} is defeated.`);
    },
    readyEddies(p, n) {
      let k = 0;
      for (const e of S.players[p].eddies) if (e.spent && k < n) { e.spent = false; k++; }
      if (k) log(S, `${S.names[p]} readies ${k} Eddie${k > 1 ? 's' : ''}.`);
    },
    swapGigs(a, b, actor) {
      const [x, y] = [S.players[0], S.players[1]];
      const find1 = (id) => { for (const P of [x, y]) { const i = P.gigs.findIndex((d) => d.id === id); if (i >= 0) return { P, i }; } };
      const A = find1(a), B = find1(b);
      if (!A || !B || A.P === B.P) return;
      const t = A.P.gigs[A.i]; A.P.gigs[A.i] = B.P.gigs[B.i]; B.P.gigs[B.i] = t;
      log(S, 'Two Gigs were swapped.');
      if (actor != null) { G.touch(actor, S.players.indexOf(A.P)); G.touch(actor, S.players.indexOf(B.P)); }
    },
    bottomDeck: (u) => bottomDeck(S, u), returnToHand: (u) => returnToHand(S, u),
    mill(p, n) { const P = S.players[p]; const out = []; for (let i = 0; i < n && P.deck.length; i++) { const c = P.deck.shift(); P.trash.push(c); out.push(c); } if (out.length) log(S, `${S.names[p]} trashes ${out.length} card(s) from the top of their deck.`); return out; },
    stashToTrash(p) { const P = S.players[p]; P.trash.push(...P.stash); P.stash = []; },
    // Play a card for free from a zone (hand/trash). Units enter with Lag unless `attack` says otherwise.
    playFreeUnit(p, id, attack = null) {
      const P = S.players[p];
      let i = P.hand.findIndex((c) => c.id === id), from = P.hand;
      if (i < 0) { i = P.trash.findIndex((c) => c.id === id); from = P.trash; }
      if (i < 0) return null;
      const [c] = from.splice(i, 1);
      c.lag = !def(c).kw.adrenaline; c.spent = false; c.freeAttack = attack;
      P.field.push(c);
      log(S, `${S.names[p]} plays ${dn(c)} for free.`);
      noteBlue(S, p, def(c));
      fire(S, c, 'play');
      return c;
    },
    playFreeProgram(p, id, bottom = false) {
      const P = S.players[p];
      let i = P.hand.findIndex((c) => c.id === id), from = P.hand;
      if (i < 0) { i = P.trash.findIndex((c) => c.id === id); from = P.trash; }
      if (i < 0) return null;
      const [c] = from.splice(i, 1);
      log(S, `${S.names[p]} plays ${dn(c)} for free.`);
      P.trash.push(c);
      if (def(c).tags.includes('BRAINDANCE')) legendTrigger(S, p, 'playBraindance');
      queueFrame(S, c.card, 'play', p, { self: c.id });
      if (bottom) { const k = P.trash.indexOf(c); if (k >= 0) { P.trash.splice(k, 1); P.deck.push(c); } }
      return c;
    },
    equipFree(p, gearId, hostId) {
      const P = S.players[p];
      let i = P.hand.findIndex((c) => c.id === gearId), from = P.hand;
      if (i < 0) { i = P.trash.findIndex((c) => c.id === gearId); from = P.trash; }
      const host = [...P.field, ...P.legends.filter((l) => l.faceUp)].find((h) => h.id === hostId);
      if (i < 0 || !host) return null;
      const [c] = from.splice(i, 1);
      host.gear.push(c);
      log(S, `${S.names[p]} equips ${dn(c)} to ${dn(host)} for free.`);
      noteBlue(S, p, def(c));
      return c;
    },
    sellTop(p) { const P = S.players[p]; const c = P.deck.shift(); if (c) { c.spent = false; P.eddies.push(c); log(S, `${S.names[p]} sells the top card of their deck for an Eddie.`); } },
    peek(p, legendId) { const k = S.players[p].known; if (!k.includes(legendId)) k.push(legendId); },
    stashTop(p, n) { const P = S.players[p]; P.stash = P.deck.splice(0, n); },
    stashToHand(p, id) {
      const P = S.players[p]; const i = P.stash.findIndex((c) => c.id === id);
      if (i >= 0) { const [c] = P.stash.splice(i, 1); P.hand.push(c); log(S, `${S.names[p]} reveals ${dn(c)} and adds it to their hand.`); }
    },
    stashToBottom(p) { const P = S.players[p]; shuffle(S, P.stash); P.deck.push(...P.stash); P.stash = []; },

    // ---- questions: return undefined (auto-resolved) or {ask} (pause the frame)
    ask(f, spec) {
      if (!spec.options.length) { f.nextAnswer = []; return undefined; }
      if (!spec.optional && spec.options.length === 1) { f.nextAnswer = [spec.options[0].id]; return undefined; }
      return { ask: spec };
    },
    askUnits(f, { player, scope, filter, prompt, optional = false }) {
      const ps = scope === 'rival' ? [rival(player)] : scope === 'friendly' ? [player] : [player, rival(player)];
      const options = [];
      for (const p of ps) for (const u of S.players[p].field) if (!filter || filter(u)) options.push({ id: u.id, label: `${dn(u)} (power ${power(S, u)}${u.spent ? ', spent' : ''}) — ${S.names[p]}` });
      return G.ask(f, { player, prompt, options, optional });
    },
    askGig(f, { player, scope, prompt, optional }) {
      const ps = scope === 'rival' ? [rival(player)] : scope === 'friendly' ? [player] : [player, rival(player)];
      const options = [];
      for (const p of ps) for (const d of S.players[p].gigs) options.push({ id: d.id, label: `d${d.sides} showing ${d.value} — ${S.names[p]}` });
      return G.ask(f, { player, prompt, options, optional });
    },
    askAdjust(f, { player, scope = 'any', up, down, prompt }) {
      const ps = scope === 'rival' ? [rival(player)] : scope === 'friendly' ? [player] : [player, rival(player)];
      const options = [];
      for (const p of ps) for (const d of S.players[p].gigs) {
        for (let v = Math.max(1, d.value - down); v <= Math.min(d.sides, d.value + up); v++) if (v !== d.value) options.push({ id: `${d.id}>${v}`, label: `d${d.sides}: ${d.value} → ${v} (${S.names[p]})`, die: d.id, to: v });
      }
      return G.ask(f, { player, prompt: prompt || `Adjust a Gig by up to ${Math.max(up, down)}`, options, optional: true });
    },
    applyAdjust(f) {
      const id = f.answer && f.answer[0];
      if (!id) return null;
      const [dieId, v] = id.split('>');
      for (const P of S.players) {
        const d = P.gigs.find((x) => x.id === dieId);
        if (d) { const from = d.value; d.value = Number(v); log(S, `A d${d.sides} Gig changes from ${from} to ${d.value}.`); G.touch(f.owner, S.players.indexOf(P)); return { die: d, from, to: d.value }; }
      }
      return null;
    },
    askHand(f, { player, prompt }) {
      const options = S.players[player].hand.map((c) => ({ id: c.id, label: dn(c) }));
      return G.ask(f, { player, prompt, options, optional: false });
    },
    askGear(f, { player, prompt, optional }) {
      const options = [];
      for (const p of [player, rival(player)]) for (const h of [...S.players[p].field, ...S.players[p].legends]) for (const g of h.gear) options.push({ id: g.id, label: `${dn(g)} on ${h.faceUp || h.owner === player || !h.card ? dn(h) : 'a Legend'} (${S.names[p]})` });
      return G.ask(f, { player, prompt, options, optional });
    },
    askLegend(f, { player, prompt, optional, facedown }) {
      const options = S.players[player].legends.map((l, i) => ({ l, i })).filter(({ l }) => !facedown || !l.faceUp).map(({ l, i }) => ({ id: l.id, label: `Legend #${i + 1}${l.faceUp ? ' (' + dn(l) + ')' : ' (face-down)'}` }));
      return G.ask(f, { player, prompt, options, optional });
    },
    askCards(f, { player, zones, filter, prompt, optional }) {
      const options = [];
      for (const z of zones) for (const c of S.players[player][z]) if (!filter || filter(c)) options.push({ id: c.id, label: `${dn(c)} (${z})` });
      return G.ask(f, { player, prompt, options, optional });
    },
    askStash(f, { player, prompt, optional, filter }) {
      const options = S.players[player].stash.filter(filter).map((c) => ({ id: c.id, label: dn(c) }));
      return G.ask(f, { player, prompt, options, optional });
    },
  };
  return G;
}

// Steal resolution is expressed as an effect frame so each stolen Gig can pause for a choice.
const INTERNAL = {
  steal: {
    steal: [
      (G, f) => {
        const S = G.S;
        if (f.d.n <= 0) { f.i = 99; return; }
        const att = find(S, f.d.unit);
        if (!att) { f.i = 99; return; }
        const pw = power(S, att, true);
        const R = S.players[rival(f.owner)];
        const options = R.gigs.filter((d) => (!R.gigShield || d.value <= pw) && !(att.isLegend && R.legendShield && d.value < pw)).map((d) => ({ id: d.id, label: `d${d.sides} showing ${d.value}` }));
        if (!options.length) { f.i = 99; return; }
        return G.ask(f, { player: f.owner, prompt: `Steal a Gig (${f.d.n} left)`, options, optional: false });
      },
      (G, f) => {
        const S = G.S;
        f.d.pick = f.answer && f.answer[0]; f.d.guard = false;
        const R = S.players[rival(f.owner)];
        const d = R.gigs.find((x) => x.id === f.d.pick);
        if (!d || !R.field.some((u) => u.card === 'alt-cunningham-mother-of-daemons')) return;
        const opts = R.hand.filter((c) => (def(c).cost ?? -1) === d.value).map((c) => ({ id: c.id, label: dn(c) }));
        if (!opts.length) return;
        f.d.guard = true;
        return G.ask(f, { player: rival(f.owner), prompt: `Alt Cunningham: discard a card with cost ${d.value} to stop this Gig being stolen?`, options: opts, optional: true });
      },
      (G, f) => {
        const S = G.S;
        const R = S.players[rival(f.owner)], M = S.players[f.owner];
        const cid = f.d.guard && f.answer && f.answer[0];
        if (cid) { G.discard(rival(f.owner), cid); log(S, 'Alt Cunningham stops the steal.'); f.d.n--; f.i = 0; return; }
        const i = R.gigs.findIndex((d) => d.id === f.d.pick);
        if (i >= 0) {
          const [d] = R.gigs.splice(i, 1);
          M.gigs.push(d);
          const att = find(S, f.d.unit); if (att) att.stole = true;
          log(S, `${S.names[f.owner]} steals a d${d.sides} (showing ${d.value}).`);
          if (att) {
            G.trigger(att, 'stole', { value: d.value, sides: d.sides });
            fireGear(S, att, 'stole');
            for (const u of M.field) G.trigger(u, 'friendStole', { value: d.value, sides: d.sides, by: att.id });
            for (const l of M.legends) if (l.faceUp) queueFrame(S, l.card, 'friendStole', f.owner, { src: 'legend', self: l.id, d: { by: att.id, value: d.value, sides: d.sides } });
          }
        }
        f.d.n--;
        f.i = 0;
      },
    ],
  },
};

function runFrame(S, f) {
  const steps = stepsFor(f);
  const G = makeG(S);
  while (f.i < steps.length) {
    const step = steps[f.i++];
    const r = step(G, f);
    f.answer = f.nextAnswer ?? null;
    f.nextAnswer = null;
    if (S.winner != null) return 'done';
    if (r && r.ask) {
      S.pending = { kind: 'choose', player: r.ask.player, prompt: r.ask.prompt, options: r.ask.options, optional: !!r.ask.optional, frame: f };
      return 'ask';
    }
  }
  return 'done';
}

// ---------------------------------------------------------------- the settle loop
function settle(S) {
  for (let guard = 0; guard < 10000; guard++) {
    if (S.winner != null) { S.pending = null; S.queue = []; return; }
    if (S.pending) return;
    if (S.queue.length) {
      const f = S.queue.shift();
      runFrame(S, f);
      continue;
    }
    if (S.combat) {
      const c = S.combat;
      if (!find(S, c.attacker)) { S.combat = null; continue; }
      if (c.stage === 'triggers') {
        c.stage = 'react';
        const att = find(S, c.attacker);
        c.unblockable = att.card === 'mt0d12-flathead' && cred(S, c.owner) < cred(S, rival(c.owner));
        continue;
      }
      if (c.stage === 'react') { S.pending = { kind: 'react', player: rival(c.owner) }; return; }
      if (c.stage === 'resolve') { resolveCombat(S); S.combat = null; continue; }
    }
    if (S.after === 'finish') { S.after = null; finishTurn(S); continue; }
    if (S.overtime) {
      const a = S.active;
      if (S.players[a].gigs.length >= 7) { win(S, a, 'majority of Gigs in Overtime'); continue; }
      if (S.players[rival(a)].gigs.length >= 7) { win(S, rival(a), 'majority of Gigs in Overtime'); continue; }
    }
    return;
  }
  throw new Error('settle loop did not terminate');
}

// ---------------------------------------------------------------- turn flow
function startTurn(S, p) {
  S.active = p; S.turnNo++; S.stage = 'start';
  const P = S.players[p];
  P.turnsTaken++;
  P.sold = false; P.arasakaAttacked = false; P.blueTriggered = false; P.cyberUsed = false; P.programDiscount = 0; P.goSoloDiscount = 0; P.programPlayed = false; P.legendShield = false; P.keepSafe = false; P.safety = false; P.fightImmune = null; P.appetite = false;
  for (const u of S.players[rival(p)].field) u.noAttack = false;
  S.players[0].called = false; S.players[1].called = false;
  log(S, `— ${S.names[p]}'s turn ${P.turnsTaken} —`);
  // 1. Win check, before anything else.
  if (P.gigs.length >= 7) { win(S, p, 'started their turn with 7 or more Gigs'); return; }
  // 2. Start-of-turn effects: "until your next turn" effects end.
  P.gigShield = false;
  // 3. Ready everything.
  P.legends.forEach((l) => { if (l.skipReady) l.skipReady = false; else l.spent = false; });
  P.field.forEach((u) => { if (u.noReady) u.noReady = false; else u.spent = false; });
  P.eddies.forEach((e) => { e.spent = false; });
  // 4. Draw.
  draw(S, p, 1);
  if (S.winner != null) return;
  legendTrigger(S, p, 'sot');
  // 5. Gain a Gig: any die from the fixer except d20, which always goes last.
  const opts = P.fixer.filter((d) => d.sides !== 20);
  const avail = opts.length ? opts : P.fixer;
  if (!avail.length) { S.stage = 'main'; return; }
  if (avail.length === 1) { gainGig(S, p, avail[0].id); return; }
  S.pending = { kind: 'gainGig', player: p, options: avail.map((d) => d.id) };
}

function gainGig(S, p, dieId) {
  const P = S.players[p];
  const i = P.fixer.findIndex((d) => d.id === dieId);
  const [d] = P.fixer.splice(i, 1);
  d.value = 1 + rint(S, d.sides);
  P.gigs.push(d);
  S.stage = 'main';
  log(S, `${S.names[p]} rolls the d${d.sides}: ${d.value}.`);
  for (const l of P.legends) if (l.faceUp) queueFrame(S, l.card, 'roll', p, { src: 'legend', self: l.id, d: { die: d.id } });
}

function finishTurn(S) {
  for (const P of S.players) for (const u of [...P.field]) if (u.cyber && (u.stole || u.fought)) { log(S, `${dn(u)} burns out from Cyberpsychosis.`); defeat(S, u); }
  for (const P of S.players) { P.noDefeat = false; P.safety = false; P.appetite = false; for (const u of P.field) { u.lag = false; u.tempPower = 0; u.stole = false; u.safeFight = false; u.cyber = false; u.fought = false; u.fightBonus = 0; u.stealMinus = 0; u.firstWin = false; u.firstSteal = false; u.once = {}; u.hitReady = false; } }
  if (!S.overtime && S.players[0].turnsTaken >= 7 && S.players[1].turnsTaken >= 7) { S.overtime = true; log(S, 'OVERTIME! Seven Gigs wins instantly.'); }
  startTurn(S, rival(S.active));
}

function doEndTurn(S) {
  const p = S.active, P = S.players[p];
  for (const h of [...P.field, ...P.legends]) { fire(S, h, 'eot'); fireGear(S, h, 'eot'); }
  S.after = 'finish';
}

// ---------------------------------------------------------------- payment
function sources(S, p, exclude = null) {
  const P = S.players[p];
  const eds = P.eddies.filter((e) => !e.spent);
  const legs = P.legends.filter((l) => !l.spent && l.id !== exclude);
  return { eds, legs };
}
function payError(S, p, cost, pay, exclude) {
  const { eds, legs } = sources(S, p, exclude);
  if (pay) {
    if (pay.length !== cost) return `Pay exactly ${cost} Eddie${cost === 1 ? '' : 's'} (you chose ${pay.length}).`;
    if (new Set(pay).size !== pay.length) return 'The same payment source was chosen twice.';
    for (const id of pay) if (![...eds, ...legs].some((x) => x.id === id)) return 'One of the chosen payment sources is not ready.';
    return null;
  }
  if (eds.length + legs.length < cost) return `Not enough Eddies: costs ${cost}, you can pay ${eds.length + legs.length} (ready Eddies plus ready Legends).`;
  return null;
}
function pay(S, p, cost, payIds, exclude = null) {
  const { eds, legs } = sources(S, p, exclude);
  let chosen;
  if (payIds) chosen = payIds;
  else {
    const order = [...eds, ...legs.filter((l) => !def(l).kw.goSolo), ...legs.filter((l) => def(l).kw.goSolo)];
    chosen = order.slice(0, cost).map((x) => x.id);
  }
  for (const id of chosen) {
    const e = eds.find((x) => x.id === id);
    if (e) e.spent = true;
    else { const l = legs.find((x) => x.id === id); spendInst(S, l); }
  }
}

// ---------------------------------------------------------------- checks (shared by actions and legalActions)
function equipTargets(S, p) {
  const P = S.players[p];
  return [...P.field, ...P.legends.filter((l) => l.faceUp)];
}
export function checkSell(S, p, cardId) {
  const P = S.players[p];
  const c = P.hand.find((x) => x.id === cardId);
  if (!c) return 'That card is not in your hand.';
  if (P.sold) return 'You already sold a card this turn (once per turn).';
  if (!def(c).sell) return `${dn(c)} has no sell tag, so it cannot be sold.`;
  return null;
}
export function checkPlay(S, p, cardId, { target = null, payIds = null, react = false } = {}) {
  const P = S.players[p];
  const c = P.hand.find((x) => x.id === cardId);
  if (!c) return 'That card is not in your hand.';
  const d = def(c);
  if (d.type === 'legend' || d.cost == null) return 'This card cannot be played from your hand.';
  if (react && !(d.type === 'program' && d.kw.quick)) return 'During a reaction you can only play QUICK Programs.';
  if (d.type === 'gear') {
    const t = target && equipTargets(S, p).find((x) => x.id === target);
    if (!t) return 'Gear must be equipped to a friendly Unit or a face-up Legend.';
  }
  return payError(S, p, costOf(S, p, c), payIds, null);
}
export function checkGoSolo(S, p, legendId, payIds = null) {
  const P = S.players[p];
  const l = P.legends.find((x) => x.id === legendId);
  if (!l) return 'That Legend is not in your Legends area.';
  const d = def(l);
  if (!d.kw.goSolo || d.cost == null) return `${dn(l)} cannot GO SOLO.`;
  return payError(S, p, goSoloCost(S, p, l), payIds, legendId);
}
export const callCost = (S, p) => (S.players[p].field.some((u) => u.card === 'panam-palmer-strength-through-family') ? 0 : 1);
export function checkCall(S, p, payIds = null) {
  const P = S.players[p];
  if (P.called) return 'You already Called a Legend this turn (once per turn).';
  if (!P.legends.some((l) => !l.faceUp)) return 'All your Legends are already face-up.';
  return payError(S, p, callCost(S, p), payIds, null);
}
const abilityList = (card) => { const a = ABILITIES[card]; return !a ? [] : Array.isArray(a) ? a : [a]; };
export const abCost = (S, p, ab) => (typeof ab.cost === 'function' ? ab.cost(S, p) : ab.cost || 0);
// The card with the ability can be a Unit/Legend or a Gear on one; `host` is the Unit/Legend that gets spent.
export function abilitySource(S, p, id) {
  const P = S.players[p];
  for (const h of [...P.field, ...P.legends.filter((l) => l.faceUp)]) {
    if (h.id === id) return { src: h, host: h };
    const g = h.gear.find((x) => x.id === id);
    if (g) return { src: g, host: h };
  }
  return null;
}
export const abilitiesOf = (S, p, id) => { const x = abilitySource(S, p, id); return x ? abilityList(x.src.card) : []; };
export function checkAbility(S, p, id, n = 0, payIds = null, react = false) {
  const x = abilitySource(S, p, id);
  if (!x) return 'That card is not in play.';
  const ab = abilityList(x.src.card)[n];
  if (!ab) return 'That card has no activated ability.';
  if (react && !ab.quick) return 'Only QUICK abilities can be used while being attacked.';
  const h = x.host;
  if (h.spent) return 'Its ability needs it to be ready (it is spent).';
  if (S.players[h.owner].field.includes(h) && h.lag) return 'This Unit just arrived and cannot use SPEND abilities yet.';
  if (ab.can) { const e = ab.can(S, p, x.src, h); if (e) return e; }
  return payError(S, p, abCost(S, p, ab), payIds, h.id);
}
function doAbility(S, p, a) {
  const x = abilitySource(S, p, a.card), n = a.n || 0;
  const ab = abilityList(x.src.card)[n];
  const cost = abCost(S, p, ab);
  if (cost) pay(S, p, cost, a.pay, x.host.id);
  log(S, `${S.names[p]} uses ${dn(x.src)}.`);
  spendInst(S, x.host);
  queueFrame(S, x.src.card, n ? 'ability' + (n + 1) : 'ability', p, { self: x.src.id, host: x.host.id });
}
export function checkAttack(S, p, unitId, target) {
  const P = S.players[p];
  const u = P.field.find((x) => x.id === unitId);
  if (!u) return 'That Unit is not on your field.';
  const d = def(u);
  if (u.spent) return 'Only ready Units can attack — this one is spent.';
  const lr = u.lag ? lagRule(S, u) : null;
  if (u.lag && !lr) return 'This Unit has Lag (it was just played) and cannot attack this turn.';
  if (u.card === 'misty-olszewski-mender-of-broken-spirits') return "Misty can't attack.";
  if (u.noAttack) return 'A rival effect stops this Unit from attacking until their next turn.';
  if (u.card === 'jacked-in-voodoo-boy' && !P.programPlayed) return "Jacked-In Voodoo Boy can't attack unless you played a Program this turn.";
  if (d.flags.cantAttack) return `${dn(u)} can't attack.`;
  if (!target) return 'Choose a target.';
  if (lr === 'gigs' && target.type !== 'gigs') return 'While it has Lag, this Unit can only attack the rival Gigs.';
  if (lr === 'units' && target.type === 'gigs') return 'While it has Lag, this Unit can only attack rival Units.';
  if (target.type === 'gigs') {
    if (d.flags.noGigAttack) return `${dn(u)} can only attack rival Units, not Gigs.`;
    if (!S.players[rival(p)].gigs.length) return 'Your Rival has no Gigs to steal.';
    return null;
  }
  const t = S.players[rival(p)].field.find((x) => x.id === target.id);
  if (!t) return 'That is not a rival Unit.';
  const canHitReady = (u.freeAttack === 'readyOnce') || u.hitReady || (u.card === 'valentino-guerrera' && cred(S, p) > cred(S, rival(p)) && hasBlocker(t));
  if (!t.spent && !canHitReady) return 'You can only attack spent rival Units. Ready Units cannot be attacked.';
  return null;
}
export function forcedAttack(S, p) {
  const P = S.players[p];
  for (const u of P.field) {
    if (u.mustAttack !== S.turnNo) continue;
    if (!checkAttack(S, p, u.id, { type: 'gigs' }) || S.players[rival(p)].field.some((t) => !checkAttack(S, p, u.id, { type: 'unit', id: t.id }))) return u;
  }
  return null;
}
export function blockersFor(S, p) {
  const c = S.combat;
  if (!c || c.blocked || c.unblockable) return [];
  return S.players[p].field.filter((u) => !u.spent && hasBlocker(u));
}

// ---------------------------------------------------------------- combat
function resolveCombat(S) {
  const c = S.combat;
  const att = find(S, c.attacker);
  if (!att) return;
  if (c.target.type === 'unit') {
    const dfn = find(S, c.target.id);
    if (!dfn) return;
    const fp = (u, o, atk) => power(S, u, atk) + (u.fightBonus || 0) + (u.card === 'meredith-stout-stone-cold-corpo' && o.isLegend ? 2 : 0);
    const pa = fp(att, dfn, true), pd = fp(dfn, att, false);
    log(S, `${dn(att)} (${pa}) fights ${dn(dfn)} (${pd}).`);
    const corpo = (u) => def(u).tags.includes('CORPO');
    let aWins = pa > pd, dWins = pd > pa;
    if (att.card === 'johnny-silverhand-never-stop-fighting' && corpo(dfn)) { aWins = true; dWins = false; log(S, 'Johnny wins all fights against CORPO Units.'); }
    else if (dfn.card === 'johnny-silverhand-never-stop-fighting' && corpo(att)) { dWins = true; aWins = false; log(S, 'Johnny wins all fights against CORPO Units.'); }
    const tie = !aWins && !dWins;
    att.fought = true; dfn.fought = true;
    const win = aWins ? att : dWins ? dfn : null, lose = aWins ? dfn : dWins ? att : null;
    let saved = null;
    if (win) {
      const diff = Math.abs(pa - pd);
      queueFrame(S, win.card, 'fightWinU', win.owner, { self: win.id, d: { opp: lose.id, diff } });
      const W = S.players[win.owner];
      if (W.appetite && diff >= 3) { W.appetite = false; log(S, `Appetite for Destruction: ${dn(win)} also steals a Gig.`); queueFrame(S, 'steal', 'steal', win.owner, { src: 'internal', d: { n: 1, unit: win.id } }); }
      queueFrame(S, lose.card, 'fightLoseU', lose.owner, { self: lose.id, d: { opp: win.id } });
      const L = S.players[lose.owner];
      if (L.safety) { L.safety = false; saved = win; }
    }
    const A = S.players[att.owner], D = S.players[dfn.owner];
    let killDef = aWins || tie, killAtt = dWins || tie;
    // Reboot Optics: the opposing friendly Unit isn't defeated by a rival Unit in the next fight.
    if (A.noDefeat) { if (killAtt) log(S, `Reboot Optics: ${dn(att)} is not defeated.`); killAtt = false; }
    if (D.noDefeat) { if (killDef) log(S, `Reboot Optics: ${dn(dfn)} is not defeated.`); killDef = false; }
    A.noDefeat = false; D.noDefeat = false;
    if (att.safeFight && killAtt) { log(S, `${dn(att)} cannot be defeated in this fight.`); killAtt = false; }
    if (dfn.safeFight && killDef) { log(S, `${dn(dfn)} cannot be defeated in this fight.`); killDef = false; }
    if (aWins) fireGear(S, att, 'fightWin');
    if (dWins) fireGear(S, dfn, 'fightWin');
    if (killDef) defeat(S, dfn);
    if (killAtt) defeat(S, att);
    if (saved && find(S, saved.id)) { log(S, `Safety Override: ${dn(saved)} is defeated.`); defeat(S, saved); }
    return;
  }
  // Steal: 1 Gig, +1 for every 10 power; power 0 steals nothing. Blocked attacks never steal.
  if (c.noSteal) return;
  const pw = power(S, att, true);
  const n = pw >= 1 ? Math.max(0, Math.floor(pw / 10) + 1 - (att.stealMinus || 0)) : 0;
  if (!n) { log(S, `${dn(att)} has no power and steals nothing.`); return; }
  queueFrame(S, 'steal', 'steal', c.owner, { src: 'internal', d: { n, unit: att.id } });
}

// ---------------------------------------------------------------- dispatch
export function act(S, a) {
  const N = structuredClone(S);
  try {
    const err = dispatch(N, a);
    if (err) return { ok: false, error: err };
    settle(N);
    return { ok: true, state: N };
  } catch (e) {
    return { ok: false, error: 'Engine error: ' + (e && e.message ? e.message : e) };
  }
}

function dispatch(S, a) {
  if (S.winner != null) return 'The game is over.';
  const pd = S.pending;
  const expected = pd ? pd.player : S.active;
  if (a.player !== expected) return pd ? `Waiting for ${S.names[expected]} to decide.` : `It is ${S.names[expected]}'s turn.`;
  const p = a.player;
  const P = S.players[p];

  if (pd) {
    switch (pd.kind) {
      case 'chooseOrder':
        if (a.type !== 'order') return 'Choose who goes first.';
        beginMulligans(S, a.first ? p : rival(p));
        log(S, `${S.names[S.first]} goes first.`);
        return null;
      case 'mulligan':
        if (a.type !== 'mulligan') return 'Decide whether to mulligan.';
        if (a.mulligan) {
          P.deck.push(...P.hand); P.hand = [];
          shuffle(S, P.deck);
          draw(S, p, 6);
          log(S, `${S.names[p]} mulligans.`);
        } else log(S, `${S.names[p]} keeps their hand.`);
        S.mulls.shift();
        S.pending = null;
        if (S.mulls.length) S.pending = { kind: 'mulligan', player: S.mulls[0] };
        else startTurn(S, S.first);
        return null;
      case 'gainGig':
        if (a.type !== 'gainGig') return 'Choose a Gig die from your fixer.';
        if (!pd.options.includes(a.die)) return 'You must pick an available die (the d20 always goes last).';
        S.pending = null;
        gainGig(S, p, a.die);
        return null;
      case 'choose': {
        if (a.type !== 'choose') return 'Answer the question first.';
        const ids = a.ids || [];
        if (!ids.length) { if (!pd.optional) return 'You must choose one.'; }
        else if (ids.length !== 1 || !pd.options.some((o) => o.id === ids[0])) return 'That is not one of the options.';
        const f = pd.frame;
        S.pending = null;
        f.answer = ids;
        S.queue.unshift(f);
        return null;
      }
      case 'react':
        return dispatchReact(S, a, p);
      default:
        return 'Unknown pending decision.';
    }
  }

  if (S.stage !== 'main') return 'The turn is still starting.';
  if (S.combat || S.queue.length) return 'Resolve the current action first.';

  switch (a.type) {
    case 'sell': {
      const e = checkSell(S, p, a.card); if (e) return e;
      const i = P.hand.findIndex((c) => c.id === a.card);
      const [c] = P.hand.splice(i, 1);
      c.spent = false;
      P.eddies.push(c); P.sold = true;
      log(S, `${S.names[p]} sells ${dn(c)} for an Eddie.`);
      return null;
    }
    case 'play': return doPlay(S, p, a, false);
    case 'goSolo': {
      const e = checkGoSolo(S, p, a.legend, a.pay); if (e) return e;
      const l = P.legends.find((x) => x.id === a.legend);
      pay(S, p, goSoloCost(S, p, l), a.pay, l.id);
      P.legends.splice(P.legends.indexOf(l), 1);
      Object.assign(l, { isLegend: true, faceUp: true, spent: false, lag: false });
      P.field.push(l);
      log(S, `${S.names[p]} sends ${dn(l)} solo!`);
      noteBlue(S, p, def(l));
      fire(S, l, 'play');
      return null;
    }
    case 'call': {
      const e = checkCall(S, p, a.pay); if (e) return e;
      pay(S, p, callCost(S, p), a.pay);
      doCall(S, p);
      return null;
    }
    case 'attack': {
      const e = checkAttack(S, p, a.unit, a.target); if (e) return e;
      const u = P.field.find((x) => x.id === a.unit);
      log(S, `${S.names[p]} attacks ${a.target.type === 'gigs' ? `${S.names[rival(p)]}'s Gigs` : dn(find(S, a.target.id))} with ${dn(u)}.`);
      spendInst(S, u);
      fire(S, u, 'attack');
      fireGear(S, u, 'attack');
      if (isArasaka(u)) { if (!P.arasakaAttacked) { P.arasakaAttacked = true; legendTrigger(S, p, 'arasakaAttack'); } }
      S.combat = { attacker: u.id, owner: p, target: a.target, stage: 'triggers', blocked: false, noSteal: false };
      return null;
    }
    case 'ability': {
      const e = checkAbility(S, p, a.card, a.n || 0, a.pay); if (e) return e;
      doAbility(S, p, a);
      return null;
    }
    case 'endTurn': {
      const m = forcedAttack(S, p); if (m) return `${dn(m)} must attack this turn if it can.`;
      doEndTurn(S);
      return null;
    }
    default:
      return 'Unknown action.';
  }
}

function noteBlue(S, p, d) {
  const P = S.players[p];
  if (d.color === 'blue' && (d.type === 'unit' || d.type === 'gear' || d.type === 'legend') && !P.blueTriggered) {
    P.blueTriggered = true;
    legendTrigger(S, p, 'playBlue');
  }
}

function doPlay(S, p, a, react) {
  const P = S.players[p];
  const e = checkPlay(S, p, a.card, { target: a.target, payIds: a.pay, react });
  if (e) return e;
  const c = P.hand.find((x) => x.id === a.card);
  const d = def(c);
  pay(S, p, costOf(S, p, c), a.pay);
  if (d.type === 'gear' && d.tags.includes('CYBERWARE')) P.cyberUsed = true;
  if (d.type === 'program') { P.programDiscount = 0; P.programPlayed = true; }
  P.hand.splice(P.hand.indexOf(c), 1);
  if (d.type === 'unit') {
    c.lag = !d.kw.adrenaline; c.spent = false;
    P.field.push(c);
    log(S, `${S.names[p]} plays ${dn(c)}.`);
    noteBlue(S, p, d);
    fire(S, c, 'play');
  } else if (d.type === 'gear') {
    const host = equipTargets(S, p).find((x) => x.id === a.target);
    host.gear.push(c);
    log(S, `${S.names[p]} equips ${dn(c)} to ${dn(host)}.`);
    noteBlue(S, p, d);
  } else {
    P.trash.push(c);
    log(S, `${S.names[p]} plays ${dn(c)}.`);
    if (d.tags.includes('BRAINDANCE')) legendTrigger(S, p, 'playBraindance');
    queueFrame(S, c.card, 'play', p, { self: c.id });
  }
  return null;
}

function dispatchReact(S, a, p) {
  const c = S.combat;
  switch (a.type) {
    case 'pass':
      S.pending = null; c.stage = 'resolve';
      return null;
    case 'block': {
      const b = blockersFor(S, p).find((u) => u.id === a.unit);
      if (!b) return 'That Unit cannot block right now (it must be ready with BLOCKER, and the attack must be blockable).';
      S.pending = null;
      spendInst(S, b);
      c.blocked = true;
      if (c.target.type === 'gigs') c.noSteal = true;
      c.target = { type: 'unit', id: b.id };
      log(S, `${dn(b)} blocks!`);
      fire(S, b, 'block');
      legendTrigger(S, b.owner, 'block');
      return null;
    }
    case 'call': {
      const e = checkCall(S, p, a.pay); if (e) return e;
      S.pending = null;
      pay(S, p, callCost(S, p), a.pay);
      doCall(S, p);
      return null;
    }
    case 'play': {
      const e = checkPlay(S, p, a.card, { target: a.target, payIds: a.pay, react: true }); if (e) return e;
      S.pending = null;
      return doPlay(S, p, a, true);
    }
    case 'ability': {
      const e = checkAbility(S, p, a.card, a.n || 0, a.pay, true); if (e) return e;
      S.pending = null;
      doAbility(S, p, a);
      return null;
    }
    default:
      return 'You are being attacked: block, Call a Legend, play a QUICK Program, or pass.';
  }
}

// ---------------------------------------------------------------- legal action enumeration (UI highlights, AI, tests)
export function legalActions(S) {
  if (S.winner != null) return [];
  const out = [];
  const pd = S.pending;
  if (pd) {
    const p = pd.player;
    switch (pd.kind) {
      case 'chooseOrder': return [{ type: 'order', player: p, first: true }, { type: 'order', player: p, first: false }];
      case 'mulligan': return [{ type: 'mulligan', player: p, mulligan: false }, { type: 'mulligan', player: p, mulligan: true }];
      case 'gainGig': return pd.options.map((die) => ({ type: 'gainGig', player: p, die }));
      case 'choose': {
        for (const o of pd.options) out.push({ type: 'choose', player: p, ids: [o.id] });
        if (pd.optional) out.push({ type: 'choose', player: p, ids: [] });
        return out;
      }
      case 'react': {
        out.push({ type: 'pass', player: p });
        for (const b of blockersFor(S, p)) out.push({ type: 'block', player: p, unit: b.id });
        if (!checkCall(S, p)) out.push({ type: 'call', player: p });
        const P = S.players[p];
        for (const h of [...P.field, ...P.legends.filter((l) => l.faceUp)]) for (const id of [h.id, ...h.gear.map((g) => g.id)]) abilitiesOf(S, p, id).forEach((ab, n) => { if (ab.quick && !checkAbility(S, p, id, n, null, true)) out.push({ type: 'ability', player: p, card: id, n }); });
        for (const c of P.hand) {
          const d = def(c);
          if (d.type === 'program' && d.kw.quick && !checkPlay(S, p, c.id, { react: true })) out.push({ type: 'play', player: p, card: c.id });
        }
        return out;
      }
      default: return [];
    }
  }
  if (S.stage !== 'main' || S.combat || S.queue.length) return [];
  const p = S.active, P = S.players[p];
  for (const c of P.hand) {
    if (!checkSell(S, p, c.id)) out.push({ type: 'sell', player: p, card: c.id });
    const d = def(c);
    if (d.type === 'legend' || d.cost == null) continue;
    if (d.type === 'gear') {
      for (const t of equipTargets(S, p)) if (!checkPlay(S, p, c.id, { target: t.id })) out.push({ type: 'play', player: p, card: c.id, target: t.id });
    } else if (!checkPlay(S, p, c.id)) out.push({ type: 'play', player: p, card: c.id });
  }
  for (const l of P.legends) if (!checkGoSolo(S, p, l.id)) out.push({ type: 'goSolo', player: p, legend: l.id });
  if (!checkCall(S, p)) out.push({ type: 'call', player: p });
  for (const h of [...P.field, ...P.legends.filter((l) => l.faceUp)]) for (const id of [h.id, ...h.gear.map((g) => g.id)]) abilitiesOf(S, p, id).forEach((_, n) => { if (!checkAbility(S, p, id, n)) out.push({ type: 'ability', player: p, card: id, n }); });
  for (const u of P.field) {
    if (!checkAttack(S, p, u.id, { type: 'gigs' })) out.push({ type: 'attack', player: p, unit: u.id, target: { type: 'gigs' } });
    for (const t of S.players[rival(p)].field) if (!checkAttack(S, p, u.id, { type: 'unit', id: t.id })) out.push({ type: 'attack', player: p, unit: u.id, target: { type: 'unit', id: t.id } });
  }
  if (!forcedAttack(S, p)) out.push({ type: 'endTurn', player: p });
  return out;
}
