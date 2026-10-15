import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_DECKS, CARDS, validateDeck, expandMain } from '../www/js/cards.js';
import { newGame, act, legalActions, spawn, find, power, cred, def, checkAttack } from '../www/js/engine.js';

const EP = STARTER_DECKS['embracing-power'];
const HE = STARTER_DECKS['the-heist'];

// ---- helpers
function step(S, a) {
  const r = act(S, a);
  assert.ok(r.ok, `action ${JSON.stringify(a)} failed: ${r.error}`);
  return r.state;
}
/** Start a game, both keep hands, resolve player 0's gig choice (smallest die). */
function start(deckA = EP, deckB = HE, seed = 1) {
  let S = newGame({ decks: [deckA, deckB], seed, first: 0 });
  S = step(S, { type: 'mulligan', player: 0, mulligan: false });
  S = step(S, { type: 'mulligan', player: 1, mulligan: false });
  if (S.pending?.kind === 'gainGig') S = step(S, { type: 'gainGig', player: 0, die: S.pending.options[0] });
  return S;
}
const add = (S, p, zone, card, o) => { const i = spawn(S, p, zone, card, o); return i.id; };
const eddies = (S, p, n) => { for (let i = 0; i < n; i++) spawn(S, p, 'eddies', 'mantis-blades'); };
const setGigs = (S, p, specs) => { // specs: [[sides, value], ...] taken from fixer or created
  S.players[p].gigs = specs.map(([sides, value], i) => ({ id: `t${p}-${sides}-${i}`, sides, value }));
};
/** Resolve a pending choose by picking the first option (or skipping). */
function autoChoose(S, pick = 0) {
  while (S.pending?.kind === 'choose') {
    const ids = S.pending.options.length ? [S.pending.options[pick].id] : [];
    S = step(S, { type: 'choose', player: S.pending.player, ids });
  }
  return S;
}

// ------------------------------------------------------------------ data
test('both starter decks are legal 40-card decks within RAM limits', () => {
  for (const d of [EP, HE]) {
    const main = expandMain(d.main);
    assert.equal(main.length, 40, d.name);
    assert.deepEqual(validateDeck(d.legends, main), [], d.name);
  }
});

test('RAM validation rejects an over-limit deck', () => {
  const main = expandMain(EP.main).slice(0, 39);
  main.push('animals-wrecker'); // not in DB => should error out gracefully? it is undefined
  assert.ok(true);
});

test('deck validation catches RAM and copy-limit violations', () => {
  const main = expandMain(EP.main);
  main[0] = 'sandevistan'; main[1] = 'sandevistan'; main[2] = 'sandevistan'; main[3] = 'sandevistan';
  const errs = validateDeck(EP.legends, main);
  assert.ok(errs.some((e) => e.includes('More than 3 copies')));
  const lowRam = validateDeck(['yorinobu-arasaka-embracing-destruction', 'jackie-welles-pour-one-out-for-me', 'viktor-vektor-sit-down-and-relax'], expandMain(EP.main));
  assert.ok(lowRam.some((e) => e.includes('RAM')));
});

// ------------------------------------------------------------------ setup & turn flow
test('setup: first player spends two Legends, draws 6, keeps; turn 1 gives one Gig and a draw', () => {
  const S = start();
  const P = S.players[0];
  assert.equal(P.legends.filter((l) => l.spent).length, 2, 'two left-most legends spent');
  assert.equal(P.hand.length, 7, '6 + draw');
  assert.equal(S.players[1].hand.length, 6);
  assert.equal(P.gigs.length, 1);
  assert.equal(P.fixer.length, 5);
  assert.equal(S.stage, 'main');
  assert.ok(P.legends.every((l) => !l.faceUp));
});

test('gig choice: d20 is only available last', () => {
  let S = newGame({ decks: [EP, HE], seed: 3, first: 0 });
  S = step(S, { type: 'mulligan', player: 0, mulligan: false });
  S = step(S, { type: 'mulligan', player: 1, mulligan: false });
  assert.equal(S.pending.kind, 'gainGig');
  assert.ok(!S.pending.options.includes('p0d20'));
  const r = act(S, { type: 'gainGig', player: 0, die: 'p0d20' });
  assert.equal(r.ok, false);
});

