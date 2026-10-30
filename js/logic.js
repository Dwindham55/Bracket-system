/*
 * Tournament rules and state changes. No DOM access here, so the same file
 * runs in the browser and in Node for tests.
 *
 * Every mutating function takes the whole state object and changes it in
 * place. User-facing problems are thrown as Errors with a readable message.
 */
(function (root) {
  'use strict';

  // Game order printed on the pool sheets. Smaller pools use the same order
  // and skip the games with a missing team (the crossed-out rows).
  const SHEET_ORDER = ['AB', 'CD', 'AE', 'BC', 'AD', 'DE', 'AC', 'DB', 'CE', 'BE'];
  const LETTERS = 'ABCDEFGHIJKL';

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function fail(message) {
    throw new Error(message);
  }

  function newState() {
    const state = {
      version: 1,
      name: 'Cornhole Tournament',
      settings: {
        poolCount: 8,
        maxPoolSize: 5,
        advancePerPool: 1,
        wildcards: 0,
        diffCap: 0,
        autoCall: true,
      },
      boards: [],
      teams: [],
      pools: [],
      games: [],
      bracket: null,
      announcements: [],
    };
    setBoardCount(state, 4);
    ensurePools(state);
    return state;
  }

  // ---------- lookups ----------

  const team = (state, id) => state.teams.find((t) => t.id === id);
  const pool = (state, id) => state.pools.find((p) => p.id === id);
  const game = (state, id) => state.games.find((g) => g.id === id);
  const board = (state, id) => state.boards.find((b) => b.id === id);
  const poolOfTeam = (state, teamId) => state.pools.find((p) => p.teamIds.includes(teamId));
  const gameOnBoard = (state, boardId) =>
    state.games.find((g) => g.status === 'called' && g.boardId === boardId);

  function busyTeams(state) {
    const busy = new Map();
    for (const g of state.games) {
      if (g.status !== 'called') continue;
      busy.set(g.teamA, g.boardId);
      busy.set(g.teamB, g.boardId);
    }
    return busy;
  }

  // ---------- boards ----------

  function setBoardCount(state, count) {
    count = Math.floor(Number(count));
    if (!(count >= 1 && count <= 64)) fail('Number of boards must be between 1 and 64.');
    while (state.boards.length < count) {
      const n = state.boards.length + 1;
      state.boards.push({ id: uid(), name: 'Board ' + n });
    }
    while (state.boards.length > count) {
      const removed = state.boards.pop();
      const g = gameOnBoard(state, removed.id);
      if (g) returnToQueue(state, g.id);
    }
  }

  function renameBoard(state, boardId, name) {
    const b = board(state, boardId) || fail('Board not found.');
    name = String(name || '').trim();
    if (!name) fail('Board name cannot be empty.');
    b.name = name;
  }

  // ---------- teams ----------

  function addTeam(state, name, checkedIn = true) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) fail('Enter a team name.');
    if (state.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      fail('There is already a team named "' + name + '".');
    }
    const t = { id: uid(), name, checkedIn: !!checkedIn, createdAt: Date.now() };
    state.teams.push(t);
    return t;
  }

  function renameTeam(state, teamId, name) {
    const t = team(state, teamId) || fail('Team not found.');
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) fail('Team name cannot be empty.');
    if (state.teams.some((o) => o.id !== teamId && o.name.toLowerCase() === name.toLowerCase())) {
      fail('There is already a team named "' + name + '".');
    }
    t.name = name;
  }

  function setCheckedIn(state, teamId, checkedIn) {
    const t = team(state, teamId) || fail('Team not found.');
    t.checkedIn = !!checkedIn;
  }

  function teamInBracket(state, teamId) {
    return !!state.bracket && state.bracket.seeds.includes(teamId);
  }

  function removeTeam(state, teamId) {
    if (teamInBracket(state, teamId)) fail('That team is in the bracket. Reset the bracket first.');
    const p = poolOfTeam(state, teamId);
    if (p) assignTeamToPool(state, teamId, null);
    state.teams = state.teams.filter((t) => t.id !== teamId);
  }

  // Number of finished pool games a team has, used to warn before removing it.
  function playedPoolGames(state, teamId) {
    return state.games.filter(
      (g) => g.stage === 'pool' && g.status === 'done' && (g.teamA === teamId || g.teamB === teamId)
    ).length;
  }

  // ---------- pools ----------

  function ensurePools(state) {
    while (state.pools.length < state.settings.poolCount) {
      state.pools.push({ id: uid(), name: 'Pool ' + (state.pools.length + 1), teamIds: [] });
    }
  }

  function setPoolCount(state, count) {
    count = Math.floor(Number(count));
    if (!(count >= 1 && count <= 32)) fail('Number of pools must be between 1 and 32.');
    const removed = state.pools.slice(count);
    if (removed.some((p) => p.teamIds.length)) {
      fail('Move the teams out of ' + removed.filter((p) => p.teamIds.length).map((p) => p.name).join(', ') + ' first.');
    }
    state.pools = state.pools.slice(0, count);
    state.settings.poolCount = count;
    ensurePools(state);
  }

  function setMaxPoolSize(state, size) {
    size = Math.floor(Number(size));
    if (!(size >= 2 && size <= 12)) fail('Pool size must be between 2 and 12.');
    const big = state.pools.filter((p) => p.teamIds.length > size);
    if (big.length) fail(big.map((p) => p.name).join(', ') + ' already has more than ' + size + ' teams.');
    state.settings.maxPoolSize = size;
  }

  function poolPairings(n) {
    if (n <= 5) {
      return SHEET_ORDER.map((p) => [LETTERS.indexOf(p[0]), LETTERS.indexOf(p[1])]).filter(
        ([a, b]) => a < n && b < n
      );
    }
    // Round-robin circle method for pools bigger than the printed sheet.
    const idx = [...Array(n).keys()];
    if (n % 2) idx.push(-1);
    const m = idx.length;
    const out = [];
    for (let r = 0; r < m - 1; r++) {
      for (let i = 0; i < m / 2; i++) {
        const a = idx[i];
        const b = idx[m - 1 - i];
        if (a >= 0 && b >= 0) out.push([Math.min(a, b), Math.max(a, b)]);
      }
      idx.splice(1, 0, idx.pop());
    }
    return out;
  }

  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // Rebuild a pool's game list from its current teams. Games that already
  // exist for the same pair (including finished ones) are kept.
  function syncPoolGames(state, p) {
    const existing = state.games.filter((g) => g.stage === 'pool' && g.poolId === p.id);
    const byPair = new Map(existing.map((g) => [pairKey(g.teamA, g.teamB), g]));
    const keep = new Set();
    poolPairings(p.teamIds.length).forEach(([a, b], order) => {
      const teamA = p.teamIds[a];
      const teamB = p.teamIds[b];
      let g = byPair.get(pairKey(teamA, teamB));
      if (!g) {
        g = { id: uid(), stage: 'pool', poolId: p.id, teamA, teamB, status: 'pending' };
        state.games.push(g);
      } else if (g.status === 'pending' || g.status === 'skipped') {
        // Keep the sheet's left/right order for games not yet played.
        g.teamA = teamA;
        g.teamB = teamB;
      }
      if (state.bracket && g.status === 'pending') g.status = 'skipped';
      g.order = order;
      keep.add(g);
    });
    state.games = state.games.filter((g) => !(g.stage === 'pool' && g.poolId === p.id) || keep.has(g));
  }

  function assignTeamToPool(state, teamId, poolId) {
    const t = team(state, teamId) || fail('Team not found.');
    const from = poolOfTeam(state, teamId);
    const to = poolId ? pool(state, poolId) || fail('Pool not found.') : null;
    if (from === to) return;
    if (teamInBracket(state, teamId)) fail(t.name + ' is in the bracket. Reset the bracket first.');
    if (to && to.teamIds.length >= state.settings.maxPoolSize) {
      fail(to.name + ' is full (' + state.settings.maxPoolSize + ' teams).');
    }
    if (from) {
      const onBoard = state.games.find(
        (g) => g.status === 'called' && g.poolId === from.id && (g.teamA === teamId || g.teamB === teamId)
      );
      if (onBoard) fail(t.name + ' is playing right now. Finish or cancel that game first.');
      from.teamIds = from.teamIds.filter((id) => id !== teamId);
      syncPoolGames(state, from);
    }
    if (to) {
      to.teamIds.push(teamId);
      syncPoolGames(state, to);
    }
  }

  function moveTeamInPool(state, poolId, teamId, delta) {
    const p = pool(state, poolId) || fail('Pool not found.');
    const i = p.teamIds.indexOf(teamId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= p.teamIds.length) return;
    [p.teamIds[i], p.teamIds[j]] = [p.teamIds[j], p.teamIds[i]];
    syncPoolGames(state, p);
  }

  // Put unassigned teams into the emptiest pools. Returns how many were placed.
  function autoAssign(state, onlyCheckedIn = true) {
    const assigned = new Set(state.pools.flatMap((p) => p.teamIds));
    const waiting = state.teams.filter((t) => !assigned.has(t.id) && (!onlyCheckedIn || t.checkedIn));
    let placed = 0;
    for (const t of waiting) {
      let target = null;
      for (const p of state.pools) {
        if (p.teamIds.length >= state.settings.maxPoolSize) continue;
        if (!target || p.teamIds.length < target.teamIds.length) target = p;
      }
      if (!target) break;
      assignTeamToPool(state, t.id, target.id);
      placed++;
    }
    return { placed, left: waiting.length - placed };
  }

  // ---------- scheduling ----------

  function priority(state, g) {
    if (g.stage === 'pool') {
      return [0, g.order, state.pools.findIndex((p) => p.id === g.poolId)];
    }
    return [1, g.round, g.index];
  }

  function comparePriority(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }

  // Pending games in calling order with whether each can go on a board now.
  function queue(state) {
    const busy = busyTeams(state);
    return state.games
      .filter((g) => g.status === 'pending')
      .map((g) => ({ g, p: priority(state, g) }))
      .sort((x, y) => comparePriority(x.p, y.p))
      .map(({ g }) => {
        let reason = '';
        if (!g.teamA || !g.teamB) reason = 'Waiting on earlier match';
        else {
          const playing = [g.teamA, g.teamB].filter((id) => busy.has(id));
          const away = [g.teamA, g.teamB].filter((id) => !team(state, id).checkedIn);
          if (playing.length) {
            reason = playing.map((id) => team(state, id).name + ' on ' + board(state, busy.get(id)).name).join(', ');
          } else if (away.length) {
            reason = away.map((id) => team(state, id).name).join(', ') + ' not checked in';
          }
        }
        return { game: g, ready: !reason, reason };
      });
  }

  function freeBoards(state) {
    return state.boards.filter((b) => !gameOnBoard(state, b.id));
  }

  function announce(state, gameId) {
    const g = game(state, gameId) || fail('Game not found.');
    if (g.status !== 'called') fail('That game is not on a board.');
    state.announcements.push({ id: uid(), gameId: g.id, boardId: g.boardId, at: Date.now() });
    if (state.announcements.length > 40) state.announcements.splice(0, state.announcements.length - 40);
  }

  function callGame(state, gameId, boardId) {
    const g = game(state, gameId) || fail('Game not found.');
    const b = board(state, boardId) || fail('Board not found.');
    if (g.status !== 'pending') fail('That game is not waiting to be played.');
    if (!g.teamA || !g.teamB) fail('Both teams are not known yet.');
    if (gameOnBoard(state, b.id)) fail(b.name + ' already has a game on it.');
    const busy = busyTeams(state);
    for (const id of [g.teamA, g.teamB]) {
      if (busy.has(id)) fail(team(state, id).name + ' is already playing on ' + board(state, busy.get(id)).name + '.');
    }
    g.status = 'called';
    g.boardId = b.id;
    g.calledAt = Date.now();
    for (const id of [g.teamA, g.teamB]) team(state, id).checkedIn = true;
    announce(state, g.id);
  }

  function returnToQueue(state, gameId) {
    const g = game(state, gameId) || fail('Game not found.');
    if (g.status !== 'called') return;
    g.status = 'pending';
    delete g.boardId;
    delete g.calledAt;
  }

  // Put the next ready games on every open board. Returns how many were called.
  function fillBoards(state) {
    let called = 0;
    for (const b of freeBoards(state)) {
      const next = queue(state).find((q) => q.ready);
      if (!next) break;
      callGame(state, next.game.id, b.id);
      called++;
    }
    return called;
  }

  // ---------- results ----------

  function parseScore(v) {
    const n = Number(v);
    if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < 0 || n > 99) {
      fail('Scores must be whole numbers from 0 to 99.');
    }
    return n;
  }

  function nextGame(state, g) {
    return g.nextId ? game(state, g.nextId) : null;
  }

  function checkBracketEditable(state, g) {
    const next = nextGame(state, g);
    if (next && next.status !== 'pending') {
      fail('The next match (' + (next.status === 'called' ? 'on a board' : 'finished') + ') depends on this result. Clear that one first.');
    }
  }

  function setNextSlot(state, g, teamId) {
    const next = nextGame(state, g);
    if (next) next[g.nextSlot === 'A' ? 'teamA' : 'teamB'] = teamId;
    else if (state.bracket) state.bracket.championId = teamId;
  }

  function recordResult(state, gameId, scoreA, scoreB) {
    const g = game(state, gameId) || fail('Game not found.');
    if (!g.teamA || !g.teamB) fail('Both teams are not known yet.');
    if (g.status === 'bye') fail('That was a bye.');
    const a = parseScore(scoreA);
    const b = parseScore(scoreB);
    if (a === b) fail('Games cannot end in a tie. Check the score.');
    if (g.stage === 'bracket' && g.status === 'done') checkBracketEditable(state, g);
    const wasOnBoard = g.status === 'called';
    g.scoreA = a;
    g.scoreB = b;
    g.winner = a > b ? g.teamA : g.teamB;
    g.status = 'done';
    g.finishedAt = Date.now();
    if (g.stage === 'bracket') setNextSlot(state, g, g.winner);
    if (wasOnBoard && state.settings.autoCall) fillBoards(state);
  }

  function clearResult(state, gameId) {
    const g = game(state, gameId) || fail('Game not found.');
    if (g.status !== 'done') return;
    if (g.stage === 'bracket') {
      checkBracketEditable(state, g);
      setNextSlot(state, g, null);
    }
    g.status = g.stage === 'pool' && state.bracket ? 'skipped' : 'pending';
    for (const k of ['scoreA', 'scoreB', 'winner', 'finishedAt', 'boardId', 'calledAt']) delete g[k];
  }

  // ---------- standings ----------

  function gameDiff(state, g) {
    const d = Math.abs(g.scoreA - g.scoreB);
    const cap = Number(state.settings.diffCap) || 0;
    return cap > 0 ? Math.min(d, cap) : d;
  }

  // Ranking: wins, then head-to-head for a two-team tie, then total point
  // differential, then points scored.
  function poolStandings(state, poolId) {
    const p = pool(state, poolId) || fail('Pool not found.');
    const rows = new Map(
      p.teamIds.map((id) => [id, { teamId: id, wins: 0, losses: 0, played: 0, remaining: 0, pf: 0, pa: 0, diff: 0 }])
    );
    const games = state.games.filter((g) => g.stage === 'pool' && g.poolId === p.id);
    for (const g of games) {
      const ra = rows.get(g.teamA);
      const rb = rows.get(g.teamB);
      if (!ra || !rb) continue;
      if (g.status !== 'done') {
        ra.remaining++;
        rb.remaining++;
        continue;
      }
      const d = gameDiff(state, g);
      const [w, l] = g.winner === g.teamA ? [ra, rb] : [rb, ra];
      w.wins++;
      l.losses++;
      w.diff += d;
      l.diff -= d;
      ra.played++;
      rb.played++;
      ra.pf += g.scoreA;
      ra.pa += g.scoreB;
      rb.pf += g.scoreB;
      rb.pa += g.scoreA;
    }
    const byStats = (x, y) => y.diff - x.diff || y.pf - x.pf || p.teamIds.indexOf(x.teamId) - p.teamIds.indexOf(y.teamId);
    const list = [...rows.values()].sort((x, y) => y.wins - x.wins);
    const out = [];
    for (let i = 0; i < list.length; ) {
      let j = i;
      while (j < list.length && list[j].wins === list[i].wins) j++;
      const group = list.slice(i, j).sort(byStats);
      if (group.length === 2) {
        const h2h = games.find(
          (g) => g.status === 'done' && pairKey(g.teamA, g.teamB) === pairKey(group[0].teamId, group[1].teamId)
        );
        if (h2h && h2h.winner === group[1].teamId) group.reverse();
      }
      out.push(...group);
      i = j;
    }
    out.forEach((r, i) => (r.rank = i + 1));
    return out;
  }

  function poolComplete(state, poolId) {
    return state.games.every((g) => g.stage !== 'pool' || g.poolId !== poolId || g.status === 'done');
  }

  // ---------- bracket ----------

  const winPct = (r) => (r.played ? r.wins / r.played : 0);
  const avgDiff = (r) => (r.played ? r.diff / r.played : 0);
  // Pools can have different sizes, so across pools compare win percentage
  // and differential per game rather than totals.
  const crossPool = (a, b) => winPct(b) - winPct(a) || avgDiff(b) - avgDiff(a) || b.pf - a.pf;

  function seedCandidates(state) {
    const all = [];
    for (const p of state.pools) {
      if (!p.teamIds.length) continue;
      for (const r of poolStandings(state, p.id)) all.push({ ...r, poolId: p.id, poolRank: r.rank });
    }
    const per = Math.max(0, Math.floor(Number(state.settings.advancePerPool) || 0));
    const qualifiers = all.filter((r) => r.poolRank <= per);
    const others = all.filter((r) => r.poolRank > per).sort(crossPool);
    const wild = others.slice(0, Math.max(0, Math.floor(Number(state.settings.wildcards) || 0)));
    wild.forEach((r) => (r.wildcard = true));
    const seeds = [...qualifiers, ...wild].sort((a, b) => a.poolRank - b.poolRank || crossPool(a, b));
    return { seeds, others: others.slice(wild.length) };
  }

  // Bracket slot order so 1 plays the lowest seed and 1 and 2 meet in the final.
  function seedOrder(size) {
    let order = [1, 2];
    while (order.length < size) {
      const n = order.length * 2 + 1;
      order = order.flatMap((s) => [s, n - s]);
    }
    return order;
  }

  function roundName(totalRounds, round) {
    const left = totalRounds - 1 - round;
    if (left === 0) return 'Final';
    if (left === 1) return 'Semifinals';
    if (left === 2) return 'Quarterfinals';
    return 'Round of ' + Math.pow(2, left + 1);
  }

  function createBracket(state, teamIds, force = false) {
    if (state.bracket) fail('A bracket already exists. Reset it first.');
    teamIds = [...new Set(teamIds)];
    if (teamIds.length < 2) fail('A bracket needs at least 2 teams.');
    for (const id of teamIds) team(state, id) || fail('Unknown team in seeds.');
    const unfinished = state.games.filter((g) => g.stage === 'pool' && g.status !== 'done');
    if (unfinished.some((g) => g.status === 'called')) fail('Finish or cancel the pool games on the boards first.');
    if (unfinished.length && !force) fail(unfinished.length + ' pool games have not been played.');
    for (const g of unfinished) g.status = 'skipped';

    const size = Math.pow(2, Math.ceil(Math.log2(teamIds.length)));
    const rounds = Math.log2(size);
    const grid = [];
    for (let r = 0; r < rounds; r++) {
      grid.push([]);
      for (let i = 0; i < size / Math.pow(2, r + 1); i++) {
        const g = { id: uid(), stage: 'bracket', round: r, index: i, teamA: null, teamB: null, status: 'pending' };
        grid[r].push(g);
        state.games.push(g);
      }
    }
    for (let r = 0; r < rounds - 1; r++) {
      grid[r].forEach((g, i) => {
        g.nextId = grid[r + 1][Math.floor(i / 2)].id;
        g.nextSlot = i % 2 ? 'B' : 'A';
      });
    }
    state.bracket = { size, rounds, seeds: teamIds, championId: null, createdAt: Date.now() };
    const order = seedOrder(size);
    grid[0].forEach((g, i) => {
      g.seedA = order[2 * i];
      g.seedB = order[2 * i + 1];
      g.teamA = teamIds[g.seedA - 1] || null;
      g.teamB = teamIds[g.seedB - 1] || null;
      if (!g.teamA || !g.teamB) {
        g.status = 'bye';
        g.winner = g.teamA || g.teamB;
        setNextSlot(state, g, g.winner);
      }
    });
    if (state.settings.autoCall) fillBoards(state);
  }

  function resetBracket(state) {
    if (!state.bracket) return;
    state.games = state.games.filter((g) => g.stage !== 'bracket');
    for (const g of state.games) if (g.status === 'skipped') g.status = 'pending';
    state.bracket = null;
  }

  const api = {
    LETTERS,
    newState,
    team,
    pool,
    game,
    board,
    poolOfTeam,
    gameOnBoard,
    busyTeams,
    setBoardCount,
    renameBoard,
    addTeam,
    renameTeam,
    setCheckedIn,
    removeTeam,
    playedPoolGames,
    ensurePools,
    setPoolCount,
    setMaxPoolSize,
    poolPairings,
    syncPoolGames,
    assignTeamToPool,
    moveTeamInPool,
    autoAssign,
    queue,
    freeBoards,
    announce,
    callGame,
    returnToQueue,
    fillBoards,
    recordResult,
    clearResult,
    gameDiff,
    poolStandings,
    poolComplete,
    seedCandidates,
    seedOrder,
    roundName,
    createBracket,
    resetBracket,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
