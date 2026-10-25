import { CARDS } from './cards.js';
// Card effects as resumable step lists.
// A step is (G, f) => undefined | G.ask(...). `f` is the effect frame:
//   f.owner  player who controls the effect      f.self  instance id of the card
//   f.host   host unit/legend id (for Gear)      f.d     scratch data that survives pauses
//   f.answer  answer to the previous step's question (array of chosen ids, [] if skipped/none)
// Triggers: play, attack, defeated, call, spend (Gear), eot, fightWin (Gear).
// Legend triggers live under `legend`: playBlue, arasakaAttack.

const rival = (p) => 1 - p;
const distinctValues = (G, p) => new Set(G.P(p).gigs.map((d) => d.value)).size;

const mayAdjust = (up, down, scope = 'any') => [
  (G, f) => G.askAdjust(f, { player: f.owner, scope, up, down }),
  (G, f) => { f.d.adj = G.applyAdjust(f); },
];

export const EFFECTS = {
  // ------------------------------------------------------------ Units
  'swordwise-huscle': {
    attack: [(G, f) => { const u = G.find(f.self); if (u && G.power(u) >= 5) G.draw(f.owner, 1); }],
  },
  'chrome-fang': {
    play: [(G, f) => { G.P(f.owner).gigShield = true; G.log(`${G.name(f.owner)}'s Gigs are protected from weaker thieves until their next turn.`); }],
  },
  'minotaur': {
    play: [
      (G, f) => {
        if (G.cred(f.owner) <= G.cred(rival(f.owner))) return;
        return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => G.power(u) <= 5, prompt: 'Minotaur: defeat a rival Unit with power 5 or less' });
      },
      (G, f) => { const u = f.answer && G.find(f.answer[0]); if (u) G.defeat(u); },
    ],
  },
  'field-operator': {
    play: [(G, f) => { if (G.cred(f.owner) % 2 === 0) G.draw(f.owner, 1); }],
  },
  'goro-takemura-losing-his-way': {
    attack: [(G, f) => {
      const u = G.find(f.self);
      if (u && G.P(f.owner).legends.every((l) => l.faceUp)) { u.tempPower += 5; G.log('Goro gets +5 power this turn.'); }
    }],
  },
  'maxtac-av': {
    play: [
      (G, f) => G.askGig(f, { player: f.owner, scope: 'friendly', optional: true, prompt: 'MaxTac AV: swap which friendly Gig? (skip to not swap)' }),
      (G, f) => { f.d.mine = f.answer && f.answer[0]; if (!f.d.mine) return; return G.askGig(f, { player: f.owner, scope: 'rival', optional: false, prompt: 'Swap it with which rival Gig?' }); },
      (G, f) => { if (f.d.mine && f.answer && f.answer[0]) G.swapGigs(f.d.mine, f.answer[0], f.owner); },
    ],
  },
  'dexter-deshawn-one-last-chance': {
    play: mayAdjust(1, 1),
    attack: mayAdjust(1, 1),
    defeated: [(G, f) => { if (Math.abs(G.cred(f.owner) - G.cred(rival(f.owner))) >= 10) G.draw(f.owner, 2); }],
  },
  'offduty-malfini': {
    play: [
      (G, f) => { const u = G.find(f.self); if (u) G.spend(u); },
      (G, f) => G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => !u.spent, prompt: 'Offduty Malfini: spend a rival Unit' }),
      (G, f) => { const u = f.answer && G.find(f.answer[0]); if (u) G.spend(u); },
    ],
  },
  't-bug-amateur-philosopher': {
    defeated: [
      (G, f) => {
        const P = G.P(f.owner);
        const down = P.legends.filter((l) => !l.faceUp);
        if (!down.length) return;
        down.forEach((l) => G.peek(f.owner, l.id));
        if (P.called) { G.log('T-Bug: a Legend was already Called this turn.'); return; }
        return G.ask(f, { player: f.owner, prompt: 'T-Bug: you may Call a Legend for free', options: [{ id: 'call', label: 'Call a Legend (free)' }], optional: true });
      },
      (G, f) => { if (f.answer && f.answer[0] === 'call') G.callLegend(f.owner, { free: true }); },
    ],
  },
  'heywood-ripperdoc': {
    play: [
      (G, f) => G.askGear(f, { player: f.owner, prompt: 'Heywood Ripperdoc: you may defeat a Gear', optional: true }),
      (G, f) => {
        const g = f.answer && f.answer[0] && G.findGear(f.answer[0]);
        if (!g) return;
        const cost = G.def(g.gear).cost;
        G.trashGear(g.gear, g.host);
        if (G.P(f.owner).gigs.some((d) => d.value === cost)) G.draw(f.owner, 1);
      },
    ],
  },
  'evelyn-parker-scheming-siren': {
    attack: [
      (G, f) => G.draw(f.owner, 1),
      (G, f) => {
        if (G.cred(f.owner) > G.cred(rival(f.owner))) return G.askHand(f, { player: f.owner, prompt: 'Evelyn Parker: discard 1 card' });
      },
      (G, f) => { if (f.answer && f.answer[0]) G.discard(f.owner, f.answer[0]); },
    ],
  },
  'delamain-cab': {
    eot: [(G, f) => { const u = G.find(f.self); if (u && u.stole) G.readyEddies(f.owner, 1); }],
  },
  'mt0d12-flathead': { /* static: see engine.unblockable() */ },

  // ------------------------------------------------------------ Gear (self = gear id, host = unit/legend id)
  'arasaka-emergency-radioport': {
    spend: [
      (G, f) => {
        if (G.P(f.owner).called) return;
        return G.askLegend(f, { player: f.owner, prompt: 'Radioport: look at a face-down Legend (you may Call it free if ARASAKA or GO SOLO)', optional: true, facedown: true });
      },
      (G, f) => {
        const id = f.answer && f.answer[0];
        if (!id) return;
        G.peek(f.owner, id);
        const l = G.find(id);
        const d = G.def(l);
        if (d.tags.includes('ARASAKA') || d.kw.goSolo) return G.ask(f, { player: f.owner, prompt: `${G.dn(l)} is ARASAKA or GO SOLO. Call it for free?`, options: [{ id: id, label: 'Call it' }], optional: true });
        f.nextAnswer = [];
      },
      (G, f) => { const id = f.answer && f.answer[0]; if (id && !G.P(f.owner).called) G.callLegend(f.owner, { free: true, legendId: id }); },
    ],
  },
  'satori-sword-of-saburo': { fightWin: [(G, f) => G.draw(f.owner, 1)] },
  'sandevistan': { eot: [(G, f) => { const h = G.find(f.host); if (h) h.spent = false; }] },
  'kiroshi-optics': {
    attack: [
      (G, f) => G.askLegend(f, { player: f.owner, prompt: 'Kiroshi Optics: look at a friendly face-down Legend', optional: false, facedown: true }),
      (G, f) => { if (f.answer && f.answer[0]) G.peek(f.owner, f.answer[0]); },
    ],
  },
  'zetatech-faceplate': {
    spend: [
      ...mayAdjust(1, 1),
      (G, f) => { if (distinctValues(G, f.owner) >= 3) G.draw(f.owner, 1); },
    ],
  },
  'tetratronic-rippler': {
    spend: [
      (G, f) => {
        const top = G.P(f.owner).deck[0];
        if (!top) return;
        return G.ask(f, { player: f.owner, prompt: `Top card of your deck: ${G.dn(top)}. Trash it?`, options: [{ id: 'trash', label: 'Trash it' }], optional: true });
      },
      (G, f) => { if (f.answer && f.answer[0] === 'trash') { const c = G.P(f.owner).deck.shift(); if (c) { G.P(f.owner).trash.push(c); G.log(`${G.name(f.owner)} trashed ${G.dn(c)} from the top of their deck.`); } } },
    ],
  },
  'dying-night-v-s-pistol': {
    attack: mayAdjust(0, 2),
    eot: [(G, f) => { const h = G.find(f.host); if (h && G.def(h).name === 'V') G.readyEddies(f.owner, 2); }],
  },

  // ------------------------------------------------------------ Programs
  'industrial-assembly': {
    play: [
      ...mayAdjust(4, 0),
      (G, f) => { if (G.P(f.owner).gigs.some((d) => d.value >= 8)) G.draw(f.owner, 1); },
    ],
  },
  'over-the-edge': {
    play: [
      (G, f) => {
        const d20 = G.P(f.owner).gigs.find((d) => d.sides === 20);
        if (!d20) { G.log('Over the Edge: no friendly d20, nothing happens.'); return; }
        f.d.limit = d20.value;
        return G.askUnits(f, { player: f.owner, scope: 'any', filter: (u) => G.power(u) <= d20.value, prompt: `Over the Edge: defeat a Unit with power ${d20.value} or less` });
      },
      (G, f) => { const u = f.answer && G.find(f.answer[0]); if (u) G.defeat(u); },
    ],
  },
  'shattered-memories': {
    play: [
      (G, f) => {
        f.d.total = 0;
        for (const p of [f.owner, rival(f.owner)]) {
          const P = G.P(p);
          f.d.total += P.hand.length;
          P.trash.push(...P.hand);
          P.hand = [];
        }
        G.log(`Shattered Memories: ${f.d.total} cards discarded.`);
      },
      (G, f) => G.ask(f, { player: f.owner, prompt: 'Shattered Memories: draw 5 cards?', options: [{ id: 'yes', label: 'Draw 5' }], optional: true }),
      (G, f) => { if (f.answer && f.answer[0] === 'yes') G.draw(f.owner, 5); },
      (G, f) => G.ask(f, { player: rival(f.owner), prompt: 'Shattered Memories: draw 5 cards?', options: [{ id: 'yes', label: 'Draw 5' }], optional: true }),
      (G, f) => {
        if (f.answer && f.answer[0] === 'yes') G.draw(rival(f.owner), 5);
        if (G.P(f.owner).gigs.some((d) => d.value === f.d.total)) G.draw(f.owner, 2);
      },
    ],
  },
  'corporate-surveillance': {
    play: [
      (G, f) => G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => !u.spent && (G.def(u).cost ?? 99) <= 4, prompt: 'Corporate Surveillance: spend a rival Unit with cost 4 or less' }),
      (G, f) => { const u = f.answer && G.find(f.answer[0]); if (u) G.spend(u); },
    ],
  },
  'afterparty-at-lizzie-s': {
    play: [
      ...mayAdjust(1, 1),
      (G, f) => { if (distinctValues(G, f.owner) >= 2) G.draw(f.owner, 1); },
    ],
  },
  'floor-it': {
    play: [
      (G, f) => G.askUnits(f, { player: f.owner, scope: 'rival', prompt: 'Floor It: give a rival Unit -1 power this turn' }),
      (G, f) => {
        const u = f.answer && G.find(f.answer[0]);
        if (u) { u.tempPower -= 1; G.log(`${G.dn(u)} gets -1 power this turn.`); }
        G.draw(f.owner, 1);
      },
    ],
  },
  'reboot-optics': {
    play: [(G, f) => { G.P(f.owner).noDefeat = true; G.log('Reboot Optics: the next rival Unit to fight this turn will not defeat the opposing friendly Unit.'); }],
  },

  // ------------------------------------------------------------ Legends
  'viktor-vektor-sit-down-and-relax': {
    call: [
      // Take the top 5 cards into a temporary stash so they can be revealed/bottomed afterwards.
      (G, f) => { G.stashTop(f.owner, 5); },
      (G, f) => G.askStash(f, { player: f.owner, prompt: 'Viktor: reveal a Gear with cost 2 or less (1st)', optional: true, filter: (c) => G.def(c).type === 'gear' && G.def(c).cost <= 2 }),
      (G, f) => { const id = f.answer && f.answer[0]; if (id) { G.stashToHand(f.owner, id); } },
      (G, f) => G.askStash(f, { player: f.owner, prompt: 'Viktor: reveal a second Gear with cost 2 or less (optional)', optional: true, filter: (c) => G.def(c).type === 'gear' && G.def(c).cost <= 2 }),
      (G, f) => { const id = f.answer && f.answer[0]; if (id) G.stashToHand(f.owner, id); G.stashToBottom(f.owner); },
    ],
  },
  legendTriggers: {
    'jackie-welles-pour-one-out-for-me': {
      playBlue: [
        (G, f) => G.askAdjust(f, { player: f.owner, scope: 'friendly', up: 0, down: 2, prompt: 'Jackie Welles: you may decrease a friendly Gig by up to 2' }),
        (G, f) => { const r = G.applyAdjust(f); if (r && r.to === 1) G.draw(f.owner, 1); },
      ],
    },
    'yorinobu-arasaka-embracing-destruction': {
      arasakaAttack: [
        (G, f) => G.draw(f.owner, 1),
        (G, f) => { if (G.cred(f.owner) < 20) return G.askHand(f, { player: f.owner, prompt: 'Yorinobu: discard 1 card (you have less than 20 Street Cred)' }); },
        (G, f) => { if (f.answer && f.answer[0]) G.discard(f.owner, f.answer[0]); },
      ],
    },
  },
};

