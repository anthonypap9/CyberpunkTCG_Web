// Card data for the two Beta starter decks (Embracing Power, The Heist).
// `text` is a short paraphrase for display; the engine behaviour lives in effects.js.
// Source of stats: official card database (cost/power/RAM) + starter decklists, Oct 2026.

import { RAW_CARDS } from './carddata.js';

const U = 'unit', G = 'gear', P = 'program', L = 'legend';

const list = [
  // ---------- Embracing Power: Legends ----------
  { id: 'goro-takemura-hands-unclean', name: 'Goro Takemura', sub: 'Hands Unclean', type: L, color: 'green', cost: 5, power: 7, ram: 2, tags: ['ARASAKA', 'CORPO'], kw: { goSolo: true, blocker: true }, text: 'GO SOLO. BLOCKER.' },
  { id: 'saburo-arasaka-stubborn-patriarch', name: 'Saburo Arasaka', sub: 'Stubborn Patriarch', type: L, color: 'green', cost: null, power: 0, ram: 2, tags: ['ARASAKA', 'CORPO'], kw: {}, text: 'Friendly ARASAKA Units have +1 power while attacking.' },
  { id: 'yorinobu-arasaka-embracing-destruction', name: 'Yorinobu Arasaka', sub: 'Embracing Destruction', type: L, color: 'red', cost: null, power: 0, ram: 2, tags: ['ARASAKA', 'CORPO'], kw: {}, text: 'The first time a friendly ARASAKA Unit attacks each turn, draw 1. Then, if you have less than 20 Street Cred, discard 1.' },

  // ---------- Embracing Power: main deck ----------
  { id: 'ruthless-lowlife', name: 'Ruthless Lowlife', type: U, color: 'red', cost: 2, power: 4, ram: 1, tags: ['GANGER', 'MAELSTROM'], flags: { noGigAttack: true }, text: 'This Unit can only attack rival Units.' },
  { id: 'swordwise-huscle', name: 'Swordwise Huscle', type: U, color: 'red', cost: 3, power: 3, ram: 2, tags: ['MERC', 'SHARE'], text: 'ATTACK: If this Unit has power 5+, draw 1.' },
  { id: 'chrome-fang', name: 'Chrome Fang', type: U, color: 'red', cost: 5, power: 6, ram: 1, tags: ['GANGER', 'NETRUNNER', 'TYGER CLAWS'], text: "PLAY: Until your next turn, rival Units can't steal your Gigs with value higher than their power." },
  { id: 'minotaur', name: 'Minotaur', type: U, color: 'red', cost: 7, power: 9, ram: 2, tags: ['ARASAKA', 'DRONE', 'MILITECH'], text: 'PLAY: If you have more Street Cred than a Rival, defeat a rival Unit with power 5 or less.' },
  { id: 'mantis-blades', name: 'Mantis Blades', type: G, color: 'red', cost: 1, power: 2, ram: 1, sell: true, tags: ['CYBERWARE'], text: 'Gear. +2 power.' },
  { id: 'arasaka-emergency-radioport', name: 'Arasaka Emergency Radioport', type: G, color: 'red', cost: 2, power: 2, ram: 2, sell: true, tags: ['ARASAKA', 'CYBERWARE'], text: 'When this Unit or Legend is spent, you may look at a friendly face-down Legend. If it is ARASAKA or has GO SOLO, you may Call it for free.' },
  { id: 'satori-sword-of-saburo', name: 'Satori', sub: 'Sword of Saburo', type: G, color: 'red', cost: 2, power: 2, ram: 1, sell: true, tags: ['ARASAKA', 'WEAPON'], text: 'When this Unit wins a fight against a rival Unit, draw 1.' },
  { id: 'industrial-assembly', name: 'Industrial Assembly', type: P, color: 'red', cost: 1, ram: 1, sell: true, tags: ['ARASAKA', 'BRAINDANCE'], text: 'Increase a Gig by up to 4. If you control a Gig with value 8+, draw 1.' },
  { id: 'over-the-edge', name: 'Over the Edge', type: P, color: 'red', cost: 3, ram: 2, sell: true, tags: ['MERC'], text: 'Defeat a Unit with power equal to or less than the value of a friendly d20.' },
  { id: 'shattered-memories', name: 'Shattered Memories', type: P, color: 'red', cost: 4, ram: 2, sell: true, tags: [], text: 'Each player discards their hand and may draw 5. If the total discarded equals the value of a friendly Gig, draw 2.' },
  { id: 'corpo-security', name: 'Corpo Security', type: U, color: 'green', cost: 2, power: 2, ram: 1, tags: ['CORPO'], kw: { blocker: true }, flags: { cantAttack: true }, text: "This Unit can't attack. BLOCKER." },
  { id: 'emergency-atlus', name: 'Emergency Atlus', type: U, color: 'green', cost: 3, power: 4, ram: 1, tags: ['TRAUMA TEAM', 'VEHICLE', 'ZETATECH'], textUnverified: true, text: 'No rules text on the official page (vanilla).' },
  { id: 'field-operator', name: 'Field Operator', type: U, color: 'green', cost: 3, power: 2, ram: 2, tags: ['ARASAKA', 'CORPO', 'TECHIE'], text: 'PLAY: If your Street Cred is an even number, draw 1.' },
  { id: 'goro-takemura-losing-his-way', name: 'Goro Takemura', sub: 'Losing His Way', type: U, color: 'green', cost: 4, power: 4, ram: 3, tags: ['ARASAKA', 'CORPO'], text: 'ATTACK: If all friendly Legends are face-up, this Unit has +5 power this turn.' },
  { id: 'maxtac-av', name: 'MaxTac AV', type: U, color: 'green', cost: 5, power: 8, ram: 2, tags: ['NCPD', 'VEHICLE'], text: 'PLAY: You may swap a friendly Gig with a rival Gig.' },
  { id: 'sandevistan', name: 'Sandevistan', type: G, color: 'green', cost: 3, power: 2, ram: 3, sell: true, tags: ['CYBERWARE'], text: 'At the end of your turn, ready this Unit or Legend.' },
  { id: 'corporate-surveillance', name: 'Corporate Surveillance', type: P, color: 'green', cost: 2, ram: 1, sell: true, tags: ['CORPO'], text: 'Spend a rival Unit with cost 4 or less.' },

  // ---------- The Heist: Legends ----------
  { id: 'v-corporate-exile', name: 'V', sub: 'Corporate Exile', type: L, color: 'blue', cost: 5, power: 8, ram: 2, tags: ['CORPO', 'MERC'], kw: { goSolo: true }, text: 'GO SOLO.' },
  { id: 'jackie-welles-pour-one-out-for-me', name: 'Jackie Welles', sub: 'Pour One Out For Me', type: L, color: 'blue', cost: null, power: 0, ram: 2, tags: ['MERC'], kw: {}, text: 'The first time you play a Blue Unit or Blue Gear each turn, you may decrease a friendly Gig by up to 2. If it becomes a min Gig, draw 1.' },
  { id: 'viktor-vektor-sit-down-and-relax', name: 'Viktor Vektor', sub: 'Sit Down and Relax', type: L, color: 'yellow', cost: null, power: 0, ram: 2, tags: ['RIPPERDOC'], kw: {}, text: 'CALL: Search the top 5 cards of your deck. Reveal up to 2 Gears with cost 2 or less and add them to your hand. Bottom-deck the rest in a random order.' },

  // ---------- The Heist: main deck ----------
  { id: 'secondhand-bombus', name: 'Secondhand Bombus', type: U, color: 'yellow', cost: 2, power: 0, ram: 2, tags: ['DRONE', 'ZETATECH'], kw: { blocker: true }, text: 'BLOCKER. (Power 0 Units do not steal Gigs.)' },
  { id: 'dexter-deshawn-one-last-chance', name: 'Dexter DeShawn', sub: 'One Last Chance', type: U, color: 'yellow', cost: 3, power: 4, ram: 2, tags: ['FIXER'], text: 'PLAY, ATTACK: Adjust a Gig by up to 1. DEFEATED: If your Street Cred differs from a Rival\'s by 10+, draw 2.' },
  { id: 'offduty-malfini', name: 'Offduty Malfini', type: U, color: 'yellow', cost: 4, power: 5, ram: 2, tags: ['GANGER', 'VOODOO BOYS'], text: 'PLAY: Spend this Unit and a rival Unit.' },
  { id: 't-bug-amateur-philosopher', name: 'T-Bug', sub: 'Amateur Philosopher', type: U, color: 'yellow', cost: 4, power: 4, ram: 2, tags: ['MERC', 'NETRUNNER'], text: 'DEFEATED: Look at all friendly face-down Legends. Then you may Call a Legend for free.' },
  { id: 'heywood-ripperdoc', name: 'Heywood Ripperdoc', type: U, color: 'yellow', cost: 6, power: 8, ram: 1, tags: ['RIPPERDOC'], text: 'PLAY: You may defeat a Gear. If its cost equals the value of a friendly Gig, draw 1.' },
  { id: 'kiroshi-optics', name: 'Kiroshi Optics', type: G, color: 'yellow', cost: 1, power: 1, ram: 1, sell: true, tags: ['CYBERWARE'], text: 'ATTACK: Look at a friendly face-down Legend.' },
  { id: 'mandibular-upgrade', name: 'Mandibular Upgrade', type: G, color: 'yellow', cost: 1, power: 0, ram: 2, sell: true, tags: ['CYBERWARE'], kw: { blocker: true }, text: 'Equipped Unit or Legend has BLOCKER.' },
  { id: 'zetatech-faceplate', name: 'Zetatech Faceplate', type: G, color: 'yellow', cost: 2, power: 2, ram: 2, sell: true, tags: ['CYBERWARE', 'ZETATECH'], text: 'When this Unit or Legend is spent, adjust a Gig by up to 1. Then, if you control 3+ Gigs with different values, draw 1.' },
  { id: 'afterparty-at-lizzie-s', name: "Afterparty at Lizzie's", type: P, color: 'yellow', cost: 1, ram: 1, sell: true, tags: ['BRAINDANCE', 'MOX'], text: 'Adjust a Gig by up to 1. If you control 2+ Gigs with different values, draw 1.' },
  { id: 'evelyn-parker-scheming-siren', name: 'Evelyn Parker', sub: 'Scheming Siren', type: U, color: 'blue', cost: 2, power: 0, ram: 3, tags: ['SHARE', 'DOLL'], text: 'ATTACK: Draw 1. Then, if you have more Street Cred than a Rival, discard 1.' },
  { id: 'delamain-cab', name: 'Delamain Cab', type: U, color: 'blue', cost: 4, power: 4, ram: 2, tags: ['VEHICLE'], text: 'At the end of your turn, if this Unit stole a Gig this turn, ready 1 Eddie.' },
  { id: 'psycho-squad', name: 'Psycho Squad', type: U, color: 'blue', cost: 4, power: 6, ram: 1, tags: ['NCPD'], text: 'No rules text (vanilla).' },
  { id: 'mt0d12-flathead', name: 'MT0D12 Flathead', type: U, color: 'blue', cost: 5, power: 7, ram: 3, sell: true, tags: ['DRONE', 'MILITECH'], text: "If you have less Street Cred than a Rival, this Unit can't be blocked." },
  { id: 'tetratronic-rippler', name: 'Tetratronic Rippler', type: G, color: 'blue', cost: 1, power: 1, ram: 2, sell: true, tags: ['CYBERWARE'], text: 'When this Unit or Legend is spent, look at the top card of your deck. You may trash it.' },
  { id: 'dying-night-v-s-pistol', name: "Dying Night", sub: "V's Pistol", type: G, color: 'blue', cost: 2, power: 2, ram: 2, sell: true, tags: ['MERC', 'WEAPON'], text: 'ATTACK: Decrease a Gig by up to 2. At the end of your turn, if this Unit is named "V", ready 2 Eddies.' },
  { id: 'floor-it', name: 'Floor It', type: P, color: 'blue', cost: 1, ram: 1, sell: true, tags: ['MERC', 'QUICKHACK'], kw: { quick: true }, text: 'QUICK: Give a rival Unit -1 power this turn. Draw 1.' },
  { id: 'reboot-optics', name: 'Reboot Optics', type: P, color: 'blue', cost: 2, ram: 2, sell: true, tags: ['SHARE', 'QUICKHACK'], kw: { quick: true }, text: "QUICK: The next time a rival Unit fights this turn, it doesn't defeat the opposing friendly Unit." },
];

