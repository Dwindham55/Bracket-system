/* Display helpers used by both the admin page and the TV dashboard. */
(function (root) {
  'use strict';

  const L = root.Logic;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // "#7 Dave & Tripp": number plus name, for lists and tables.
  function teamName(state, id) {
    const t = id && L.team(state, id);
    return t ? '#' + t.number + ' ' + L.teamLabel(t) : 'TBD';
  }

  // Big two-line block for boards and the pop-up: number + team name, then
  // the players underneath when the team also has a name of its own.
  function teamBlock(state, id, cls = 'tb') {
    const t = id && L.team(state, id);
    if (!t) return '<div class="' + cls + '"><span class="' + cls + '-name">TBD</span></div>';
    const players = t.name && t.players.length ? '<div class="' + cls + '-players">' + esc(t.players.map(L.shortName).join(' & ')) + '</div>' : '';
    const g = groupName(state, t.id);
    const grp = g ? '<div class="' + cls + '-group">' + esc(g) + '</div>' : '';
    return (
      '<div class="' + cls + '"><div class="' + cls + '-line"><span class="' + cls + '-num">#' + t.number + '</span><span class="' +
      cls + '-name">' + nameParts(L.teamLabel(t)) + '</span></div>' + players + grp + '</div>'
    );
  }

  // Keep each player's name whole when a long pair has to wrap.
  function nameParts(label) {
    return label.split(' & ').map((n) => '<span class="nw">' + esc(n) + '</span>').join(' & ');
  }

  // The team's church or group, when groups are turned on.
  function groupName(state, teamId) {
    const t = L.team(state, teamId);
    const g = state.settings.useGroups && t && t.groupId && L.group(state, t.groupId);
    return g ? g.name : '';
  }

  function groupTable(state) {
    const rows = L.groupStandings(state);
    if (!rows.length) return '<p class="muted">No groups yet</p>';
    return (
      '<table class="standings"><thead><tr><th></th><th>Church / group</th><th>Teams</th><th>W</th><th>L</th><th>Diff</th></tr></thead><tbody>' +
      rows
        .map((r, i) => '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(L.group(state, r.groupId).name) + '</td><td class="num">' + r.teams +
          '</td><td class="num">' + r.wins + '</td><td class="num">' + r.losses + '</td><td class="num">' + fmtDiff(r.diff) + '</td></tr>')
        .join('') +
      '</tbody></table>'
    );
  }

  // How the announcer says a team: "team 7, Dave and Tripp".
  function spokenName(state, id) {
    const t = L.team(state, id);
    if (!t) return '';
    const who = t.players.length ? t.players.map((n) => L.shortName(n).replace(/\.$/, '')).join(' and ') : t.name;
    return 'team ' + t.number + ', ' + who;
  }

  function boardName(state, id) {
    const b = id && L.board(state, id);
    return b ? b.name : '';
  }

  function letterOf(state, poolId, teamId) {
    const p = L.pool(state, poolId);
    const i = p ? p.teamIds.indexOf(teamId) : -1;
    return i >= 0 ? L.LETTERS[i] : '?';
  }

  // Short label for where a game belongs, e.g. "Pool 3 · A vs C" or "Semifinals".
  function gameStage(state, g) {
    if (g.stage === 'pool') {
      const p = L.pool(state, g.poolId);
      return (p ? p.name : 'Pool') + ' · ' + letterOf(state, g.poolId, g.teamA) + ' vs ' + letterOf(state, g.poolId, g.teamB);
    }
    const name = L.roundName(state.bracket.rounds, g.round);
    const count = state.games.filter((x) => x.stage === 'bracket' && x.round === g.round).length;
    return count > 1 ? name + ' · Match ' + (g.index + 1) : name;
  }

  function matchup(state, g) {
    return esc(teamName(state, g.teamA)) + ' <span class="vs">vs</span> ' + esc(teamName(state, g.teamB));
  }

  function fmtDiff(n) {
    return n > 0 ? '+' + n : String(n);
  }

  function standingsTable(state, poolId, opts = {}) {
    const rows = L.poolStandings(state, poolId);
    const per = state.settings.advancePerPool;
    if (!rows.length) return '<p class="muted">No teams yet</p>';
    return (
      '<table class="standings"><thead><tr><th></th><th>Team</th><th>W</th><th>L</th><th>Diff</th></tr></thead><tbody>' +
      rows
        .map(
          (r) =>
            '<tr class="' + (r.rank <= per && r.played ? 'adv' : '') + '"><td class="num">' + r.rank + '</td><td>' +
            (opts.letters ? '<span class="letter">' + letterOf(state, poolId, r.teamId) + '</span> ' : '') +
            esc(teamName(state, r.teamId)) + '</td><td class="num">' + r.wins + '</td><td class="num">' + r.losses +
            '</td><td class="num">' + fmtDiff(r.diff) + '</td></tr>'
        )
        .join('') +
      '</tbody></table>'
    );
  }

  function bracketHTML(state, opts = {}) {
    const b = state.bracket;
    if (!b) return '';
    const seedOf = (id) => b.seeds.indexOf(id) + 1;
    let html = '<div class="bracket">';
    for (let r = 0; r < b.rounds; r++) {
      const games = state.games.filter((g) => g.stage === 'bracket' && g.round === r).sort((x, y) => x.index - y.index);
      html += '<div class="round"><h4>' + esc(L.roundName(b.rounds, r)) + '</h4><div class="round-games">';
      for (const g of games) {
        const side = (id, score) => {
          const won = g.winner && g.winner === id;
          const lost = g.status === 'done' && id && !won;
          return (
            '<div class="slot' + (won ? ' won' : '') + (lost ? ' lost' : '') + (id ? '' : ' empty') + '">' +
            (id ? '<span class="seed">' + seedOf(id) + '</span>' : '') +
            '<span class="name">' + (id ? esc(teamName(state, id)) : g.status === 'bye' ? 'Bye' : 'TBD') + '</span>' +
            '<span class="score">' + (g.status === 'done' ? score : '') + '</span></div>'
          );
        };
        const status =
          g.status === 'called' ? '<div class="live">' + esc(boardName(state, g.boardId)) + '</div>' : '';
        const click = opts.clickable && g.status !== 'bye' && g.teamA && g.teamB;
        html +=
          '<div class="match ' + g.status + (click ? ' clickable" data-act="score" data-id="' + g.id : '') + '">' +
          status + side(g.teamA, g.scoreA) + side(g.teamB, g.scoreB) + '</div>';
      }
      html += '</div></div>';
    }
    if (b.championId) {
      html += '<div class="round champion-col"><h4>Champion</h4><div class="round-games"><div class="champion">🏆 ' + esc(teamName(state, b.championId)) + '</div></div></div>';
    }
    return html + '</div>';
  }

  function chime() {
    try {
      const ctx = chime.ctx || (chime.ctx = new (window.AudioContext || window.webkitAudioContext)());
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.start(t);
        o.stop(t + 0.55);
      });
    } catch (e) {
      /* sound is optional */
    }
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* speech is optional */
    }
  }

  root.UI = { esc, teamName, teamBlock, groupName, groupTable, spokenName, boardName, letterOf, gameStage, matchup, fmtDiff, standingsTable, bracketHTML, chime, speak };
})(window);
