// Plain-language lexicon of every term in the game (Beta rules as implemented in this fan tool).
export const LEXICON = [
  // ---- goal
  { g: 'The goal', t: 'Gig', d: 'A die you have won. At the start of your turn, if you hold 7 or more Gigs you win. Count wins: the numbers on the dice do not matter for winning.' },
  { g: 'The goal', t: 'Fixer', d: 'Where your dice wait before they become Gigs. You own six dice (d4, d6, d8, d10, d12, d20). At the start of each of your turns you roll one into your Gigs — the d20 is always last.' },
  { g: 'The goal', t: 'Street Cred (☆)', d: 'The total of the numbers showing on your Gigs. Many card effects compare Street Cred ("more ☆ than a Rival"). It does not decide who wins.' },
  { g: 'The goal', t: 'Steal', d: 'Hitting the Rival\'s Gigs with an unblocked attacker takes dice from them: 1, plus 1 more per 10 power. A Unit with 0 power steals nothing. A blocked attack never steals.' },
  { g: 'The goal', t: 'Overtime', d: 'If nobody has won after both players\' 7th turn, the first player to hold 7 Gigs wins at once. Drawing from an empty deck loses.' },
  { g: 'The goal', t: 'Mulligan', d: 'At the start you may shuffle your opening hand back and draw 6 new cards — once.' },
  // ---- playmat
  { g: 'The playmat', t: 'Playmat', d: 'The board. You are the bottom half, the Rival the top half; both halves are laid out the same way.' },
  { g: 'The playmat', t: 'Field', d: 'The row where your Units stand after you play them. Only cards on the Field can attack or block.' },
  { g: 'The playmat', t: 'Legends area', d: 'Your three Legend cards. They start face-down. Calling one flips it face-up. Ready Legends can also be spent as money.' },
  { g: 'The playmat', t: 'Eddies', d: 'Your money pile. Selling a card from your hand puts it here as one Eddie. Spending an Eddie turns it sideways; it comes back at the start of your turn.' },
  { g: 'The playmat', t: 'Deck / Hand / Trash', d: 'Deck: your draw pile. Hand: cards you hold. Trash: cards that were used or defeated.' },
  // ---- cards
  { g: 'Cards', t: 'Unit', d: 'A character card. Units fight, block and attack. Their big number is power.' },
  { g: 'Cards', t: 'Gear', d: 'Equipment. Plays attached to a Unit or a face-up Legend and gives it extra power or abilities. It is lost when its host leaves the Field.' },
  { g: 'Cards', t: 'Program', d: 'A one-shot spell. Does its effect, then goes to your trash.' },
  { g: 'Cards', t: 'Legend', d: 'Special cards kept in your Legends area (3 per deck). You do not draw them. Each can be Called or sent Solo.' },
  { g: 'Cards', t: 'Power', d: 'A Unit\'s strength. In a fight the higher power wins; equal power defeats both. Gear adds to it.' },
  { g: 'Cards', t: 'Colour', d: 'Red, Green, Blue or Yellow. Colour matters in deck building (see RAM).' },
  { g: 'Cards', t: 'RAM', d: 'A deck-building limit, not something you spend in a match. Add up the RAM of your 3 Legends per colour. A card can only go in your deck if its own RAM is no more than your total in its colour. Example: Legends with RAM 2 + 2 in green allow green cards up to RAM 4. During a game RAM does nothing.' },
  { g: 'Cards', t: 'Rarity', d: 'How rare a card is (Common, Uncommon, Rare, Epic, Secret…). It does not change the rules. Legends and Epic+ cards get a foil shine in this app.' },
  // ---- money
  { g: 'Money & playing cards', t: 'Cost', d: 'The number in the top-left corner: how many €$ you must pay to play the card.' },
  { g: 'Money & playing cards', t: '€$ (money)', d: 'One unit of money. Each ready Eddie is 1 €$, and each ready Legend can be spent for 1 €$ too.' },
  { g: 'Money & playing cards', t: 'Sell', d: 'Once per turn you may put one card from your hand into your Eddies. Only cards with a sell tag (shown as € beside the cost) can be sold.' },
  { g: 'Money & playing cards', t: 'Sell tag', d: 'The € mark next to a card\'s cost. In this fan tool Gear and Programs have it and most Units do not — check your physical cards.' },
  { g: 'Money & playing cards', t: 'Call (Call a Legend)', d: 'Pay 1 €$ (once per turn) to flip one of your Legends face-up. Its CALL effect happens right away. Face-up Legends can carry Gear.' },
  { g: 'Money & playing cards', t: 'GO SOLO', d: 'Pay a Legend\'s cost to play it as a ready Unit that can attack this turn. If it leaves the Field it is removed from the game.' },
  { g: 'Money & playing cards', t: 'Equip', d: 'Play a Gear onto a Unit or face-up Legend. It stays attached.' },
  // ---- turn
  { g: 'Your turn', t: 'Start phase', d: 'Automatic: everything readies, you draw 1 card, and you roll 1 die from your Fixer into your Gigs (if you hold 7 at the very start, you win).' },
  { g: 'Your turn', t: 'Main phase', d: 'Do these in any order: sell 1 card, play cards, Call a Legend, attack. Then press End turn.' },
  { g: 'Your turn', t: 'Ready / Spent', d: 'Ready = upright, can be used. Spent = turned sideways, already used. Everything of yours readies at the start of your turn.' },
  { g: 'Your turn', t: 'Lag', d: 'A Unit cannot attack the turn it is played. It can still block on the Rival\'s turn.' },
  { g: 'Your turn', t: 'Draw', d: 'Take the top card of your deck into your hand.' },
  // ---- combat
  { g: 'Combat', t: 'Attack', d: 'Spend a ready Unit to attack either a SPENT Rival Unit (a fight) or the Rival\'s Gigs (a steal). Ready Units cannot be attacked.' },
  { g: 'Combat', t: 'Fight', d: 'When two Units fight, higher power wins and the loser is defeated. Equal power: both are defeated.' },
  { g: 'Combat', t: 'Defeat', d: 'A defeated Unit goes to its owner\'s trash, along with its Gear.' },
  { g: 'Combat', t: 'BLOCKER', d: 'While ready, a BLOCKER Unit can spend to take an attack aimed at you or at another of your Units. A blocked attack steals nothing.' },
  { g: 'Combat', t: 'Block', d: 'When you are attacked, you may spend a ready BLOCKER Unit to become the target instead.' },
  { g: 'Combat', t: 'QUICK', d: 'Can be played or used at any time, even in the middle of a Rival\'s attack.' },
  { g: 'Combat', t: 'ADRENALINE', d: 'This Unit has no Lag: it can attack the turn it is played.' },
  { g: 'Combat', t: 'SPEND', d: 'Turn the card sideways to use its effect. It stays spent until your next turn.' },
  // ---- triggers
  { g: 'Card text', t: 'PLAY', d: 'Happens once, when you play the card.' },
  { g: 'Card text', t: 'ATTACK', d: 'Happens when this Unit attacks.' },
  { g: 'Card text', t: 'DEFEATED', d: 'Happens when this Unit is defeated.' },
  { g: 'Card text', t: 'CALL', d: 'Happens when you Call this Legend.' },
  { g: 'Card text', t: 'Adjust', d: 'Change a Gig die up or down by the stated amount, staying within the die\'s faces (1 up to its highest number).' },
  { g: 'Card text', t: 'Min / max Gig', d: 'A min Gig shows 1. A max Gig shows its die\'s highest face (e.g. 6 on a d6).' },
  { g: 'Card text', t: 'Value-pair', d: 'Two of your Gigs showing the same number.' },
  { g: 'Card text', t: 'Bottom-deck', d: 'Put the card on the bottom of its owner\'s deck.' },
  { g: 'Card text', t: 'Trash N', d: 'Move the top N cards of your deck to your trash (usually followed by "add one of them to your hand").' },
  // ---- deck building
  { g: 'Deck building', t: 'Deck', d: '3 Legends with different names, plus 40–50 other cards. At most 3 copies of any card. Every card must fit your RAM limits.' },
  { g: 'Deck building', t: 'Suggested limits', d: 'Not official rules: the starter decks have about 20 Units and 20 Gear/Programs, an average cost of 2.5–2.9, and about 20 sellable cards so you always have Eddies.' },
];
export const LEX_GROUPS = [...new Set(LEXICON.map((e) => e.g))];