// ====================================================================== expansion cards
const pickUnit = (scope, filter, prompt, optional = false) => (G, f) => G.askUnits(f, { player: f.owner, scope, filter: filter && ((u) => filter(G, f, u)), prompt, optional });
const withUnit = (fn) => (G, f) => { const u = f.answer && f.answer[0] && G.find(f.answer[0]); if (u) fn(G, f, u); };
const costOfUnit = (G, u) => G.def(u).cost || 0;
const trashPick = (n, type, prompt) => [
  (G, f) => { f.d.m = G.mill(f.owner, n).filter((c) => G.def(c).type === type).map((c) => c.id); if (!f.d.m.length) return; return G.askCards(f, { player: f.owner, zones: ['trash'], filter: (c) => f.d.m.includes(c.id), prompt, optional: true }); },
  (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; const P = G.P(f.owner); const i = P.trash.findIndex((c) => c.id === id); if (i >= 0) { const [c] = P.trash.splice(i, 1); P.hand.push(c); G.log(`${G.name(f.owner)} adds ${G.dn(c)} to their hand.`); } },
];
const modeAsk = (prompt, a, b) => (G, f) => G.ask(f, { player: f.owner, prompt, options: [{ id: 'a', label: a }, { id: 'b', label: b }], optional: false });

Object.assign(EFFECTS, {
  'japantown-jonin': { play: [pickUnit('friendly', null, 'Japantown Jonin: give a friendly Unit +2 power this turn'), withUnit((G, f, u) => { u.tempPower += 2; })] },
  'delamain-rideshare-ai': { play: [(G, f) => G.draw(f.owner, 2)] },
  'tyger-s-whisper': { play: [(G, f) => { if (G.P(f.owner).called) return; return G.ask(f, { player: f.owner, prompt: "Tyger's Whisper: you may Call a Legend for free", options: [{ id: 'call', label: 'Call a Legend (free)' }], optional: true }); }, (G, f) => { if (f.answer && f.answer[0] === 'call') G.callLegend(f.owner, { free: true }); }] },
  'royce-don-t-call-me-simon': { play: [pickUnit('rival', (G, f, u) => G.power(u) <= (G.cred(f.owner) > G.cred(rival(f.owner)) ? 3 : 2), "Royce: defeat a rival Unit (power 2 or less; 3 if you have more Street Cred)"), withUnit((G, f, u) => G.defeat(u))] },
  'caliber-totentanz-s-top-dog': {
    play: [pickUnit('rival', (G, f, u) => costOfUnit(G, u) <= 2, 'Caliber: defeat a rival Unit with cost 2 or less'), withUnit((G, f, u) => G.defeat(u))],
    defeated: [(G, f) => { const r = rival(f.owner); const R = G.P(r); if (!R.hand.length) return; return G.askHand(f, { player: r, prompt: 'Caliber was defeated: discard a card' }); }, (G, f) => { const r = rival(f.owner); const id = f.answer && f.answer[0]; if (!id) return; const c = G.P(r).hand.find((x) => x.id === id); f.d.cost = c ? G.def(c).cost : null; G.discard(r, id); if (f.d.cost != null && G.P(f.owner).gigs.some((d) => d.value === f.d.cost) && G.P(r).hand.length) return G.askHand(f, { player: r, prompt: 'Matching Gig value: discard 1 more' }); }, (G, f) => { const id = f.answer && f.answer[0]; if (id) G.discard(rival(f.owner), id); }],
  },
  'gilded-mato-n': { play: [(G, f) => { const own = []; for (const h of [...G.P(f.owner).field, ...G.P(f.owner).legends]) for (const g of h.gear) own.push({ id: g.id, label: `${G.dn(g)} on ${G.dn(h)}` }); if (!own.length) return; return G.ask(f, { player: f.owner, prompt: 'Gilded Matō: you may defeat a friendly Gear', options: own, optional: true }); },
    (G, f) => { const id = f.answer && f.answer[0]; if (!id) { f.d.skip = true; return; } const g = G.findGear(id); for (const h of [...G.P(f.owner).field, ...G.P(f.owner).legends]) if (h.gear.includes(g)) G.trashGear(g, h); },
    (G, f) => { if (f.d.skip) return; return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => costOfUnit(G, u) <= 3, prompt: 'Defeat a rival Unit with cost 3 or less' }); }, withUnit((G, f, u) => G.defeat(u))] },
  'adam-smasher-metal-over-meat': { play: [(G, f) => { for (const p of [0, 1]) for (const u of [...G.P(p).field]) if (u.id !== f.self) G.defeat(u); }] },
  'adam-smasher-ender-of-legends': { play: [pickUnit('rival', null, 'Adam Smasher: defeat a rival Unit'), withUnit((G, f, u) => G.defeat(u))] },
  'screw-lovelorn-fool': { defeated: [(G, f) => G.askCards(f, { player: f.owner, zones: ['trash'], filter: (c) => G.def(c).type === 'unit' && c.id !== f.self, prompt: 'Screw: add another Unit from your trash to your hand', optional: true }), (G, f) => { const id = f.answer && f.answer[0]; const P = G.P(f.owner); const i = P.trash.findIndex((c) => c.id === id); if (i >= 0) P.hand.push(...P.trash.splice(i, 1)); }] },
  'live-with-the-aftermath': { play: [pickUnit('friendly', null, 'Defeat one of YOUR Units', false), withUnit((G, f, u) => G.defeat(u)), (G, f) => { const r = rival(f.owner); if (!G.P(r).field.length) return; return G.askUnits(f, { player: r, scope: 'friendly', prompt: 'Defeat one of YOUR Units' }); }, (G, f) => { const u = f.answer && G.find(f.answer[0]); if (u) G.defeat(u); }] },
  'wild-in-the-streets': { play: [pickUnit('any', (G, f, u) => u.spent, 'Defeat a spent Unit'), withUnit((G, f, u) => G.defeat(u))] },
  'don-t-fear-the-reaper': { play: [(G, f) => { for (const u of G.P(rival(f.owner)).field) G.spend(u); }, pickUnit('any', (G, f, u) => u.spent, 'Defeat a spent Unit'), withUnit((G, f, u) => G.defeat(u))] },
  'bonnie-and-clyde': { play: [pickUnit('rival', (G, f, u) => G.power(u) <= 4, 'Bonnie & Clyde: defeat a rival Unit with power 4 or less'), withUnit((G, f, u) => G.defeat(u)),
    (G, f) => { if (G.P(rival(f.owner)).gigs.length < G.P(f.owner).gigs.length + 2) return; return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => G.power(u) <= 4, prompt: 'You may defeat a second one', optional: true }); }, withUnit((G, f, u) => G.defeat(u))] },
  'memory-relapse': { play: [pickUnit('rival', null, 'Memory Relapse: spend a rival Unit'), withUnit((G, f, u) => { G.spend(u); u.noReady = true; }), (G, f) => { if (G.cred(f.owner) % 2 === 0) G.draw(f.owner, 1); }] },
  'pacifica-netrunner': { play: [(G, f) => { if (G.cred(f.owner) % 2) return; return G.askUnits(f, { player: f.owner, scope: 'rival', prompt: "Pacifica: that Unit can't ready until your next turn", optional: true }); }, withUnit((G, f, u) => { u.noReady = true; })] },
  'chrome-reverie': { play: [pickUnit('rival', null, "Chrome Reverie: a rival Unit can't attack until your next turn"), withUnit((G, f, u) => { u.noAttack = true; }), (G, f) => { const P = G.P(f.owner); if (P.called || !P.gigs.some((d) => d.value === 1 || d.value === d.sides)) return; return G.ask(f, { player: f.owner, prompt: 'You control a min/max Gig: Call a Legend for free?', options: [{ id: 'call', label: 'Call a Legend (free)' }], optional: true }); }, (G, f) => { if (f.answer && f.answer[0] === 'call') G.callLegend(f.owner, { free: true }); }] },
  'all-is-lost': { play: trashPick(3, 'unit', 'All Is Lost: add a Unit from among them to your hand') },
  'hacked-corpo': { play: trashPick(3, 'program', 'Hacked Corpo: add a Program from among them to your hand') },
  'the-heist': { play: trashPick(4, 'gear', 'The Heist: add a Gear from among them to your hand') },
  'les-e-le-mens': { play: [(G, f) => { const R = G.P(rival(f.owner)).field; if (!R.length) return; const low = Math.min(...R.map((u) => G.power(u))); return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => G.power(u) === low, prompt: 'Bottom-deck a lowest-power rival Unit' }); }, withUnit((G, f, u) => G.bottomDeck(u))] },
  'unlikely-bond': { play: [pickUnit('friendly', (G, f, u) => !u.spent, 'Unlikely Bond: bottom-deck a READY friendly Unit'), withUnit((G, f, u) => { G.bottomDeck(u); f.d.ok = true; }), (G, f) => { if (!f.d.ok) return; return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => u.spent, prompt: 'Bottom-deck a SPENT rival Unit' }); }, withUnit((G, f, u) => G.bottomDeck(u))] },
  'towerfall': { play: [(G, f) => { if (G.cred(f.owner) < G.cred(rival(f.owner))) { f.d.both = true; return; } return modeAsk('Towerfall: choose one', 'All rival Units get -5 power this turn', 'Bottom-deck all rival Units with power 0')(G, f); },
    (G, f) => { const a = f.d.both || (f.answer && f.answer[0] === 'a'); const b = f.d.both || (f.answer && f.answer[0] === 'b'); const R = G.P(rival(f.owner)); if (a) for (const u of R.field) u.tempPower -= 5; if (b) for (const u of [...R.field]) if (G.power(u) === 0) G.bottomDeck(u); }] },
  'pyramid-song': { play: [(G, f) => { if (G.P(f.owner).gigs.some((d) => d.sides === 4 && d.value === 1)) { f.d.both = true; return; } return modeAsk('Pyramid Song: choose one', 'Give a rival Unit -4 power this turn', 'Bottom-deck a rival Unit with power 0')(G, f); },
    (G, f) => { f.d.a = f.d.both || (f.answer && f.answer[0] === 'a'); f.d.b = f.d.both || (f.answer && f.answer[0] === 'b'); if (f.d.a) return G.askUnits(f, { player: f.owner, scope: 'rival', prompt: 'Give a rival Unit -4 power' }); },
    withUnit((G, f, u) => { u.tempPower -= 4; }),
    (G, f) => { if (f.d.b) return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => G.power(u) === 0, prompt: 'Bottom-deck a rival Unit with power 0' }); }, withUnit((G, f, u) => G.bottomDeck(u))] },
  'trust-no-one': { play: [(G, f) => G.askAdjust(f, { player: f.owner, scope: 'any', up: 0, down: 3, prompt: 'Trust No One: decrease a Gig by up to 3' }), (G, f) => { G.applyAdjust(f); if (G.P(f.owner).gigs.some((d) => d.value === 1)) G.draw(f.owner, 1); }] },
  'bootleg-black-sapphire-show': { play: [(G, f) => { G.sellTop(f.owner); const g = G.P(f.owner).gigs; if (g.some((d) => d.value % 2 === 0) && g.some((d) => d.value % 2 === 1)) G.draw(f.owner, 2); }] },
  'valentino-street-racer': { play: [pickUnit('friendly', (G, f, u) => u.id !== f.self && costOfUnit(G, u) <= 5, 'Give another friendly Unit (cost 5 or less) ADRENALINE this turn', true), withUnit((G, f, u) => { u.freeAttack = 'any'; })] },
  'yorinobu-arasaka-steel-dragon': { play: [(G, f) => G.askCards(f, { player: f.owner, zones: ['hand', 'trash'], filter: (c) => G.def(c).type === 'unit' && (G.def(c).cost || 0) <= 4, prompt: 'Steel Dragon: play a Unit (cost 4 or less) from hand or trash for free', optional: true }), (G, f) => { const id = f.answer && f.answer[0]; if (id) G.playFreeUnit(f.owner, id, 'units'); }] },
  'maxtac-squadron': { eot: [(G, f) => { const u = G.find(f.self); if (u && u.spent) { const l = G.P(f.owner).legends.find((x) => x.faceUp && x.spent); if (l) { l.spent = false; G.log('MaxTac Squadron readies a Legend.'); } } }] },
  'modded-muramasa': { eot: [(G, f) => { const u = G.find(f.self); if (u && u.spent && G.cred(f.owner) < G.cred(rival(f.owner))) { u.spent = false; G.log('Modded Muramasa readies itself.'); } }] },
  'modded-kusanagi': { eot: [(G, f) => { const u = G.find(f.self); if (u) G.returnToHand(u); }] },
  'saul-bright-stormrider': { eot: [(G, f) => { let n = 0; for (const u of G.P(f.owner).field) if (u.spent && n < 3) { u.spent = false; n++; } if (n) G.log(`Saul readies ${n} Unit(s).`); }] },
  'v-roamer-of-the-badlands': { eot: [(G, f) => { if (G.P(f.owner).gigs.filter((d) => d.value >= 8).length >= 2) G.draw(f.owner, 1); }] },
  'jackie-welles-ride-or-die-choom': {
    attack: [(G, f) => { const u = G.find(f.self); const n = G.P(f.owner).gigs.filter((d) => d.value % 2 === 0).length; if (u && n) { u.tempPower += 2 * n; G.log(`Jackie gets +${2 * n} power.`); } }],
    defeated: [(G, f) => { const n = G.P(f.owner).gigs.filter((d) => d.value % 2 === 1).length; if (n) G.draw(f.owner, n); }],
  },
  'la-llorona-ghost-of-the-past': { block: mayAdjust(3, 0) },
  'augmented-negotiators': { block: [(G, f) => { const r = rival(f.owner); if (!G.P(r).hand.length) return; return G.askHand(f, { player: r, prompt: 'Augmented Negotiators: discard a card' }); }, (G, f) => { const id = f.answer && f.answer[0]; if (id) G.discard(rival(f.owner), id); }] },
  'netwatch-netdriver': { spend: [(G, f) => G.draw(f.owner, 1)] },
});

