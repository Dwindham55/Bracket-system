/* The tournament director's page: teams, pools, boards, scores and bracket. */
(function () {
  'use strict';

  const L = window.Logic;
  const U = window.UI;
  const esc = U.esc;
  const store = window.Store.createAdminStore(L);
  const $ = (sel, el = document) => el.querySelector(sel);

  const TABS = [
    ['setup', '1. Setup'],
    ['players', '2. Players'],
    ['teams', '3. Teams'],
    ['pools', '4. Pools'],
    ['live', '5. Boards & Queue'],
    ['bracket', '6. Bracket'],
  ];

  let tab = store.state.teams.length ? 'live' : 'setup';
  try {
    const saved = localStorage.getItem('cornhole-admin-tab');
    if (saved && TABS.some(([id]) => id === saved)) tab = saved;
  } catch (e) {}
  // Seed order the director has hand-edited on the Bracket tab, or null to
  // follow the live standings.
  let seedDraft = null;
  let refocus = null;
  let addChecked = true;
  let addGroup = '';
  let playerGroup = '';
  let picked = [];
  let planSize = 0;

  // ---------- helpers ----------

  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.className = ''), isError ? 5000 : 2500);
  }

  const FAILED = Symbol('failed');

  // Apply a change; show the error and return FAILED if it is rejected.
  function act(fn, okMsg) {
    try {
      const r = store.update(fn);
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      return r;
    } catch (e) {
      toast(e.message, true);
      render();
      return FAILED;
    }
  }

  const options = (items, selected) =>
    items.map(([v, label]) => '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(label) + '</option>').join('');

  function minutesSince(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m + ' min';
  }

  function scoreText(g) {
    if (g.status !== 'done') return '';
    const w = g.winner === g.teamA ? [g.scoreA, g.scoreB] : [g.scoreB, g.scoreA];
    return w[0] + '–' + w[1];
  }

  // ---------- header ----------

  function renderHeader(s) {
    document.title = s.name + ' · Control';
    $('#tname').textContent = s.name;
    const here = s.settings.useCheckIn ? ' (' + s.teams.filter((t) => t.checkedIn).length + ' checked in)' : '';
    const poolGames = s.games.filter((g) => g.stage === 'pool' && g.status !== 'skipped');
    const done = poolGames.filter((g) => g.status === 'done').length;
    const inUse = s.boards.length - L.freeBoards(s).length;
    $('#summary').textContent =
      s.teams.length + ' teams' + here + ' · ' + done + '/' + poolGames.length + ' pool games · ' +
      inUse + '/' + s.boards.length + ' boards in use';
    $('#tabs').innerHTML = TABS.map(
      ([id, label]) => '<button data-act="tab" data-id="' + id + '" class="' + (id === tab ? 'on' : '') + '">' + label + '</button>'
    ).join('');
    $('#undo').disabled = !store.canUndo();
  }

  // ---------- Boards & Queue ----------

  function renderLive(s) {
    const q = L.queue(s);
    const ready = q.filter((x) => x.ready);
    const readyOpts = ready.map((x) => [x.game.id, U.teamName(s, x.game.teamA) + ' vs ' + U.teamName(s, x.game.teamB) + ' — ' + U.gameStage(s, x.game)]);
    const free = L.freeBoards(s);

    let html =
      '<div class="toolbar">' +
      '<label class="switch"><input type="checkbox" data-change="autoCall"' + (s.settings.autoCall ? ' checked' : '') +
      '> Auto-call the next game when a score is entered</label>' +
      '<button class="primary" data-act="fill"' + (free.length && ready.length ? '' : ' disabled') + '>Fill open boards (' + Math.min(free.length, ready.length) + ')</button>' +
      '</div>';

    html += '<div class="boards">';
    for (const b of s.boards) {
      const g = L.gameOnBoard(s, b.id);
      if (g) {
        html +=
          '<div class="board busy"><div class="board-head"><h3>' + esc(b.name) + '</h3><span class="muted">' + minutesSince(g.calledAt) + '</span></div>' +
          '<div class="stage">' + esc(U.gameStage(s, g)) + '</div>' +
          '<div class="teams">' + U.teamBlock(s, g.teamA) + '<div class="vs">vs</div>' + U.teamBlock(s, g.teamB) + '</div>' +
          '<div class="actions"><button class="primary" data-act="score" data-id="' + g.id + '">Enter score</button>' +
          '<button data-act="announce" data-id="' + g.id + '" title="Show the pop-up on the TV again">Re-announce</button>' +
          '<button class="ghost" data-act="unassign" data-id="' + g.id + '" title="Take this game off the board and put it back in the queue">Cancel</button></div></div>';
      } else {
        html +=
          '<div class="board open"><div class="board-head"><h3>' + esc(b.name) + '</h3><span class="tag ok">Open</span></div>' +
          (ready.length
            ? '<div class="actions"><button class="primary" data-act="callNext" data-id="' + b.id + '">Call next game</button></div>' +
              '<div class="pick"><select id="sel-' + b.id + '"><option value="">…or choose a game</option>' + options(readyOpts) +
              '</select><button data-act="callSel" data-id="' + b.id + '">Call</button></div>'
            : '<p class="muted">No games ready to call.</p>') +
          '</div>';
      }
    }
    html += '</div>';

    html += '<div class="cols"><section><h2>Up next <span class="muted">(' + q.length + ' waiting)</span></h2>';
    if (!q.length) {
      html += '<p class="muted">' + (s.games.length ? 'Nothing waiting.' : 'Add teams to pools to build the schedule.') + '</p>';
    } else {
      html += '<div class="table-scroll"><table class="list"><thead><tr><th>#</th><th>Game</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>';
      q.slice(0, 60).forEach((x, i) => {
        const g = x.game;
        html +=
          '<tr class="' + (x.ready ? '' : 'waiting') + '"><td class="num">' + (i + 1) + '</td><td>' + esc(U.gameStage(s, g)) + '</td><td>' + U.matchup(s, g) +
          '</td><td>' + (x.ready ? '<span class="tag ok">Ready</span>' : '<span class="tag">' + esc(x.reason) + '</span>') + '</td><td class="row-actions">' +
          (g.teamA && g.teamB && free.length
            ? '<select id="to-' + g.id + '">' + options(free.map((b) => [b.id, b.name])) + '</select><button data-act="callTo" data-id="' + g.id + '">Call</button>'
            : '') +
          (g.teamA && g.teamB ? '<button class="ghost" data-act="score" data-id="' + g.id + '" title="Enter a score without putting it on a board">Score</button>' : '') +
          '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</section><section><h2>Recent results</h2>';
    const recent = s.games.filter((g) => g.status === 'done').sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 15);
    if (!recent.length) html += '<p class="muted">No games finished yet.</p>';
    else {
      html += '<table class="list"><tbody>';
      for (const g of recent) {
        html +=
          '<tr><td>' + esc(U.gameStage(s, g)) + '</td><td><b>' + esc(U.teamName(s, g.winner)) + '</b> def. ' +
          esc(U.teamName(s, g.winner === g.teamA ? g.teamB : g.teamA)) + '</td><td class="num">' + scoreText(g) +
          '</td><td class="row-actions"><button class="ghost" data-act="score" data-id="' + g.id + '">Edit</button></td></tr>';
      }
      html += '</tbody></table>';
    }
    return html + '</section></div>';
  }

  // ---------- Teams ----------

  function renderTeams(s) {
    const records = new Map();
    for (const p of s.pools) for (const r of L.poolStandings(s, p.id)) records.set(r.teamId, r);
    const poolOpts = [['', '— none —'], ...s.pools.map((p) => [p.id, p.name])];
    const checkIn = s.settings.useCheckIn;
    const groups = s.settings.useGroups;
    const groupOpts = [['', '— none —'], ...s.groups.map((g) => [g.id, g.name])];

    let html =
      '<section><h2>Add a team</h2>' +
      '<form class="add-team" data-form="addTeam">' +
      '<label class="field">Player 1<input id="newP1" placeholder="e.g. Dave Smith" autocomplete="off"></label>' +
      '<label class="field">Player 2<input id="newP2" placeholder="e.g. Tripp Jones" autocomplete="off"></label>' +
      '<label class="field">Team name <span class="muted">(optional)</span><input id="newName" placeholder="e.g. Bag Slingers" autocomplete="off"></label>' +
      (groups ? '<label class="field">Church / group<select id="newGroup">' + options(groupOpts, addGroup) + '</select></label>' : '') +
      (checkIn ? '<label><input type="checkbox" id="newHere"' + (addChecked ? ' checked' : '') + '> Here now</label>' : '') +
      '<button class="primary big">Add team #' + (Math.max(0, ...s.teams.map((t) => t.number)) + 1) + '</button></form>' +
      '<details><summary>Paste a list of teams</summary><form data-form="addBulk">' +
      '<p class="muted">One team per line, players separated by a comma. Examples:<br><code>Dave Smith, Tripp Jones</code><br><code>Bag Slingers: Chris, Stewart</code></p>' +
      '<textarea id="bulk" rows="8" placeholder="Dave Smith, Tripp Jones"></textarea>' +
      (checkIn ? '<label><input type="checkbox" id="bulkHere"> Mark these as here</label>' : '') +
      ' <button>Add all</button></form></details>' +
      '<p class="muted">Every team gets a number automatically. You can add teams any time, even after games have started.</p></section>';

    if (groups && s.groups.length) html += '<section><h2>Church standings</h2><div class="group-table">' + U.groupTable(s) + '</div></section>';
    html += '<section><div class="section-head"><h2>Teams (' + s.teams.length + ')</h2><input type="search" id="teamFilter" placeholder="Search names"></div>';
    if (!s.teams.length) return html + '<p class="muted">No teams yet.</p></section>';
    html += '<div class="table-scroll"><table class="list" id="teamTable"><thead><tr><th>#</th>' + (checkIn ? '<th>Here</th>' : '') +
      '<th>Player 1</th><th>Player 2</th><th>Team name</th>' + (groups ? '<th>Church / group</th>' : '') + '<th>Pool</th><th>Record</th><th></th></tr></thead><tbody>';
    const sorted = [...s.teams].sort((a, b) => a.number - b.number);
    for (const t of sorted) {
      const p = L.poolOfTeam(s, t.id);
      const r = records.get(t.id);
      const search = [t.number, t.name, ...t.players].join(' ').toLowerCase();
      const field = (key, value, ph) =>
        '<td><input class="plain" value="' + esc(value || '') + '" placeholder="' + ph + '" data-change="teamField" data-key="' + key + '" data-id="' + t.id + '"></td>';
      html +=
        '<tr data-name="' + esc(search) + '"><td class="num"><b>' + t.number + '</b></td>' +
        (checkIn ? '<td><input type="checkbox" data-change="checkin" data-id="' + t.id + '"' + (t.checkedIn ? ' checked' : '') + '></td>' : '') +
        field('p0', t.players[0], 'Player 1') + field('p1', t.players[1], 'Player 2') + field('name', t.name, '—') +
        (groups ? '<td><select data-change="teamGroup" data-id="' + t.id + '">' + options(groupOpts, t.groupId || '') + '</select></td>' : '') +
        '<td><select data-change="teamPool" data-id="' + t.id + '">' + options(poolOpts, p ? p.id : '') + '</select></td>' +
        '<td class="num">' + (r && r.played ? r.wins + '–' + r.losses + ' (' + U.fmtDiff(r.diff) + ')' : '') + '</td>' +
        '<td class="row-actions"><button class="ghost danger" data-act="delTeam" data-id="' + t.id + '">Remove</button></td></tr>';
    }
    return html + '</tbody></table></div></section>';
  }

  // ---------- Players ----------

  function renderPlayers(s) {
    const groups = s.settings.useGroups;
    const groupOpts = [['', '— none —'], ...s.groups.map((g) => [g.id, g.name])];
    const free = s.players.filter((p) => !L.teamOfPlayer(s, p.id));
    picked = picked.filter((id) => free.some((p) => p.id === id));
    const groupSel = (id) => (groups ? '<label class="field">Church / group<select id="' + id + '">' + options(groupOpts, playerGroup) + '</select></label>' : '');

    let html =
      '<p class="muted">Use this page when people sign up on their own. Enter everyone here, then pair them up. Each pair becomes a team on the Teams page. ' +
      'If people already come as pairs, skip this page and use Teams instead.</p>' +
      '<div class="cols"><section><h2>Add a player</h2>' +
      '<form class="add-team" data-form="addPlayer"><label class="field">Full name<input id="newPlayer" placeholder="e.g. Dave Windham" autocomplete="off"></label>' +
      groupSel('playerGroup') + '<button class="primary big">Add player</button></form>' +
      '<details><summary>Paste a list of players</summary><form data-form="addPlayers"><p class="muted">One name per line.</p>' +
      '<textarea id="bulkPlayers" rows="8" placeholder="Dave Windham"></textarea>' + groupSel('bulkPlayerGroup') + ' <button>Add all</button></form></details>' +
      '</section><section><h2>Not on a team yet (' + free.length + ')</h2>';
    if (!free.length) html += '<p class="muted">' + (s.players.length ? 'Everyone is on a team.' : 'No players yet.') + '</p>';
    else {
      html += '<div class="toolbar"><button class="primary" data-act="pairPicked"' + (picked.length === 2 ? '' : ' disabled') + '>Make a team from the 2 ticked (' + picked.length + '/2)</button>' +
        '<button data-act="autoPair"' + (free.length >= 2 ? '' : ' disabled') + '>Pair everyone at random</button>' +
        (groups ? '<label><input type="checkbox" id="pairSameGroup" checked> keep churches together</label>' : '') + '</div>';
      html += '<div class="table-scroll"><table class="list"><thead><tr><th></th><th>Name</th><th>Shows as</th>' + (groups ? '<th>Church / group</th>' : '') + '<th></th></tr></thead><tbody>';
      for (const p of free) {
        html +=
          '<tr class="' + (picked.includes(p.id) ? 'picked' : '') + '"><td><input type="checkbox" data-change="pick" data-id="' + p.id + '"' + (picked.includes(p.id) ? ' checked' : '') + '></td>' +
          '<td><input class="plain" value="' + esc(p.name) + '" data-change="playerName" data-id="' + p.id + '"></td><td class="muted">' + esc(L.shortName(p.name)) + '</td>' +
          (groups ? '<td><select data-change="playerGroupOf" data-id="' + p.id + '">' + options(groupOpts, p.groupId || '') + '</select></td>' : '') +
          '<td class="row-actions"><button class="icon danger" data-act="delPlayer" data-id="' + p.id + '" title="Remove">✕</button></td></tr>';
      }
      html += '</tbody></table></div>';
    }
    const made = s.teams.filter((t) => t.playerIds.length).sort((a, b) => a.number - b.number);
    if (made.length) {
      html += '<h2>Teams made here (' + made.length + ')</h2><table class="list"><tbody>' +
        made.map((t) => '<tr><td class="num"><b>#' + t.number + '</b></td><td>' + esc(t.players.join(' & ')) + '</td><td class="muted">' + esc(U.groupName(s, t.id)) +
          '</td><td class="row-actions"><button class="ghost" data-act="splitTeam" data-id="' + t.id + '">Split up</button></td></tr>').join('') +
        '</tbody></table>';
    }
    return html + '</section></div>';
  }

  // ---------- Pools ----------

  function describePlan(p, boards) {
    const counts = new Map();
    for (const n of p.sizes) counts.set(n, (counts.get(n) || 0) + 1);
    const split = [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([n, c]) => c + ' of ' + n).join(', ');
    const rounds = Math.ceil(p.games / Math.max(1, boards));
    return {
      title: p.pools + ' pool' + (p.pools === 1 ? '' : 's') + ' (' + split + ' teams)',
      detail: 'Top ' + p.advance + ' from each pool' + (p.wildcards ? ' + ' + p.wildcards + ' wildcard' + (p.wildcards === 1 ? '' : 's') : '') +
        ' → full ' + p.bracketSize + '-team bracket, no byes · ' + p.games + ' pool games, about ' + rounds + ' rounds on ' + boards + ' boards · ' +
        (p.minSize === p.maxSize ? p.minSize - 1 : p.minSize - 1 + '–' + (p.maxSize - 1)) + ' pool games per team',
    };
  }

  function renderPlanner(s) {
    const teamCount = s.teams.filter((t) => !s.settings.useCheckIn || t.checkedIn).length;
    if (teamCount < 6) return '<section class="planner card"><h2>Recommended setup</h2><p class="muted">Add at least 6 teams to get a recommendation.</p></section>';
    const sizes = [];
    for (let n = 2; n <= teamCount / 2; n *= 2) sizes.push(n);
    const suggested = L.suggestedBracketSize(teamCount);
    if (!sizes.includes(planSize)) planSize = sizes.includes(s.settings.bracketSize) ? s.settings.bracketSize : suggested;
    const plans = L.planPools(teamCount, planSize).slice(0, 3);
    let html =
      '<section class="planner card"><div class="section-head"><h2>Recommended setup for ' + teamCount + ' teams</h2>' +
      '<label>Teams in the championship bracket <select data-change="planSize">' +
      options(sizes.map((n) => [String(n), n + (n === suggested ? ' (suggested)' : '')]), String(planSize)) + '</select></label></div>';
    if (!plans.length) return html + '<p class="muted">No even split works for that bracket size. Try another size.</p></section>';
    plans.forEach((p, i) => {
      const d = describePlan(p, s.boards.length);
      const current = p.pools === s.pools.length && p.advance === s.settings.advancePerPool && p.wildcards === s.settings.wildcards && p.maxSize === s.settings.maxPoolSize;
      html +=
        '<div class="plan' + (i === 0 ? ' best' : '') + '"><div><b>' + (i === 0 ? '★ Best: ' : '') + esc(d.title) + '</b><div class="muted">' + esc(d.detail) + '</div></div>' +
        (current ? '<span class="tag ok">In use</span>' : '<button class="' + (i === 0 ? 'primary' : '') + '" data-act="usePlan" data-i="' + i + '">Use this</button>') + '</div>';
    });
    return html + '<p class="muted">"Use this" sets the pools and the bracket rules, then spreads the teams out' +
      (s.settings.useGroups ? ', keeping teams from the same church apart where possible' : '') + '. It only works before pool games start.</p></section>';
  }

  function renderPools(s) {
    const assigned = new Set(s.pools.flatMap((p) => p.teamIds));
    const unassigned = s.teams.filter((t) => !assigned.has(t.id));
    const unOpts = unassigned.map((t) => [t.id, U.teamName(s, t.id) + (s.settings.useCheckIn && !t.checkedIn ? ' (not checked in)' : '')]);

 let html = renderPlanner(s) +
      '<div class="toolbar">' +
      '<label>Pools <input type="number" min="1" max="32" class="short" value="' + s.settings.poolCount + '" data-change="poolCount"></label>' +
      '<label>Teams per pool (most) <input type="number" min="2" max="12" class="short" value="' + s.settings.maxPoolSize + '" data-change="maxPool"></label>' +
      '<button class="primary" data-act="autoAssign"' + (unassigned.length ? '' : ' disabled') + '>Auto-fill pools</button>' +
      (s.settings.useCheckIn ? '<label><input type="checkbox" id="autoHere" checked> checked-in teams only</label>' : '') + '</div>';

    html += '<div class="unassigned"><b>Not in a pool (' + unassigned.length + '):</b> ' +
      (unassigned.length
        ? unassigned.map((t) => '<span class="chip' + (s.settings.useCheckIn && !t.checkedIn ? ' away' : '') + '">' + esc(U.teamName(s, t.id)) + '</span>').join(' ')
        : '<span class="muted">everyone is placed</span>') + '</div>';

    html += '<div class="pools">';
    for (const p of s.pools) {
      const games = s.games.filter((g) => g.stage === 'pool' && g.poolId === p.id).sort((a, b) => a.order - b.order);
      const done = games.filter((g) => g.status === 'done').length;
      html +=
        '<div class="pool card"><div class="board-head"><input class="plain h3" value="' + esc(p.name) + '" data-change="poolName" data-id="' + p.id + '">' +
        '<span class="muted">' + p.teamIds.length + '/' + s.settings.maxPoolSize + ' teams · ' + done + '/' + games.length + ' games</span></div>';
      html += '<ol class="pool-teams">';
      p.teamIds.forEach((id, i) => {
        const t = L.team(s, id);
        html +=
          '<li><span class="letter">' + L.LETTERS[i] + '</span><span class="name' + (s.settings.useCheckIn && !t.checkedIn ? ' away' : '') + '">' + esc(U.teamName(s, id)) + '</span>' +
          '<span class="row-actions"><button class="icon" data-act="poolMove" data-id="' + id + '" data-pool="' + p.id + '" data-dir="-1" title="Move up">↑</button>' +
          '<button class="icon" data-act="poolMove" data-id="' + id + '" data-pool="' + p.id + '" data-dir="1" title="Move down">↓</button>' +
          '<button class="icon danger" data-act="poolRemove" data-id="' + id + '" title="Take out of pool">✕</button></span></li>';
      });
      html += '</ol>';
      if (unassigned.length && p.teamIds.length < s.settings.maxPoolSize) {
        html += '<select data-change="poolAdd" data-id="' + p.id + '"><option value="">+ Add a team…</option>' + options(unOpts) + '</select>';
      }
      if (p.teamIds.length) html += U.standingsTable(s, p.id, { letters: true });
      if (games.length) {
        html += '<table class="list games"><tbody>';
        for (const g of games) {
          const status =
            g.status === 'done' ? '<b>' + esc(U.letterOf(s, p.id, g.winner)) + '</b> ' + scoreText(g)
            : g.status === 'called' ? '<span class="tag live">' + esc(U.boardName(s, g.boardId)) + '</span>'
            : g.status === 'skipped' ? '<span class="muted">skipped</span>' : '';
          html +=
            '<tr class="clickable" data-act="score" data-id="' + g.id + '"><td class="pair">' + U.letterOf(s, p.id, g.teamA) + '–' + U.letterOf(s, p.id, g.teamB) +
            '</td><td>' + U.matchup(s, g) + '</td><td class="num">' + status + '</td></tr>';
        }
        html += '</tbody></table>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  // ---------- Bracket ----------

  function currentSeeds(s) {
    const { seeds, others } = L.seedCandidates(s);
    const info = new Map([...seeds, ...others].map((r) => [r.teamId, r]));
    const ids = seedDraft ? seedDraft.filter((id) => L.team(s, id)) : seeds.map((r) => r.teamId);
    return { ids, info };
  }

  function renderBracket(s) {
    if (s.bracket) {
      let html = '<div class="toolbar">';
      if (s.bracket.championId) html += '<div class="champ-banner">🏆 Champion: ' + esc(U.teamName(s, s.bracket.championId)) + '</div>';
      html += '<span class="muted">Click a match to enter or fix its score.</span>' +
        '<button class="ghost danger" data-act="resetBracket">Reset bracket</button></div>';
      return html + '<div class="bracket-wrap">' + U.bracketHTML(s, { clickable: true }) + '</div>';
    }

    const poolGames = s.games.filter((g) => g.stage === 'pool');
    const left = poolGames.filter((g) => g.status !== 'done').length;
    const { ids, info } = currentSeeds(s);
    const size = ids.length > 1 ? Math.pow(2, Math.ceil(Math.log2(ids.length))) : 0;

    let html =
      '<div class="toolbar">' +
      '<label>Teams advancing from each pool <input type="number" min="0" max="12" class="short" value="' + s.settings.advancePerPool + '" data-change="advance"></label>' +
      '<label>Wildcards (best of the rest) <input type="number" min="0" max="64" class="short" value="' + s.settings.wildcards + '" data-change="wildcards"></label>' +
      '</div>';
    html += '<p class="' + (left ? 'warn' : 'muted') + '">' +
      (left ? left + ' of ' + poolGames.length + ' pool games are not finished. Seeds below use the standings so far.' : 'All pool games are finished.') +
      '</p>';
    html += '<p class="muted">Seeding: pool winners first, then runners-up, and so on. Within each group: win %, then point differential per game, then points scored. ' +
      'Byes go to the top seeds when the field is not a power of two. You can reorder before creating the bracket.</p>';

    html += '<section><div class="section-head"><h2>Seeds (' + ids.length + (size ? ' teams, ' + size + '-team bracket, ' + (size - ids.length) + ' byes' : '') + ')</h2>' +
      (seedDraft ? '<button class="ghost" data-act="seedReset">Reset to standings order</button>' : '') + '</div>';
    html += '<table class="list"><thead><tr><th>Seed</th><th>Team</th><th>Pool</th><th>Record</th><th>Diff</th><th></th></tr></thead><tbody>';
    ids.forEach((id, i) => {
      const r = info.get(id);
      const p = L.poolOfTeam(s, id);
      html +=
        '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(U.teamName(s, id)) + (r && r.wildcard && !seedDraft ? ' <span class="tag">wildcard</span>' : '') +
        '</td><td>' + (p ? esc(p.name) + (r ? ' #' + r.poolRank : '') : '') + '</td><td class="num">' + (r ? r.wins + '–' + r.losses : '') +
        '</td><td class="num">' + (r ? U.fmtDiff(r.diff) : '') + '</td><td class="row-actions">' +
        '<button class="icon" data-act="seedMove" data-i="' + i + '" data-dir="-1">↑</button>' +
        '<button class="icon" data-act="seedMove" data-i="' + i + '" data-dir="1">↓</button>' +
        '<button class="icon danger" data-act="seedRemove" data-i="' + i + '">✕</button></td></tr>';
    });
    html += '</tbody></table>';
    const rest = s.teams.filter((t) => !ids.includes(t.id));
    if (rest.length) {
      html += '<select data-change="seedAdd"><option value="">+ Add a team to the bracket…</option>' + options(rest.map((t) => [t.id, U.teamName(s, t.id)])) + '</select>';
    }
    html += '<div class="toolbar"><button class="primary big" data-act="createBracket"' + (ids.length >= 2 ? '' : ' disabled') + '>Create bracket</button></div></section>';
    return html;
  }

  // ---------- Setup ----------

  function renderSetup(s) {
    const num = (label, key, value, min, max, help) =>
      '<label class="field big-field">' + label + '<input type="number" min="' + min + '" max="' + max + '" class="short" value="' + value +
      '" data-change="' + key + '">' + (help ? '<span class="muted">' + help + '</span>' : '') + '</label>';
    let html =
      '<div class="cols"><section><h2>Your tournament</h2>' +
      '<label class="field big-field">Tournament name <input value="' + esc(s.name) + '" data-change="tname"></label>' +
      '<div class="setup-nums">' +
      num('Number of boards', 'boardCount', s.boards.length, 1, 64, 'Sets of boards you are playing on') +
      num('Number of pools', 'poolCount', s.settings.poolCount, 1, 32, 'Groups that play each other first') +
      num('Teams per pool (most)', 'maxPool', s.settings.maxPoolSize, 2, 12, 'Pools can have fewer; unused games are skipped') +
      '</div>' +
      '<h2>Board names</h2><div class="board-names">' +
      s.boards.map((b) => '<input value="' + esc(b.name) + '" data-change="boardName" data-id="' + b.id + '">').join('') +
      '</div><p class="muted">Change these to match the numbers on your boards.</p>' +
      '<h2>Churches / groups</h2>' +
      '<label class="field"><span><input type="checkbox" data-change="useGroups"' + (s.settings.useGroups ? ' checked' : '') +
      '> Teams belong to a church or group</span><span class="muted">Each team still plays for itself; this shows which church it is with and totals the wins for each church.</span></label>' +
      (s.settings.useGroups
        ? num('Number of churches / groups', 'groupCount', s.groups.length, 0, 64) +
          '<div class="board-names">' + s.groups.map((g) => '<input value="' + esc(g.name) + '" data-change="groupName" data-id="' + g.id + '">').join('') + '</div>'
        : '') +
      '<h2>Options</h2>' +
      '<label class="field"><span><input type="checkbox" data-change="useCheckIn"' + (s.settings.useCheckIn ? ' checked' : '') +
      '> Use check-in</span><span class="muted">Turn this on if you enter teams ahead of time and want to mark who actually showed up. Teams not marked "here" are not called to boards.</span></label>' +
      num('Most points one game can add to differential (0 = no limit)', 'diffCap', s.settings.diffCap || 0, 0, 99) +
      '</section>';
    html +=
      '<section><h2>How to run the day</h2><ol class="steps">' +
      '<li><b>Setup</b> (this page): enter boards, pools and teams per pool.</li>' +
      '<li><b>Players</b> <span class="muted">(optional)</span>: if people sign up on their own, enter them here and pair them into teams.</li>' +
      '<li><b>Teams</b>: type in each pair of players. Each team gets a number.</li>' +
      '<li><b>Pools</b>: pick how many teams go to the championship bracket and press <i>Use this</i> on the recommended setup.</li>' +
      '<li>Press <b>📺 Open TV dashboard</b> (top right) and drag that window onto the TV.</li>' +
      '<li><b>Boards &amp; Queue</b>: press <i>Fill open boards</i>. When a game ends, press <i>Enter score</i>. The next game is called automatically.</li>' +
      '<li><b>Bracket</b>: when pools are done, press <i>Create bracket</i> and keep entering scores the same way.</li></ol>' +
      '<p class="muted">Made a mistake? Press <b>↶ Undo</b> at the top.</p>' +
      '<h2>Saving</h2><p class="muted">Everything saves by itself on this computer, in this web browser. ' +
      'To move a tournament to a different computer, download a backup here and restore it there.</p>' +
      '<div class="toolbar"><button data-act="export">Download backup</button><label class="button">Restore from backup<input type="file" accept=".json,application/json" data-change="import" hidden></label></div>' +
      '<h2>Start over</h2><div class="toolbar"><button class="ghost danger" data-act="resetKeepTeams">New tournament, keep team list</button>' +
      '<button class="ghost danger" data-act="resetAll">Erase everything</button></div></section></div>';
    return html;
  }

  // ---------- render ----------

  function render() {
    const s = store.state;
    renderHeader(s);
    const view = { setup: renderSetup, players: renderPlayers, live: renderLive, teams: renderTeams, pools: renderPools, bracket: renderBracket }[tab] || renderLive;
    const main = $('#main');
    const scroll = window.scrollY;
    main.innerHTML = view(s);
    window.scrollTo(0, scroll);
    if (refocus) {
      const el = $(refocus);
      if (el) el.focus();
      refocus = null;
    }
    applyTeamFilter();
  }

  function applyTeamFilter() {
    const f = $('#teamFilter');
    if (!f) return;
    f.value = applyTeamFilter.value || '';
    const v = f.value.trim().toLowerCase();
    document.querySelectorAll('#teamTable tbody tr').forEach((tr) => (tr.hidden = !!v && !tr.dataset.name.includes(v)));
  }

  // ---------- score dialog ----------

  function openScore(gameId) {
    const s = store.state;
    const g = L.game(s, gameId);
    if (!g || !g.teamA || !g.teamB || g.status === 'bye') return;
    const dlg = $('#scoreDialog');
    dlg.dataset.id = g.id;
    $('#scoreStage').textContent = U.gameStage(s, g) + (g.status === 'called' ? ' · ' + U.boardName(s, g.boardId) : '');
    $('#nameA').textContent = U.teamName(s, g.teamA);
    $('#nameB').textContent = U.teamName(s, g.teamB);
    $('#scoreA').value = g.status === 'done' ? g.scoreA : '';
    $('#scoreB').value = g.status === 'done' ? g.scoreB : '';
    $('#clearScore').hidden = g.status !== 'done';
    dlg.showModal();
    $('#scoreA').focus();
  }

  function saveScore(e) {
    e.preventDefault();
    const dlg = $('#scoreDialog');
    const id = dlg.dataset.id;
    const g = L.game(store.state, id);
    const a = $('#scoreA').value.trim();
    const b = $('#scoreB').value.trim();
    if (act((s) => L.recordResult(s, id, a, b)) === FAILED) return;
    dlg.close();
    const w = Number(a) > Number(b) ? g.teamA : g.teamB;
    toast(U.teamName(store.state, w) + ' wins ' + Math.max(a, b) + '–' + Math.min(a, b));
  }

  // ---------- actions ----------

  const confirmIt = (msg) => window.confirm(msg);

  const actions = {
    tab(d) {
      tab = d.id;
      try {
        localStorage.setItem('cornhole-admin-tab', tab);
      } catch (e) {}
      render();
    },
    fill() {
      act((s) => L.fillBoards(s), (n) => n + ' game' + (n === 1 ? '' : 's') + ' called');
    },
    callNext(d) {
      act((s) => {
        const next = L.queue(s).find((x) => x.ready);
        if (!next) throw new Error('No games are ready.');
        L.callGame(s, next.game.id, d.id);
      });
    },
    callSel(d) {
      const gameId = $('#sel-' + d.id).value;
      if (!gameId) return toast('Choose a game first.', true);
      act((s) => L.callGame(s, gameId, d.id));
    },
    callTo(d) {
      const boardId = $('#to-' + d.id).value;
      act((s) => L.callGame(s, d.id, boardId));
    },
    score(d) {
      openScore(d.id);
    },
    announce(d) {
      act((s) => L.announce(s, d.id), 'Announced on the TV');
    },
    unassign(d) {
      act((s) => L.returnToQueue(s, d.id), 'Game put back in the queue');
    },
    delTeam(d) {
      const s = store.state;
      const t = L.team(s, d.id);
      const played = L.playedPoolGames(s, d.id);
      const msg = 'Remove ' + U.teamName(s, t.id) + '?' + (played ? ' Their ' + played + ' finished pool game(s) will be deleted too.' : '');
      if (confirmIt(msg)) act((st) => L.removeTeam(st, d.id), 'Team removed');
    },
    poolMove(d) {
      act((s) => L.moveTeamInPool(s, d.pool, d.id, Number(d.dir)));
    },
    poolRemove(d) {
      const s = store.state;
      const played = L.playedPoolGames(s, d.id);
      if (played && !confirmIt('Take ' + U.teamName(s, d.id) + ' out of the pool? Their ' + played + ' finished game(s) will be deleted.')) return;
      act((st) => L.assignTeamToPool(st, d.id, null));
    },
    autoAssign() {
      const onlyHere = !!$('#autoHere') && $('#autoHere').checked;
      act(
        (s) => L.autoAssign(s, onlyHere),
        (r) => 'Placed ' + r.placed + ' team' + (r.placed === 1 ? '' : 's') + (r.left ? ' · ' + r.left + ' did not fit (pools are full)' : '')
      );
    },
    seedMove(d) {
      const ids = currentSeeds(store.state).ids.slice();
      const i = Number(d.i);
      const j = i + Number(d.dir);
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      seedDraft = ids;
      render();
    },
    seedRemove(d) {
      const ids = currentSeeds(store.state).ids.slice();
      ids.splice(Number(d.i), 1);
      seedDraft = ids;
      render();
    },
    seedReset() {
      seedDraft = null;
      render();
    },
    createBracket() {
      const s = store.state;
      const ids = currentSeeds(s).ids;
      const left = s.games.filter((g) => g.stage === 'pool' && g.status !== 'done').length;
      if (left && !confirmIt(left + ' pool games have not been played. They will be skipped. Create the bracket anyway?')) return;
      if (act((st) => L.createBracket(st, ids, true), 'Bracket created') !== FAILED) {
        seedDraft = null;
        render();
      }
    },
    pairPicked() {
      if (act((s) => L.pairPlayers(s, picked), (t) => 'Made team #' + t.number) !== FAILED) picked = [];
      render();
    },
    autoPair() {
      const same = !!$('#pairSameGroup') && $('#pairSameGroup').checked;
      act((s) => L.autoPair(s, same), (r) => 'Made ' + r.made + ' team' + (r.made === 1 ? '' : 's') + (r.left ? ' · 1 player still needs a partner' : ''));
    },
    delPlayer(d) {
      act((s) => L.removePlayer(s, d.id));
    },
    splitTeam(d) {
      if (confirmIt('Split up team #' + L.team(store.state, d.id).number + '? Both players go back to the list.')) act((s) => L.splitTeam(s, d.id), 'Team split up');
    },
    usePlan(d) {
      const s = store.state;
      const plan = L.planPools(s.teams.filter((t) => !s.settings.useCheckIn || t.checkedIn).length, planSize)[Number(d.i)];
      if (s.pools.some((p) => p.teamIds.length) && !confirmIt('This re-shuffles every team into new pools. Continue?')) return;
      act((st) => L.applyPlan(st, plan), (r) => 'Pools set up · ' + r.placed + ' teams placed');
    },
    resetBracket() {
      if (confirmIt('Delete the bracket and all bracket results? Pool results are kept.')) act((s) => L.resetBracket(s), 'Bracket reset');
    },
    export() {
      const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cornhole-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    resetKeepTeams() {
      if (!confirmIt('Start a new tournament? Pools, games and the bracket are cleared. The team list stays.')) return;
      const old = store.state;
      const s = L.newState();
      s.name = old.name;
      Object.assign(s.settings, old.settings);
      s.pools = [];
      L.ensurePools(s);
      s.boards = old.boards;
      s.teams = old.teams.map((t) => ({ ...t, checkedIn: !old.settings.useCheckIn }));
      store.replace(s);
      toast('New tournament started');
    },
    resetAll() {
      if (!confirmIt('Erase all teams, pools, games and the bracket? (You can Undo right after.)')) return;
      store.replace(L.newState());
      toast('Everything erased');
    },
  };

  const changes = {
    autoCall(d, el) {
      act((s) => {
        s.settings.autoCall = el.checked;
        if (el.checked) L.fillBoards(s);
      });
    },
    checkin(d, el) {
      act((s) => L.setCheckedIn(s, d.id, el.checked));
    },
    teamField(d, el) {
      act((s) => {
        const t = L.team(s, d.id);
        if (d.key === 'name') return L.updateTeam(s, d.id, { name: el.value });
        const players = t.players.slice();
        players[d.key === 'p0' ? 0 : 1] = el.value;
        L.updateTeam(s, d.id, { players });
      });
    },
    useGroups(d, el) {
      act((s) => {
        s.settings.useGroups = el.checked;
        if (el.checked && !s.groups.length) L.setGroupCount(s, 2);
      });
    },
    groupCount(d, el) {
      act((s) => L.setGroupCount(s, el.value));
    },
    groupName(d, el) {
      act((s) => L.renameGroup(s, d.id, el.value));
    },
    teamGroup(d, el) {
      act((s) => L.setTeamGroup(s, d.id, el.value));
    },
    pick(d, el) {
      picked = el.checked ? [...picked.filter((id) => id !== d.id), d.id].slice(-2) : picked.filter((id) => id !== d.id);
      render();
    },
    playerName(d, el) {
      act((s) => L.updatePlayer(s, d.id, { name: el.value }));
    },
    playerGroupOf(d, el) {
      act((s) => L.updatePlayer(s, d.id, { groupId: el.value || null }));
    },
    planSize(d, el) {
      planSize = Number(el.value);
      render();
    },
    useCheckIn(d, el) {
      act((s) => {
        s.settings.useCheckIn = el.checked;
        if (el.checked) for (const t of s.teams) t.checkedIn = true;
      });
    },
    teamPool(d, el) {
      act((s) => L.assignTeamToPool(s, d.id, el.value || null));
    },
    poolAdd(d, el) {
      if (el.value) act((s) => L.assignTeamToPool(s, el.value, d.id));
    },
    poolName(d, el) {
      act((s) => {
        const name = el.value.trim();
        if (!name) throw new Error('Pool name cannot be empty.');
        L.pool(s, d.id).name = name;
      });
    },
    poolCount(d, el) {
      act((s) => L.setPoolCount(s, el.value));
    },
    maxPool(d, el) {
      act((s) => L.setMaxPoolSize(s, el.value));
    },
    boardCount(d, el) {
      act((s) => L.setBoardCount(s, el.value));
    },
    boardName(d, el) {
      act((s) => L.renameBoard(s, d.id, el.value));
    },
    tname(d, el) {
      act((s) => {
        s.name = el.value.trim() || 'Cornhole Tournament';
      });
    },
    diffCap(d, el) {
      act((s) => {
        s.settings.diffCap = Math.max(0, Math.floor(Number(el.value) || 0));
      });
    },
    advance(d, el) {
      seedDraft = null;
      act((s) => {
        s.settings.advancePerPool = Math.max(0, Math.floor(Number(el.value) || 0));
      });
    },
    wildcards(d, el) {
      seedDraft = null;
      act((s) => {
        s.settings.wildcards = Math.max(0, Math.floor(Number(el.value) || 0));
      });
    },
    seedAdd(d, el) {
      if (!el.value) return;
      seedDraft = currentSeeds(store.state).ids.concat(el.value);
      render();
    },
    import(d, el) {
      const file = el.files[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          const s = JSON.parse(text);
          if (!s || !Array.isArray(s.teams) || !Array.isArray(s.games) || !Array.isArray(s.pools)) throw new Error();
          if (!confirmIt('Replace the current tournament with this backup?')) return;
          store.replace(L.migrate(s));
          toast('Backup restored');
        } catch (e) {
          toast('That file is not a tournament backup.', true);
        }
      });
    },
  };

  function addTeams(lines, checkedIn) {
    const errors = [];
    let added = 0;
    store.update((s) => {
      for (const line of lines) {
        try {
          L.addTeam(s, line, checkedIn);
          added++;
        } catch (e) {
          errors.push(e.message);
        }
      }
    });
    if (errors.length) toast(errors.join(' '), true);
    else if (added) toast('Added ' + added + ' team' + (added === 1 ? '' : 's'));
  }

  // ---------- wiring ----------

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el.dataset, el);
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) changes[el.dataset.change](el.dataset, el);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'teamFilter') {
      applyTeamFilter.value = e.target.value;
      applyTeamFilter();
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'addTeam') {
      const info = { name: $('#newName').value, players: [$('#newP1').value, $('#newP2').value] };
      if ($('#newGroup')) info.groupId = addGroup = $('#newGroup').value || null;
      if ($('#newHere')) addChecked = $('#newHere').checked;
      refocus = '#newP1';
      addTeams([info], addChecked);
    } else if (form.dataset.form === 'addPlayer' || form.dataset.form === 'addPlayers') {
      const one = form.dataset.form === 'addPlayer';
      const sel = $(one ? '#playerGroup' : '#bulkPlayerGroup');
      if (sel) playerGroup = sel.value;
      const names = one ? [$('#newPlayer').value] : $('#bulkPlayers').value.split('\n');
      const list = names.map((x) => x.trim()).filter(Boolean);
      if (!list.length) return;
      if (one) refocus = '#newPlayer';
      const errors = [];
      store.update((s) => {
        for (const n of list) {
          try {
            L.addPlayer(s, n, playerGroup || null);
          } catch (err) {
            errors.push(err.message);
          }
        }
      });
      if (errors.length) toast(errors.join(' '), true);
    } else if (form.dataset.form === 'addBulk') {
      const lines = $('#bulk').value.split('\n').map((x) => x.trim()).filter(Boolean);
      addTeams(lines, !!$('#bulkHere') && $('#bulkHere').checked);
    }
  });

  $('#scoreForm').addEventListener('submit', saveScore);
  $('#cancelScore').addEventListener('click', () => $('#scoreDialog').close());
  $('#clearScore').addEventListener('click', () => {
    const id = $('#scoreDialog').dataset.id;
    if (!confirmIt('Clear this result and mark the game unplayed?')) return;
    act((s) => L.clearResult(s, id), 'Result cleared');
    $('#scoreDialog').close();
  });
  $('#undo').addEventListener('click', () => {
    store.undo();
    toast('Undone');
  });
  $('#openDash').addEventListener('click', () => {
    if (!store.openWindow('dashboard.html')) toast('Your browser blocked the new window. Allow pop-ups for this page.', true);
  });

  store.subscribe(render);
  // Keep the "minutes on board" counters fresh without disturbing typing.
  setInterval(() => {
    const busy = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (tab === 'live' && !busy && !$('#scoreDialog').open) render();
  }, 30000);
  render();
})();
