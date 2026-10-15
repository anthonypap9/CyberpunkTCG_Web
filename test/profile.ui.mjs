import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('www/index.html', 'utf8').replace(/<script[^>]*><\/script>/, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const g = globalThis;
for (const k of ['window', 'document', 'localStorage', 'navigator', 'Element']) { try { Object.defineProperty(g, k, { value: dom.window[k], configurable: true, writable: true }); } catch {} }
g.location = dom.window.location;
const errs = []; process.on("uncaughtException", (e) => { console.log("UNCAUGHT", e.stack); process.exit(1); });
process.on("unhandledRejection", (e) => { console.log("REJ", e.stack || e); process.exit(1); });
await import('../www/js/app.js');
const w = g.window.__nctcg, doc = g.document;
const click = (el) => { assert.ok(el, 'missing element'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); };
const q = (s) => doc.querySelector(s);
assert.equal(w.ui.screen, 'welcome');
assert.equal(doc.querySelectorAll('.starter').length, 2);
assert.ok(q('[data-act="wgo"]').disabled);
click(q('button[data-act="wpick"][data-id="the-heist"]'));
q('[data-pname]').value = 'Cach3'; q('[data-pname]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
click(q('[data-act="wgo"]'));
assert.equal(w.ui.screen, 'menu'); assert.equal(w.ui.P.starter, 'the-heist'); assert.equal(w.ui.mine, 'the-heist');
assert.ok(q('.pstrip').textContent.includes(w.ui.P.id));
// the other starter is locked for the player's deck
assert.ok(q('.deckpick.locked'), 'other starter locked');
// no eddies: buying fails
click(q('[data-act="shop"]')); assert.equal(w.ui.screen, 'shop'); assert.ok(q('[data-act="buy"]').disabled);
w.ui.P.eddies = 25; w.render();
click(q('[data-act="buy"]'));
assert.equal(w.ui.P.eddies, 15); assert.ok(q('.packov .stack'));
assert.ok(q('.packov'), 'overlay');
for (let i = 0; i < 12; i++) {
  click(q('.packov[data-act="pkstep"]')); await new Promise((r) => setTimeout(r, 120));
  assert.ok(q('.stack .pk.top .pkfront'), 'card shown ' + i); assert.ok(q('.stack .pk.top').classList.contains('flip'), 'flipped');
}
click(q('.packov[data-act="pkstep"]'));
assert.equal(doc.querySelectorAll('.reveal .pk.flip').length, 12, 'summary grid');
assert.ok(JSON.parse(localStorage.getItem('nctcg.profile')).eddies === 15, 'saved');
// collection counts
click(q('[data-act="browser"]')); assert.equal(w.ui.screen, 'browser'); assert.ok(doc.querySelectorAll('.cwrap.unowned').length > 50);
// builder: cannot exceed owned copies; unowned legends hidden
click(q('[data-act="menu"]')); click(q('[data-act="builder"]'));
const owns = (id) => w.ui.P.owned[id] || 0;
const legendBtns = [...doc.querySelectorAll('[data-act="ladd"]')].map((b) => b.dataset.id);
assert.ok(legendBtns.every((id) => owns(id) > 0), 'only owned legends offered');
// find an owned card with exactly 1 copy and ensure + stops at 1
const one = Object.keys(w.ui.P.owned).find((id) => w.ui.P.owned[id] === 1 && w.ui.P.starter && !id.includes('legend'));
w.ui.bd = { id: null, name: 'x', legends: [], main: {} }; w.render();
for (let i = 0; i < 4; i++) { const b = q(`[data-act="badd"][data-id="${one}"][data-d="1"]`); if (b && !b.disabled) click(b); }
assert.ok((w.ui.bd.main[one] || 0) <= 1, 'clamped to owned');
// save code round trip + reset
click(q('[data-act="menu"]')); click(q('[data-act="pmenu"]'));
const code = q('#pcode').value; assert.ok(code.startsWith('NCT1.'));
click(q('[data-act="preset"]')); click(q('[data-act="preset2"]')); assert.equal(w.ui.screen, 'welcome'); assert.equal(w.ui.P, null);
click(q('a[data-act="pmenu"]')); q('#pin').value = code; click(q('[data-act="pimport"]'));
assert.equal(w.ui.screen, 'menu'); assert.equal(w.ui.P.starter, 'the-heist'); assert.equal(w.ui.P.eddies, 15);
// win reward: Sharp = +15, paid once
w.ui.level = 'sharp'; w.ui.fast = true; w.startGame();
const before = w.ui.P.eddies;
w.setState({ ...w.ui.S, winner: 0, winReason: 'test' });
assert.equal(w.ui.P.eddies, before + 15); assert.equal(w.ui.P.wins.sharp, 1);
w.setState({ ...w.ui.S }); assert.equal(w.ui.P.eddies, before + 15, 'paid once');
assert.ok(q('.reward').textContent.includes('+15'));
// a deck the player does not own can't start
w.ui.mine = 'embracing-power'; w.ui.screen = 'menu'; w.startGame(); assert.equal(w.ui.screen, 'menu');
console.log('profile ui ok', errs.map((e) => e.message));
process.exit(errs.length ? 1 : 0);