// Which cards the game actually performs. 'full' = every printed effect works. 'partial' = some. Others: rules text is shown but NOT automated (plays like a vanilla card).
const FULL = ['japantown-jonin', 'delamain-rideshare-ai', 'tyger-s-whisper', 'royce-don-t-call-me-simon', 'caliber-totentanz-s-top-dog', 'gilded-mato-n', 'adam-smasher-metal-over-meat', 'adam-smasher-ender-of-legends', 'screw-lovelorn-fool', 'live-with-the-aftermath', 'wild-in-the-streets', 'don-t-fear-the-reaper', 'bonnie-and-clyde', 'memory-relapse', 'pacifica-netrunner', 'chrome-reverie', 'all-is-lost', 'hacked-corpo', 'the-heist', 'les-e-le-mens', 'unlikely-bond', 'towerfall', 'pyramid-song', 'trust-no-one', 'bootleg-black-sapphire-show', 'valentino-street-racer', 'yorinobu-arasaka-steel-dragon', 'maxtac-squadron', 'modded-muramasa', 'modded-kusanagi', 'v-roamer-of-the-badlands', 'jackie-welles-ride-or-die-choom', 'la-llorona-ghost-of-the-past', 'augmented-negotiators', 'netwatch-netdriver',
  // handled by engine rules rather than an effect step
  'octant', 'carnage-at-the-colosseum', 'trauma-team-operatives', 'maxtac-heavy', 'zetatech-berserk', 'nocturne-op55-n1', 'riot-shield', 'deadman-transmitter', 'adrenaline-converter', 'maxtac-suppression-team', 'nadia-fighting-through-grief', 'sandayu-oda-hanako-s-guardian', 'riding-nomad', 'animals-wrecker', 'rockn-rockerboy', 'rebecca-having-a-moment', 'valentino-guerrera', 'jacked-in-voodoo-boy', 'misty-olszewski-mender-of-broken-spirits', 'viktor-vektor-drop-your-illusions'];
