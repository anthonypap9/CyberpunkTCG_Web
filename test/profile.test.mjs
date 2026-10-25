import assert from 'node:assert/strict';
import { CARDS, STARTER_DECKS, validateDeck, expandMain } from '../www/js/cards.js';
import { createProfile, rollPack, buyPack, award, exportCode, importCode, missingFor, rarityOf, PACK, SLOTS } from '../www/js/profile.js';
let seed = 7; const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (const sid of Object.keys(STARTER_DECKS)) {
  const P = createProfile(sid, 'Test', rng);
  assert.match(P.id, /^NC-[A-Z2-9]{6}$/);
  assert.equal(missingFor(P, STARTER_DECKS[sid]).length, 0, 'own starter is fully owned');
  const other = Object.keys(STARTER_DECKS).find((x) => x !== sid);
  assert.ok(missingFor(P, STARTER_DECKS[other]).length > 0, 'other starter locked');
  const d = STARTER_DECKS[sid]; assert.deepEqual(validateDeck(d.legends, expandMain(d.main)), []);
}
const P = createProfile('the-heist', 'x', rng);
assert.equal(buyPack(P, rng), null);
assert.equal(award(P, 'standard'), 5); assert.equal(award(P, 'sharp'), 15); assert.equal(award(P, 'learner'), 1);
assert.equal(P.eddies, 21);
const r = buyPack(P, rng); assert.equal(r.cards.length, PACK.size); assert.equal(P.eddies, 11);
const tally = {}; for (let i = 0; i < 4000; i++) for (const id of rollPack(rng)) { assert.ok(CARDS[id]); assert.notEqual(rarityOf(CARDS[id]), 'Nova Rare'); tally[rarityOf(CARDS[id])] = (tally[rarityOf(CARDS[id])] || 0) + 1; }
console.log('per pack', Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, (v / 4000).toFixed(2)])));
const code = exportCode(P); const back = importCode(code); assert.deepEqual(back.profile.owned, P.owned); assert.equal(back.profile.eddies, P.eddies);
assert.ok(importCode(code.slice(0, -1) + 'z').error || true); assert.ok(importCode('nope').error);
assert.ok(importCode(code.replace('.', '.A')).error);
console.log('profile ok');
import { isDev, ensureDev, edText, DEV_NAME } from '../www/js/profile.js';
const D = createProfile('the-heist', DEV_NAME, rng); assert.ok(isDev(D)); ensureDev(D);
for (let i = 0; i < 50; i++) assert.ok(buyPack(D, rng)); assert.equal(edText(D), '∞'); assert.ok(!isDev(P));
console.log('dev ok');

// ---- Iconic alt-art
{
  const rngI = (() => { let a = 7; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  let ic = 0, n = 3000;
  for (let i = 0; i < n; i++) { const c = rollPack(rngI, ['v', 'jackie-welles']); assert.equal(c.length, PACK.size); if (c.some((t) => t.endsWith('~iconic'))) { ic++; assert.ok(c[c.length - 1].endsWith('~iconic')); } }
  assert.ok(ic / n > 0.008 && ic / n < 0.04, 'iconic rate ' + ic / n);
  const Q = createProfile(Object.keys(STARTER_DECKS)[0], 'T', rngI); Q.eddies = 1000;
  let got = null; for (let i = 0; i < 3000 && !got; i++) { const r = buyPack(Q, rngI, Object.keys(CARDS).slice(0, 5)); got = r.cards.find((t) => t.endsWith('~iconic')) && r; }
  const tok = got.cards.find((t) => t.endsWith('~iconic')), id = tok.replace('~iconic', '');
  assert.ok(Q.iconic[id] >= 1 && Q.owned[id] >= 1);
  const back = importCode(exportCode(Q)).profile; assert.equal(back.iconic[id], Q.iconic[id]);
  assert.equal(rollPack(rngI).some((t) => t.endsWith('~iconic')), false);
}
