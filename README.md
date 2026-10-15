# Night City TCG Trainer (unofficial fan tool)
- Play on PC: open `night-city-tcg-trainer.html` in any browser (works offline, single file), or serve `www/` (PWA: installable on Android via Chrome "Add to Home screen").
- Android APK: `npm i @capacitor/core @capacitor/cli @capacitor/android && npx cap add android && npx cap sync && npx cap open android` (needs Android Studio), then Build > Build APK.
- Tests: `npm test` (engine), `node test/ui.smoke.mjs` (UI, needs jsdom).

## Card images (optional, personal use)
The app shows plain text frames by default. To get the real card art:
1. Install Node 18+, open a terminal in this folder.
2. `node tools/fetch-art.mjs` (downloads all 151 cards; re-run it to retry failures). Images are saved to `www/art/<card-id>.webp`.
3. The single-file build needs an `art/` folder next to the HTML file: copy `www/art` beside `night-city-tcg-trainer.html`.
Cards without an image fall back to the text frame.

## Deck builder & card pool
- All 151 cards of the Beta pool are in (`www/js/carddata.js`, generated from the official card pages by `data/build-cards.mjs`).
- Deck builder: pick 3 Legends (unique names), add cards (max 3 copies, RAM limit per colour = sum of your Legends' RAM), save/load/import/export decks, play against the AI with them.
- "Suggested limits" and "Synergies" are guidelines derived from the two starter decks and card text, NOT official rules.
- Implementation status per card: ● fully playable, ◐ partly automated, ○ text only (the game shows the text but does not perform it). Cards marked ○ play like vanilla cards.
- Sell tags are not on the website, so Gear/Programs are assumed sellable and Units not (the starter decks match this). Check against your physical cards.
- Rebuild the single file + zip with `tools/build.sh`.

## Progression (starter pick, Eddies, packs)
- First launch: choose one of the two starter decks. It is tied to a random player ID stored in the browser (`nctcg.profile`).
- Winning a Quick match or a builder match earns €$: Learner +1, Standard +5, Sharp +15 (the tutorial pays nothing).
- A pack costs 10 €$ and holds 12 cards (6 Common, 3 Uncommon, 2 Rare+, 1 wildcard). Layout and odds are this tool's own balance (`www/js/profile.js`).
- Decks can only use owned cards (max 3 copies, owned Legends only). The Rival is unrestricted.
- Profile & backup on the menu gives a save code to move progress between devices. Progress is local and honor-system.
- Tests: `node test/profile.test.mjs`, `node test/profile.ui.mjs`.