const PARTIAL = ['saul-bright-stormrider', 'carnage-at-the-colosseum', 'royce-psycho-on-the-edge', 'we-gotta-live-together', 'misty-olszewski-mender-of-broken-spirits', 'nocturne-op55-n1', 'sandayu-oda-hanako-s-guardian'];

// ====================================================================== batch 3: activated abilities, searches, Gig-steal triggers
// ABILITIES: SPEND abilities the player can use on their own turn (needs the card ready; a Unit also can't have just arrived).
//   cost = Eddies to pay (the card itself can't pay for itself). The effect steps live in EFFECTS[card].ability.
export const ABILITIES = {
  'dexter-deshawn-off-the-grid': { cost: 0, label: 'SPEND: increase a Gig by up to 2' },
  'muamar-reyes-el-capita-n': { cost: 0, label: 'SPEND: adjust a Gig by 1' },
  'wakako-okada-peace-and-harmony': { cost: 0, label: 'SPEND: decrease a Gig by up to 2' },
  'padre-man-of-the-cross': { cost: 0, label: "SPEND: set a Gig to another Gig's value" },
  'hanako-arasaka-daughter-of-the-emperor': { cost: 0, label: 'SPEND: swap a friendly Gig with a rival Gig' },
  'judy-a-lvarez-braindance-maestro': { cost: 0, label: 'SPEND: trash your top card; take it if it is a Program' },
  'dum-dum-maelstrom-triggerman': { cost: 1, quick: true, label: 'QUICK 1 €$, SPEND: friendly Unit +1 power per equipped Gear' },
  'river-ward-detective-on-the-hunt': { cost: 0, label: 'SPEND: play a Gear (cost 2 or less) from hand free' },
  'kerry-eurodyne-the-last-rockerboy': { cost: 0, label: 'SPEND: draw 2 if you control a Gig with 8+ value' },
  'judy-a-lvarez-nothing-to-doubt': { cost: 1, label: '1 €$, SPEND: reveal your top card, may play it free' },
  'johnny-silverhand-rocking-renegade': { cost: (S, p) => Math.max(0, 2 - S.players[p].gigs.filter((d) => d.value >= 8).length), label: 'SPEND: a friendly Unit can attack spent Units now (+2 power if ROCKER)' },
  'goro-takemura-vengeful-bodyguard': { cost: 1, quick: true, label: 'QUICK 1 €$, SPEND: a Unit (cost 4 or less) gains BLOCKER' },
  'panam-palmer-nomad-cavalry': { cost: 2, label: '2 €$, SPEND: move a Gear from this Legend to a Unit and ready it', can: (S, p, src, host) => (host.gear.length ? null : 'This Legend has no Gear to move.') },
  'alt-cunningham-soulkiller-architect': [
    { cost: 0, label: 'SPEND: your next Program costs -1 per friendly min Gig' },
    { cost: 1, label: '1 €$, SPEND: play a Program from your trash (pay its cost)', can: (S, p) => (S.players[p].trash.some((c) => CARDS[c.card].type === 'program') ? null : 'No Program in your trash.') },
  ],
  'evelyn-parker-beautiful-enigma': { cost: 1, label: '1 €$, SPEND: a rival Unit must attack next turn' },
  'rogue-amendiares-queen-of-the-afterlife': { cost: 2, quick: true, label: 'QUICK 2 €$, SPEND: a rival Unit loses power equal to this Unit' },
  'overwatch-panam-s-gift': { cost: 1, quick: true, label: 'QUICK 1 €$, SPEND: discard 1, defeat a spent rival Unit with cost up to its cost', can: (S, p) => (S.players[p].hand.length ? null : 'You have no card to discard.') },
};

const gigById = (G, id) => { for (const p of [0, 1]) { const d = G.P(p).gigs.find((x) => x.id === id); if (d) return d; } return null; };
const stashN = (n) => (G, f) => { G.stashTop(f.owner, n); };
const stashPick = (prompt, filter, optional = true) => (G, f) => G.askStash(f, { player: f.owner, prompt, optional, filter: (c) => filter(G, c) });
const stashGet = (G, f) => { const id = f.answer && f.answer[0]; if (id) G.stashToHand(f.owner, id); };
const stashEnd = (G, f) => { stashGet(G, f); G.stashToBottom(f.owner); };
const hasPair = (G, p) => { const v = G.P(p).gigs.map((d) => d.value); return v.some((x, i) => v.indexOf(x) !== i); };
const ownGear = (G, p) => { const out = []; for (const h of [...G.P(p).field, ...G.P(p).legends.filter((l) => l.faceUp)]) for (const g of h.gear) out.push({ id: g.id, label: `${G.dn(g)} on ${G.dn(h)}` }); return out; };
const modeCall = (title, aLabel, bLabel, aPrompt, aFn) => [
  modeAsk(title, aLabel, bLabel),
  (G, f) => { if (f.answer && f.answer[0] === 'b') { G.draw(f.owner, 1); return; } return aFn.pick(G, f, aPrompt); },
  withUnit(aFn.apply),
];
const rivalUnitPick = (G, f, prompt) => G.askUnits(f, { player: f.owner, scope: 'rival', prompt });
const discardProgramThen = (title) => [
  (G, f) => G.askCards(f, { player: f.owner, zones: ['hand'], filter: (c) => G.def(c).type === 'program', prompt: `${title}: you may discard a Program`, optional: true }),
  (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; G.discard(f.owner, id); return G.askUnits(f, { player: f.owner, scope: 'rival', prompt: `${title}: bottom-deck a rival Unit` }); },
  withUnit((G, f, u) => G.bottomDeck(u)),
];
const swapStep = [
  (G, f) => G.askGig(f, { player: f.owner, scope: 'friendly', prompt: 'Swap which friendly Gig?', optional: false }),
  (G, f) => { f.d.mine = f.answer && f.answer[0]; if (!f.d.mine) return; return G.askGig(f, { player: f.owner, scope: 'rival', prompt: 'With which rival Gig?', optional: false }); },
  (G, f) => { if (f.d.mine && f.answer && f.answer[0]) G.swapGigs(f.d.mine, f.answer[0], f.owner); },
];
const copyGig = (optional) => [
  (G, f) => G.askGig(f, { player: f.owner, scope: 'any', prompt: 'Set which Gig?', optional }),
  (G, f) => { f.d.a = f.answer && f.answer[0]; if (!f.d.a) return; return G.askGig(f, { player: f.owner, scope: 'any', prompt: "To the value of which other Gig?", optional: false }); },
  (G, f) => {
    const a = f.d.a && gigById(G, f.d.a), b = f.answer && f.answer[0] && gigById(G, f.answer[0]);
    if (!a || !b || a === b) return;
    const from = a.value; a.value = Math.min(a.sides, b.value);
    G.log(`A d${a.sides} Gig changes from ${from} to ${a.value}.`);
    G.touch(f.owner, G.dieOwner(a.id));
  },
];