export const CARDS = {};
for (const c of list) {
  CARDS[c.id] = { kw: {}, flags: {}, tags: [], sell: false, curated: true, ...c };
}
// All other cards come straight from the official pages. Their effects are encoded in effects.js as far as
// the engine supports them; `impl` says whether the game actually performs the card's printed effects.
for (const c of RAW_CARDS) {
  if (!CARDS[c.id]) CARDS[c.id] = { flags: {}, sell: false, ...c };
}

const ep = {
  id: 'embracing-power',
  name: 'Embracing Power',
  blurb: 'Arasaka (Red/Green): big Units and Gear that all give +2 power.',
  legends: ['goro-takemura-hands-unclean', 'saburo-arasaka-stubborn-patriarch', 'yorinobu-arasaka-embracing-destruction'],
  main: {
    'ruthless-lowlife': 3, 'swordwise-huscle': 2, 'chrome-fang': 2, 'minotaur': 2,
    'mantis-blades': 3, 'arasaka-emergency-radioport': 2, 'satori-sword-of-saburo': 3,
    'industrial-assembly': 2, 'over-the-edge': 2, 'shattered-memories': 2,
    'corpo-security': 3, 'emergency-atlus': 2, 'field-operator': 2,
    'goro-takemura-losing-his-way': 2, 'maxtac-av': 2, 'sandevistan': 3, 'corporate-surveillance': 3,
  },
};

