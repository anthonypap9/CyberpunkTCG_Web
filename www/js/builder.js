// Deck-builder logic: limits, analysis and synergy hints. Everything here except validateDeck() is a SUGGESTION
// derived from the two official starter decks, not an official rule.
import { CARDS, validateDeck, expandMain, displayName } from './cards.js';
import { IMPL_FULL, IMPL_PARTIAL, EFFECTS } from './effects.js';

export const implOf = (id) => {
  const c = CARDS[id];
  if (c.curated || IMPL_FULL.has(id)) return 'full';
  if (IMPL_PARTIAL.has(id) || EFFECTS[id]) return 'partial';
  return 'none';
};
export const IMPL_LABEL = { full: 'Fully playable', partial: 'Partly automated', none: 'Text only (plays as a vanilla card)' };

export function ramLimits(legendIds) {
  const lim = {};
  for (const id of legendIds) { const d = CARDS[id]; if (d) lim[d.color] = (lim[d.color] || 0) + (d.ram || 0); }
  return lim;
}
export const maxCopies = 3;

// Suggested ranges for a 40-card deck (the starters are 20 Units + 20 Gear/Programs). Scaled for bigger decks.
export function recommended(size) {
  const k = Math.max(size, 40) / 40;
  const r = (a, b) => [Math.round(a * k), Math.round(b * k)];
  return {
    unit: { range: r(16, 22), why: 'Units are your attackers and blockers; they are also the cards that usually have NO sell tag, so they cannot become Eddies.' },
    spell: { range: r(18, 24), why: 'Gear + Programs. Almost all of them have the sell tag, so this is your Eddie supply (you sell 1 card per turn). Below ~16 you risk running out of money.' },
    cheap: { range: r(12, 26), why: 'Cards costing 1–2. You need plays on turns 1–3 while you have only 1–3 Eddies.' },
    expensive: { range: r(0, 6), why: 'Cards costing 5+. A few finishers are fine; too many get stuck in hand.' },
    avgCost: { range: [2.2, 3.2], why: 'Both starter decks average about 2.5–2.9.' },
  };
}

export function analyse(legendIds, mainIds) {
  const cards = mainIds.map((id) => CARDS[id]).filter(Boolean);
  const n = cards.length;
  const count = (f) => cards.filter(f).length;
  const curve = {};
  for (const c of cards) { const k = Math.min(c.cost ?? 0, 7); curve[k] = (curve[k] || 0) + 1; }
  const colors = {};
  for (const c of cards) colors[c.color] = (colors[c.color] || 0) + 1;
  const tags = {};
  for (const c of [...cards, ...legendIds.map((i) => CARDS[i]).filter(Boolean)]) for (const t of c.tags || []) tags[t] = (tags[t] || 0) + 1;
  const totalCost = cards.reduce((s, c) => s + (c.cost || 0), 0);
  const stat = {
    n, units: count((c) => c.type === 'unit'), gear: count((c) => c.type === 'gear'), programs: count((c) => c.type === 'program'),
    sellable: count((c) => c.sell), cheap: count((c) => (c.cost || 0) <= 2), expensive: count((c) => (c.cost || 0) >= 5),
    blockers: count((c) => c.kw?.blocker), quick: count((c) => c.kw?.quick),
    avgCost: n ? totalCost / n : 0, curve, colors, tags,
    notAutomated: [...new Set(cards.map((c) => c.id))].filter((id) => implOf(id) === 'none' && CARDS[id].text && !/flavour only/.test(CARDS[id].text)),
  };
  stat.spells = stat.gear + stat.programs;
  return stat;
}

// Verdict lines ("ok" | "warn") per card type, with the reason.
export function typeAdvice(st) {
  const rec = recommended(st.n || 40);
  const row = (label, val, key) => {
    const [lo, hi] = rec[key].range;
    const state = val < lo ? 'low' : val > hi ? 'high' : 'ok';
    return { label, val: Number.isInteger(val) ? val : val.toFixed(1), range: `${lo}–${hi}`, state, why: rec[key].why };
  };
  return [
    row('Units', st.units, 'unit'),
    row('Gear + Programs (Eddie supply)', st.spells, 'spell'),
    row('Cheap cards (cost 1–2)', st.cheap, 'cheap'),
    row('Expensive cards (cost 5+)', st.expensive, 'expensive'),
    { ...row('Average cost', st.avgCost, 'avgCost'), val: st.avgCost.toFixed(1), range: '2.2–3.2' },
  ];
}