Object.assign(EFFECTS, {
  // ---- Legends: Call effects + SPEND abilities
  'dexter-deshawn-off-the-grid': {
    call: modeCall('Dexter: choose one', 'Give a friendly Unit +2 power this turn', 'Draw 1', 'Dexter: friendly Unit gets +2 power', { pick: (G, f, p) => G.askUnits(f, { player: f.owner, scope: 'friendly', prompt: p }), apply: (G, f, u) => { u.tempPower += 2; } }),
    ability: mayAdjust(2, 0),
  },
  'muamar-reyes-el-capita-n': {
    call: modeCall('Muamar: choose one', "A friendly Unit can't be defeated in a fight this turn", 'Draw 1', "Muamar: this Unit can't be defeated in a fight", { pick: (G, f, p) => G.askUnits(f, { player: f.owner, scope: 'friendly', prompt: p }), apply: (G, f, u) => { u.safeFight = true; G.log(`${G.dn(u)} cannot be defeated in a fight this turn.`); } }),
    ability: mayAdjust(1, 1),
  },
  'wakako-okada-peace-and-harmony': {
    call: modeCall('Wakako: choose one', 'Give a rival Unit -2 power this turn', 'Draw 1', 'Wakako: rival Unit gets -2 power', { pick: rivalUnitPick, apply: (G, f, u) => { u.tempPower -= 2; } }),
    ability: mayAdjust(0, 2),
  },
  'padre-man-of-the-cross': {
    call: modeCall('Padre: choose one', 'Spend a rival Unit', 'Draw 1', 'Padre: spend a rival Unit', { pick: (G, f, p) => G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => !u.spent, prompt: p }), apply: (G, f, u) => { G.spend(u); } }),
    ability: copyGig(false),
  },
  'hanako-arasaka-daughter-of-the-emperor': { ability: swapStep },
  'judy-a-lvarez-braindance-maestro': { ability: trashPick(1, 'program', 'Judy: add the Program to your hand') },
  'dum-dum-maelstrom-triggerman': {
    call: [
      (G, f) => G.ask(f, { player: f.owner, prompt: 'Dum Dum: you may defeat a friendly Gear (then draw 2 instead of 1)', options: ownGear(G, f.owner), optional: true }),
      (G, f) => {
        const id = f.answer && f.answer[0]; const g = id && G.findGear(id);
        if (g) { G.trashGear(g.gear, g.host); G.draw(f.owner, 2); } else G.draw(f.owner, 1);
      },
    ],
    ability: [pickUnit('friendly', null, 'Dum Dum: friendly Unit gets +1 power per equipped Gear'), withUnit((G, f, u) => { u.tempPower += u.gear.length; G.log(`${G.dn(u)} gets +${u.gear.length} power this turn.`); })],
  },
  'river-ward-detective-on-the-hunt': {
    ability: [
      (G, f) => G.askCards(f, { player: f.owner, zones: ['hand'], filter: (c) => G.def(c).type === 'gear' && (G.def(c).cost || 0) <= 2, prompt: 'River Ward: play a Gear (cost 2 or less) for free', optional: true }),
      (G, f) => { f.d.g = f.answer && f.answer[0]; if (!f.d.g) return; return G.ask(f, { player: f.owner, prompt: 'Equip it to which Unit or Legend?', options: [...G.P(f.owner).field, ...G.P(f.owner).legends.filter((l) => l.faceUp)].map((h) => ({ id: h.id, label: G.dn(h) })), optional: false }); },
      (G, f) => { if (f.d.g && f.answer && f.answer[0]) G.equipFree(f.owner, f.d.g, f.answer[0]); },
    ],
  },

  // ---- Units
  'kerry-eurodyne-the-last-rockerboy': { ability: [(G, f) => { if (G.P(f.owner).gigs.some((d) => d.value >= 8)) G.draw(f.owner, 2); else G.log('Kerry: no Gig with 8+ value, nothing happens.'); }] },
  'judy-a-lvarez-nothing-to-doubt': {
    ability: [
      (G, f) => {
        const P = G.P(f.owner); const c = P.deck.shift(); if (!c) return;
        P.hand.push(c); f.d.c = c.id; G.log(`${G.name(f.owner)} reveals ${G.dn(c)}.`);
        const t = G.def(c).type; if (t !== 'unit' && t !== 'program') return;
        return G.ask(f, { player: f.owner, prompt: `Judy revealed ${G.dn(c)}. Play it for free? (otherwise it goes to your hand)`, options: [{ id: 'play', label: 'Play it for free' }], optional: true });
      },
      (G, f) => {
        if (!(f.answer && f.answer[0] === 'play') || !f.d.c) return;
        const c = G.P(f.owner).hand.find((x) => x.id === f.d.c); if (!c) return;
        if (G.def(c).type === 'unit') G.playFreeUnit(f.owner, c.id); else G.playFreeProgram(f.owner, c.id);
      },
    ],
  },
  'sketchy-ripper': { attack: [stashN(3), stashPick('Sketchy Ripper: reveal a Gear', (G, c) => G.def(c).type === 'gear'), stashEnd] },
  'hanako-arasaka-in-a-gilded-cage': {
    play: [
      stashN(4),
      ...[0, 1, 2].flatMap(() => [(G, f) => { const vals = new Set(G.P(f.owner).gigs.map((d) => d.value)); return G.askStash(f, { player: f.owner, prompt: "Hanako: reveal a card whose cost equals one of your Gig values (optional)", optional: true, filter: (c) => vals.has(G.def(c).cost) }); }, stashGet]),
      (G, f) => { const vals = new Set(G.P(f.owner).gigs.map((d) => d.value)); return G.askStash(f, { player: f.owner, prompt: 'Hanako: reveal another card whose cost equals one of your Gig values (optional)', optional: true, filter: (c) => vals.has(G.def(c).cost) }); },
      stashEnd,
    ],
  },
  'placide-voodoo-sentinel': { play: discardProgramThen('Placide'), attack: discardProgramThen('Placide') },
  'maman-brigitte-spirit-of-death': {
    play: [
      (G, f) => { if (G.P(f.owner).hand.filter((c) => G.def(c).type === 'program').length < 2) return; return G.askCards(f, { player: f.owner, zones: ['hand'], filter: (c) => G.def(c).type === 'program', prompt: 'Maman Brigitte: you may discard 2 Programs (first one)', optional: true }); },
      (G, f) => { f.d.a = f.answer && f.answer[0]; if (!f.d.a) return; return G.askCards(f, { player: f.owner, zones: ['hand'], filter: (c) => G.def(c).type === 'program' && c.id !== f.d.a, prompt: 'Maman Brigitte: discard the second Program', optional: false }); },
      (G, f) => { const b = f.answer && f.answer[0]; if (!f.d.a || !b) return; G.discard(f.owner, f.d.a); G.discard(f.owner, b); return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => !u.gear.length, prompt: 'Maman Brigitte: bottom-deck a rival unequipped Unit' }); },
      withUnit((G, f, u) => G.bottomDeck(u)),
    ],
  },
  'panam-palmer-strength-through-family': {
    attack: [
      (G, f) => { if (!G.P(f.owner).hand.length) return; return G.askHand(f, { player: f.owner, prompt: 'Panam: discard 1 card (then draw 1 per face-up Legend)' }); },
      (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; G.discard(f.owner, id); G.draw(f.owner, G.P(f.owner).legends.filter((l) => l.faceUp).length); },
    ],
  },
  'el-sombrero-n-la-venganza-lenta': {
    attack: [
      (G, f) => { const max = Math.max(0, ...G.P(f.owner).gigs.map((d) => d.value)); f.d.max = max; if (!max || !G.canPay(f.owner, 2)) return; return G.ask(f, { player: f.owner, prompt: `El Sombrero: pay 2 €$ for +${max} power this turn?`, options: [{ id: 'pay', label: `Pay 2 €$ (+${max} power)` }], optional: true }); },
      (G, f) => { if (!(f.answer && f.answer[0] === 'pay')) return; const u = G.find(f.self); if (!u) return; G.pay(f.owner, 2); u.tempPower += f.d.max; G.log(`El Sombrero gets +${f.d.max} power this turn.`); },
    ],
  },
  '6th-street-recruits': { friendStole: [(G, f) => { if (f.d.sides !== 6) return; return G.askAdjust(f, { player: f.owner, scope: 'any', up: 6, down: 0 }); }, (G, f) => { G.applyAdjust(f); }] },
  'maelstrom-goons': { stole: [(G, f) => { const u = G.find(f.self); if (!u || !u.gear.length) return; const r = rival(f.owner); if (!G.P(r).hand.length) return; return G.askHand(f, { player: r, prompt: 'Maelstrom Goons stole a Gig while equipped: discard a card' }); }, (G, f) => { if (f.answer && f.answer[0]) G.discard(rival(f.owner), f.answer[0]); }] },
  'wraith-marauders': { stole: [(G, f) => { const v = f.d.value; return G.askUnits(f, { player: f.owner, scope: 'friendly', filter: (u) => u.id !== f.self && u.spent && G.power(u) === v, prompt: `Wraith Marauders: ready another friendly Unit with power ${v}`, optional: true }); }, (G, f) => { const u = f.answer && G.find(f.answer[0]); if (u) { u.spent = false; G.log(`${G.dn(u)} is readied.`); } }] },

  // ---- Programs
  'fool-on-the-hill': {
    play: [
      stashN(2),
      (G, f) => G.ask(f, { player: rival(f.owner), prompt: `Fool on the Hill: ${G.name(f.owner)} revealed ${G.P(f.owner).stash.map((c) => G.dn(c)).join(' and ') || 'nothing'}. Their choice: add to hand, or trash them (they draw 2)?`, options: [{ id: 'hand', label: 'Add them to their hand' }, { id: 'trash', label: 'Trash them (they draw 2)' }], optional: false }),
      (G, f) => { const P = G.P(f.owner); if (f.answer && f.answer[0] === 'trash') { P.trash.push(...P.stash); P.stash = []; G.draw(f.owner, 2); } else { P.hand.push(...P.stash); P.stash = []; } },
    ],
  },
  'three-mouths-one-desire': {
    play: [
      stashN(3), stashPick('Three Mouths: add 1 card to your hand', () => true, false), stashGet,
      ...[0, 1, 2].flatMap(() => [(G, f) => { if (f.d.n === undefined) f.d.n = G.P(f.owner).gigs.filter((d) => d.value === 1).length; if (f.d.n <= 0) return; return G.askStash(f, { player: f.owner, prompt: 'Three Mouths: add 1 more card (1 per friendly min Gig)', optional: true, filter: () => true }); }, (G, f) => { const id = f.answer && f.answer[0]; if (id) { G.stashToHand(f.owner, id); f.d.n--; } }]),
      (G, f) => { G.stashToBottom(f.owner); },
    ],
  },
  'peace-offering': { play: [...copyGig(true), (G, f) => { if (hasPair(G, f.owner)) G.draw(f.owner, 1); }] },
  'detonate': {
    play: [
      (G, f) => { const options = []; for (const p of [rival(f.owner)]) for (const h of [...G.P(p).field, ...G.P(p).legends.filter((l) => l.faceUp)]) for (const g of h.gear) if ((G.def(g).power || 0) <= 2) options.push({ id: g.id, label: `${G.dn(g)} on ${G.dn(h)}` }); return G.ask(f, { player: f.owner, prompt: 'Detonate: defeat a rival Gear with power 2 or less', options, optional: true }); },
      (G, f) => { const g = f.answer && f.answer[0] && G.findGear(f.answer[0]); if (g) G.trashGear(g.gear, g.host); },
    ],
  },
});

