// Player profile: ID, starter deck, collection, Eddies. Pure logic (no DOM); app.js does the storage.
// Pack contents and odds are this fan tool's own balance, not official numbers.
import { CARDS, STARTER_DECKS, expandMain } from './cards.js';

export const REWARD = { learner: 1, standard: 5, sharp: 15 };
export const PACK = { cost: 10, size: 12, iconicChance: 0.02 };
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Secret', 'Nova Rare'];

// Starter cards have no printed rarity in our data: Legends count as Rare, expensive cards as Uncommon.
// Official rarities known from the community card database: the six starter Legends are Epic, and these four starter Units are Uncommon.
const STARTER_UNCOMMON = new Set(['goro-takemura-losing-his-way', 'minotaur', 'dexter-deshawn-one-last-chance', 'mt0d12-flathead']);
export function rarityOf(c) {
  if (c.rarity) return c.rarity;
  if (c.type === 'legend') return 'Epic';
  if (STARTER_UNCOMMON.has(c.id)) return 'Uncommon';
  return (c.cost || 0) >= 4 ? 'Uncommon' : 'Common';
}
// Not in any booster in real life (promo / box topper only): Nova Rare cards such as Rebecca.
export const inPacks = (c) => rarityOf(c) !== 'Nova Rare';

// slot -> weights over rarities (a pack is 6 + 3 + 2 + 1 slots = 12 cards)
export const SLOTS = [
  { n: 6, w: { Common: 1 }, label: 'Common' },
  { n: 3, w: { Uncommon: 1 }, label: 'Uncommon' },
  { n: 2, w: { Rare: 78, Epic: 18, Secret: 4 }, label: 'Rare or better' },
  { n: 1, w: { Common: 45, Uncommon: 30, Rare: 17, Epic: 6, Secret: 2 }, label: 'Wildcard' },
];

const byRarity = () => {
  const m = {};
  for (const c of Object.values(CARDS)) if (inPacks(c)) (m[rarityOf(c)] ||= []).push(c.id);
  return m;
};

const pick = (rng, w) => {
  let t = 0; for (const k in w) t += w[k];
  let r = rng() * t;
  for (const k in w) { r -= w[k]; if (r < 0) return k; }
  return Object.keys(w)[0];
};

// iconics: ids of cards that have an Iconic alt-art printing. A pack may swap its wildcard card for one (token "<id>~iconic").
export function rollPack(rng = Math.random, iconics = []) {
  const pool = byRarity(), out = [];
  for (const s of SLOTS) {
    for (let i = 0; i < s.n; i++) {
      const rar = pick(rng, s.w);
      const ids = pool[rar] && pool[rar].length ? pool[rar] : pool.Common;
      out.push(ids[Math.floor(rng() * ids.length)]);
    }
  }
  if (iconics.length && rng() < PACK.iconicChance) out[out.length - 1] = iconics[Math.floor(rng() * iconics.length)] + '~iconic';
  // show the best cards last (an Iconic counts as the very best)
  const rank = (t) => (t.endsWith('~iconic') ? 99 : RARITIES.indexOf(rarityOf(CARDS[t])));
  return out.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map((x) => x.id);
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newId(rng = Math.random) {
  let s = ''; for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(rng() * ALPHA.length)];
  return 'NC-' + s;
}

export function starterCards(starterId) {
  const d = STARTER_DECKS[starterId]; const owned = {};
  for (const id of [...d.legends, ...expandMain(d.main)]) owned[id] = (owned[id] || 0) + 1;
  return owned;
}

export function createProfile(starterId, name = '', rng = Math.random) {
  if (!STARTER_DECKS[starterId]) throw new Error('unknown starter');
  return { v: 1, id: newId(rng), name: String(name).slice(0, 16), starter: starterId, eddies: 0, owned: starterCards(starterId), iconic: {}, alt: {}, wins: { learner: 0, standard: 0, sharp: 0 }, packs: 0, created: Date.now() };
}

