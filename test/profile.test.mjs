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