// Mechanical themes found in card text. A theme is "active" when 3+ cards in the deck care about it.
export const THEMES = [
  { id: 'high', name: 'High Gigs (8+)', re: /8\+/, tip: 'Wants Gigs showing 8 or more. Adjust-up effects and big dice help; Gig-boosting cards keep it online.' },
  { id: 'minmax', name: 'Min / max Gigs', re: /\bmin Gig|\bmax Gig|min or max|min value|max value/i, tip: 'Wants Gigs at their lowest (or highest) face. Decrease effects and small dice (d4) make this easy.' },
  { id: 'pair', name: 'Value-pairs', re: /value-pair|matching pair/i, tip: 'Wants two Gigs showing the same number. Set/adjust effects can line them up.' },
  { id: 'parity', name: 'Even / odd Gigs', re: /even (number|value)|odd (number|value)|an even|an odd|even\b.*Gig|odd\b.*Gig/i, tip: 'Cares whether Gigs or your Street Cred are even/odd. Adjust by 1 to flip it.' },
  { id: 'under', name: 'Behind on Street Cred', re: /less ☆|fewer ☆/, tip: 'Rewards having LOWER Street Cred than a rival (Mercs/low-power Units).' },
  { id: 'ahead', name: 'Ahead on Street Cred', re: /more ☆/, tip: 'Rewards having HIGHER Street Cred (big Units and Gear).' },
  { id: 'gear', name: 'Gear & equipped Units', re: /equipped|Gear/, tip: 'Wants plenty of Gear on the field; Gear also doubles as Eddie supply.' },
  { id: 'trash', name: 'Trash recursion', re: /from your trash|Trash \d|your trash/, tip: 'Digs through the deck and replays Units/Programs from the trash.' },
  { id: 'bottom', name: 'Bottom-deck removal', re: /[Bb]ottom-deck/, tip: 'Removes rival Units by putting them under their deck (they come back much later).' },
  { id: 'removal', name: 'Unit removal', re: /[Dd]efeat (a|all|another|the)? ?(rival|spent|other)/, tip: 'Direct removal. Keep a few cheap ones for early blockers.' },
  { id: 'blocker', name: 'Blockers', re: /BLOCKER/, tip: 'Keeps your Gigs safe: ready BLOCKER Units can intercept attacks.' },
  { id: 'adren', name: 'Fast attackers (ADRENALINE)', re: /ADRENALINE/, tip: 'Units that attack the turn they are played.' },
  { id: 'legend', name: 'Legend tricks', re: /Call a Legend|face-up Legend|GO SOLO/, tip: 'Leans on Calling and Going Solo with your Legends.' },
  { id: 'discard', name: 'Discard / hand disruption', re: /discard/i, tip: 'Makes the rival discard; pairs with cheap, fast Units.' },
];
const themeOf = (c, th) => th.re.test(c.text || '') || (th.id === 'blocker' && c.kw?.blocker) || (th.id === 'adren' && c.kw?.adrenaline);

export function synergy(legendIds, mainIds, colorsAllowed) {
  const inDeck = [...mainIds, ...legendIds].map((id) => CARDS[id]).filter(Boolean);
  const pool = Object.values(CARDS).filter((c) => c.type !== 'legend' && colorsAllowed(c));
  const out = [];
  for (const th of THEMES) {
    const have = inDeck.filter((c) => themeOf(c, th));
    if (have.length < 3) continue;
    const owned = {}; for (const id of mainIds) owned[id] = (owned[id] || 0) + 1;
    const add = pool.filter((c) => themeOf(c, th) && (owned[c.id] || 0) < 3).sort((a, b) => (owned[b.id] ? 1 : 0) - (owned[a.id] ? 1 : 0) || (a.cost || 0) - (b.cost || 0)).slice(0, 6);
    out.push({ ...th, count: have.length, add: add.map((c) => c.id) });
  }
  out.sort((a, b) => b.count - a.count);
  // Tag clusters
  const tagc = {};
  for (const c of inDeck) for (const t of c.tags || []) tagc[t] = (tagc[t] || 0) + 1;
  const tags = Object.entries(tagc).filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => ({ tag: t, n }));
  return { themes: out.slice(0, 5), tags };
}

// Which cards would pair well with this one (shared themes / tags), for the card detail view.
export function pairsWith(id, limit = 6) {
  const c = CARDS[id];
  if (!c) return [];
  const mine = THEMES.filter((th) => themeOf(c, th));
  const scored = Object.values(CARDS).filter((o) => o.id !== id && o.type !== 'legend').map((o) => {
    let s = 0;
    for (const th of mine) if (themeOf(o, th)) s += 2;
    for (const t of c.tags || []) if ((o.tags || []).includes(t)) s += 1;
    if (o.color === c.color) s += 0.5;
    return { id: o.id, s };
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, limit);
  return scored.map((x) => x.id);
}

export function deckProblems(legendIds, main) {
  return validateDeck(legendIds, expandMain(main));
}
export { displayName };
