import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync('dist/night-city-tcg-trainer.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window, d = w.document;
const click = (sel) => { const el = d.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(100);
click('[data-act="builder"]');
click('[data-act="ladd"][data-id="goro-takemura-hands-unclean"]');
click('[data-act="ladd"][data-id="saburo-arasaka-stubborn-patriarch"]');
click('[data-act="ladd"][data-id="yorinobu-arasaka-embracing-destruction"]');
for (let n = 0; n < 40; n++) {
  const b = d.querySelector('.prow:not(.locked):not(.has) [data-act="badd"][data-d="1"]:not([disabled]), .prow.has [data-act="badd"][data-d="1"]:not([disabled])');
  if (!b) break; b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}
console.log('legends', d.querySelectorAll('.lrow .lchip').length, 'deck count', d.querySelector('.panel h3 span.okc, .panel h3 span.badc')?.textContent, 'errs', [...d.querySelectorAll('.errs li')].map((x) => x.textContent));
console.log('advice rows', d.querySelectorAll('.adv tr').length, 'themes', d.querySelectorAll('.theme').length);
click('[data-act="bz"]');
console.log('zoom', !!d.querySelector('.modal'));
process.exit(0);
