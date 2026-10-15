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
      (G, f) => { if (f.d.mine && f.answer && f.answer[0]) G.swapGigs(f.d.mine, f.answer[0]); },
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
export const IMPL_FULL = new Set(FULL.filter((id) => !PARTIAL.includes(id)));
export const IMPL_PARTIAL = new Set(PARTIAL);