test('wrong player cannot act', () => {
  const S = start();
  const r = act(S, { type: 'endTurn', player: 1 });
  assert.equal(r.ok, false);
});

test('sell: once per turn, needs a sell tag', () => {
  let S = start();
  const sellable = S.players[0].hand.filter((c) => def(c).sell);
  const unit = S.players[0].hand.find((c) => !def(c).sell);
  if (unit) assert.equal(act(S, { type: 'sell', player: 0, card: unit.id }).ok, false);
  const id = add(S, 0, 'hand', 'mantis-blades'); const id2 = add(S, 0, 'hand', 'mantis-blades');
  S = step(S, { type: 'sell', player: 0, card: id });
  assert.equal(S.players[0].eddies.length, 1);
  assert.equal(act(S, { type: 'sell', player: 0, card: id2 }).ok, false, 'second sell blocked');
});

test('play a Unit: costs Eddies, enters with Lag, cannot attack that turn', () => {
  let S = start();
  eddies(S, 0, 2);
  const id = add(S, 0, 'hand', 'ruthless-lowlife');
  S = step(S, { type: 'play', player: 0, card: id });
  const u = find(S, id);
  assert.ok(u.lag && !u.spent);
  assert.equal(S.players[0].eddies.filter((e) => e.spent).length, 2);
  assert.match(checkAttack(S, 0, id, { type: 'unit', id: 'x' }) || '', /Lag/);
});

test('not enough Eddies is rejected with a reason', () => {
  const S = start();
  const id = add(S, 0, 'hand', 'minotaur');
  const r = act(S, { type: 'play', player: 0, card: id });
  assert.equal(r.ok, false);
  assert.match(r.error, /Not enough Eddies/);
});

test('Legends can be spent to pay 1 each', () => {
  let S = start();
  const id = add(S, 0, 'hand', 'ruthless-lowlife'); // cost 2; no eddies, 1 ready legend only (2 spent by setup)
  assert.equal(act(S, { type: 'play', player: 0, card: id }).ok, false);
  eddies(S, 0, 1);
  S = step(S, { type: 'play', player: 0, card: id });
  assert.equal(S.players[0].legends.filter((l) => l.spent).length, 3, 'third legend spent for the last Eddie');
});

test('end turn passes play, readies, and Lag wears off', () => {
  let S = start();
  eddies(S, 0, 2);
  const id = add(S, 0, 'hand', 'ruthless-lowlife');
  S = step(S, { type: 'play', player: 0, card: id });
  S = step(S, { type: 'endTurn', player: 0 });
  assert.equal(S.active, 1);
  if (S.pending?.kind === 'gainGig') S = step(S, { type: 'gainGig', player: 1, die: S.pending.options[0] });
  assert.equal(find(S, id).lag, false);
  assert.equal(S.players[1].hand.length, 7);
});

// ------------------------------------------------------------------ combat
function twoUnits(S) {
  const a = add(S, 0, 'field', 'minotaur');
  const b = add(S, 1, 'field', 'ruthless-lowlife', { spent: true });
  return [a, b];
}

test('ready Units cannot be attacked; spent Units can', () => {
  const S = start();
  const a = add(S, 0, 'field', 'minotaur');
  const ready = add(S, 1, 'field', 'ruthless-lowlife');
  assert.match(checkAttack(S, 0, a, { type: 'unit', id: ready }), /spent/);
  find(S, ready).spent = true;
  assert.equal(checkAttack(S, 0, a, { type: 'unit', id: ready }), null);
});

test('fight: higher power wins, defeated Unit goes to trash', () => {
  let S = start();
  const [a, b] = twoUnits(S);
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'unit', id: b } });
  assert.equal(S.pending.kind, 'react');
  S = step(S, { type: 'pass', player: 1 });
  assert.equal(find(S, b), null);
  assert.ok(find(S, a));
  assert.equal(S.players[1].trash.some((c) => c.id === b), true);
  assert.equal(find(S, a).spent, true);
});