// Developer account: the exact player name below gets unlimited Eddies (client-side only, so not secret).
export const DEV_NAME = 'Cach3\u2122';
export const isDev = (P) => !!P && P.name === DEV_NAME;
export const edText = (P) => (isDev(P) ? '\u221e' : P.eddies);
export function ensureDev(P) { if (isDev(P)) P.eddies = Math.max(P.eddies, 999999); return P; }
export const iconicCount = (P, id) => (P.iconic && P.iconic[id]) || 0;
export const altOn = (P, id) => !!P && iconicCount(P, id) > 0 && !(P.alt && P.alt[id] === false);
export const ownedCount = (P, id) => P.owned[id] || 0;
export const uniqueOwned = (P) => Object.keys(P.owned).filter((id) => P.owned[id] > 0 && CARDS[id]).length;

export function award(P, level) {
  const r = REWARD[level] || 0;
  P.eddies += r; P.wins[level] = (P.wins[level] || 0) + 1;
  return r;
}

// Returns the new card ids and marks which were new, or null when the player can't afford it.
export function buyPack(P, rng = Math.random, iconics = []) {
  ensureDev(P);
  if (P.eddies < PACK.cost) return null;
  P.eddies -= PACK.cost; P.packs++; ensureDev(P);
  const cards = rollPack(rng, iconics);
  const fresh = new Set();
  const seen = {};
  P.iconic = P.iconic || {};
  for (const tok of cards) {
    const id = tok.replace('~iconic', ''), ic = tok !== id;
    if (!seen[tok] && (ic ? !(P.iconic[id] > 0) : !(P.owned[id] > 0))) fresh.add(tok);
    seen[tok] = 1; P.owned[id] = (P.owned[id] || 0) + 1; if (ic) P.iconic[id] = (P.iconic[id] || 0) + 1;
  }
  return { cards, fresh };
}

// What a deck needs that the player doesn't own: [{id, need, have}]
export function missingFor(P, deck) {
  const need = {};
  for (const id of deck.legends) need[id] = (need[id] || 0) + 1;
  for (const [id, n] of Object.entries(deck.main)) need[id] = (need[id] || 0) + n;
  const out = [];
  for (const [id, n] of Object.entries(need)) if ((P.owned[id] || 0) < n) out.push({ id, need: n, have: P.owned[id] || 0 });
  return out;
}

// ---- backup code (text the player can copy to another device)
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
const unb64 = (s) => (typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'));
export function exportCode(P) {
  const body = b64(JSON.stringify({ v: 1, id: P.id, n: P.name, s: P.starter, e: P.eddies, o: P.owned, i: P.iconic || {}, a: P.alt || {}, w: P.wins, p: P.packs, c: P.created }));
  return `NCT1.${body}.${hash(body)}`;
}
export function importCode(code) {
  const m = String(code).trim().match(/^NCT1\.([A-Za-z0-9+/=]+)\.([a-z0-9]+)$/);
  if (!m) return { error: 'That does not look like a save code.' };
  if (hash(m[1]) !== m[2]) return { error: 'The code is damaged (a character is missing or wrong).' };
  let j; try { j = JSON.parse(unb64(m[1])); } catch { return { error: 'The code could not be read.' }; }
  if (!j || !STARTER_DECKS[j.s] || typeof j.o !== 'object') return { error: 'The code has unknown contents.' };
  const owned = {}; for (const [id, n] of Object.entries(j.o)) if (CARDS[id] && n > 0) owned[id] = Math.min(99, n | 0);
  return { profile: { v: 1, id: String(j.id), name: String(j.n || '').slice(0, 16), starter: j.s, eddies: Math.max(0, j.e | 0), owned, iconic: Object.fromEntries(Object.entries(j.i || {}).filter(([id, n]) => CARDS[id] && n > 0).map(([id, n]) => [id, Math.min(99, n | 0)])), alt: Object.fromEntries(Object.entries(j.a || {}).filter(([id, v]) => CARDS[id] && v === false)), wins: { learner: 0, standard: 0, sharp: 0, ...(j.w || {}) }, packs: j.p | 0, created: j.c || Date.now() } };
}
