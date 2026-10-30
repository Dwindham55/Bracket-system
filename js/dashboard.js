/* TV dashboard: boards in play, who's up next, standings or bracket, and the
   "Now calling" pop-up. Read-only; all changes come from the control page. */
(function () {
  'use strict';

  const L = window.Logic;
  const U = window.UI;
  const esc = U.esc;
  const $ = (sel) => document.querySelector(sel);

  const POPUP_MS = 9000;
  // When several games are called at once, cycle through them faster.
  const POPUP_BUSY_MS = 5000;
  const POOLS_PER_PAGE = 4;
  const PAGE_MS = 12000;

  let state = null;
  let seen = null;
  const popups = [];
  let showing = false;
  let soundOn = false;
  let page = 0;

  function minutesSince(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'just started' : m + ' min';
  }

  function renderBoards(s) {
    return s.boards
      .map((b) => {
        const g = L.gameOnBoard(s, b.id);
        if (!g) return '<div class="dboard open"><div class="dboard-name">' + esc(b.name) + '</div><div class="open-label">OPEN</div></div>';
        return (
          '<div class="dboard busy"><div class="dboard-name">' + esc(b.name) + '<span>' + minutesSince(g.calledAt) + '</span></div>' +
          U.teamBlock(s, g.teamA, 'dteam') + '<div class="dvs">vs</div>' + U.teamBlock(s, g.teamB, 'dteam') +
          '<div class="dstage">' + esc(U.gameStage(s, g)) + '</div></div>'
        );
      })
      .join('');
  }

  function renderUpNext(s) {
    const q = L.queue(s).filter((x) => x.game.teamA && x.game.teamB).slice(0, 8);
    if (!q.length) return '<p class="dim">No games waiting</p>';
    return (
      '<ol class="upnext">' +
      q
        .map(
          (x, i) =>
            '<li class="' + (i === 0 ? 'ondeck' : '') + (x.ready ? '' : ' waiting') + '">' +
            (i === 0 ? '<div class="ondeck-label">ON DECK</div>' : '') +
            '<div class="un-teams">' + U.matchup(s, x.game) + '</div>' +
            '<div class="un-stage">' + esc(U.gameStage(s, x.game)) + (x.ready ? '' : ' · ' + esc(x.reason)) + '</div></li>'
        )
        .join('') +
      '</ol>'
    );
  }

  function renderBottom(s) {
    if (s.bracket) {
      return '<h2>Bracket</h2><div class="bracket-wrap">' + U.bracketHTML(s) + '</div>';
    }
    const pools = s.pools.filter((p) => p.teamIds.length);
    if (!pools.length) return '<h2>Pools</h2><p class="dim">Pools will appear here once teams are placed.</p>';
    const poolPages = Math.ceil(pools.length / POOLS_PER_PAGE);
    const showGroups = s.settings.useGroups && s.groups.length > 0;
    const pages = poolPages + (showGroups ? 1 : 0);
    page = page % pages;
    if (page === poolPages) {
      return '<h2>Church standings <span class="dim">' + (page + 1) + ' / ' + pages + '</span></h2><div class="dgroups">' + U.groupTable(s) + '</div>';
    }
    const shown = pools.slice(page * POOLS_PER_PAGE, (page + 1) * POOLS_PER_PAGE);
    return (
      '<h2>Pool standings' + (pages > 1 ? ' <span class="dim">' + (page + 1) + ' / ' + pages + '</span>' : '') + '</h2><div class="dpools">' +
      shown
        .map((p) => {
          const games = s.games.filter((g) => g.stage === 'pool' && g.poolId === p.id && g.status !== 'skipped');
          const done = games.filter((g) => g.status === 'done').length;
          return '<div class="dpool"><h3>' + esc(p.name) + '<span>' + done + '/' + games.length + ' games</span></h3>' + U.standingsTable(s, p.id) + '</div>';
        })
        .join('') +
      '</div>'
    );
  }

  function render() {
    if (!state) return;
    const s = state;
    document.title = s.name + ' · Dashboard';
    $('#dname').textContent = s.name;
    $('#dboards').innerHTML = renderBoards(s);
    $('#dupnext').innerHTML = renderUpNext(s);
    $('#dbottom').innerHTML = renderBottom(s);
    const champ = s.bracket && s.bracket.championId;
    $('#dphase').textContent = champ ? 'Champion: ' + U.teamName(s, champ) : s.bracket ? 'Bracket play' : 'Pool play';
  }

  // ---------- Now calling pop-up ----------

  function showNext() {
    if (showing || !popups.length || !state) return;
    const a = popups.shift();
    const g = L.game(state, a.gameId);
    // Skip calls that were cancelled or finished before we got to them.
    if (!g || g.status !== 'called' || g.boardId !== a.boardId) return showNext();
    showing = true;
    const s = state;
    const boardName = U.boardName(s, g.boardId);
    const next = L.queue(s).find((x) => x.game.teamA && x.game.teamB);
    $('#popup').innerHTML =
      '<div class="pop"><div class="pop-label">NOW CALLING</div><div class="pop-board">' + esc(boardName) + '</div>' +
      U.teamBlock(s, g.teamA, 'pop-team') + '<div class="pop-vs">vs</div>' +
      U.teamBlock(s, g.teamB, 'pop-team') + '<div class="pop-stage">' + esc(U.gameStage(s, g)) + '</div>' +
      (next ? '<div class="pop-next">Up next: ' + U.matchup(s, next.game) + ' — get ready!</div>' : '') + '</div>';
    $('#popup').classList.add('show');
    if (soundOn) {
      U.chime();
      setTimeout(() => U.speak('Now calling to ' + boardName + '. ' + U.spokenName(s, g.teamA) + '. Versus, ' + U.spokenName(s, g.teamB) + '.'), 700);
    }
    setTimeout(() => {
      $('#popup').classList.remove('show');
      setTimeout(() => {
        showing = false;
        showNext();
      }, 600);
    }, popups.length ? POPUP_BUSY_MS : POPUP_MS);
  }

  window.Store.listen((s) => {
    state = L.migrate(s);
    s = state;
    const anns = s.announcements || [];
    if (seen === null) {
      // Don't replay calls that happened before the dashboard was opened.
      seen = new Set(anns.map((a) => a.id));
    } else {
      for (const a of anns) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        popups.push(a);
      }
    }
    render();
    showNext();
  });

  // ---------- chrome ----------

  function tick() {
    $('#dclock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 10000);
  setInterval(render, 30000);
  setInterval(() => {
    page++;
    if (state && !state.bracket) $('#dbottom').innerHTML = renderBottom(state);
  }, PAGE_MS);

  $('#soundBtn').addEventListener('click', () => {
    soundOn = !soundOn;
    $('#soundBtn').textContent = soundOn ? '🔊 Sound on' : '🔇 Turn on sound';
    if (soundOn) {
      U.chime();
      U.speak('Sound is on.');
    }
  });
  $('#fsBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  // Hide the buttons when the mouse is still so the TV looks clean.
  let idle;
  document.addEventListener('mousemove', () => {
    document.body.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.add('idle'), 3000);
  });
})();
