# Cornhole Tournament Manager

Runs a cornhole tournament from pool play through a single-elimination bracket. It also drives a TV dashboard that shows every board, the players on it, who's up next, and a big **Now Calling** pop-up when a team is sent to a board.

## Opening it

**Web address:** <https://dwindham55.github.io/Bracket-system/>

Type or paste that into Chrome, Edge, Safari or Firefox. There's nothing to install and no account to sign in to. The page is free and stays up with no server to look after.

> **Good to know:** a tournament saves on the computer and browser it was entered on. Use the same laptop for the whole event. To move a tournament to another computer, use **Setup → Download backup** there and **Restore from backup** on the new one.

**Without internet:** download this project (on GitHub: green **Code** button → **Download ZIP**), unzip it, and double-click `index.html`. It works the same way.

## Tournament day

1. **Setup**: type the tournament name, the number of boards, the number of pools, and the most teams per pool.
2. **Teams**: type in Player 1 and Player 2 for each team. A team name is optional. Each team gets a number (#1, #2, …) automatically. You can also paste a whole list, one team per line, like `Dave Smith, Tripp Jones`.
3. **Pools**: press **Auto-fill pools**. Teams are spread evenly. Pools don't have to be full, and games for empty spots are skipped.
4. Press **📺 Open TV dashboard** at the top right. Drag the new window onto the TV and press **Full screen**. Press **Turn on sound** if you want a chime and a spoken call ("Now calling to Board 3: team 7, Dave and Tripp…").
5. **Boards & Queue**: press **Fill open boards**. When a game ends, press **Enter score** on that board. The next game is called to that board automatically and pops up on the TV.
6. **Bracket**: when the pools are done, press **Create bracket**. Keep entering scores the same way until there's a champion.

Pressed the wrong thing? **↶ Undo** at the top reverses it.

Teams that show up late can be added at any time and put into a pool. Their games join the line, and games already played are kept.

### Optional: check-in
If you enter teams ahead of time but aren't sure everyone will show up, turn on **Use check-in** on the Setup page. Then tick *Here* for each team as they arrive. Teams that aren't marked here won't be called to a board.

## How it scores

- **Pool game order** matches the printed pool sheets: A–B, C–D, A–E, B–C, A–D, D–E, A–C, D–B, C–E, B–E. Games with a missing team are dropped. Pools larger than 5 play a full round-robin.
- **Point differential**: the winner gets `+ (winner − loser)` and the loser gets the negative. You can cap it per game on the Setup page.
- **Pool ranking**: wins → head-to-head (when exactly two teams are tied) → point differential → points scored.
- **Bracket seeding**: pool winners first, then runners-up, and so on. Within each group: win %, then differential per game, then points scored. Wildcards are the best of the rest. Top seeds get byes when the field isn't 4, 8, 16 or 32. You can reorder the seeds before creating the bracket.

## For whoever maintains this

There's no server and no build step. It is plain HTML, CSS and JavaScript, hosted free by GitHub Pages from this repository. To turn hosting on (one time): repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**, choose the default branch and the `/ (root)` folder, then **Save**. Changes pushed to that branch go live within a minute or two.

| File | What it is |
|---|---|
| `index.html`, `js/admin.js`, `css/app.css` | Control page |
| `dashboard.html`, `js/dashboard.js`, `css/dashboard.css` | TV dashboard |
| `js/logic.js` | Tournament rules: teams, pools, scheduling, standings, bracket |
| `js/store.js` | Saving in the browser and syncing the two windows |
| `js/shared.js` | Display helpers used by both pages |
| `tests/` | Rule tests: `npm test` (Node 18+) |
