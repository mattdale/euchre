# 🃏 Euchre 

A (slightly spicy) Euchre game built for fun.

## ✨ Features
- **AI Opponents:** Play alongside and against computer-controlled players that understand the nuances of Euchre strategy (set to Intense mode by default).
- **Classic Rules:** Supports the classic mechanics: Stick the Dealer, Going Alone, and standard trump bidding phases.
- **Picks Up Where You Left Off:** Settings are remembered, and a reload resumes your game from the last completed hand.
- **Your Record:** Wins, streaks, euchres, marches and loners live in Settings.
- **Keyboard & Screen Reader Friendly:** Arrow keys and Enter (or 1–6) play cards; every card, dialog and score has a spoken label. Respects "reduce motion".
- **No Dependencies:** Built with pure vanilla HTML, CSS, and JavaScript. No build steps, frameworks or third-party scripts.

## 🚀 How to Run
Since it's built with vanilla web technologies, you don't need any complex setup to get started:

1. Clone or download the repository to your local machine.
2. Open `index.html` in a browser.
3. *Optional:* Use a simple local server (like VS Code Live Server or python's `http.server`) if you want to avoid local file restrictions.

## ⌨️ Keyboard
| Key | Does |
| --- | --- |
| Tab / Shift+Tab | Move between buttons |
| ← → | Move between cards in your hand |
| Enter / Space | Play or discard the focused card, press the focused button |
| 1–6 | Play or discard that card, counting from the left |
| Esc | Close Settings without saving |

## 🧪 Tests
The rules engine (`rules.js`) and persistence (`storage.js`) are plain functions with no DOM, tested with Node's built-in runner:

```sh
npm test        # unit tests
npm run check   # syntax-check every script, then run the tests
```

CI runs `npm run check` on every push and pull request. Add `?debug` to the URL to see the turn-by-turn log in the console.

## 🛠️ Built With
- **HTML5 & CSS3**
- **Vanilla JavaScript:** All game logic, AI decision-making, and DOM manipulation are handled natively without external libraries.
  - `rules.js`: pure Euchre rules (follow suit, bowers, trick winner, scoring)
  - `storage.js`: validated localStorage for settings, saved game and stats
  - `game.js`: game flow, AI and UI
  
## 🙏 Acknowledgments
- **[Phosphor Icons](https://phosphoricons.com/)** - For the beautiful icon set used throughout the game.
- **[Lucide Icons](https://lucide.dev/)** - For additional UI icons and inspiration.
- **GIFs & Assets:** Credit to the respective creators on Giphy and Tenor.
---
