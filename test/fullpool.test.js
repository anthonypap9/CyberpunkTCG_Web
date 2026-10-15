import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, validateDeck, expandMain } from '../www/js/cards.js';
import { newGame, act, legalActions } from '../www/js/engine.js';

let r0 = 12345;
const rnd = (n) => { r0 = (Math.imul(r0, 1664525) + 1013904223) >>> 0; return r0 % n; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function randomDeck() {
  const legends = Object.values(CARDS).filter((c) => c.type === 'legend');
  for (;;) {
    const L = shuffle(legends).slice(0, 3);
    if (new Set(L.map((l) => l.name)).size < 3) continue;
    const lim = {}; for (const l of L) lim[l.color] = (lim[l.color] || 0) + (l.ram || 0);
    const pool = Object.values(CARDS).filter((c) => c.type !== 'legend' && (c.ram || 0) <= (lim[c.color] || 0));
    if (pool.length < 14) continue;
    const main = {}; let n = 0;
    while (n < 40) { const c = pool[rnd(pool.length)]; if ((main[c.id] || 0) < 3) { main[c.id] = (main[c.id] || 0) + 1; n++; } }
    const d = { id: 'x', name: 'x', legends: L.map((l) => l.id), main };
    assert.deepEqual(validateDeck(d.legends, expandMain(main)), []);
    return d;
  }
}

test('150 AI-ish random games from random full-pool decks never crash or get stuck', () => {
  let done = 0;
  for (let seed = 1; seed <= 150; seed++) {
    let S = newGame({ decks: [randomDeck(), randomDeck()], seed, first: seed % 2 });
    let st = seed;
    const rand = (n) => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st % n; };
    for (let i = 0; i < 1500 && S.winner == null; i++) {
      const acts = legalActions(S);
      assert.ok(acts.length, 'stuck: ' + JSON.stringify(S.pending));
      const non = acts.filter((a) => a.type !== 'endTurn');
      const a = non.length && rand(10) < 8 ? non[rand(non.length)] : acts[rand(acts.length)];
      const r = act(S, a);
      assert.ok(r.ok, `seed ${seed}: ${JSON.stringify(a)} -> ${r.error}`);
      S = r.state;
    }
    if (S.winner != null) done++;
  }
  assert.ok(done >= 130, `only ${done} finished`);
});