FULL.push('sketchy-ripper', 'hanako-arasaka-in-a-gilded-cage', 'three-mouths-one-desire', 'fool-on-the-hill', 'peace-offering', 'detonate', 'kerry-eurodyne-the-last-rockerboy', 'judy-a-lvarez-nothing-to-doubt', 'el-sombrero-n-la-venganza-lenta', 'placide-voodoo-sentinel', 'maman-brigitte-spirit-of-death', '6th-street-recruits', 'maelstrom-goons', 'wraith-marauders', 'wakako-okada-peace-and-harmony', 'padre-man-of-the-cross', 'dexter-deshawn-off-the-grid', 'muamar-reyes-el-capita-n');
PARTIAL.push('hanako-arasaka-daughter-of-the-emperor', 'dum-dum-maelstrom-triggerman', 'judy-a-lvarez-braindance-maestro', 'river-ward-detective-on-the-hunt', 'panam-palmer-strength-through-family');


// ====================================================================== batch 4: fight/steal/spend triggers, QUICK programs, remaining Legends
const once = (u, k) => { u.once = u.once || {}; if (u.once[k]) return false; u.once[k] = true; return true; };
const handOpts = (G, p) => G.P(p).hand.map((c) => ({ id: c.id, label: G.dn(c) }));
const takeFromTrash = (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; const P = G.P(f.owner); const i = P.trash.findIndex((c) => c.id === id); if (i >= 0) { const [c] = P.trash.splice(i, 1); P.hand.push(c); G.log(`${G.name(f.owner)} adds ${G.dn(c)} from their trash to their hand.`); } };
const mustAttackNext = (G, f, u) => { u.mustAttack = G.S.turnNo + 1; G.log(`${G.dn(u)} must attack next turn if it can.`); };