const heist = {
  id: 'the-heist',
  name: 'The Heist',
  blurb: 'Mercs (Yellow/Blue): low Street Cred, Quickhacks and card advantage.',
  legends: ['v-corporate-exile', 'jackie-welles-pour-one-out-for-me', 'viktor-vektor-sit-down-and-relax'],
  main: {
    'secondhand-bombus': 2, 'dexter-deshawn-one-last-chance': 2, 'offduty-malfini': 2,
    't-bug-amateur-philosopher': 2, 'heywood-ripperdoc': 2, 'kiroshi-optics': 3,
    'mandibular-upgrade': 3, 'zetatech-faceplate': 3, 'afterparty-at-lizzie-s': 2,
    'evelyn-parker-scheming-siren': 3, 'delamain-cab': 3, 'psycho-squad': 2,
    'mt0d12-flathead': 2, 'tetratronic-rippler': 2, 'dying-night-v-s-pistol': 2,
    'floor-it': 3, 'reboot-optics': 2,
  },
};

export const STARTER_DECKS = { [ep.id]: ep, [heist.id]: heist };

export function expandMain(main) {
  const out = [];
  for (const [id, n] of Object.entries(main)) for (let i = 0; i < n; i++) out.push(id);
  return out;
}

export function displayName(d) {
  return d.sub ? `${d.name}: ${d.sub}` : d.name;
}