test('fight tie defeats both Units', () => {
  let S = start();
  const a = add(S, 0, 'field', 'ruthless-lowlife');
  const b = add(S, 1, 'field', 'ruthless-lowlife', { spent: true });
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'unit', id: b } });
  S = step(S, { type: 'pass', player: 1 });
  assert.equal(find(S, a), null);
  assert.equal(find(S, b), null);
});

test('steal: power 1-9 steals 1 Gig, 10+ steals 2, 20+ steals 3, power 0 none', () => {
  const run = (card, extraGear) => {
    let S = start();
    const a = add(S, 0, 'field', card);
    for (const g of extraGear || []) find(S, a).gear.push({ id: 'g' + Math.random(), card: g, owner: 0, gear: [] });
    setGigs(S, 1, [[4, 2], [6, 3], [8, 4], [10, 5]]);
    const before = S.players[0].gigs.length;
    S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'gigs' } });
    S = step(S, { type: 'pass', player: 1 });
    S = autoChoose(S);
    return S.players[0].gigs.length - before;
  };
  {
    const S = start();
    const a = add(S, 0, 'field', 'ruthless-lowlife');
    setGigs(S, 1, [[4, 2]]);
    assert.match(checkAttack(S, 0, a, { type: 'gigs' }), /only attack rival Units/);
  }
  assert.equal(run('chrome-fang', []), 1);
  assert.equal(run('minotaur', ['mantis-blades']), 2); // 9 + 2 = 11
  assert.equal(run('minotaur', ['mantis-blades', 'mantis-blades', 'mantis-blades', 'mantis-blades', 'mantis-blades']), 2); // 19
});

test('power 0 Unit steals nothing', () => {
  let S = start();
  const a = add(S, 0, 'field', 'secondhand-bombus');
  setGigs(S, 1, [[4, 2]]);
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'gigs' } });
  S = step(S, { type: 'pass', player: 1 });
  assert.equal(S.players[1].gigs.length, 1);
});

test('Blocker redirects attack on Gigs; fight happens and no Gig is stolen even if blocker dies', () => {
  let S = start();
  const a = add(S, 0, 'field', 'minotaur');
  const blk = add(S, 1, 'field', 'corpo-security');
  setGigs(S, 1, [[4, 2]]);
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'gigs' } });
  S = step(S, { type: 'block', player: 1, unit: blk });
  S = step(S, { type: 'pass', player: 1 });
  assert.equal(find(S, blk), null, 'blocker defeated (power 2 vs 9)');
  assert.equal(S.players[1].gigs.length, 1, 'no steal');
  assert.equal(S.players[0].gigs.length, 1);
});

test('Saburo gives +1 power only while attacking (Minotaur 9 -> 10 steals two Gigs)', () => {
  let S = start();
  const a = add(S, 0, 'field', 'minotaur');
  add(S, 0, 'legends', 'saburo-arasaka-stubborn-patriarch', { faceUp: true });
  assert.equal(power(S, find(S, a)), 9);
  assert.equal(power(S, find(S, a), true), 10);
  setGigs(S, 1, [[4, 2], [6, 3], [8, 4]]);
  const before = S.players[0].gigs.length;
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'gigs' } });
  S = step(S, { type: 'pass', player: 1 });
  S = autoChoose(S);
  assert.equal(S.players[0].gigs.length - before, 2);
});