Object.assign(EFFECTS, {
  // ---- fight triggers
  'johnny-silverhand-never-stop-fighting': { fightWinU: [(G, f) => { const u = G.find(f.self); if (u && once(u, 'ready') && u.spent) { u.spent = false; G.log('Johnny readies after winning a fight.'); } }] },
  'maelstrom-zealots': { fightLoseU: [(G, f) => { const o = G.find(f.d.opp); if (o) { G.log('Maelstrom Zealots take their opponent down with them.'); G.defeat(o); } }] },
  'meredith-stout-stone-cold-corpo': { rivalTouched: [(G, f) => G.askCards(f, { player: f.owner, zones: ['trash'], prompt: 'Meredith Stout: add a card from your trash to your hand', optional: true }), takeFromTrash] },
  'alt-cunningham-mother-of-daemons': { friendSpent: [(G, f) => { if (f.d.equipped) G.draw(f.owner, 1); }] },
  'rita-wheeler-no-stupid-questions': {
    spent: [
      (G, f) => { const u = G.find(f.self); if (!u || !once(u, 'rita')) return; G.draw(f.owner, 1); if (!G.P(f.owner).hand.length) return; return G.askHand(f, { player: f.owner, prompt: 'Rita Wheeler: discard 1 card' }); },
      (G, f) => { if (f.answer && f.answer[0]) G.discard(f.owner, f.answer[0]); },
    ],
  },
  'rogue-amendiares-queen-of-the-afterlife': {
    friendStole: [(G, f) => { if (f.d.by === f.self) return; const me = G.find(f.self), by = G.find(f.d.by); if (!me || !by || f.d.value >= G.power(by) || !once(me, 'rogueQ')) return; G.readyEddies(f.owner, 2); }],
    ability: [pickUnit('rival', null, 'Rogue: a rival Unit loses power equal to this Unit'), withUnit((G, f, u) => { const me = G.find(f.self); const n = me ? G.power(me) : 0; u.tempPower -= n; G.log(`${G.dn(u)} gets -${n} power this turn.`); })],
  },
  'rogue-amendiares-preem-solo': {
    friendStole: [
      (G, f) => { const by = G.find(f.d.by); if (!by || !by.isLegend) return; if (f.d.value % 2 === 0) { G.draw(f.owner, 1); return; } const r = rival(f.owner); if (!G.P(r).hand.length) return; return G.askHand(f, { player: r, prompt: 'Rogue stole an odd Gig: discard a card' }); },
      (G, f) => { if (f.answer && f.answer[0]) G.discard(rival(f.owner), f.answer[0]); },
    ],
  },
  'gorilla-arms': {
    stole: [
      (G, f) => { const h = G.find(f.host); if (!h || !once(h, 'gorilla')) return; const mine = new Set(G.P(f.owner).gigs.map((d) => d.value)); const options = G.P(rival(f.owner)).gigs.filter((d) => !mine.has(d.value)).map((d) => ({ id: d.id, label: `d${d.sides} showing ${d.value}` })); return G.ask(f, { player: f.owner, prompt: 'Gorilla Arms: steal a rival Gig whose value no friendly Gig has', options, optional: true }); },
      (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; const R = G.P(rival(f.owner)); const i = R.gigs.findIndex((d) => d.id === id); if (i >= 0) { const [d] = R.gigs.splice(i, 1); G.P(f.owner).gigs.push(d); G.log(`${G.name(f.owner)} steals another Gig (d${d.sides} showing ${d.value}).`); } },
    ],
  },
  'the-relic-experimental-biochip': {
    defeated: [
      (G, f) => G.askCards(f, { player: f.owner, zones: ['trash'], filter: (c) => G.def(c).type === 'unit' && (G.def(c).cost || 0) <= 9 && c.id !== f.host, prompt: 'The Relic: play another Unit (cost 9 or less) from your trash for free', optional: true }),
      (G, f) => {
        const id = f.answer && f.answer[0]; if (!id) return;
        G.playFreeUnit(f.owner, id);
        const P = G.P(f.owner); const i = P.trash.findIndex((c) => c.id === f.host);
        if (i >= 0) { const [c] = P.trash.splice(i, 1); P.deck.push(c); G.log(`${G.dn(c)} is put on the bottom of its owner's deck.`); }
      },
    ],
  },

  // ---- QUICK / fight Programs
  'safety-override': { play: [(G, f) => { G.P(f.owner).safety = true; G.log('Safety Override: if a friendly Unit loses a fight this turn, the opposing Unit is defeated.'); }] },
  'appetite-for-destruction': { play: [(G, f) => { G.P(f.owner).appetite = true; G.log('Appetite for Destruction: the next friendly fight won by 3+ power also steals a Gig.'); }] },
  'cyberpsychosis': { play: [pickUnit('any', (G, f, u) => u.gear.length > 0, 'Cyberpsychosis: give an equipped Unit +3 power per Gear (it is defeated at end of turn if it steals or fights)'), withUnit((G, f, u) => { u.tempPower += 3 * u.gear.length; u.cyber = true; G.log(`${G.dn(u)} gets +${3 * u.gear.length} power and will burn out if it steals or fights.`); })] },
  'synapse-burnout': { play: [pickUnit('friendly', null, 'Synapse Burnout: a friendly Unit gets +1 power per face-up Legend while fighting'), withUnit((G, f, u) => { const n = G.P(f.owner).legends.filter((l) => l.faceUp).length; u.fightBonus += n; G.log(`${G.dn(u)} gets +${n} power while fighting Units this turn.`); })] },
  'take-control': { play: [pickUnit('rival', null, 'Take Control: a rival Unit steals 1 fewer Gig this turn'), withUnit((G, f, u) => { u.stealMinus += 1; G.log(`${G.dn(u)} steals 1 fewer Gig this turn.`); const t = G.def(u).tags; if (t.includes('AI') || t.includes('DRONE') || t.includes('VEHICLE')) G.draw(f.owner, 1); })] },
  'gunpoint-diplomacy': {
    play: [
      pickUnit('friendly', null, 'Gunpoint Diplomacy: choose a friendly Unit'),
      (G, f) => { f.d.u = f.answer && f.answer[0]; if (!f.d.u) return; if (G.cred(f.owner) < G.cred(rival(f.owner))) return G.ask(f, { player: rival(f.owner), prompt: 'Gunpoint Diplomacy: choose ONE effect for their Unit', options: [{ id: 'a', label: 'It may attack ready Units next attack' }, { id: 'b', label: 'It gets +3 power this turn' }], optional: false }); f.d.both = true; },
      (G, f) => { const u = f.d.u && G.find(f.d.u); if (!u) return; const a = f.d.both || (f.answer && f.answer[0] === 'a'), b = f.d.both || (f.answer && f.answer[0] === 'b'); if (a) { u.hitReady = true; G.log(`${G.dn(u)} may attack ready Units.`); } if (b) { u.tempPower += 3; G.log(`${G.dn(u)} gets +3 power this turn.`); } },
    ],
  },

  // ---- must-attack / spend / misc Units
  'mox-inciters': { play: [pickUnit('rival', null, 'Mox Inciters: a rival Unit must attack next turn if it can'), withUnit(mustAttackNext)] },
  'westbrook-netrunner': { play: [(G, f) => { G.P(f.owner).legendShield = true; G.log('Westbrook: rival Legends can\'t steal your Gigs with value less than their power until your next turn.'); }] },
  'lizzy-wizzy-delicate-weapon': {
    play: [
      (G, f) => G.askCards(f, { player: f.owner, zones: ['hand', 'trash'], filter: (c) => G.def(c).type === 'program' && (G.def(c).cost || 0) <= 3, prompt: 'Lizzy Wizzy: play a Program (cost 3 or less) for free', optional: true }),
      (G, f) => { const id = f.answer && f.answer[0]; if (id) G.playFreeProgram(f.owner, id, true); },
    ],
  },
  'viktor-vektor-you-might-feel-a-little-pinch': {
    play: [
      (G, f) => G.askCards(f, { player: f.owner, zones: ['trash'], filter: (c) => G.def(c).type === 'gear' && G.def(c).tags.includes('CYBERWARE') && (G.def(c).cost || 0) <= 2, prompt: 'Viktor: play a CYBERWARE Gear (cost 2 or less) from your trash', optional: true }),
      (G, f) => { f.d.g = f.answer && f.answer[0]; if (!f.d.g) return; return G.askUnits(f, { player: f.owner, scope: 'friendly', filter: (u) => u.id !== f.self, prompt: 'Equip it to which other friendly Unit?', optional: false }); },
      (G, f) => { const h = f.answer && f.answer[0]; if (f.d.g && h) G.equipFree(f.owner, f.d.g, h); },
    ],
  },
  'pepe-najarro-working-doubles': { attack: [(G, f) => { if (!hasPair(G, f.owner)) return; let n = 0; for (const l of G.P(f.owner).legends) if (l.spent && n < 2 && G.def(l).tags.includes('MERC')) { l.spent = false; n++; } if (n) G.log(`Pepe readies ${n} MERC Legend(s).`); }] },
  'sasha-yakovleva-won-t-let-you-down': {
    attack: [(G, f) => { const P = G.P(f.owner); const c = P.deck.shift(); if (!c) return; P.hand.push(c); const u = G.find(f.self); const n = G.def(c).cost || 0; if (u) u.tempPower += n; G.log(`${G.name(f.owner)} reveals ${G.dn(c)} and adds it to their hand. Sasha gets +${n} power.`); }],
    defeated: [(G, f) => { const r = rival(f.owner); if (!G.P(r).hand.length) return; return G.askHand(f, { player: r, prompt: 'Sasha was defeated: discard a card' }); }, (G, f) => { if (f.answer && f.answer[0]) G.discard(rival(f.owner), f.answer[0]); }],
  },
  'overwatch-panam-s-gift': {
    ability: [
      (G, f) => G.askHand(f, { player: f.owner, prompt: 'Overwatch: discard 1 card' }),
      (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; const c = G.P(f.owner).hand.find((x) => x.id === id); f.d.cost = G.def(c).cost || 0; G.discard(f.owner, id); return G.askUnits(f, { player: f.owner, scope: 'rival', filter: (u) => u.spent && costOfUnit(G, u) <= f.d.cost, prompt: `Overwatch: defeat a spent rival Unit with cost ${f.d.cost} or less` }); },
      withUnit((G, f, u) => G.defeat(u)),
    ],
  },

  // ---- Legend abilities
  'johnny-silverhand-rocking-renegade': {
    ability: [pickUnit('friendly', null, 'Johnny: a friendly Unit can attack spent rival Units the turn it is played'), withUnit((G, f, u) => { if (!u.freeAttack) u.freeAttack = 'units'; if (G.def(u).tags.includes('ROCKER')) { u.tempPower += 2; G.log(`${G.dn(u)} gets +2 power this turn.`); } })],
  },
  'goro-takemura-vengeful-bodyguard': {
    ability: [pickUnit('friendly', (G, f, u) => costOfUnit(G, u) <= 4, 'Goro: a friendly Unit (cost 4 or less) gains BLOCKER this turn'), withUnit((G, f, u) => { u.tempBlocker = true; if (hasPair(G, f.owner)) u.tempPower += 1; G.log(`${G.dn(u)} gains BLOCKER this turn.`); })],
  },
  'panam-palmer-nomad-cavalry': {
    ability: [
      (G, f) => { const h = G.find(f.host); return G.ask(f, { player: f.owner, prompt: 'Panam: move which Gear?', options: h.gear.map((g) => ({ id: g.id, label: G.dn(g) })), optional: false }); },
      (G, f) => { f.d.g = f.answer && f.answer[0]; if (!f.d.g) return; return G.askUnits(f, { player: f.owner, scope: 'friendly', filter: (u) => !u.gear.length, prompt: 'Move it to which unequipped friendly Unit?', optional: true }); },
      (G, f) => { const u = f.answer && G.find(f.answer[0]); const h = G.find(f.host); const g = h && h.gear.find((x) => x.id === f.d.g); if (!u || !g) return; h.gear = h.gear.filter((x) => x !== g); u.gear.push(g); u.spent = false; G.log(`${G.dn(g)} moves to ${G.dn(u)}, which is readied.`); },
    ],
    eot: [(G, f) => { const hs = [...G.P(f.owner).field, ...G.P(f.owner).legends.filter((l) => l.faceUp)]; const eq = hs.filter((h) => h.gear.length); if (eq.length >= 5) { eq.forEach((h) => { h.spent = false; }); G.log('Panam: five or more equipped Units/Legends are readied.'); } }],
  },
  'alt-cunningham-soulkiller-architect': {
    ability: [(G, f) => { const n = G.P(f.owner).gigs.filter((d) => d.value === 1).length; G.P(f.owner).programDiscount = n; G.log(`Your next Program costs ${n} less (minimum 1).`); }],
    ability2: [
      (G, f) => G.askCards(f, { player: f.owner, zones: ['trash'], filter: (c) => G.def(c).type === 'program' && G.canPay(f.owner, G.def(c).cost || 0), prompt: 'Soulkiller Architect: play a Program from your trash (you pay its cost)', optional: true }),
      (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; const c = G.P(f.owner).trash.find((x) => x.id === id); G.pay(f.owner, G.def(c).cost || 0); G.playFreeProgram(f.owner, id, true); },
    ],
  },
  'evelyn-parker-beautiful-enigma': { ability: [pickUnit('rival', null, 'Evelyn Parker: a rival Unit must attack next turn if it can'), withUnit(mustAttackNext)] },
  'v-streetkid': {
    call: [
      (G, f) => { G.mill(f.owner, 3); },
      (G, f) => G.askCards(f, { player: f.owner, zones: ['trash'], filter: (c) => G.def(c).type === 'program' && G.def(c).tags.includes('BRAINDANCE'), prompt: 'V: add a BRAINDANCE Program from your trash to your hand', optional: true }),
      takeFromTrash,
    ],
  },
  'kerry-eurodyne-axe-attitude-audience': {},
});
Object.assign(EFFECTS.legendTriggers, {
  'evelyn-parker-beautiful-enigma': { friendStole: [(G, f) => { const by = G.find(f.d.by); if (!by) return; const t = G.def(by).tags; if (t.includes('CORPO') || t.includes('GANGER')) G.readyEddies(f.owner, 1); }] },
  'goro-takemura-vengeful-bodyguard': {
    block: [
      (G, f) => { if (!G.P(f.owner).hand.length) return; return G.ask(f, { player: f.owner, prompt: 'Goro: discard a card to draw a card?', options: handOpts(G, f.owner), optional: true }); },
      (G, f) => { const id = f.answer && f.answer[0]; if (!id) return; G.discard(f.owner, id); G.draw(f.owner, 1); },
    ],
  },
  'judy-a-lvarez-braindance-maestro': { playBraindance: [pickUnit('friendly', null, 'Judy: give a friendly Unit +1 power this turn', true), withUnit((G, f, u) => { u.tempPower += 1; })] },
  'river-ward-detective-on-the-hunt': {
    friendDefeatedEquipped: [
      stashN(2),
      (G, f) => G.askStash(f, { player: f.owner, prompt: 'River Ward: trash 1 of the top 2 cards of your deck', optional: false, filter: () => true }),
      (G, f) => { const id = f.answer && f.answer[0]; const P = G.P(f.owner); const i = P.stash.findIndex((c) => c.id === id); if (i >= 0) { const [c] = P.stash.splice(i, 1); P.trash.push(c); G.log(`${G.name(f.owner)} trashes ${G.dn(c)}.`); } P.deck.unshift(...P.stash); P.stash = []; },
    ],
  },
  'hanako-arasaka-daughter-of-the-emperor': {
    sot: [(G, f) => { const cnt = {}; for (const d of G.P(f.owner).gigs) cnt[d.value] = (cnt[d.value] || 0) + 1; const pairs = Object.values(cnt).reduce((a, n) => a + Math.floor(n / 2), 0); if (pairs) { G.log(`Hanako: ${pairs} value-pair(s), drawing ${pairs}.`); G.draw(f.owner, pairs); } }],
  },
  'kerry-eurodyne-axe-attitude-audience': {
    roll: [
      (G, f) => { const d = G.die(f.d.die); if (!d) return; return G.ask(f, { player: f.owner, prompt: `Kerry Eurodyne: you rolled ${d.value} on the d${d.sides}. Ignore it and reroll once?`, options: [{ id: 're', label: 'Reroll it' }], optional: true }); },
      (G, f) => { const d = G.die(f.d.die); if (!d) return; if (f.answer && f.answer[0] === 're') G.reroll(d); if (d.value === 1 || d.value === d.sides) { const n = d.sides === 20 ? 3 : 1; G.log(`Kerry Eurodyne: min/max roll, draw ${n}.`); G.draw(f.owner, n); } },
    ],
  },
});

