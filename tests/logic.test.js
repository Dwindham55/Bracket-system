const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const names = (state, ids) => ids.map((id) => L.team(state, id).name);
const pairs = (state, poolId) =>
  state.games
    .filter((g) => g.stage === 'pool' && g.poolId === poolId)
    .sort((a, b) => a.order - b.order)
    .map((g) => names(state, [g.teamA, g.teamB]).join('-'));

// Record a result as "x scored sx, y scored sy", whichever side each team is on.
function play(state, x, y, sx, sy) {
  const g = state.games.find((g) => g.stage === 'pool' && [g.teamA, g.teamB].sort().join() === [x, y].sort().join());
  if (g.teamA === x) L.recordResult(state, g.id, sx, sy);
  else L.recordResult(state, g.id, sy, sx);
}

function setup(poolSizes, boards = 4) {
  const s = L.newState();
  L.setPoolCount(s, poolSizes.length);
  L.setBoardCount(s, boards);
  poolSizes.forEach((n, p) => {
    for (let i = 0; i < n; i++) {
      const t = L.addTeam(s, 'P' + (p + 1) + L.LETTERS[i]);
      L.assignTeamToPool(s, t.id, s.pools[p].id);
    }
  });
  return s;
}

test('pool games follow the printed sheet order and drop missing teams', () => {
  const s = setup([5, 4, 3]);
  assert.deepEqual(pairs(s, s.pools[0].id), [
    'P1A-P1B', 'P1C-P1D', 'P1A-P1E', 'P1B-P1C', 'P1A-P1D',
    'P1D-P1E', 'P1A-P1C', 'P1D-P1B', 'P1C-P1E', 'P1B-P1E',
  ]);
  assert.deepEqual(pairs(s, s.pools[1].id), ['P2A-P2B', 'P2C-P2D', 'P2B-P2C', 'P2A-P2D', 'P2A-P2C', 'P2D-P2B']);
  assert.deepEqual(pairs(s, s.pools[2].id), ['P3A-P3B', 'P3B-P3C', 'P3A-P3C']);
});

test('big pools still play everyone once', () => {
  for (const n of [6, 7, 8]) {
    const p = L.poolPairings(n);
    assert.equal(p.length, (n * (n - 1)) / 2);
    assert.equal(new Set(p.map(([a, b]) => a + '-' + b)).size, p.length);
  }
});

test('adding a late team keeps finished games', () => {
  const s = setup([3]);
  const g = s.games.find((x) => x.order === 0);
  L.recordResult(s, g.id, 21, 10);
  const late = L.addTeam(s, 'Late');
  L.assignTeamToPool(s, late.id, s.pools[0].id);
  assert.equal(pairs(s, s.pools[0].id).length, 6);
  assert.equal(L.game(s, g.id).status, 'done');
});

test('standings match the photo of pool 8', () => {
  const s = setup([3]);
  const [a, b, c] = s.pools[0].teamIds;
  play(s, a, b, 0, 12);
  play(s, b, c, 9, 12);
  play(s, a, c, 0, 11);
  const st = L.poolStandings(s, s.pools[0].id);
  assert.deepEqual(names(s, st.map((r) => r.teamId)), ['P1C', 'P1B', 'P1A']);
  assert.deepEqual(st.map((r) => [r.wins, r.losses, r.diff]), [[2, 0, 14], [1, 1, 9], [0, 2, -23]]);
});

test('head to head breaks a two-team tie before differential', () => {
  const s = setup([3]);
  const [a, b, c] = s.pools[0].teamIds;
  // Everyone 1-1: a three-way tie goes to differential.
  play(s, a, b, 21, 20);
  play(s, b, c, 21, 0);
  play(s, c, a, 21, 0);
  assert.deepEqual(names(s, L.poolStandings(s, s.pools[0].id).map((r) => r.teamId)), ['P1B', 'P1C', 'P1A']);

  const t = setup([4]);
  const [w, x, y, z] = t.pools[0].teamIds;
  play(t, w, x, 21, 19);
  play(t, x, y, 21, 0);
  play(t, x, z, 21, 0);
  play(t, w, y, 21, 18);
  play(t, z, w, 21, 18);
  play(t, y, z, 21, 20);
  // w and x are both 2-1; x has the better differential but w won head to head.
  const order = names(t, L.poolStandings(t, t.pools[0].id).map((r) => r.teamId));
  assert.deepEqual(order.slice(0, 2), ['P1A', 'P1B']);
});

