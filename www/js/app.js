import { CARDS, STARTER_DECKS, displayName } from './cards.js';
import { newGame, act, legalActions, find, locate, power, cred, def, dn, checkPlay, checkSell, checkGoSolo, checkAttack, checkCall, blockersFor, rival, hasBlocker } from './engine.js';
import { aiAct, LEVELS } from './ai.js';
import { sfx, setMuted } from './sound.js';
import { analyse, typeAdvice, synergy, pairsWith, ramLimits, implOf, IMPL_LABEL, deckProblems } from './builder.js';
import { expandMain } from './cards.js';

const HUMAN = 0;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ settings
const store = {
  get(k, d) { try { const v = localStorage.getItem('nctcg.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nctcg.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const customDecks = () => store.get('decks', {});
const allDecks = () => ({ ...STARTER_DECKS, ...customDecks() });
const getDeck = (id) => allDecks()[id] || STARTER_DECKS['embracing-power'];

const ui = {
  screen: 'menu', S: null, history: [], sel: null, hover: null, logOpen: false, thinking: false, logSeen: 0, timer: null,
  level: store.get('level', 'standard'), mine: store.get('mine', 'embracing-power'), theirs: store.get('theirs', 'the-heist'),
  mute: store.get('mute', false), fast: store.get('fast', false), rolling: new Map(), flash: new Map(), toast: null, browser: { q: '', type: '', color: '' }, bd: null, bf: { q: '', type: '', color: '', fit: true, auto: false },
  zoomCard: null, rules: false, tut: null,
};
setMuted(ui.mute);

// ------------------------------------------------------------------ state transitions
function setState(S, { human = false } = {}) {
  const prev = ui.S;
  ui.S = S;
  if (!human && prev) ui.history = []; // once the rival acted, information has been revealed: no undo past it
  noteChanges(prev, S);
  if (ui.sel && !locate(S, ui.sel) && !S.players[HUMAN].hand.some((c) => c.id === ui.sel)) ui.sel = null;
  render();
  pump();
}

function noteChanges(prev, S) {
  if (!prev) { ui.logSeen = S.log.length; return; }
  // dice animations
  const owner = (st) => { const m = new Map(); st.players.forEach((P, i) => P.gigs.forEach((d) => m.set(d.id, i))); return m; };
  const a = owner(prev), b = owner(S);
  const now = Date.now();
  for (const [id, o] of b) {
    if (!a.has(id)) ui.rolling.set(id, now + 900);
    else if (a.get(id) !== o) ui.flash.set(id, now + 1100);
  }
  // sounds from new log lines
  const lines = S.log.slice(Math.max(0, ui.logSeen - (prev.log.length === 400 ? 0 : 0)));
  const fresh = S.log.length >= ui.logSeen ? S.log.slice(ui.logSeen) : S.log.slice(-5);
  ui.logSeen = S.log.length;
  let played = false;
  for (const l of fresh) {
    const t = l.text;
    const once = (n) => { if (!played) { sfx(n); played = true; } };
    if (/ wins:/.test(t)) { sfx(S.winner === HUMAN ? 'win' : 'lose'); played = true; }
    else if (/rolls the d/.test(t)) once('roll');
    else if (/steals a d/.test(t)) once('steal');
    else if (/is defeated|removed from the game/.test(t)) once('boom');
    else if (/attacks/.test(t)) once('hit');
    else if (/Calls /.test(t)) once('call');
    else if (/plays |equips |sells |sends /.test(t)) once('tap');
  }
  void lines;
}

function human(a) {
  const S = ui.S;
  const r = act(S, { ...a, player: HUMAN });
  if (!r.ok) { toast(r.error); sfx('nope'); return false; }
  ui.history.push(S);
  if (ui.tut) ui.tut.did[a.type] = true;
  if (ui.history.length > 60) ui.history.shift();
  ui.sel = null;
  setState(r.state, { human: true });
  return true;
}

function undo() {
  if (!ui.history.length) return;
  clearTimeout(ui.timer);
  const S = ui.history.pop();
  ui.S = S; ui.sel = null; ui.logSeen = S.log.length;
  render(); pump();
}

function pump() {
  clearTimeout(ui.timer);
  const S = ui.S;
  if (ui.screen !== 'game' || !S || S.winner != null) { ui.thinking = false; return; }
  const who = S.pending ? S.pending.player : S.active;
  if (who === HUMAN) { ui.thinking = false; updateTray(); return; }
  ui.thinking = true;
  updateTray();
  const kind = S.pending?.kind;
  const delay = ui.fast ? 120 : kind === 'mulligan' || kind === 'gainGig' || kind === 'chooseOrder' ? 450 : kind === 'react' ? 900 : 750;
  ui.timer = setTimeout(() => {
    if (ui.S !== S) return;
    const a = aiAct(S, ui.level);
    if (!a) return;
    const r = act(S, a);
    if (!r.ok) { console.error('AI produced an illegal action', a, r.error); return; }
    setState(r.state);
  }, delay);
}

// ------------------------------------------------------------------ moves (drag targets / tap targets)
function buildMoves(S) {
  const byObj = new Map();
  const buttons = [];
  const push = (id, m) => { if (!byObj.has(id)) byObj.set(id, []); byObj.get(id).push(m); };
  const P = S.players[HUMAN];
  const known = new Set(P.known);
  for (const a of legalActions(S)) {
    switch (a.type) {
      case 'sell': push(a.card, { a, drop: 'eddies', label: 'Sell for 1 €$' }); break;
      case 'play': {
        if (a.target) push(a.card, { a, drop: 'u:' + a.target, label: `Equip to ${dn(find(S, a.target))}` });
        else push(a.card, { a, drop: 'field', label: S.pending?.kind === 'react' ? 'Play (QUICK)' : 'Play' });
        break;
      }
      case 'goSolo': {
        const l = P.legends.find((x) => x.id === a.legend);
        // Don't leak the identity of unknown face-down Legends through the list of legal moves.
        if (l && (l.faceUp || known.has(l.id))) push(a.legend, { a, drop: 'field', label: 'Go Solo' });
        break;
      }
      case 'attack':
        if (a.target.type === 'gigs') push(a.unit, { a, drop: 'rgigs', label: "Attack Rival's Gigs" });
        else push(a.unit, { a, drop: 'u:' + a.target.id, label: `Attack ${dn(find(S, a.target.id))}` });
        break;
      case 'block': {
        push(a.unit, { a, drop: 'u:' + S.combat.attacker, label: 'Block the attack' });
        const bu = find(S, a.unit);
        buttons.unshift({ a, label: `🛡 Block with ${dn(bu)} (power ${power(S, bu)})`, primary: true });
        break;
      }
      case 'call': { const rE = P.eddies.filter((e) => !e.spent).length; buttons.push({ a, label: `Call a Legend (costs 1 €$: ${rE ? 'an Eddie' : 'one of your ready Legends'})` }); break; }
      case 'endTurn': buttons.push({ a, label: 'End turn', primary: true }); break;
      case 'pass': buttons.push({ a, label: S.pending?.kind === 'react' && S.combat ? "Don't block — let it happen" : 'No reaction — let it resolve', primary: false }); break;
      default: break;
    }
  }
  return { byObj, buttons };
}

function explain(S, id) {
  const P = S.players[HUMAN];
  const inHand = P.hand.find((c) => c.id === id);
  if (S.pending?.kind === 'react') {
    if (inHand) return checkPlay(S, HUMAN, id, { react: true, target: null }) || 'Only QUICK Programs can be played as a reaction.';
    const u = P.field.find((x) => x.id === id);
    if (u) return hasBlocker(u) ? (u.spent ? 'This Unit is spent, so it cannot block.' : S.combat?.unblockable ? 'This attack cannot be blocked.' : 'It can block.') : 'This Unit has no BLOCKER, so it cannot redirect attacks.';
    return 'Nothing to do with this card right now.';
  }
  if (S.active !== HUMAN) return "It is the Rival's turn.";
  if (inHand) {
    const d = def(inHand);
    const sell = checkSell(S, HUMAN, id);
    if (d.type === 'legend' || d.cost == null) return 'This card cannot be played from hand.';
    const tgt = d.type === 'gear' ? [...P.field, ...P.legends.filter((l) => l.faceUp)][0] : null;
    if (d.type === 'gear' && !tgt) return 'Gear needs a friendly Unit or a face-up Legend to equip to — you have neither yet.';
    const e = checkPlay(S, HUMAN, id, { target: tgt?.id });
    return e || (sell ? `Playable. (${sell})` : 'Playable.');
  }
  const l = P.legends.find((x) => x.id === id);
  if (l) {
    if (!(l.faceUp || P.known.includes(l.id))) return 'Face-down Legend. You can spend it to pay 1 €$ for any card, or Call one at random (1 €$, once per turn).';
    return checkGoSolo(S, HUMAN, id) || 'You can GO SOLO.';
  }
  const u = P.field.find((x) => x.id === id);
  if (u) {
    const e = checkAttack(S, HUMAN, id, { type: 'gigs' });
    const e2 = S.players[1].field.find((t) => t.spent) ? checkAttack(S, HUMAN, id, { type: 'unit', id: S.players[1].field.find((t) => t.spent).id }) : e;
    return e && e2 ? e : 'Ready to attack.';
  }
  return 'Nothing to do with this right now.';
}

// ------------------------------------------------------------------ official art (optional local files in art/)
const artOK = new Set(), artBad = new Set();
document.addEventListener('load', (e) => { const i = e.target; if (i.classList?.contains('art')) { artOK.add(i.dataset.card); i.closest('.card')?.classList.add('art-on'); } }, true);
document.addEventListener('error', (e) => { const i = e.target; if (i.classList?.contains('art')) { artBad.add(i.dataset.card); i.remove(); } }, true);

// ------------------------------------------------------------------ view helpers
const SHAPES = [4, 6, 8, 10, 12, 20];
function dieEl(d, cls = '', extra = '') {
  const now = Date.now();
  const rolling = ui.rolling.get(d.id) > now ? ' rolling' : '';
  const flash = ui.flash.get(d.id) > now ? ' flash' : '';
  return `<div class="die d${d.sides} ${cls}${rolling}${flash}" data-die="${d.id}" title="d${d.sides}${d.value != null && !cls.includes('fix') ? ' showing ' + d.value : ''}" ${extra}><span>${cls.includes('fix') ? 'd' + d.sides : d.value}</span></div>`;
}

function cardEl(inst, o = {}) {
  const d = CARDS[inst.card];
  const S = ui.S;
  const classes = ['card', d.color];
  if (artOK.has(inst.card)) classes.push('art-on');
  if (o.mini) classes.push('mini');
  if (inst.spent && o.zone !== 'hand') classes.push('spent');
  if (inst.lag) classes.push('lag');
  if (o.zone === 'legends' && inst.faceUp) classes.push('faceup-leg');
  if (o.cls) classes.push(o.cls);
  if (ui.sel === inst.id) classes.push('sel');
  const attr = `data-id="${inst.id}" data-zone="${o.zone || ''}" data-owner="${inst.owner}"`;
  if (o.back) return `<div class="card back ${o.mini ? 'mini' : ''} ${inst.spent ? 'spent' : ''} ${ui.sel === inst.id ? 'sel' : ''} ${o.cls || ''}" ${attr}><div class="bl">Legend<br>#${(o.idx ?? 0) + 1}</div></div>`;
  let pw = '';
  if (d.type === 'unit' || inst.isLegend) {
    const cur = o.zone === 'field' ? power(S, inst) : d.power || 0;
    const printed = d.power || 0;
    pw = `<div class="pw ${cur > printed ? 'buff' : cur < printed ? 'nerf' : ''}">${cur}</div>`;
  } else if (d.type === 'gear') pw = `<div class="pw">+${d.power || 0}</div>`;
  else if (d.type === 'legend' && d.cost != null) pw = `<div class="pw">${d.power || 0}</div>`;
  const gear = inst.gear?.length ? `<div class="gear">${inst.gear.map((g) => `<i title="${esc(dn(g))}">${esc(CARDS[g.card].name.split(' ')[0].slice(0, 7))} +${CARDS[g.card].power || 0}</i>`).join('')}</div>` : '';
  const ram = d.ram ? `<div class="ram">RAM ${d.ram}</div>` : '';
  const peek = o.peeked ? '<div class="ram" style="top:auto;bottom:2.6em;color:var(--accent)">peeked</div>' : '';
  return `<div class="${classes.join(' ')}" ${attr} title="${esc(displayName(d))}">
    ${artBad.has(inst.card) ? '' : `<img class="art" data-card="${inst.card}" src="art/${inst.card}.webp" alt="" draggable="false">`}<div class="cost ${d.sell ? 'sell' : ''}">${d.cost == null ? '–' : d.cost}</div><div class="type">${d.type}</div>${ram}
    <div class="body"><div class="name">${esc(d.name)}${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</div>
    <div class="txt">${esc(d.text)}</div></div><div class="tags">${esc(d.tags.join(' · '))}</div>${gear}${pw}${peek}</div>`;
}

function half(S, p, moves) {
  const P = S.players[p];
  const mine = p === HUMAN;
  const legends = P.legends.map((l, i) => {
    const show = l.faceUp || (mine && P.known.includes(l.id));
    return show ? cardEl(l, { mini: true, zone: 'legends', peeked: !l.faceUp }) : cardEl(l, { mini: true, zone: 'legends', back: true, idx: i });
  }).join('');
  const ready = P.eddies.filter((e) => !e.spent).length, spent = P.eddies.length - ready;
  const eddies = P.eddies.map((e) => `<div class="eddy ${e.spent ? 'spent' : ''}"></div>`).join('') || '<small class="muted">no Eddies yet</small>';
  const cs = cred(S, p);
  const sub = mine ? `Deck <b>${P.deck.length}</b> · Trash <b>${P.trash.length}</b>` : `Hand <b>${P.hand.length}</b> · Deck <b>${P.deck.length}</b> · Trash <b>${P.trash.length}</b>`;
  const fixer = P.fixer.map((d) => dieEl(d, 'fix')).join('');
  const gigs = P.gigs.map((d) => dieEl(d, mine ? 'mine' : 'theirs')).join('') || '<small class="muted">none</small>';
  const field = P.field.map((u) => cardEl(u, { mini: true, zone: 'field' })).join('');
  return `<section class="half ${mine ? 'me' : 'rival'}" data-half="${p}">
    <div class="rail"><div class="zlabel"><b>${esc(S.names[p])}</b> · Legends</div><div class="legends">${legends}</div>
      <div class="zlabel">Eddies ${ready}/${P.eddies.length}${mine ? ` · <b>€$ to spend: ${ready + P.legends.filter((l) => !l.spent).length}</b>` : ''}</div><div class="eddies" data-drop="${mine ? 'eddies' : 'reddies'}">${eddies}</div>
      <div class="counts">${sub}</div></div>
    <div class="zone-field" data-drop="${mine ? 'field' : 'rfield'}"><div class="zlabel">Field</div>${field || '<small class="muted" style="align-self:center">No Units</small>'}</div>
    <div class="zone-gigs" data-drop="${mine ? 'gigs' : 'rgigs'}"><div class="zlabel">Gigs ${P.gigs.length}/7 · ☆ <b>${cs}</b></div><div class="dicerow">${gigs}</div>
      <div class="zlabel" style="margin-top:2px">Fixer</div><div class="fixer">${fixer || '<small class="muted">empty</small>'}</div></div>
  </section>`;
}

function turnLabel(S) {
  if (S.winner != null) return 'Game over';
  if (S.stage === 'setup' || S.pending?.kind === 'chooseOrder' || S.pending?.kind === 'mulligan') return 'Setup';
  const who = S.active === HUMAN ? 'Your turn' : "Rival's turn";
  return `${who} · turn ${S.players[S.active].turnsTaken}${S.overtime ? ' · OVERTIME' : ''}`;
}

function detailFor(S, id) {
  const hit = [...S.players[0].hand, ...S.players[1].hand].find((c) => c.id === id);
  const inst = hit || find(S, id);
  if (!inst) return null;
  const d = def(inst);
  const hidden = (inst.owner !== HUMAN && hit) || (!inst.faceUp && S.players[inst.owner].legends.includes(inst) && !S.players[inst.owner].known.includes(inst.id) && !(inst.owner === HUMAN && false));
  if (hidden || (d.type === 'legend' && !inst.faceUp && !S.players[inst.owner].known.includes(inst.id) && !inst.isLegend)) return { head: 'Face-down Legend', text: 'Unknown until it is Called. Spend it for 1 €$ at any time.' };
  const stats = [d.type, d.cost != null ? `cost ${d.cost}` : null, d.type !== 'program' && d.power != null ? `power ${d.type === 'gear' ? '+' : ''}${d.power}` : null, d.ram ? `RAM ${d.ram}` : null, d.sell ? 'sell tag' : null].filter(Boolean).join(' · ');
  return { head: displayName(d), stats, text: d.text + (d.textUnverified ? ' (Official text could not be read; treated as having no effect.)' : '') };
}


// ------------------------------------------------------------------ deck builder
function newDraft(from) {
  const d = from ? allDecks()[from] : null;
  return { id: d && customDecks()[from] ? from : null, name: d ? (customDecks()[from] ? d.name : d.name + ' (copy)') : 'My deck', legends: d ? [...d.legends] : [], main: d ? { ...d.main } : {} };
}
const bdMain = () => expandMain(ui.bd.main);
const bdCount = () => Object.values(ui.bd.main).reduce((s, n) => s + n, 0);
const dot = (c) => `<i class="cdot ${c}"></i>`;

function renderBuilder() {
  const bd = ui.bd, f = ui.bf;
  const lim = ramLimits(bd.legends);
  const fits = (c) => (c.ram || 0) <= (lim[c.color] || 0);
  const main = bdMain();
  const st = analyse(bd.legends, main);
  const errs = deckProblems(bd.legends, bd.main);
  const adv = typeAdvice(st);
  const syn = bd.legends.length ? synergy(bd.legends, main, fits) : { themes: [], tags: [] };
  const all = Object.values(CARDS);
  const legendPool = all.filter((c) => c.type === 'legend' && (!bd.legends.length || true)).filter((c) => !bd.legends.includes(c.id));
  const q = f.q.toLowerCase();
  const pool = all.filter((c) => c.type !== 'legend' && (!f.type || c.type === f.type) && (!f.color || c.color === f.color) && (!q || (displayName(c) + ' ' + c.text + ' ' + c.tags.join(' ')).toLowerCase().includes(q)) && (!f.fit || !bd.legends.length || fits(c)))
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name));
  const lcard = (id) => { const c = CARDS[id]; return `<button class="lchip ${c.color}" data-act="bz" data-id="${id}" title="Details">${dot(c.color)}<b>${esc(c.name)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}<em>RAM ${c.ram || 0} · ${c.color}</em><span class="x" data-act="bdel" data-id="${id}">✕</span></button>`; };
  const limTxt = ['red', 'green', 'blue', 'yellow'].filter((c) => lim[c]).map((c) => `${dot(c)}${cap(c)} ${lim[c]}`).join(' &nbsp; ') || 'pick Legends first';
  const row = (c) => {
    const n = bd.main[c.id] || 0, ok = fits(c) || !bd.legends.length;
    const why = !ok ? `Needs ${c.color} RAM ${c.ram}; you have ${lim[c.color] || 0}` : '';
    const im = implOf(c.id);
    return `<div class="prow ${ok ? '' : 'locked'} ${n ? 'has' : ''}"><button class="pname" data-act="bz" data-id="${c.id}">${dot(c.color)}<b>${esc(c.name)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}
      <em>${c.type} · cost ${c.cost} ${c.type === 'unit' ? '· pow ' + c.power : c.type === 'gear' ? '· +' + c.power : ''} · RAM ${c.ram}${c.sell ? ' · sell' : ''}</em>${why ? `<span class="why">${esc(why)}</span>` : ''}</button>
      <span class="impl ${im}" title="${IMPL_LABEL[im]}">${im === 'full' ? '●' : im === 'partial' ? '◐' : '○'}</span>
      <span class="qty"><button data-act="badd" data-id="${c.id}" data-d="-1" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button data-act="badd" data-id="${c.id}" data-d="1" ${ok && n < 3 && bdCount() < 50 ? '' : 'disabled'}>+</button></span></div>`;
  };
  const maxCurve = Math.max(1, ...Object.values(st.curve));
  const curve = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<div class="cv"><div class="bar" style="height:${((st.curve[k] || 0) / maxCurve) * 54}px"></div><b>${st.curve[k] || 0}</b><small>${k === 7 ? '7+' : k}</small></div>`).join('');
  const saved = Object.entries(customDecks());
  app().innerHTML = `<div class="screen"><div class="wrap bdwrap">
    <div class="row" style="margin:8px 0 10px"><button data-act="menu">← Back</button><h2>Deck builder</h2><span class="spacer"></span></div>
    <div class="panel"><div class="row"><input class="bdname" value="${esc(bd.name)}" data-bn="1" maxlength="30"><button class="primary" data-act="bsave" ${errs.length ? 'title="Not legal yet, but you can still save a draft"' : ''}>Save</button>
      <select data-bload="1"><option value="">Load…</option>${Object.values(STARTER_DECKS).map((d) => `<option value="${d.id}">${esc(d.name)} (starter)</option>`).join('')}${saved.map(([id, d]) => `<option value="${id}">${esc(d.name)}</option>`).join('')}</select>
      <button data-act="bnew">New</button><button data-act="bclear">Clear cards</button><button data-act="bexport">Export</button><button data-act="bimport">Import</button>${bd.id ? '<button class="ghost" data-act="bdelete">Delete saved</button>' : ''}</div></div>
    <div class="panel"><h3>1. Legends (${bd.legends.length}/3) <span class="muted">RAM limit per colour = sum of your Legends' RAM · ${limTxt}</span></h3>
      <div class="lrow">${bd.legends.map(lcard).join('') || '<span class="muted">Choose 3 Legends with different names.</span>'}</div>
      ${bd.legends.length < 3 ? `<details open><summary>Add a Legend</summary><div class="lrow pick">${legendPool.map((c) => `<button class="lchip ${c.color}" data-act="ladd" data-id="${c.id}">${dot(c.color)}<b>${esc(c.name)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}<em>RAM ${c.ram || 0} · ${c.color}</em></button>`).join('')}</div></details>` : ''}</div>
    <div class="bdcols">
      <div class="panel"><h3>2. Cards <span class="muted">${pool.length} shown</span></h3>
        <div class="row" style="margin-bottom:8px"><input type="search" placeholder="Search…" value="${esc(f.q)}" data-bff="q">
          <select data-bff="type"><option value="">All types</option>${['unit', 'gear', 'program'].map((o) => `<option ${o === f.type ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <select data-bff="color"><option value="">All colours</option>${['red', 'green', 'blue', 'yellow'].map((o) => `<option ${o === f.color ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" data-bfc="fit" ${f.fit ? 'checked' : ''}> only cards my RAM allows</label></div>
        <div class="plist">${pool.map(row).join('') || '<span class="muted">No cards match.</span>'}</div>
        <p class="fine">● fully playable · ◐ partly automated · ○ text only (the game shows the text but does not perform it). “sell” = can be sold for an Eddie (fan-tool assumption: Gear/Programs yes, Units mostly no).</p></div>
      <div class="side">
        <div class="panel"><h3>Deck: <span class="${bdCount() >= 40 && bdCount() <= 50 ? 'okc' : 'badc'}">${bdCount()}</span> / 40–50</h3>
          ${errs.length ? `<ul class="errs">${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="okc">✓ Legal deck</p>'}
          <div class="curve">${curve}</div><p class="fine">Cost curve (cost 1–7+). Colours: ${Object.entries(st.colors).map(([c, n]) => `${dot(c)}${n}`).join(' ') || '—'}</p>
          <div class="row"><button class="primary" data-act="bplay" ${errs.length ? 'disabled' : ''}>Play vs AI with this deck</button></div></div>
        <div class="panel"><h3>Suggested limits <span class="muted">(guidelines from the starter decks, not rules)</span></h3>
          <table class="adv">${adv.map((r) => `<tr class="${r.state}" title="${esc(r.why)}"><td>${r.state === 'ok' ? '✓' : '⚠'} ${r.label}</td><td><b>${r.val}</b></td><td>aim ${r.range}</td></tr>`).join('')}</table>
          <ul class="advl">${adv.filter((r) => r.state !== 'ok').map((r) => `<li><b>${r.label}:</b> ${r.state === 'low' ? 'a bit low' : 'a bit high'}. ${esc(r.why)}</li>`).join('')}
          <li>Max <b>3 copies</b> of a card (official). Sellable cards in deck: <b>${st.sellable}</b> — you sell 1 per turn, so keep this near 18–24.</li>
          ${st.notAutomated.length ? `<li class="warn">${st.notAutomated.length} card(s) in this deck have <b>text only</b> (not performed by the game): ${st.notAutomated.slice(0, 6).map((id) => esc(CARDS[id].name)).join(', ')}${st.notAutomated.length > 6 ? '…' : ''}</li>` : ''}</ul></div>
        <div class="panel"><h3>Synergies</h3>
          ${syn.themes.length || syn.tags.length ? '' : '<p class="fine">Add a few cards and I will point out themes your deck leans into.</p>'}
          ${syn.tags.length ? `<p class="fine">Shared tags: ${syn.tags.map((t) => `<b>${esc(t.tag)}</b> ×${t.n}`).join(' · ')}</p>` : ''}
          ${syn.themes.map((t) => `<div class="theme"><b>${t.name}</b> <span class="muted">${t.count} cards</span><div class="fine">${esc(t.tip)}</div>${t.add.length ? `<div class="chips">${t.add.map((id) => `<button class="chip" data-act="bz" data-id="${id}">${esc(CARDS[id].name)}</button>`).join('')}</div>` : ''}</div>`).join('')}</div>
      </div></div>
  </div></div>${ui.zoomCard ? bzModal(ui.zoomCard) : ''}${ui.bio ? ioModal() : ''}`;
}
function bzModal(id) {
  const d = CARDS[id], pw = pairsWith(id), im = implOf(id), n = ui.bd.main[id] || 0;
  return `<div class="modal" data-act="closeZoom"><div class="box" onclick="event.stopPropagation()" style="max-width:520px"><div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
    <div style="width:170px">${cardEl({ id: 'z', card: id, owner: 0, gear: [], spent: false }, { zone: 'zoom' }).replace('class="card ', 'style="--cw:170px" class="card ')}</div>
    <div style="flex:1;min-width:200px"><h3 style="margin:0">${esc(displayName(d))}</h3><p class="muted">${d.type} · ${d.color} · cost ${d.cost ?? '–'} · RAM ${d.ram ?? '–'} · ${d.rarity || ''}${d.sell ? ' · sell tag' : ''}</p>
    <p style="white-space:pre-line">${esc(d.text || '(no rules text)')}</p><p class="fine impl-${im}">${IMPL_LABEL[im]}</p></div></div>
    ${pw.length ? `<p class="fine" style="margin-top:10px">Pairs well with:</p><div class="chips">${pw.map((i) => `<button class="chip" data-act="bz" data-id="${i}">${esc(CARDS[i].name)}</button>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:12px">${d.type === 'legend' ? '' : `<button data-act="badd" data-id="${id}" data-d="1">+ Add (${n}/3)</button>`}<span class="spacer"></span><button class="primary" data-act="closeZoom">Close</button></div></div></div>`;
}
function ioModal() {
  return `<div class="modal"><div class="box" style="max-width:520px"><h3>${ui.bio === 'export' ? 'Export' : 'Import'} deck</h3>
    <textarea id="iotext" rows="12" style="width:100%">${ui.bio === 'export' ? esc(exportDeck(ui.bd)) : ''}</textarea>
    <p class="fine">${ui.bio === 'export' ? 'Copy this text to share or back up your deck.' : 'Paste a deck: lines like “3 Sandevistan” and “Legend: Goro Takemura: Hands Unclean”, or card ids.'}</p>
    <div class="row">${ui.bio === 'import' ? '<button class="primary" data-act="bio-go">Import</button>' : ''}<span class="spacer"></span><button data-act="bio-x">Close</button></div></div></div>`;
}
function exportDeck(bd) {
  return [`Deck: ${bd.name}`, ...bd.legends.map((id) => `Legend: ${displayName(CARDS[id])}`), ...Object.entries(bd.main).map(([id, n]) => `${n} ${displayName(CARDS[id])}`)].join('\n');
}
function importDeck(text) {
  const byName = new Map(Object.values(CARDS).flatMap((c) => [[displayName(c).toLowerCase(), c], [c.id, c]]));
  const out = { id: null, name: 'Imported deck', legends: [], main: {} }; const miss = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim(); if (!l) continue;
    let m;
    if ((m = l.match(/^deck:\s*(.+)$/i))) { out.name = m[1].slice(0, 30); continue; }
    if ((m = l.match(/^legend:\s*(.+)$/i))) { const c = byName.get(m[1].trim().toLowerCase()); if (c && c.type === 'legend') out.legends.push(c.id); else miss.push(l); continue; }
    m = l.match(/^(\d+)\s*x?\s+(.+)$/i) || [0, '1', l];
    const c = byName.get(m[2].trim().toLowerCase());
    if (c && c.type !== 'legend') out.main[c.id] = Math.min(3, (out.main[c.id] || 0) + Number(m[1])); else miss.push(l);
  }
  return { deck: out, miss };
}
function saveDraft() {
  const bd = ui.bd; const decks = customDecks();
  const id = bd.id || 'c-' + Date.now().toString(36);
  decks[id] = { id, name: bd.name || 'My deck', legends: [...bd.legends], main: { ...bd.main } };
  store.set('decks', decks); bd.id = id; return id;
}

// ------------------------------------------------------------------ render
const app = () => $('#app');

function render() {
  if (ui.screen === 'menu') return renderMenu();
  if (ui.screen === 'browser') return renderBrowser();
  if (ui.screen === 'builder') return renderBuilder();
  renderGame();
}

function renderMenu() {
  const deckBtn = (id, key) => {
    const d = allDecks()[id];
    return `<button class="deckpick ${ui[key] === id ? 'on' : ''}" data-act="deck" data-key="${key}" data-id="${id}"><b>${esc(d.name)}</b><span>${esc(d.blurb || 'Custom deck')}</span></button>`;
  };
  const deckList = (key) => Object.keys(allDecks()).map((id) => deckBtn(id, key)).join('<div style="height:8px"></div>');
  app().innerHTML = `<div class="screen"><div class="wrap">
    <div class="brand"><h1>Night City TCG Trainer</h1><span class="tag">unofficial fan tool</span></div>
    <p class="fine">A playable learning version of the Cyberpunk Trading Card Game's Beta rules. Not affiliated with or endorsed by Weird Co. or CD PROJEKT RED.</p>
    <div class="grid2">
      <div class="panel"><h3>Your deck</h3>${deckList('mine')}</div>
      <div class="panel"><h3>Rival's deck</h3>${deckList('theirs')}</div>
    </div>
    <div class="panel"><h3>Rival strength</h3><div class="seg">${LEVELS.map((l) => `<button data-act="level" data-id="${l}" class="${ui.level === l ? 'on' : ''}">${cap(l)}</button>`).join('')}</div>
      <p class="fine" style="margin:8px 0 0">Learner makes mistakes and often skips good plays. Standard plays solid greedy turns. Sharp looks one move further ahead.</p></div>
    <div class="row" style="margin:6px 0 18px"><button class="primary" data-act="tutorial" style="padding:11px 22px;font-size:16px">Learn to play (tutorial)</button><button data-act="start" style="padding:11px 22px;font-size:16px">Quick match</button>
      <button data-act="builder">Deck builder</button><button data-act="browser">Card browser</button><button data-act="rules">Rules in one minute</button><span class="spacer"></span>
      <button class="ghost" data-act="mute">${ui.mute ? '🔇 Sound off' : '🔊 Sound on'}</button><button class="ghost" data-act="fast">${ui.fast ? '⚡ Fast rival' : '⏱ Normal rival speed'}</button></div>
    <div class="panel"><h3>How to play (drag or tap)</h3><p class="fine" style="margin:0;color:#c8cfdb">Drag a card from your hand onto the highlighted zone, or tap it and use the buttons / tap the highlighted target. Drag a ready Unit onto a spent rival Unit or the rival's Gigs to attack. Tap any card to read it and see why it can or can't be played.</p></div>
  </div></div>${ui.rules ? rulesModal() : ''}`;
}

function rulesModal() {
  return `<div class="modal" data-act="closeRules"><div class="box" onclick="event.stopPropagation()"><h2>Rules in one minute</h2>
  <p><b>Win:</b> start your turn with <b>7 or more Gig dice</b> (12 dice exist, 6 each). Steal your Rival's by attacking. After both players' 7th turn the game goes to <b>Overtime</b>: the moment you hold 7, you win. Drawing from an empty deck loses.</p>
  <p><b>Your turn:</b> Start Phase (ready everything, draw 1, roll one Gig die from your fixer — the d20 goes last), then Main Phase in any order: <b>sell</b> one card for an Eddie (once per turn), <b>play</b> cards by spending Eddies (Legends can each be spent as 1 €$), <b>Call a Legend</b> (1 €$, once per turn), <b>attack</b>.</p>
  <p><b>Attacking:</b> spend a ready Unit (not one with Lag). Hit a <b>spent</b> rival Unit to fight (higher power wins, ties destroy both) or hit the rival's Gigs to steal 1 (+1 per 10 power). Ready Units can't be attacked, so keep BLOCKERS ready. The defender may react: Call a Legend, play QUICK Programs, or Block.</p>
  <p><b>Units can't attack the turn they're played</b> (Lag). Programs are one-shot effects. Gear equips to a Unit or face-up Legend and goes away with it.</p>
  <div class="row"><span class="spacer"></span><button class="primary" data-act="closeRules">Got it</button></div></div></div>`;
}

function renderBrowser() {
  const q = ui.browser;
  const cards = Object.values(CARDS).filter((c) => (!q.type || c.type === q.type) && (!q.color || c.color === q.color) && (!q.q || (displayName(c) + ' ' + c.text + ' ' + c.tags.join(' ')).toLowerCase().includes(q.q.toLowerCase())));
  const sel = (id, opts, val) => `<select data-bf="${id}"><option value="">All</option>${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  app().innerHTML = `<div class="screen"><div class="wrap">
    <div class="row" style="margin:8px 0 12px"><button data-act="menu">← Back</button><h2>Card browser</h2><span class="muted">${cards.length} cards</span></div>
    <div class="row" style="margin-bottom:14px"><input type="search" placeholder="Search name, text, tag…" value="${esc(q.q)}" data-bf="q"> ${sel('type', ['unit', 'gear', 'program', 'legend'], q.type)} ${sel('color', ['red', 'green', 'blue', 'yellow'], q.color)}</div>
    <div class="cardgrid">${cards.map((c) => cardEl({ id: 'b-' + c.id, card: c.id, owner: 0, gear: [], spent: false }, { zone: 'browser' }).replace('card ', 'card ')).join('')}</div>
  </div></div>${ui.zoomCard ? zoomModal(ui.zoomCard) : ''}`;
}

function zoomModal(cardId) {
  const d = CARDS[cardId];
  return `<div class="modal" data-act="closeZoom"><div style="width:min(300px,80vw)" onclick="event.stopPropagation()">
    ${cardEl({ id: 'z', card: cardId, owner: 0, gear: [], spent: false }, { zone: 'zoom' }).replace('class="card ', 'style="--cw:min(300px,80vw)" class="card ')}
    <p style="text-align:center;margin-top:10px"><b>${esc(displayName(d))}</b><br><span class="muted">${d.type} · ${d.color} · RAM ${d.ram}${d.sell ? ' · sell tag' : ''}</span></p></div></div>`;
}

function renderGame() {
  tutAdvance();
  const S = ui.S;
  const myTurnDecision = S.winner == null && (S.pending ? S.pending.player === HUMAN : S.active === HUMAN);
  const moves = myTurnDecision ? buildMoves(S) : { byObj: new Map(), buttons: [] };
  ui.moves = moves;
  const hand = S.players[HUMAN].hand.map((c) => {
    const can = moves.byObj.has(c.id);
    return cardEl(c, { zone: 'hand', cls: can ? 'can' : myTurnDecision && S.pending?.kind !== 'react' ? 'cant' : '' });
  }).join('') || '<span class="empty">Your hand is empty.</span>';
  const rh = S.players[1].hand.length;
  app().innerHTML = `<div class="game">
    <header class="top"><button data-act="menu" title="Menu">☰</button><span class="title">Night City TCG Trainer</span><span class="status" id="status">${esc(turnLabel(S))}</span><span class="spacer"></span>
      <span class="rhand"><span class="backs">${'<i></i>'.repeat(Math.min(rh, 10))}</span> Rival hand ${rh}</span>
      <button data-act="undo" ${ui.history.length ? '' : 'disabled'}>↶ Undo</button><button data-act="log">📜 Log</button><button data-act="mute">${ui.mute ? '🔇' : '🔊'}</button></header>
    <div class="cols"><main class="board" id="board">${half(S, 1, moves)}<div id="trayhost"></div>${half(S, HUMAN, moves)}</main>
      <aside class="logpanel ${ui.logOpen ? 'open' : ''}" id="logpanel"><h3>Game log</h3><div class="loglines" id="loglines">${logHTML(S)}</div></aside></div>
    <footer class="hand" id="hand">${hand}</footer>
  </div>${modalHTML(S)}${S.winner != null ? winHTML(S) : ''}${ui.zoomCard ? zoomModal(ui.zoomCard) : ''}`;
  updateTray();
  markTargets();
  tutFocus();
  const ll = $('#loglines'); if (ll) ll.scrollTop = ll.scrollHeight;
}

function logHTML(S) {
  return S.log.slice(-120).map((l) => `<div class="${l.text.startsWith('—') ? 'turn' : ''}">${esc(l.text)}</div>`).join('');
}

function updateTray() {
  const host = $('#trayhost');
  const S = ui.S;
  if (!host || !S) return;
  const moves = ui.moves || { byObj: new Map(), buttons: [] };
  const id = ui.sel || ui.hover;
  const det = id ? detailFor(S, id) : null;
  const selMoves = ui.sel ? moves.byObj.get(ui.sel) || [] : [];
  let info = '';
  if (S.winner != null) info = `<div class="h">${S.winner === HUMAN ? 'You win!' : 'The Rival wins.'}</div><div class="t">${esc(S.winReason || '')}</div>`;
  else if (S.pending?.kind === 'react' && S.pending.player === HUMAN) {
    const att = find(S, S.combat.attacker);
    const tgt = S.combat.target;
    info = `<div class="h banner">⚔ ${esc(dn(att))} (power ${power(S, att, true)}) attacks ${tgt.type === 'gigs' ? 'your Gigs' : esc(dn(find(S, tgt.id)))}!</div><div class="t">${S.combat.unblockable ? "This attack can't be blocked." : 'Block it with a ready BLOCKER (buttons below), or let it happen.'}</div>`;
  } else if (ui.thinking) info = `<div class="h">${S.pending ? 'Rival is deciding…' : "Rival's turn…"}</div><div class="t">Watch the log for what the Rival does.</div>`;
  else if (det) info = `<div class="h">${esc(det.head)}</div><div class="t muted">${esc(det.stats || '')}</div><div class="t">${esc(det.text)}</div>${ui.sel ? `<div class="t" style="color:${selMoves.length ? 'var(--ok)' : 'var(--accent)'}">${selMoves.length ? 'Drag it to a highlighted target, or tap a button →' : esc(explain(S, ui.sel))}</div>` : ''}`;
  else if (S.active === HUMAN && S.stage === 'main') info = '<div class="h">Your Main Phase</div><div class="t">Sell a card, play cards (drag onto your Field), Call a Legend, attack — in any order — then end your turn. Tap any card to read it.</div>';
  else info = '<div class="h">…</div>';
  if (ui.tut && S.winner == null) info = coachHTML(S) + (det ? `<div class="t" style="margin-top:6px"><b>${esc(det.head)}</b> — ${esc(det.text)}</div>` : '');
  const btns = [];
  selMoves.forEach((m, i) => btns.push(`<button data-act="move" data-i="${i}">${esc(m.label)}</button>`));
  if ((ui.sel || ui.hover) && !ui.tut) btns.push(`<button class="ghost" data-act="zoom">🔍 Big view</button>`);
  const tutOK = (b) => !ui.tut || b.a.type === 'pass' || (b.a.type === 'endTurn' && (ui.tut.i === 6 || ui.tut.i >= 11));
  if (S.winner == null) moves.buttons.forEach((b, i) => tutOK(b) && btns.push(`<button class="${b.primary ? 'primary' : ''}" data-act="gbtn" data-i="${i}">${esc(b.label)}</button>`));
  host.innerHTML = `<div class="tray"><div class="info">${info}</div><div class="acts">${btns.join('')}</div></div>`;
  const st = $('#status'); if (st) st.textContent = turnLabel(S) + (ui.thinking ? ' …' : '');
}

function modalHTML(S) {
  const pd = S.pending;
  if (!pd || pd.player !== HUMAN || S.winner != null) return '';
  const P = S.players[HUMAN];
  switch (pd.kind) {
    case 'chooseOrder':
      return `<div class="modal"><div class="box"><h2>You won the roll</h2><p>You rolled ${S.roll[0]}, the Rival rolled ${S.roll[1]}. Who goes first? The first player starts with two Legends already spent (they don't ready on turn 1) — that's the trade-off for moving first.</p>
        <div class="opts"><button class="primary" data-act="order" data-v="1">Go first</button><button data-act="order" data-v="0">Go second</button></div></div></div>`;
    case 'mulligan':
      return `<div class="modal"><div class="box"><h2>Opening hand</h2><p>Keep this hand, or shuffle it back and draw 6 new cards (once). Good hands have a few sellable cards (they show € under the cost) and some cheap plays.</p>
        <div class="mullhand">${P.hand.map((c) => cardEl(c, { zone: 'mull' })).join('')}</div>
        <div class="opts"><button class="primary" data-act="mull" data-v="0">Keep</button><button data-act="mull" data-v="1">Mulligan</button></div></div></div>`;
    case 'gainGig':
      return `<div class="modal"><div class="box"><h2>Gain a Gig</h2>${ui.tut ? '<p>Pick any die. Each Gig die is 1 point. Get 7 to win.</p>' : ''}<p ${ui.tut ? 'hidden' : ''}>Pick a die from your fixer; it is rolled and joins your Gigs. The d20 always goes last. Gig <i>values</i> matter for Street Cred (☆) effects — but every die counts as one Gig toward winning.</p>
        <div class="dicerow" style="justify-content:center;gap:10px">${P.fixer.filter((d) => pd.options.includes(d.id)).map((d) => dieEl(d, 'fix pick', `data-act="gig" data-id="${d.id}" style="--s:54px"`)).join('')}</div></div></div>`;
    case 'choose':
      return `<div class="modal"><div class="box"><h2>${esc(pd.prompt)}</h2><div class="opts" style="margin-top:10px">${pd.options.map((o, i) => `<button data-act="opt" data-i="${i}">${esc(o.label)}</button>`).join('')}${pd.optional ? '<button class="ghost" data-act="skip">Skip / decline</button>' : ''}</div></div></div>`;
    default: return '';
  }
}

function winHTML(S) {
  const won = S.winner === HUMAN;
  return `<div class="modal"><div class="box"><h2>${won ? 'You win! 🏆' : 'The Rival wins'}</h2><p>${esc(S.winReason || '')}. Final Gigs: you ${S.players[0].gigs.length}, Rival ${S.players[1].gigs.length}.</p>
    <div class="row"><button class="primary" data-act="start">Play again</button><button data-act="review">Review the board</button><button data-act="menu">Menu</button></div></div></div>`;
}

// ------------------------------------------------------------------ targets / selection / drag
function targetKeysFor(id) {
  const ms = ui.moves?.byObj.get(id);
  return ms ? new Set(ms.map((m) => m.drop)) : new Set();
}
function markTargets() {
  $$('.drop-ok').forEach((e) => e.classList.remove('drop-ok'));
  if (!ui.sel) return;
  for (const k of targetKeysFor(ui.sel)) {
    if (k.startsWith('u:')) { const el = $(`.card[data-id="${k.slice(2)}"]`); if (el) el.classList.add('drop-ok'); }
    else $$(`[data-drop="${k}"]`).forEach((e) => e.classList.add('drop-ok'));
  }
}
function select(id) {
  ui.sel = ui.sel === id ? null : id;
  sfx('tick');
  const S = ui.S;
  updateTray();
  $$('.card.sel').forEach((e) => e.classList.remove('sel'));
  if (ui.sel) $$(`.card[data-id="${ui.sel}"]`).forEach((e) => e.classList.add('sel'));
  markTargets();
  if (ui.tut) { const i0 = ui.tut.i; tutAdvance(); if (ui.tut.i !== i0) { render(); return; } }
  if (ui.sel && !(ui.moves?.byObj.get(ui.sel) || []).length) {
    const mine = S.players[HUMAN];
    const own = mine.hand.some((c) => c.id === id) || mine.field.some((u) => u.id === id) || mine.legends.some((l) => l.id === id);
    if (own) toast(explain(S, id), 'info');
  }
}
function runMove(m) { if (m) human(m.a); }
function dropKeyAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.classList?.contains('dragghost')) continue;
    const c = el.closest('.card[data-id]');
    if (c && c.classList.contains('drop-ok')) return 'u:' + c.dataset.id;
    const z = el.closest('[data-drop]');
    if (z && z.classList.contains('drop-ok')) return z.dataset.drop;
  }
  return null;
}

let down = null, drag = null;
document.addEventListener('pointerdown', (e) => {
  if (ui.screen !== 'game' || e.button > 0) return;
  const c = e.target.closest('.card[data-id]');
  if (!c || c.dataset.zone === 'mull' || c.dataset.zone === 'zoom') return;
  down = { id: c.dataset.id, x: e.clientX, y: e.clientY, el: c, pid: e.pointerId };
});
document.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (!drag && dist > 9) {
    const ms = ui.moves?.byObj.get(down.id);
    if (!ms || !ms.length) { return; }
    ui.sel = down.id;
    $$('.card.sel').forEach((x) => x.classList.remove('sel'));
    down.el.classList.add('sel');
    updateTray(); markTargets();
    const g = down.el.cloneNode(true);
    g.classList.add('dragghost'); g.classList.remove('sel', 'spent', 'can', 'drop-ok');
    g.style.width = down.el.getBoundingClientRect().width + 'px';
    g.style.setProperty('--cw', down.el.getBoundingClientRect().width + 'px');
    document.body.appendChild(g);
    drag = { g };
    try { down.el.setPointerCapture(down.pid); } catch { /* ignore */ }
  }
  if (drag) { drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; e.preventDefault(); }
});
document.addEventListener('pointerup', (e) => {
  if (!down) return;
  const d = down; down = null;
  if (drag) {
    drag.g.remove(); drag = null;
    const key = dropKeyAt(e.clientX, e.clientY);
    const ms = ui.moves?.byObj.get(d.id) || [];
    const m = ms.find((x) => x.drop === key);
    if (m) runMove(m); else { markTargets(); }
    d.swallow = true; swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
  }
});
document.addEventListener('pointercancel', () => { if (drag) { drag.g.remove(); drag = null; } down = null; });
let swallowClick = false;

// hover detail (desktop)
document.addEventListener('mouseover', (e) => {
  if (ui.screen !== 'game' || drag) return;
  const c = e.target.closest('.card[data-id]');
  const id = c && c.dataset.zone !== 'mull' ? c.dataset.id : null;
  if (id !== ui.hover) { ui.hover = id; if (!ui.thinking) updateTray(); }
});

// ------------------------------------------------------------------ clicks
document.addEventListener('click', (e) => {
  if (swallowClick) { e.preventDefault(); return; }
  const t = e.target;
  const b = t.closest('[data-act]');
  const S = ui.S;
  if (b) {
    const act_ = b.dataset.act;
    switch (act_) {
      case 'deck': ui[b.dataset.key] = b.dataset.id; store.set(b.dataset.key, b.dataset.id); return render();
      case 'level': ui.level = b.dataset.id; store.set('level', ui.level); return render();
      case 'start': ui.tut = null; return startGame();
      case 'tutorial': return startTutorial();
      case 'tnext': ui.tut.i++; return render();
      case 'tkeep': ui.tut = null; return render();
      case 'builder': ui.bd = ui.bd || newDraft(); ui.screen = 'builder'; ui.zoomCard = null; return render();
      case 'bz': ui.zoomCard = b.dataset.id; return render();
      case 'badd': { const id = b.dataset.id, d = Number(b.dataset.d), bd = ui.bd; const n = Math.max(0, Math.min(3, (bd.main[id] || 0) + d)); if (n) bd.main[id] = n; else delete bd.main[id]; const sc = $('.plist')?.scrollTop; renderBuilder(); const pl = $('.plist'); if (pl && sc) pl.scrollTop = sc; return; }
      case 'ladd': { const bd = ui.bd, c = CARDS[b.dataset.id]; if (bd.legends.length >= 3) return; if (bd.legends.some((i) => CARDS[i].name === c.name)) return toast('Legends need different names.', 'warn'); bd.legends.push(c.id); return render(); }
      case 'bdel': { e.stopPropagation(); ui.bd.legends = ui.bd.legends.filter((i) => i !== b.dataset.id); return render(); }
      case 'bsave': saveDraft(); toast('Deck saved.'); return render();
      case 'bnew': ui.bd = { id: null, name: 'My deck', legends: [], main: {} }; return render();
      case 'bclear': ui.bd.main = {}; return render();
      case 'bdelete': { const d = customDecks(); delete d[ui.bd.id]; store.set('decks', d); if (ui.mine === ui.bd.id) ui.mine = 'embracing-power'; if (ui.theirs === ui.bd.id) ui.theirs = 'the-heist'; ui.bd.id = null; toast('Deck deleted.'); return render(); }
      case 'bexport': ui.bio = 'export'; return render();
      case 'bimport': ui.bio = 'import'; return render();
      case 'bio-x': ui.bio = null; return render();
      case 'bio-go': { const { deck, miss } = importDeck($('#iotext').value); ui.bd = deck; ui.bio = null; render(); if (miss.length) toast(`${miss.length} line(s) not recognised: ${miss[0]}`, 'warn'); return; }
      case 'bplay': { const id = saveDraft(); ui.mine = id; store.set('mine', id); ui.tut = null; return startGame(); }
      case 'browser': ui.screen = 'browser'; ui.zoomCard = null; return render();
      case 'rules': ui.rules = true; return render();
      case 'closeRules': ui.rules = false; return render();
      case 'mute': ui.mute = !ui.mute; setMuted(ui.mute); store.set('mute', ui.mute); return render();
      case 'fast': ui.fast = !ui.fast; store.set('fast', ui.fast); return render();
      case 'menu': ui.tut = null; clearTimeout(ui.timer); ui.screen = 'menu'; ui.zoomCard = null; return render();
      case 'undo': return undo();
      case 'log': ui.logOpen = !ui.logOpen; return render();
      case 'zoom': { const inst = ui.S && find(ui.S, ui.sel || ui.hover) || ui.S?.players[0].hand.find((c) => c.id === (ui.sel || ui.hover)); if (inst) { ui.zoomCard = inst.card; render(); } return; }
      case 'closeZoom': ui.zoomCard = null; return render();
      case 'review': { const w = $('.modal'); if (w) w.remove(); return; }
      case 'move': return runMove((ui.moves.byObj.get(ui.sel) || [])[Number(b.dataset.i)]);
      case 'gbtn': return human(ui.moves.buttons[Number(b.dataset.i)].a);
      case 'order': return human({ type: 'order', first: b.dataset.v === '1' });
      case 'mull': return human({ type: 'mulligan', mulligan: b.dataset.v === '1' });
      case 'gig': return human({ type: 'gainGig', die: b.dataset.id });
      case 'opt': return human({ type: 'choose', ids: [S.pending.options[Number(b.dataset.i)].id] });
      case 'skip': return human({ type: 'choose', ids: [] });
      default: break;
    }
  }
  if (ui.screen === 'browser') {
    const c = t.closest('.card[data-id]');
    if (c) { ui.zoomCard = c.dataset.id.replace(/^b-/, ''); render(); }
    return;
  }
  if (ui.screen !== 'game' || !S) return;
  // tap on a highlighted target while something is selected
  if (ui.sel) {
    const ms = ui.moves.byObj.get(ui.sel) || [];
    const card = t.closest('.card[data-id]');
    const zone = t.closest('[data-drop]');
    const key = card && card.classList.contains('drop-ok') ? 'u:' + card.dataset.id : zone && zone.classList.contains('drop-ok') ? zone.dataset.drop : null;
    const m = key && ms.find((x) => x.drop === key);
    if (m) return runMove(m);
  }
  const card = t.closest('.card[data-id]');
  if (card && card.dataset.zone !== 'mull') return select(card.dataset.id);
  if (ui.sel && !t.closest('.tray') && !t.closest('.modal')) { ui.sel = null; updateTray(); $$('.card.sel').forEach((e2) => e2.classList.remove('sel')); markTargets(); }
});
document.addEventListener('dblclick', (e) => {
  const c = e.target.closest('.card[data-id]');
  if (c && ui.screen === 'game' && c.dataset.zone !== 'mull') {
    const inst = find(ui.S, c.dataset.id) || ui.S.players[0].hand.find((x) => x.id === c.dataset.id);
    if (inst && (inst.owner === HUMAN || inst.faceUp || inst.zone !== 'x')) { const d = def(inst); if (d && (inst.owner === HUMAN || inst.faceUp || S_isPublic(inst))) { ui.zoomCard = inst.card; render(); } }
  }
});
function S_isPublic(inst) { return ui.S.players[inst.owner].field.includes(inst) || inst.faceUp; }
document.addEventListener('input', (e) => {
  const t0 = e.target;
  if (t0.dataset?.bn) { ui.bd.name = t0.value; return; }
  if (t0.dataset?.bff === 'q') { ui.bf.q = t0.value; const pos = t0.selectionStart; renderBuilder(); const i = $('[data-bff="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } return; }
  const f = e.target.dataset?.bf; if (!f) return;
  ui.browser[f] = e.target.value; const pos = e.target.selectionStart;
  renderBrowser();
  if (f === 'q') { const i = $('[data-bf="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
});
document.addEventListener('change', (e) => {
  const t0 = e.target;
  if (t0.dataset?.bff) { ui.bf[t0.dataset.bff] = t0.value; return renderBuilder(); }
  if (t0.dataset?.bfc) { ui.bf[t0.dataset.bfc] = t0.checked; return renderBuilder(); }
  if (t0.dataset?.bload && t0.value) { ui.bd = newDraft(t0.value); return render(); } const f = e.target.dataset?.bf; if (f && f !== 'q') { ui.browser[f] = e.target.value; renderBrowser(); } });
document.addEventListener('keydown', (e) => {
  if (ui.screen !== 'game') return;
  if (e.key === 'Escape') { ui.sel = null; ui.zoomCard = null; render(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
});


// ------------------------------------------------------------------ tutorial (one tiny instruction per step)
const hasCard = (S, p, id) => S.players[p].hand.find((c) => c.card === id)?.id;
const myMain = (S) => S.active === HUMAN && S.stage === 'main' && !S.pending;
const TUT = [
  { say: 'Goal: collect 7 Gig dice. You steal them by attacking.', next: true },
  { say: 'The Rival goes first. Just watch.', wait: true, done: (S) => S.winner != null || (S.pending?.kind === 'gainGig' && S.pending.player === HUMAN) || myMain(S) },
  { say: 'Tap any die to gain your first Gig.', done: (S) => myMain(S) },
  { say: 'Tap a card in your hand to read it.', done: (S, u) => !!u.sel },
  { say: 'Sell a card for money: drag Mantis Blades onto your Eddies.', focus: (S) => ({ ids: [hasCard(S, 0, 'mantis-blades')], zones: ['eddies'] }), done: (S, u) => u.tut.did.sell },
  { say: 'Play a Unit: drag Swordwise Huscle onto your Field.', focus: (S) => ({ ids: [hasCard(S, 0, 'swordwise-huscle')], zones: ['field'] }), done: (S) => S.players[0].field.length > 0 },
  { say: 'New Units must wait a turn. Press End turn.', done: (S, u) => u.tut.did.endTurn },
  { say: 'Rival’s turn. Just watch.', wait: true, done: (S) => S.winner != null || (S.pending?.kind === 'gainGig' && S.pending.player === HUMAN) || myMain(S) },
  { say: 'Tap any die to gain another Gig.', done: (S) => myMain(S) },
  { say: 'Attack: drag your Unit onto the Rival’s Gigs.', focus: (S) => ({ ids: S.players[0].field.map((u) => u.id), zones: ['rgigs'] }), done: (S, u) => u.tut.did.attack || !S.players[0].field.length },
  { say: 'Stolen dice move to your Gigs. First to 7 wins.', next: true },
  { say: 'That’s the loop: Sell, Play, Attack, End turn.', final: true },
];
function startTutorial() {
  clearTimeout(ui.timer);
  const decks = [STARTER_DECKS['embracing-power'], STARTER_DECKS['the-heist']];
  let S = newGame({ decks, seed: 20261014, first: 1 });
  // rig a friendly opening hand so every step works
  const P = S.players[0];
  const want = ['swordwise-huscle', 'mantis-blades', 'sandevistan', 'field-operator', 'over-the-edge'];
  P.deck.push(...P.hand); P.hand = [];
  for (const id of want) { const i = P.deck.findIndex((c) => c.card === id); if (i >= 0) P.hand.push(...P.deck.splice(i, 1)); }
  while (P.hand.length < 6) P.hand.push(P.deck.shift());
  for (let k = 0; k < 2; k++) { const r = act(S, { type: 'mulligan', player: S.pending.player, mulligan: false }); S = r.state; }
  ui.screen = 'game'; ui.S = null; ui.history = []; ui.sel = null; ui.hover = null; ui.zoomCard = null; ui.logSeen = 0; ui.logOpen = false;
  ui.level = 'learner';
  ui.tut = { i: 0, did: {} };
  setState(S);
}
function tutAdvance() {
  const T = ui.tut; if (!T || !ui.S) return;
  for (let n = 0; n < 6; n++) {
    const st = TUT[T.i];
    if (!st || !st.done || !st.done(ui.S, ui)) break;
    T.i++;
  }
}
function coachHTML(S) {
  const T = ui.tut, st = TUT[T.i];
  const reacting = S.pending?.kind === 'react' && S.pending.player === HUMAN;
  const say = reacting ? 'The Rival attacks! Press the yellow button to let it happen.' : st ? st.say : 'Tutorial finished. Keep playing!';
  const label = st && !st.final ? `Step ${Math.min(T.i + 1, TUT.length - 1)} of ${TUT.length - 1}` : 'Done';
  const btns = !reacting && st?.next ? '<div class="row"><button class="primary" data-act="tnext">Next</button></div>' : '';
  const fin = !reacting && st?.final ? '<div class="row"><button class="primary" data-act="tkeep">Keep playing</button><button data-act="menu">Menu</button></div>' : '';
  return `<div class="coach"><div class="step">${label}</div><div class="say">${esc(say)}</div>${btns}${fin}</div>`;
}
function tutFocus() {
  $$('.coach-focus').forEach((e) => e.classList.remove('coach-focus'));
  const T = ui.tut; if (!T || !ui.S || ui.S.winner != null || ui.S.pending?.kind === 'react') return;
  const st = TUT[T.i]; if (!st?.focus) return;
  const f = st.focus(ui.S);
  for (const id of f.ids || []) if (id) $$(`.card[data-id="${id}"]`).forEach((e) => e.classList.add('coach-focus'));
  for (const z of f.zones || []) $$(`[data-drop="${z}"]`).forEach((e) => e.classList.add('coach-focus'));
}

function startGame() {
  clearTimeout(ui.timer);
  const decks = [getDeck(ui.mine), getDeck(ui.theirs)];
  ui.S = null; ui.history = []; ui.sel = null; ui.hover = null; ui.logSeen = 0; ui.screen = 'game'; ui.zoomCard = null;
  const S = newGame({ decks, names: ['Player', 'Rival'], seed: (Math.random() * 4294967296) >>> 0 });
  setState(S);
}

function toast(msg, kind = '') {
  $$('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), kind === 'info' ? 3800 : 3000);
}

// keep dice animations from sticking after they expire
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const m of [ui.rolling, ui.flash]) for (const [k, v] of m) if (v < now) { m.delete(k); changed = true; }
  if (changed && ui.screen === 'game' && ui.S && !drag) $$('.die.rolling, .die.flash').forEach((d) => { if (!ui.rolling.has(d.dataset.die)) d.classList.remove('rolling'); if (!ui.flash.has(d.dataset.die)) d.classList.remove('flash'); });
}, 400);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
render();

// exposed for tests / debugging
window.__nctcg = { ui, startGame, setState, render };