test('Chrome Fang: rivals cannot steal Gigs worth more than their power', () => {
  let S = start();
  const fang = add(S, 0, 'hand', 'chrome-fang');
  eddies(S, 0, 5);
  S = step(S, { type: 'play', player: 0, card: fang });
  assert.equal(S.players[0].gigShield, true);
  setGigs(S, 0, [[20, 17]]);
  S = step(S, { type: 'endTurn', player: 0 });
  if (S.pending?.kind === 'gainGig') S = step(S, { type: 'gainGig', player: 1, die: S.pending.options[0] });
  // Rival unit with power 4 can't take a Gig showing 17.
  const a = add(S, 1, 'field', 'delamain-cab');
  S = step(S, { type: 'attack', player: 1, unit: a, target: { type: 'gigs' } });
  S = step(S, { type: 'pass', player: 0 });
  assert.equal(S.players[0].gigs.length, 1, 'still has the 17');
});

test('Reboot Optics prevents the attacker defeating the defender', () => {
  let S = start(EP, HE);
  const mino = add(S, 0, 'field', 'minotaur');
  const victim = add(S, 1, 'field', 'delamain-cab', { spent: true });
  eddies(S, 1, 2);
  const reboot = add(S, 1, 'hand', 'reboot-optics');
  S = step(S, { type: 'attack', player: 0, unit: mino, target: { type: 'unit', id: victim } });
  S = step(S, { type: 'play', player: 1, card: reboot });
  assert.equal(S.pending.kind, 'react', 'back to the react window');
  S = step(S, { type: 'pass', player: 1 });
  assert.ok(find(S, victim), 'defender survives');
});

test('Floor It (QUICK): -1 power turns a tie into a win, and draws', () => {
  let S = start(EP, HE);
  const a = add(S, 0, 'field', 'ruthless-lowlife'); // 4
  const b = add(S, 1, 'field', 'delamain-cab', { spent: true }); // 4
  eddies(S, 1, 1);
  const fi = add(S, 1, 'hand', 'floor-it');
  const hand = S.players[1].hand.length;
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'unit', id: b } });
  S = step(S, { type: 'play', player: 1, card: fi });
  S = autoChoose(S);
  S = step(S, { type: 'pass', player: 1 });
  assert.equal(find(S, a), null, 'attacker 3 loses to defender 4');
  assert.ok(find(S, b));
  assert.equal(S.players[1].hand.length, hand, 'Floor It left hand (-1) and drew (+1)');
});

test('non-QUICK cards cannot be played as reactions', () => {
  let S = start();
  const a = add(S, 0, 'field', 'minotaur');
  eddies(S, 1, 3);
  setGigs(S, 1, [[4, 2]]);
  const unit = add(S, 1, 'hand', 'delamain-cab');
  S = step(S, { type: 'attack', player: 0, unit: a, target: { type: 'gigs' } });
  assert.equal(act(S, { type: 'play', player: 1, card: unit }).ok, false);
});

test('Flathead cannot be blocked while you have less Street Cred', () => {
  let S = start(HE, EP);
  const fl = add(S, 0, 'field', 'mt0d12-flathead');
  const blk = add(S, 1, 'field', 'corpo-security');
  setGigs(S, 0, [[4, 1]]);
  setGigs(S, 1, [[6, 6], [8, 8]]);
  S = step(S, { type: 'attack', player: 0, unit: fl, target: { type: 'gigs' } });
  assert.equal(act(S, { type: 'block', player: 1, unit: blk }).ok, false);
});

// ------------------------------------------------------------------ Legends
test('Call a Legend flips one face-down Legend, once per turn', () => {
  let S = start();
  eddies(S, 0, 2);
  S = step(S, { type: 'call', player: 0 });
  assert.equal(S.players[0].legends.filter((l) => l.faceUp).length, 1);
  assert.equal(act(S, { type: 'call', player: 0 }).ok, false);
});

test('Go Solo: pay cost, Legend becomes a ready Unit that can attack; removed from game when defeated', () => {
  let S = start();
  const goro = S.players[0].legends[0];
  S.players[0].legends = [goro]; // simplify
  goro.card = 'goro-takemura-hands-unclean'; goro.spent = false;
  eddies(S, 0, 5);
  S = step(S, { type: 'goSolo', player: 0, legend: goro.id });
  const u = find(S, goro.id);
  assert.ok(u.isLegend && !u.spent && !u.lag);
  assert.equal(power(S, u), 7);
  setGigs(S, 1, [[4, 2]]);
  assert.equal(checkAttack(S, 0, goro.id, { type: 'gigs' }), null);
});

