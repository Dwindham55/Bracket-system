# Cornhole Tournament Manager

Runs a cornhole tournament from pool play through a single-elimination bracket. It also drives a TV dashboard that shows every board, the players on it, who's up next, and a big **Now Calling** pop-up when a team is sent to a board.

## Opening it

**Web address:** <https://dwindham55.github.io/Bracket-system/>

Type or paste that into Chrome, Edge, Safari or Firefox. There's nothing to install and no account to sign in to. The page is free and stays up with no server to look after.

> **Good to know:** a tournament saves on the computer and browser it was entered on. Use the same laptop for the whole event. To move a tournament to another computer, use **Setup → Download backup** there and **Restore from backup** on the new one.

**Without internet:** download this project (on GitHub: green **Code** button → **Download ZIP**), unzip it, and double-click `index.html`. It works the same way.

## Tournament day

1. **Setup**: type the tournament name and the number of boards. If teams come from different churches, tick **Teams belong to a church or group**, enter how many, and type their names.
2. **Players** *(optional)*: if people sign up on their own, enter everyone here (or paste a list). Then tick two names and press **Make a team**, or press **Pair everyone at random** (it can keep churches together). Each pair goes onto the Teams page automatically.
3. **Teams**: if people come as pairs, type Player 1 and Player 2 here instead. A team name is optional. Each team gets a number (#1, #2, …). Pick the church from the drop-down.
4. **Pools**: choose how many teams go to the **championship bracket** (it suggests one), then press **Use this** on the recommended setup. It picks the number of pools and how many teams advance so the bracket is exactly full with **no byes**. Every pool has at least 3 teams, and some pools may have one fewer team (one less game). Teams from the same church are spread across pools.
5. Press **📺 Open TV dashboard** at the top right. Drag the new window onto the TV and press **Full screen**. Press **Turn on sound** if you want a chime and a spoken call.
6. **Boards & Queue**: press **Fill open boards**. When a game ends, press **Enter score** on that board. The next game is called automatically and pops up on the TV.
7. **Bracket**: when pools are done, press **Create bracket**. Keep entering scores the same way until there's a champion.

Names show as first name plus last initial ("Dave W.") along with the team number, so they're easy to read on the TV. The full names are kept on the Teams and Players pages.

Pressed the wrong thing? **↶ Undo** at the top reverses it.

Teams that show up late can be added at any time and put into a pool. Their games join the line, and games already played are kept.

### Churches / groups
Every team still plays for itself. With groups turned on, each team shows its church on the boards and the TV. The Teams page and the TV also show **Church standings**: total wins, losses and point differential for each church.

### Optional: check-in
If you enter teams ahead of time but aren't sure everyone will show up, turn on **Use check-in** on the Setup page and tick *Here* for each team as they arrive. Teams that aren't marked here won't be called to a board.

## How it scores

- **Pool game order** matches the printed pool sheets: A–B, C–D, A–E, B–C, A–D, D–E, A–C, D–B, C–E, B–E. Games with a missing team are dropped. Pools larger than 5 play a full round-robin.
- **Point differential**: the winner gets `+ (winner − loser)` and the loser gets the negative. You can cap it per game on the Setup page.
- **Pool ranking**: wins → head-to-head (when exactly two teams are tied) → point differential → points scored.
- **Recommended pools**: for the bracket size you pick, it tries every number of pools that keeps each pool at 3 or more teams. It prefers splits where the same number advance from each pool with no wildcards, and pools of about 4 teams. Example: 31 teams with an 8-team bracket gives 8 pools (seven of 4, one of 3), and each pool winner advances.
- **Bracket seeding**: pool winners first, then runners-up, and so on. Within each group: win %, then differential per game, then points scored. Wildcards are the best of the rest. Top seeds get byes when the field isn't 4, 8, 16 or 32. You can reorder the seeds before creating the bracket.

## For whoever maintains this

There's no server and no build step. It is plain HTML, CSS and JavaScript, hosted free by GitHub Pages from this repository. To turn hosting on (one time): repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**, choose the default branch and the `/ (root)` folder, then **Save**. Changes pushed to that branch go live within a minute or two.

| File | What it is |
|---|---|
| `index.html`, `js/admin.js`, `css/app.css` | Control page |
| `dashboard.html`, `js/dashboard.js`, `css/dashboard.css` | TV dashboard |
| `js/logic.js` | Tournament rules: players, teams, churches, pool planner, scheduling, standings, bracket |
| `js/store.js` | Saving in the browser and syncing the two windows |
| `js/shared.js` | Display helpers used by both pages |
| `tests/` | Rule tests: `npm test` (Node 18+) |