// Deck legality per the official deck-building rules: exactly 3 Legends with unique names,
// 40-50 main cards, max 3 copies by name+subtitle, every card within the RAM limit set by Legends.
export function validateDeck(legendIds, mainIds) {
  const errors = [];
  if (legendIds.length !== 3) errors.push('Needs exactly 3 Legends.');
  const names = new Set(legendIds.map((id) => CARDS[id]?.name));
  if (names.size !== legendIds.length) errors.push('Legends must have different names.');
  if (mainIds.length < 40 || mainIds.length > 50) errors.push(`Main deck must be 40-50 cards (has ${mainIds.length}).`);
  const copies = {};
  for (const id of mainIds) copies[id] = (copies[id] || 0) + 1;
  for (const [id, n] of Object.entries(copies)) if (n > 3) errors.push(`More than 3 copies of ${displayName(CARDS[id])}.`);
  const limit = {};
  for (const id of legendIds) { const d = CARDS[id]; limit[d.color] = (limit[d.color] || 0) + (d.ram || 0); }
  for (const id of new Set(mainIds)) {
    const d = CARDS[id];
    if (d.type === L) errors.push(`${displayName(d)} is a Legend and cannot be in the main deck.`);
    if ((d.ram || 0) > (limit[d.color] || 0)) errors.push(`${displayName(d)} needs ${d.color} RAM ${d.ram} (you have ${limit[d.color] || 0}).`);
  }
  return errors;
}
