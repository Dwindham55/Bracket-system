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
  s.settings.useCheckIn = true;
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

test('check-in is ignored unless it is turned on', () => {
  const s = setup([3], 2);
  L.setCheckedIn(s, s.pools[0].teamIds[1], false);
  assert.equal(L.fillBoards(s), 1);
  assert.equal(L.game(s, s.games.find((g) => g.status === 'called').id).order, 0);
});

test('teams get numbers and player names', () => {
  const s = L.newState();
  const a = L.addTeam(s, 'Dave Smith, Tripp Jones');
  const b = L.addTeam(s, 'Chris & Stewart');
  const c = L.addTeam(s, 'Sharpshooters: Clint, David P');
  const d = L.addTeam(s, 'The Bag Slingers');
  assert.deepEqual([a, b, c, d].map((t) => t.number), [1, 2, 3, 4]);
  assert.deepEqual(a.players, ['Dave Smith', 'Tripp Jones']);
  assert.equal(L.teamLabel(a), 'Dave S. & Tripp J.');
  assert.deepEqual([c.name, c.players], ['Sharpshooters', ['Clint', 'David P']]);
  assert.deepEqual([d.name, d.players], ['The Bag Slingers', []]);
  assert.throws(() => L.addTeam(s, 'chris and stewart'), /already/);
  L.updateTeam(s, b.id, { players: ['Chris', 'Stewart', ''] });
  assert.deepEqual(b.players, ['Chris', 'Stewart']);
  L.removeTeam(s, a.id);
  assert.equal(L.addTeam(s, 'New, Pair').number, 5);
});

test('older saved tournaments are upgraded', () => {
  const old = { settings: { poolCount: 1 }, teams: [{ id: 'x', name: 'Old Team', checkedIn: false }], pools: [], games: [], boards: [] };
  L.migrate(old);
  assert.equal(old.teams[0].number, 1);
  assert.deepEqual(old.teams[0].players, []);
  assert.equal(old.settings.useCheckIn, false);
  assert.equal(old.settings.maxPoolSize, 5);
});

test('names shorten to first name and last initial', () => {
  assert.equal(L.shortName('Dave Windham'), 'Dave W.');
  assert.equal(L.shortName('Mary Ann van Buren'), 'Mary B.');
  assert.equal(L.shortName('David P'), 'David P.');
  assert.equal(L.shortName('Cher'), 'Cher');
  // Two Dave S.'s are still different teams.
  const s = L.newState();
  L.addTeam(s, 'Dave Smith, Tripp Jones');
  assert.doesNotThrow(() => L.addTeam(s, 'Dave Stone, Tripp Jacobs'));
});

test('players can be paired into teams, split, and auto-paired', () => {
  const s = L.newState();
  L.setGroupCount(s, 2);
  const [g1, g2] = s.groups;
  const ps = ['Ann Lee', 'Bob Ray', 'Cal Fox', 'Dee Hart', 'Eve Moss'].map((n, i) => L.addPlayer(s, n, i < 2 ? g1.id : g2.id));
  const t = L.pairPlayers(s, [ps[0].id, ps[1].id]);
  assert.equal(L.teamLabel(t), 'Ann L. & Bob R.');
  assert.equal(t.groupId, g1.id);
  assert.throws(() => L.pairPlayers(s, [ps[0].id, ps[2].id]), /already on team/);
  L.updateTeam(s, t.id, { players: ['Ann Leigh', 'Bob Ray'] });
  assert.equal(L.player(s, ps[0].id).name, 'Ann Leigh');
  L.splitTeam(s, t.id);
  assert.equal(s.teams.length, 0);
  const r = L.autoPair(s, true, () => 0.5);
  assert.deepEqual(r, { made: 2, left: 1 });
  // Same-group pairing: the g1 players end up together.
  const g1Team = s.teams.find((x) => x.playerIds.includes(ps[0].id));
  assert.ok(g1Team.playerIds.includes(ps[1].id));
  assert.equal(g1Team.groupId, g1.id);
});

test('groups total up wins and are spread across pools', () => {
  const s = L.newState();
  L.setPoolCount(s, 2);
  L.setGroupCount(s, 2);
  const [g1, g2] = s.groups;
  ['A1', 'A2', 'B1', 'B2'].forEach((n) => L.addTeam(s, { name: n, groupId: n[0] === 'A' ? g1.id : g2.id }));
  L.autoAssign(s);
  for (const p of s.pools) {
    assert.deepEqual(p.teamIds.map((id) => L.team(s, id).groupId).sort(), [g1.id, g2.id].sort());
  }
  for (const g of s.games) L.recordResult(s, g.id, L.team(s, g.teamA).groupId === g1.id ? 21 : 0, L.team(s, g.teamA).groupId === g1.id ? 0 : 21);
  const st = L.groupStandings(s);
  assert.equal(st[0].groupId, g1.id);
  assert.deepEqual([st[0].wins, st[0].losses, st[0].teams], [2, 0, 2]);
  L.setGroupCount(s, 1);
  assert.ok(s.teams.filter((t) => t.groupId === g2.id).length === 0);
});

test('pool planner fills the bracket with no byes', () => {
  // Our 2026 tournament: 31 teams, 8-team bracket -> 8 pools (seven of 4, one of 3), winners advance.
  assert.equal(L.suggestedBracketSize(31), 8);
  const best = L.planPools(31, 8)[0];
  assert.deepEqual([best.pools, best.advance, best.wildcards], [8, 1, 0]);
  assert.deepEqual(best.sizes, [4, 4, 4, 4, 4, 4, 4, 3]);
  for (const [teams, size] of [[12, 4], [17, 4], [20, 4], [24, 8], [40, 8], [50, 16], [64, 16], [9, 2]]) {
    const plans = L.planPools(teams, size);
    assert.ok(plans.length, teams + ' teams');
    for (const p of plans) {
      assert.ok(p.minSize >= 3);
      assert.equal(p.advance * p.pools + p.wildcards, size);
      assert.equal(p.sizes.reduce((a, b) => a + b, 0), teams);
    }
  }
});

test('applying a plan rebuilds the pools', () => {
  const s = L.newState();
  for (let i = 0; i < 31; i++) L.addTeam(s, 'T' + i);
  L.applyPlan(s, L.planPools(31, 8)[0]);
  assert.equal(s.pools.length, 8);
  assert.deepEqual(s.pools.map((p) => p.teamIds.length).sort(), [3, 4, 4, 4, 4, 4, 4, 4]);
  assert.equal(s.settings.advancePerPool, 1);
  L.recordResult(s, s.games[0].id, 21, 3);
  assert.throws(() => L.applyPlan(s, L.planPools(31, 8)[0]), /already started/);
});