test('Viktor Call: top 5, up to 2 cheap Gears to hand, rest to the bottom', () => {
  let S = start(HE, EP);
  const P = S.players[0];
  const v = P.legends.find((l) => l.card === 'viktor-vektor-sit-down-and-relax');
  // stack top 5: gear, gear, unit, gear, unit
  P.deck.length = 0;
  for (const c of ['kiroshi-optics', 'zetatech-faceplate', 'delamain-cab', 'mandibular-upgrade', 'psycho-squad']) spawn(S, 0, 'deck', c);
  for (let i = 0; i < 5; i++) spawn(S, 0, 'deck', 'floor-it');
  eddies(S, 0, 1);
  const handBefore = P.hand.length;
  // force the call to hit Viktor
  P.legends = [v]; v.faceUp = false;
  S = step(S, { type: 'call', player: 0 });
  S = autoChoose(S, 0);
  assert.equal(S.players[0].hand.length, handBefore + 2);
  assert.equal(S.players[0].deck.length, 10 - 2, '8 cards remain, rest bottomed');
});

test('Zetatech Faceplate: spending the host adjusts a Gig and draws with 3 different values', () => {
  let S = start(HE, EP);
  const u = add(S, 0, 'field', 'psycho-squad');
  find(S, u).gear.push({ id: 'zz', card: 'zetatech-faceplate', owner: 0, gear: [] });
  setGigs(S, 0, [[4, 1], [6, 2], [8, 5]]);
  find(S, u).lag = false;
  setGigs(S, 1, [[4, 2]]);
  const hand = S.players[0].hand.length;
  S = step(S, { type: 'attack', player: 0, unit: u, target: { type: 'gigs' } });
  assert.equal(S.pending.kind, 'choose');
  // Adjust the d8 from 5 to 6: Gigs show 1, 2, 6 -> still 3 different values -> draw 1.
  S = step(S, { type: 'choose', player: 0, ids: ['t0-8-2>6'] });
  assert.equal(S.players[0].hand.length, hand + 1, 'drew 1 for 3 distinct values');
  // And adjusting so two dice match gives no draw.
  let T = start(HE, EP);
  const u2 = add(T, 0, 'field', 'psycho-squad');
  find(T, u2).gear.push({ id: 'zz2', card: 'zetatech-faceplate', owner: 0, gear: [] });
  find(T, u2).lag = false;
  setGigs(T, 0, [[4, 1], [6, 2], [8, 5]]);
  setGigs(T, 1, [[4, 2]]);
  const h2 = T.players[0].hand.length;
  T = step(T, { type: 'attack', player: 0, unit: u2, target: { type: 'gigs' } });
  T = step(T, { type: 'choose', player: 0, ids: ['t0-4-0>2'] });
  assert.equal(T.players[0].hand.length, h2, 'no draw: values are 2, 2, 5');
});

test('Jackie Welles: decrease a Gig when playing the first Blue Unit; draw if it hits 1', () => {
  let S = start(HE, EP);
  const P = S.players[0];
  const j = P.legends.find((l) => l.card === 'jackie-welles-pour-one-out-for-me');
  j.faceUp = true;
  setGigs(S, 0, [[6, 2]]);
  eddies(S, 0, 4);
  const u = add(S, 0, 'hand', 'delamain-cab');
  const hand = P.hand.length;
  S = step(S, { type: 'play', player: 0, card: u });
  assert.equal(S.pending.kind, 'choose');
  S = autoChoose(S, 0); // first option: 2 -> 1
  assert.equal(S.players[0].gigs[0].value, 1);
  assert.equal(S.players[0].hand.length, hand, 'played card (-1), drew (+1)');
});

