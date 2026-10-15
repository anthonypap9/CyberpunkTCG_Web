// Downloads official card images for YOUR OWN personal use into www/art/<card-id>.webp
// Usage (Node 18+, run on your own PC):  node tools/fetch-art.mjs          (all 151 cards, from the built-in card list)
//                                         --all is not needed anymore
// The site hands out signed, expiring image links, so images must be saved locally; the app then reads www/art/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../www/js/cards.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'art');
const BASE = 'https://cyberpunktcg.com';
const H = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', referer: 'https://cyberpunktcg.com/', origin: 'https://cyberpunktcg.com', accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(r.status + ' ' + u); return r; };

async function slugsFromSite() {
  const seen = new Set();
  for (let page = 1; page <= 12; page++) {
    let html = '';
    try { html = await (await get(`${BASE}/cards?page=${page}`)).text(); } catch { break; }
    const before = seen.size;
    for (const m of html.matchAll(/href="\/cards\/([a-z0-9-]+)(?:\?[^"]*)?"/g)) seen.add(m[1]);
    if (seen.size === before) break;
    await sleep(300);
  }
  return [...seen];
}

const slugs = process.argv.includes('--all') ? await slugsFromSite() : Object.keys(CARDS);
console.log(`Fetching ${slugs.length} card images into ${OUT}`);
let ok = 0; const miss = [];
for (const s of slugs) {
  const file = path.join(OUT, s + '.webp');
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) { ok++; continue; }
  try {
    const html = await (await get(`${BASE}/cards/${s}`)).text();
    const un = (u) => u.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    const cands = [];
    for (const re of [/property="og:image"\s+content="([^"]+)"/, /content="([^"]+)"\s+property="og:image"/, /name="twitter:image"\s+content="([^"]+)"/, /content="([^"]+)"\s+name="twitter:image"/]) { const m = html.match(re); if (m) cands.push(un(m[1])); }
    for (const m of html.matchAll(/https?:(?:\\?\/){2}[^"'\s\\]+?\.(?:webp|png|jpe?g)(?:\?[^"'\s\\]*)?/gi)) cands.push(un(m[0]));
    const uniq = [...new Set(cands)].filter((u) => !/logo|icon|favicon|sprite/i.test(u)).sort((a, b) => /Signature|Expires|Key-Pair/i.test(b) - /Signature|Expires|Key-Pair/i.test(a));
    if (!uniq.length) { fs.writeFileSync(path.join(OUT, '_debug_' + s + '.html'), html); throw new Error(`no image link in page (${html.length} bytes; saved _debug_${s}.html)`); }
    let saved = false, last = `${uniq.length} link(s) tried`;
    for (const u of uniq) {
      try { const img = await get(u); const buf = Buffer.from(await img.arrayBuffer()); if (buf.length > 1000) { fs.writeFileSync(file, buf); saved = true; break; } last = 'tiny file ' + u; } catch (e2) { last += ' | ' + e2.message; }
    }
    if (!saved) fs.writeFileSync(path.join(OUT, '_debug_' + s + '.html'), html);
    if (!saved) throw new Error('image download failed: ' + last);
    ok++; console.log('ok  ', s);
  } catch (e) { miss.push(s); console.log('MISS', s, '-', e.message); }
  await sleep(250);
}
console.log(`\nDone: ${ok} saved, ${miss.length} missed${miss.length ? ': ' + miss.join(', ') : ''}`);