FULL.push('johnny-silverhand-never-stop-fighting', 'maelstrom-zealots', 'meredith-stout-stone-cold-corpo', 'alt-cunningham-mother-of-daemons', 'rita-wheeler-no-stupid-questions', 'rogue-amendiares-queen-of-the-afterlife', 'rogue-amendiares-preem-solo', 'gorilla-arms', 'the-relic-experimental-biochip', 'safety-override', 'appetite-for-destruction', 'cyberpsychosis', 'synapse-burnout', 'take-control', 'gunpoint-diplomacy', 'mox-inciters', 'westbrook-netrunner', 'lizzy-wizzy-delicate-weapon', 'viktor-vektor-you-might-feel-a-little-pinch', 'pepe-najarro-working-doubles', 'sasha-yakovleva-won-t-let-you-down', 'overwatch-panam-s-gift', 'johnny-silverhand-rocking-renegade', 'goro-takemura-vengeful-bodyguard', 'panam-palmer-nomad-cavalry', 'alt-cunningham-soulkiller-architect', 'evelyn-parker-beautiful-enigma', 'v-streetkid', 'kerry-eurodyne-axe-attitude-audience', 'hanako-arasaka-daughter-of-the-emperor', 'dum-dum-maelstrom-triggerman', 'judy-a-lvarez-braindance-maestro', 'river-ward-detective-on-the-hunt', 'panam-palmer-strength-through-family');
for (const id of ['hanako-arasaka-daughter-of-the-emperor', 'dum-dum-maelstrom-triggerman', 'judy-a-lvarez-braindance-maestro', 'river-ward-detective-on-the-hunt', 'panam-palmer-strength-through-family']) { const i = PARTIAL.indexOf(id); if (i >= 0) PARTIAL.splice(i, 1); }


Object.assign(EFFECTS, {
  'jackie-welles-mama-s-favorite': {
    jackieSave: [
      (G, f) => { const u = G.find(f.d.unit); if (!u) return; return G.ask(f, { player: f.owner, prompt: `Jackie Welles: pay 1 €$ to defeat Jackie instead of ${G.dn(u)}?`, options: [{ id: 'pay', label: 'Pay 1 €$ (Jackie is defeated and removed from the game instead)' }], optional: true }); },
      (G, f) => {
        const u = G.find(f.d.unit); if (!u) return;
        if (f.answer && f.answer[0] === 'pay') { const j = G.find(f.self); if (j && G.canPay(f.owner, 1)) { G.pay(f.owner, 1); u.jackieChecked = false; G.defeat(j); return; } }
        u.jackieChecked = true; G.defeat(u); u.jackieChecked = false;
      },
    ],
  },
});
FULL.push('jackie-welles-mama-s-favorite');

export const IMPL_FULL = new Set(FULL.filter((id) => !PARTIAL.includes(id)));
export const IMPL_PARTIAL = new Set(PARTIAL);
