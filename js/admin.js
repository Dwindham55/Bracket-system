/* The tournament director's page: teams, pools, boards, scores and bracket. */
(function () {
  'use strict';

  const L = window.Logic;
  const U = window.UI;
  const esc = U.esc;
  const store = window.Store.createAdminStore(L);
  const $ = (sel, el = document) => el.querySelector(sel);

  const TABS = [
    ['live', 'Boards & Queue'],
    ['teams', 'Teams'],
    ['pools', 'Pools'],
    ['bracket', 'Bracket'],
    ['settings', 'Settings'],
  ];

  let tab = 'live';
  try {
    tab = localStorage.getItem('cornhole-admin-tab') || 'live';
  } catch (e) {}
  // Seed order the director has hand-edited on the Bracket tab, or null to
  // follow the live standings.
  let seedDraft = null;
  let refocus = null;
  let addChecked = true;

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
    const here = s.teams.filter((t) => t.checkedIn).length;
    const poolGames = s.games.filter((g) => g.stage === 'pool' && g.status !== 'skipped');
    const done = poolGames.filter((g) => g.status === 'done').length;
    const inUse = s.boards.length - L.freeBoards(s).length;
    $('#summary').textContent =
      s.teams.length + ' teams (' + here + ' checked in) · ' + done + '/' + poolGames.length + ' pool games · ' +
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
          '<div class="teams">' + U.matchup(s, g) + '</div>' +
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
      html += '<table class="list"><thead><tr><th>#</th><th>Game</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>';
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
      html += '</tbody></table>';
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

    let html =
      '<div class="cols"><section><h2>Add a team</h2>' +
      '<form class="inline" data-form="addTeam"><input id="newTeam" placeholder="Team name, e.g. Dave & Tripp" autocomplete="off">' +
      '<label><input type="checkbox" id="newHere"' + (addChecked ? ' checked' : '') + '> Checked in</label><button class="primary">Add team</button></form>' +
      '<details><summary>Add many at once</summary><form data-form="addBulk"><textarea id="bulk" rows="8" placeholder="One team per line"></textarea>' +
      '<label><input type="checkbox" id="bulkHere"> Mark these as checked in</label> <button>Add all</button></form></details>' +
      '<p class="muted">Enter teams ahead of time and leave them unchecked; check them in as they arrive. Teams that show up late can be added here any time and dropped into a pool.</p>' +
      '</section></div>';

    html +=
      '<section><div class="section-head"><h2>Teams (' + s.teams.length + ')</h2><input type="search" id="teamFilter" placeholder="Search teams"></div>';
    if (!s.teams.length) return html + '<p class="muted">No teams yet.</p></section>';
    html += '<table class="list" id="teamTable"><thead><tr><th>Here</th><th>Team</th><th>Pool</th><th>Record</th><th></th></tr></thead><tbody>';
    const sorted = [...s.teams].sort((a, b) => a.name.localeCompare(b.name));
    for (const t of sorted) {
      const p = L.poolOfTeam(s, t.id);
      const r = records.get(t.id);
      html +=
        '<tr data-name="' + esc(t.name.toLowerCase()) + '"><td><input type="checkbox" data-change="checkin" data-id="' + t.id + '"' + (t.checkedIn ? ' checked' : '') + '></td>' +
        '<td><input class="plain" value="' + esc(t.name) + '" data-change="renameTeam" data-id="' + t.id + '"></td>' +
        '<td><select data-change="teamPool" data-id="' + t.id + '">' + options(poolOpts, p ? p.id : '') + '</select></td>' +
        '<td class="num">' + (r && r.played ? r.wins + '–' + r.losses + ' (' + U.fmtDiff(r.diff) + ')' : '') + '</td>' +
        '<td class="row-actions"><button class="ghost danger" data-act="delTeam" data-id="' + t.id + '">Remove</button></td></tr>';
    }
    return html + '</tbody></table></section>';
  }

  // ---------- Pools ----------

  function renderPools(s) {
    const assigned = new Set(s.pools.flatMap((p) => p.teamIds));
    const unassigned = s.teams.filter((t) => !assigned.has(t.id));
    const unOpts = unassigned.map((t) => [t.id, t.name + (t.checkedIn ? '' : ' (not checked in)')]);

    let html =
      '<div class="toolbar">' +
      '<label>Pools <input type="number" min="1" max="32" class="short" value="' + s.settings.poolCount + '" data-change="poolCount"></label>' +
      '<label>Max teams per pool <input type="number" min="2" max="12" class="short" value="' + s.settings.maxPoolSize + '" data-change="maxPool"></label>' +
      '<button class="primary" data-act="autoAssign"' + (unassigned.length ? '' : ' disabled') + '>Auto-fill pools</button>' +
      '<label><input type="checkbox" id="autoHere" checked> checked-in teams only</label></div>';

    html += '<div class="unassigned"><b>Not in a pool (' + unassigned.length + '):</b> ' +
      (unassigned.length
        ? unassigned.map((t) => '<span class="chip' + (t.checkedIn ? '' : ' away') + '">' + esc(t.name) + '</span>').join(' ')
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
          '<li><span class="letter">' + L.LETTERS[i] + '</span><span class="name' + (t.checkedIn ? '' : ' away') + '">' + esc(t.name) + '</span>' +
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
      html += '<select data-change="seedAdd"><option value="">+ Add a team to the bracket…</option>' + options(rest.map((t) => [t.id, t.name])) + '</select>';
    }
    html += '<div class="toolbar"><button class="primary big" data-act="createBracket"' + (ids.length >= 2 ? '' : ' disabled') + '>Create bracket</button></div></section>';
    return html;
  }

  // ---------- Settings ----------

  function renderSettings(s) {
    let html =
      '<div class="cols"><section><h2>Tournament</h2>' +
      '<label class="field">Name <input value="' + esc(s.name) + '" data-change="tname"></label>' +
      '<label class="field">Cap on point differential per game (0 = no cap) <input type="number" min="0" max="99" class="short" value="' + (s.settings.diffCap || 0) + '" data-change="diffCap"></label>' +
      '<h2>Boards</h2><label class="field">Number of boards <input type="number" min="1" max="64" class="short" value="' + s.boards.length + '" data-change="boardCount"></label>' +
      '<div class="board-names">' +
      s.boards.map((b) => '<input value="' + esc(b.name) + '" data-change="boardName" data-id="' + b.id + '">').join('') +
      '</div><p class="muted">Rename a board to match the number or sign on it. Removing a board puts its game back in the queue.</p></section>';
    html +=
      '<section><h2>Backup</h2><p class="muted">Everything saves automatically in this browser. Download a backup now and then, or to move the tournament to another computer.</p>' +
      '<div class="toolbar"><button data-act="export">Download backup</button><label class="button">Restore from backup<input type="file" accept=".json,application/json" data-change="import" hidden></label></div>' +
      '<h2>Start over</h2><div class="toolbar"><button class="ghost danger" data-act="resetKeepTeams">New tournament, keep team list</button>' +
      '<button class="ghost danger" data-act="resetAll">Erase everything</button></div></section></div>';
    return html;
  }

  // ---------- render ----------

  function render() {
    const s = store.state;
    renderHeader(s);
    const view = { live: renderLive, teams: renderTeams, pools: renderPools, bracket: renderBracket, settings: renderSettings }[tab] || renderLive;
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
      const msg = 'Remove ' + t.name + '?' + (played ? ' Their ' + played + ' finished pool game(s) will be deleted too.' : '');
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
      const onlyHere = $('#autoHere').checked;
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
      if (!confirmIt('Start a new tournament? Pools, games and the bracket are cleared. Teams stay, marked not checked in.')) return;
      const old = store.state;
      const s = L.newState();
      s.name = old.name;
      Object.assign(s.settings, old.settings);
      s.pools = [];
      L.ensurePools(s);
      s.boards = old.boards;
      s.teams = old.teams.map((t) => ({ ...t, checkedIn: false }));
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
    renameTeam(d, el) {
      act((s) => L.renameTeam(s, d.id, el.value));
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
          store.replace(s);
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
      const name = $('#newTeam').value;
      if (!name.trim()) return;
      refocus = '#newTeam';
      addChecked = $('#newHere').checked;
      addTeams([name], addChecked);
    } else if (form.dataset.form === 'addBulk') {
      const lines = $('#bulk').value.split('\n').map((x) => x.trim()).filter(Boolean);
      addTeams(lines, $('#bulkHere').checked);
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