test('scheduler fills boards across pools and never double-books a team', () => {
  const s = setup([5, 5], 3);
  assert.equal(L.fillBoards(s), 3);
  const onBoards = s.games.filter((g) => g.status === 'called');
  const teams = onBoards.flatMap((g) => [g.teamA, g.teamB]);
  assert.equal(new Set(teams).size, teams.length);
  assert.deepEqual(onBoards.map((g) => pairs(s, g.poolId)[g.order]).sort(), ['P1A-P1B', 'P1C-P1D', 'P2A-P2B']);

  // Finishing a game auto-calls the next ready one onto that board.
  const first = onBoards[0];
  L.recordResult(s, first.id, 21, 5);
  assert.ok(L.gameOnBoard(s, first.boardId));
  assert.equal(s.games.filter((g) => g.status === 'called').length, 3);
});

test('teams not checked in are skipped by auto-calling', () => {
  const s = setup([3], 2);
  L.setCheckedIn(s, s.pools[0].teamIds[1], false);
  L.fillBoards(s);
  const called = s.games.filter((g) => g.status === 'called');
  assert.equal(called.length, 1);
  assert.deepEqual(names(s, [called[0].teamA, called[0].teamB]), ['P1A', 'P1C']);
});

test('bracket seeds pool winners, gives byes and advances winners', () => {
  const s = setup([3, 3, 3], 2);
  s.settings.autoCall = false;
  for (const g of s.games) L.recordResult(s, g.id, 21, 10 + g.order);
  s.settings.wildcards = 2;
  const { seeds } = L.seedCandidates(s);
  assert.equal(seeds.length, 5);
  assert.deepEqual(seeds.slice(0, 3).map((r) => r.poolRank), [1, 1, 1]);
  L.createBracket(s, seeds.map((r) => r.teamId));
  assert.equal(s.bracket.size, 8);
  const r0 = s.games.filter((g) => g.stage === 'bracket' && g.round === 0);
  assert.equal(r0.filter((g) => g.status === 'bye').length, 3);
  assert.deepEqual(L.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);

  const play = () => {
    const q = L.queue(s).find((x) => x.ready);
    L.recordResult(s, q.game.id, 21, 3);
    return q.game;
  };
  // 4v5 is the only real first-round match.
  const g45 = play();
  assert.deepEqual([g45.seedA, g45.seedB], [4, 5]);
  play();
  assert.throws(() => L.clearResult(s, g45.id), /next match/);
  play();
  play();
  assert.equal(s.bracket.championId, seeds[0].teamId);
  assert.equal(L.queue(s).length, 0);
});

test('changing a bracket result is blocked once the next round has started', () => {
  const s = setup([2, 2], 1);
  s.settings.autoCall = false;
  for (const g of s.games) L.recordResult(s, g.id, 21, 0);
  L.createBracket(s, L.seedCandidates(s).seeds.map((r) => r.teamId).concat(s.pools[0].teamIds[1], s.pools[1].teamIds[1]));
  const semis = s.games.filter((g) => g.stage === 'bracket' && g.round === 0);
  L.recordResult(s, semis[0].id, 21, 5);
  L.recordResult(s, semis[0].id, 5, 21); // fine, final not started
  const fin = s.games.find((g) => g.stage === 'bracket' && g.round === 1);
  assert.equal(fin.teamA, semis[0].teamB);
  L.recordResult(s, semis[1].id, 21, 5);
  L.callGame(s, fin.id, s.boards[0].id);
  assert.throws(() => L.recordResult(s, semis[0].id, 21, 5), /next match/);
});

test('unplayed pool games are skipped when the bracket starts and restored on reset', () => {
  const s = setup([3], 1);
  assert.throws(() => L.createBracket(s, s.pools[0].teamIds), /not been played/);
  L.createBracket(s, s.pools[0].teamIds, true);
  assert.ok(s.games.filter((g) => g.stage === 'pool').every((g) => g.status === 'skipped'));
  L.resetBracket(s);
  assert.ok(s.games.filter((g) => g.stage === 'pool').every((g) => g.status === 'pending'));
});

test('removing a board sends its game back to the queue', () => {
  const s = setup([4], 2);
  L.fillBoards(s);
  L.setBoardCount(s, 1);
  assert.equal(s.games.filter((g) => g.status === 'called').length, 1);
});
