/*
 * Saves the tournament in this browser and keeps the TV dashboard in sync.
 *
 * The dashboard hears about changes three ways so it works whether the app is
 * opened from a file or a web server: postMessage to the window this page
 * opened, a BroadcastChannel, and the localStorage "storage" event.
 */
(function (root) {
  'use strict';

  const KEY = 'cornhole-tournament-v1';
  const CHANNEL = 'cornhole-tournament';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save to this browser', e);
    }
  }

  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch (e) {
    channel = null;
  }

  // Subscribe to state from another window. Calls fn(state) on every change.
  function listen(fn) {
    let last = '';
    const take = (state) => {
      if (!state) return;
      const json = JSON.stringify(state);
      if (json === last) return;
      last = json;
      fn(state);
    };
    if (channel) channel.onmessage = (e) => take(e.data);
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'cornhole-state') take(e.data.state);
    });
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) take(read());
    });
    // Polling catches anything the events miss.
    setInterval(() => take(read()), 2000);
    take(read());
    if (window.opener) window.opener.postMessage({ type: 'cornhole-hello' }, '*');
  }

  // The admin side: owns the state, undo history and outgoing sync.
  function createAdminStore(Logic) {
    let state = Logic.migrate(read() || Logic.newState());
    const undo = [];
    const subscribers = [];
    const windows = new Set();

    function broadcast() {
      if (channel) channel.postMessage(state);
      for (const w of windows) {
        if (w.closed) windows.delete(w);
        else w.postMessage({ type: 'cornhole-state', state }, '*');
      }
    }

    function commit() {
      state.updatedAt = Date.now();
      write(state);
      broadcast();
      subscribers.forEach((fn) => fn(state));
    }

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'cornhole-hello' && e.source) {
        windows.add(e.source);
        e.source.postMessage({ type: 'cornhole-state', state }, '*');
      }
    });
    // Another admin tab saved: pick up its changes so we don't overwrite them.
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      const next = read();
      if (!next) return;
      state = Logic.migrate(next);
      subscribers.forEach((fn) => fn(state));
    });

    return {
      get state() {
        return state;
      },
      subscribe(fn) {
        subscribers.push(fn);
      },
      // Run fn against the state. If it throws, nothing changes.
      update(fn) {
        const before = JSON.stringify(state);
        let result;
        try {
          result = fn(state);
        } catch (e) {
          state = JSON.parse(before);
          throw e;
        }
        if (JSON.stringify(state) !== before) {
          undo.push(before);
          if (undo.length > 50) undo.shift();
          commit();
        }
        return result;
      },
      canUndo: () => undo.length > 0,
      undo() {
        if (!undo.length) return;
        state = JSON.parse(undo.pop());
        commit();
      },
      replace(next) {
        undo.push(JSON.stringify(state));
        state = next;
        commit();
      },
      openWindow(url) {
        const w = window.open(url, 'cornhole-dashboard');
        if (w) windows.add(w);
        return w;
      },
    };
  }

  root.Store = { KEY, read, listen, createAdminStore };
})(window);
