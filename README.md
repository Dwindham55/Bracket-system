# Cornhole Tournament Manager

Runs a cornhole tournament from pool play through a single-elimination bracket. It also drives a TV dashboard that shows every board, who's up next, and a big **Now Calling** pop-up when a game is sent to a board.

You don't install anything. It runs in Chrome, Edge, Firefox or Safari on one laptop.

## Running it

1. Download this folder (on GitHub: **Code → Download ZIP**, then unzip).
2. Double-click `index.html`. This is the **control page** the tournament director uses.
3. Click **📺 Open TV dashboard**. A second window opens. Drag it onto the TV (laptop on HDMI, display set to *extend*), then click **Full screen**.
4. Click **Turn on sound** on the dashboard if you want a chime and a spoken call ("Now calling to Board 3…"). Browsers need one click before a page can play sound.

The dashboard updates by itself whenever anything changes on the control page.

Everything saves automatically in the browser. Closing it or losing power won't lose anything. Use **Settings → Download backup** now and then anyway.

If your browser has trouble with the pages as plain files, run `python3 -m http.server 8000` in this folder and open <http://localhost:8000>.

## Tournament day

**Before the event**
- **Settings**: set the tournament name and number of boards. Rename the boards to match their signs if you like.
- **Teams**: enter the teams you already know. Use *Add many at once* and paste one team per line, leaving them **not checked in**.

**As people arrive**
- **Teams**: tick *Here* for each team that shows up. Walk-ups can be added any time and are checked in automatically.
- **Pools**: set the number of pools and the max teams per pool, then click **Auto-fill pools**. You can also add teams to a pool by hand, or move them up and down to change their letter.

**Pool play**
- Pools use the same game order as the printed sheets: A–B, C–D, A–E, B–C, A–D, D–E, A–C, D–B, C–E, B–E. Games involving a missing team are dropped, so a 4-team pool plays 6 games and a 3-team pool plays 3. Pools larger than 5 get a full round-robin.
- **Boards & Queue**: click **Fill open boards**. Each open board gets the next game whose teams are both checked in and not already playing. The TV pops up each call.
- When a game finishes, click **Enter score** on that board. With *auto-call* on, the board gets its next game right away and the TV announces it.
- You can also pick a specific game for a board, re-announce a game, cancel a game back into the queue, or edit any earlier score.
- A team that arrives late can still join a pool mid-tournament. Its games are added to the queue, and finished games are kept.

**Standings**
- Total point differential: the winner gets `+ (winner − loser)` and the loser gets the negative. You can set a per-game cap in Settings.
- Ranking within a pool: wins → head-to-head (when exactly two teams are tied) → point differential → points scored.

**Bracket**
- **Bracket tab**: choose how many teams advance from each pool and how many wildcards to add (the best of the remaining teams).
- Seeding puts pool winners first, then runners-up, and so on. Within each group it uses win %, then differential per game, then points scored, because pools can be different sizes. Top seeds get byes when the field isn't 4/8/16/32. You can reorder, add or remove seeds before clicking **Create bracket**.
- Bracket games go into the same board queue and are announced the same way. Winners advance automatically, and the champion shows on the TV.

**Undo** in the header reverses your last change.

## Files

| File | What it is |
|---|---|
| `index.html`, `js/admin.js`, `css/app.css` | Control page |
| `dashboard.html`, `js/dashboard.js`, `css/dashboard.css` | TV dashboard |
| `js/logic.js` | Tournament rules: pools, scheduling, standings, bracket |
| `js/store.js` | Saving and syncing between the two windows |
| `js/shared.js` | Display helpers used by both pages |
| `tests/` | Rule tests: run `npm test` (Node 18+) |
