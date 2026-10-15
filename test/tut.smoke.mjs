import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const html = fs.readFileSync('www/index.html', 'utf8').replace(/<script[^>]*><\/script>/, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const g = globalThis;
for (const k of ['window', 'document', 'localStorage', 'navigator', 'Element']) { try { Object.defineProperty(g, k, { value: dom.window[k], configurable: true, writable: true }); } catch {} }
g.document.elementsFromPoint = () => [];
const errs = []; process.on('uncaughtException', (e) => errs.push(e));
await import('../www/js/app.js');
const w = g.window.__nctcg, doc = g.document, q = (s) => doc.querySelector(s);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
w.ui.fast = true;
click(q('[data-act="tutorial"]'));
const seen = [];
for (let n = 0; n < 150 && !errs.length; n++) {
  await wait(20);
  const T = w.ui.tut, S = w.ui.S; console.error(n, T?.i, S.active, S.stage, S.pending?.kind);
  const say = q('.coach .say')?.textContent; if (say && seen.at(-1) !== say) seen.push(say);
  if (!T || S.winner != null) break;
  const pd = S.pending;
  if (pd?.player === 0) {
    if (pd.kind === 'react') click([...doc.querySelectorAll('[data-act="gbtn"]')].find((b) => /Don't block|No reaction/.test(b.textContent))); else if (q('[data-act="gig"]')) click(q('[data-act="gig"]'));
    continue;
  }
  if (q('[data-act="tnext"]')) { click(q('[data-act="tnext"]')); continue; }
  if (S.active !== 0 || S.stage !== 'main') continue;
  const id = (q('.coach-focus[data-id]') || {}).dataset?.id;
  if (T.i === 3) { click(q('.hand .card')); continue; }
  if (id) {
    click(q(`.card[data-id="${id}"]`));
    const mv = [...doc.querySelectorAll('[data-act="move"]')].find((b) => /Sell|Play|Attack/.test(b.textContent));
    if (mv) { click(mv); continue; }
  }
  if (T.i >= 6 && !TUT_ATTACK(S, T)) click([...doc.querySelectorAll('[data-act="gbtn"]')].find((b) => /End turn/.test(b.textContent)));
  else if (T.i === 6) click([...doc.querySelectorAll('[data-act="gbtn"]')].find((b) => /End turn/.test(b.textContent)));
}
function TUT_ATTACK() { return false; }
console.log(seen.join('\n'));
console.log('final step', w.ui.tut?.i, 'errors', errs.map((e) => e.stack).slice(0, 2));
process.exit(errs.length ? 1 : 0);
