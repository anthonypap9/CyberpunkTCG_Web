import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const html = fs.readFileSync('www/index.html', 'utf8').replace(/<script[^>]*><\/script>/, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const g = globalThis;
for (const k of ['window', 'document', 'localStorage', 'navigator', 'Element']) { try { Object.defineProperty(g, k, { value: dom.window[k], configurable: true, writable: true }); } catch {} }
g.location = dom.window.location;
dom.window.document.elementsFromPoint = () => [];
g.document.elementsFromPoint = () => [];
const errs = [];
process.on('uncaughtException', (e) => { errs.push(e); });
await import('../www/js/app.js');
const w = g.window.__nctcg, doc = g.document;
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const q = (s) => doc.querySelector(s);
w.ui.fast = true;
click(q('[data-act="start"]'));
let steps = 0;
const t0 = Date.now();
while (w.ui.S.winner == null && steps++ < 4000) {
  const S = w.ui.S;
  await new Promise((r) => setTimeout(r, 5));
  if (w.ui.S !== S) continue;
  const pd = S.pending;
  if (pd && pd.player === 0 && pd.kind === 'react') { click([...doc.querySelectorAll('[data-act="gbtn"]')].find((b) => /Don't block|No reaction/.test(b.textContent))); continue; }
  if (pd && pd.player === 0) {
    const b = q('[data-act="order"],[data-act="mull"],[data-act="gig"],[data-act="opt"]');
    if (!b) { errs.push(new Error('no modal button for ' + pd.kind)); break; }
    click(b.matches('[data-act="mull"]') ? q('[data-act="mull"][data-v="0"]') : b); continue;
  }
  if (!pd && S.active === 0 && S.stage === 'main') {
    // try the first card with a legal move, else the main button
    const withMove = [...w.ui.moves.byObj.keys()];
    if (withMove.length && Math.random() < 0.8) {
      const id = withMove[0];
      const el = q(`.card[data-id="${id}"]`) || null;
      if (el) { click(el); const mb = q('[data-act="move"]'); if (mb) { click(mb); continue; } }
    }
    click([...doc.querySelectorAll('[data-act="gbtn"]')].find((b) => /End turn/.test(b.textContent)) || q('[data-act="gbtn"]'));
  } else if (pd?.kind === 'react' && pd.player === 0) click([...doc.querySelectorAll('[data-act="gbtn"]')].find((b) => /Don't block|No reaction/.test(b.textContent)));
}
console.log('finished', w.ui.S.winner, 'steps', steps, 'ms', Date.now() - t0, 'turn', w.ui.S.turnNo);
console.log('errors', errs.map((e) => e.stack || e.message).slice(0, 3));
process.exit(errs.length || w.ui.S.winner == null ? 1 : 0);