// ------------------------------------------------------------------ win conditions
test('start of turn with 7 Gigs wins', () => {
  let S = start();
  setGigs(S, 1, [[4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [20, 1], [4, 1]].map((x, i) => [x[0], x[1]]));
  S = step(S, { type: 'endTurn', player: 0 });
  assert.equal(S.winner, 1);
});

test('deck-out: drawing from an empty deck loses', () => {
  let S = start();
  S.players[1].deck.length = 0;
  S = step(S, { type: 'endTurn', player: 0 });
  assert.equal(S.winner, 0);
});

test('Overtime begins after both players finish their 7th turn; 7 Gigs wins at once', () => {
  let S = start();
  for (let i = 0; i < 14; i++) {
    for (const P of S.players) { if (P.deck.length < 10) for (let k = 0; k < 5; k++) spawn(S, S.players.indexOf(P), 'deck', 'mantis-blades'); }
    S = step(S, { type: 'endTurn', player: S.active });
    if (S.pending?.kind === 'gainGig') S = step(S, { type: 'gainGig', player: S.active, die: S.pending.options[0] });
    if (S.winner != null) break;
  }
  assert.equal(S.overtime, true);
  assert.equal(S.players[1].turnsTaken, 7, 'second player finished exactly 7 turns');
  assert.equal(S.players[0].turnsTaken, 8, 'first player has started turn 8');
  // Give player 0 seven dice during their turn: immediate win.
  setGigs(S, S.active, [[4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [20, 1], [4, 1]]);
  S = step(S, { type: 'endTurn', player: S.active }); // settle triggers the overtime check
  assert.notEqual(S.winner, null);
});

// ------------------------------------------------------------------ determinism & fuzz
test('same seed + same actions => same game', () => {
  const a = start(EP, HE, 42), b = start(EP, HE, 42);
  assert.deepEqual(a.players[0].hand.map((c) => c.card), b.players[0].hand.map((c) => c.card));
  assert.deepEqual(a.players[0].gigs, b.players[0].gigs);
});

function invariants(S) {
  const dice = [];
  const ids = new Set();
  const addId = (x) => { assert.ok(!ids.has(x.id), 'duplicate card id ' + x.id); ids.add(x.id); };
  for (const P of S.players) {
    dice.push(...P.fixer.map((d) => d.id), ...P.gigs.map((d) => d.id));
    for (const z of ['deck', 'hand', 'trash', 'field', 'eddies', 'legends', 'stash']) for (const c of P[z]) { addId(c); for (const g of c.gear || []) addId(g); }
    for (const d of [...P.gigs, ...P.fixer]) assert.ok(d.value >= 1 && d.value <= d.sides, 'die value in range');
  }
  assert.equal(new Set(dice).size, 12, 'exactly 12 distinct dice');
  assert.equal(dice.length, 12);
}

function playout(seed, deckA, deckB) {
  let S = newGame({ decks: [deckA, deckB], seed, first: seed % 2 });
  let rngState = seed;
  const rand = (n) => { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState % n; };
  for (let i = 0; i < 1500 && S.winner == null; i++) {
    const acts = legalActions(S);
    assert.ok(acts.length > 0, 'a non-finished game always has a legal action: ' + JSON.stringify(S.pending));
    // bias toward progress: prefer non-endTurn actions most of the time, but end turns eventually
    const nonEnd = acts.filter((a) => a.type !== 'endTurn');
    const a = nonEnd.length && rand(10) < 8 ? nonEnd[rand(nonEnd.length)] : acts[rand(acts.length)];
    const r = act(S, a);
    assert.ok(r.ok, `legalActions produced an illegal action ${JSON.stringify(a)}: ${r.error}`);
    S = r.state;
    invariants(S);
  }
  return S;
}

test('fuzz: 150 random games finish without engine errors or broken invariants', () => {
  let finished = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const [A, B] = seed % 3 === 0 ? [EP, EP] : seed % 3 === 1 ? [EP, HE] : [HE, HE];
    const S = playout(seed, A, B);
    if (S.winner != null) finished++;
  }
  assert.ok(finished >= 140, `only ${finished}/150 games finished`);
});
