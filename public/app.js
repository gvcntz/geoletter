// GeoLetter map page. Plain JS, no build step. User text only ever goes through textContent.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const I18N = window.GeoI18n;
  const tr = (key, params) => I18N.tr(key, params);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = () => innerWidth < 760;
  const panel = $('#panel');
  const intro = $('#intro');
  const view = $('#view');
  let cfg = { demo: false, lockRadiusDefault: 200 };
  let map;
  let draftMarker = null;
  let composing = null; // the open form's "move the point" function, while one is open
  let currentPlace = null; // { lng, lat } of the place view on screen, to redraw it on a language change
  let readerPos = null; // only set after the person presses a button that asks for it

  // Rendered features come back rounded to the tile grid (hundreds of metres at world zoom),
  // so the place to open is looked up by id in the data as it was loaded.
  const exact = new Map();
  const remember = (data) => { exact.clear(); for (const f of data.features || []) exact.set(f.properties.id, f.geometry.coordinates); };
  const coordsOf = (f) => (f.properties.id && exact.get(f.properties.id)) || f.geometry.coordinates;

  // A finger is about 44 px wide; the dots stay small, the target around them does not.
  const HIT_RADIUS = 22;
  const SAME_PLACE_M = 60;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || tr('error.generic'));
    return data;
  }

  const fmtDate = (ms) => new Intl.DateTimeFormat(I18N.locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
  function fmtDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    if (m < 100000) return `${(m / 1000).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 })} km`;
    return `${Math.round(m / 1000).toLocaleString(I18N.locale())} km`;
  }
  function meters(a, b) {
    const k = Math.PI / 180;
    const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
    const y = (b[1] - a[1]) * k;
    return Math.hypot(x, y) * 6371000;
  }
  const ease = (opts) => map.easeTo({ ...opts, duration: reduceMotion ? 0 : opts.duration ?? 900 });

  // ---------- remembered offerings (author keys stay in this browser only) ----------
  const MINE_KEY = 'geoletter.mine';
  const loadMine = () => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { return []; } };
  const saveMine = (list) => localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 30)));
  function rememberMine(entry) { saveMine([entry, ...loadMine().filter((e) => e.id !== entry.id)]); }

  function mineTitle(m) {
    if (m.kind) return m.kind === 'letter' ? tr('mine.letter', { to: m.to || '' }) : tr(`mine.${m.kind}`);
    return m.title || tr('mine.untitled');
  }

  async function renderMine() {
    const list = loadMine();
    const box = $('#mine');
    const ul = $('#mine-list');
    ul.replaceChildren();
    box.hidden = list.length === 0;
    for (const m of list.slice(0, 8)) {
      const li = h('li', null, h('a', { href: `/l/${m.id}?k=${encodeURIComponent(m.key)}` }, mineTitle(m)), ' ', h('span', { class: 'status' }, ''));
      ul.append(li);
      api(`/api/offerings/${m.id}?k=${encodeURIComponent(m.key)}`)
        .then((o) => {
          li.querySelector('.status').textContent = tr(o.status === 'approved' ? 'status.approved' : o.status === 'queued' ? 'status.queued' : 'status.rejected');
        })
        .catch(() => { li.querySelector('.status').textContent = tr('status.gone'); });
    }
  }

  async function renderRecent() {
    try {
      const { offerings } = await api('/api/recent');
      const ul = $('#recent-list');
      ul.replaceChildren(...offerings.map((o) => h('li', null, h('button', { type: 'button', onclick: () => {
        map.flyTo({ center: [o.lng, o.lat], zoom: 15.5, duration: reduceMotion ? 0 : 2400 });
        openPlace(o.lng, o.lat);
      } }, o.title, h('span', { class: 'where' }, `${o.place || tr('somewhere')} · ${fmtDate(o.created_at)}`)))));
      $('#recent').hidden = offerings.length === 0;
    } catch { /* the map still works without it */ }
  }

  // ---------- panel ----------
  function showIntro() {
    view.hidden = true;
    view.replaceChildren();
    intro.hidden = false;
    panel.classList.remove('tall');
    composing = null;
    currentPlace = null;
    clearDraftMarker();
    renderMine();
    renderRecent();
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  function showView(...children) {
    intro.hidden = true;
    composing = null;
    view.replaceChildren(...children);
    view.hidden = false;
    panel.scrollTop = 0;
  }

  function clearDraftMarker() {
    if (draftMarker) { draftMarker.remove(); draftMarker = null; }
  }

  // On phones the sheet grows and the map shrinks: keep the chosen spot in view.
  function keepInView(lngLat) {
    if (narrow()) setTimeout(() => ease({ center: lngLat, duration: 600 }), 60);
  }

  function placeDraftMarker(lngLat, onMove) {
    clearDraftMarker();
    const el = h('div', { class: 'draft-marker', 'aria-hidden': 'true' });
    draftMarker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(lngLat).addTo(map);
    draftMarker.on('dragend', () => { const p = draftMarker.getLngLat(); onMove(p.lng, p.lat); });
    keepInView(lngLat);
  }

  // ---------- a place on the map ----------
  async function openPlace(lng, lat) {
    history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)}`);
    const back = h('button', { type: 'button', class: 'link close', onclick: showIntro }, tr('back'));
    showView(back, h('p', { class: 'small' }, tr('search.looking')));
    currentPlace = { lng, lat };
    keepInView([lng, lat]);
    let data;
    const q = new URLSearchParams({ lat, lng });
    if (readerPos) { q.set('rlat', readerPos.lat); q.set('rlng', readerPos.lng); }
    try {
      data = await api(`/api/place?${q}`);
    } catch (e) {
      showView(back, h('p', { class: 'error' }, e.message));
      return;
    }
    if (!currentPlace || currentPlace.lng !== lng || currentPlace.lat !== lat) return; // something else was opened meanwhile
    const list = data.offerings;
    if (!list.length) { compose({ lng, lat }); return; }

    const counts = { flower: 0, candle: 0, letter: 0, item: 0 };
    list.forEach((o) => counts[o.kind]++);
    const words = ['flower', 'candle', 'letter', 'item'].filter((k) => counts[k]).map((k) => tr(`count.${k}`, { n: counts[k] }));

    const place = list.find((o) => o.place)?.place || tr('thisPlace');
    const items = list.map((o) => {
      const meta = [fmtDate(o.created_at), o.from && tr('from', { name: o.from })].filter(Boolean).join(' · ');
      let content;
      if (!o.open) {
        const far = o.distance !== null ? tr('away', { d: fmtDistance(o.distance) }) : '';
        content = h('p', { class: 'sealed' }, tr('sealedList', { r: o.radius }) + far);
      } else if (o.excerpt) {
        content = h('p', { class: 'excerpt', lang: o.lang || undefined }, o.excerpt);
      }
      const isText = o.kind === 'letter' || o.kind === 'item' || o.excerpt;
      return h('li', { 'data-id': o.id },
        h('p', { class: 'title' }, o.title),
        h('p', { class: 'meta' }, meta, o.example ? ` · ${tr('example')}` : ''),
        content,
        isText ? h('a', { href: `/l/${o.id}` }, o.kind === 'letter' ? (o.open ? tr('readLetter') : tr('goToLetter')) : tr('open')) : null,
      );
    });

    showView(
      back,
      h('div', { class: 'place-head' }, h('h2', null, place), h('p', { class: 'tally' }, words.join(', '))),
      h('ul', { class: 'offering-list' }, items),
      h('button', { type: 'button', onclick: () => compose({ lng, lat, place }) }, tr('leaveToo')),
    );
    currentPlace = { lng, lat };
  }

  // ---------- leaving something ----------
  async function compose({ lng, lat, place = '', restore = null }) {
    const pos = { lng, lat };
    const form = $('#compose-tpl').content.firstElementChild.cloneNode(true);
    I18N.apply(form);
    showView(form);
    panel.classList.add('tall');
    const f = form.elements;
    let autoName = '';
    let lookup = 0;

    const nameThisSpot = () => {
      const mine = ++lookup;
      f.place.placeholder = tr('compose.placeFinding');
      api(`/api/geo/reverse?lat=${pos.lat}&lng=${pos.lng}&lang=${I18N.lang}`)
        .then((r) => {
          if (mine !== lookup) return;
          // Only fill the field if the person has not typed their own name for the place.
          if (!f.place.value || f.place.value === autoName) { autoName = r.name || ''; f.place.value = autoName; }
        })
        .catch(() => {})
        .finally(() => { if (mine === lookup) f.place.placeholder = tr('compose.placeHolder'); });
    };

    const moveTo = (nlng, nlat) => {
      pos.lng = nlng;
      pos.lat = nlat;
      history.replaceState(null, '', `#${nlat.toFixed(5)},${nlng.toFixed(5)}`);
      if (draftMarker) draftMarker.setLngLat([nlng, nlat]); else placeDraftMarker([nlng, nlat], moveTo);
      nameThisSpot();
    };

    history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)}`);
    placeDraftMarker([lng, lat], moveTo);
    f.place.value = place;
    f.place.placeholder = tr('compose.placeHolder');
    if (!place) nameThisSpot();
    f.radius.value = String(cfg.lockRadiusDefault);

    const update = () => {
      const kind = f.kind.value;
      form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(kind); });
      const submit = form.querySelector('[data-submit]');
      submit.dataset.i18n = `submit.${kind}`;
      submit.textContent = tr(`submit.${kind}`);
    };
    form.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', update));
    const count = form.querySelector('[data-count]');
    f.body.addEventListener('input', () => { count.textContent = `${[...f.body.value].length} / 2000`; });

    if (restore) {
      for (const [k, v] of Object.entries(restore)) {
        if (k === 'kind') form.querySelector(`input[name="kind"][value="${v}"]`).checked = true;
        else if (k === 'locked') f.locked.checked = !!v;
        else if (f[k] && typeof v === 'string') f[k].value = v;
      }
      f.body.dispatchEvent(new Event('input'));
    }
    update();

    form.querySelector('[data-close]').addEventListener('click', showIntro);

    // Gemma draft from loose memories.
    const draftBtn = form.querySelector('[data-draft]');
    const draftState = form.querySelector('[data-draft-state]');
    draftBtn.addEventListener('click', async () => {
      const notes = f.notes.value.trim();
      if (notes.length < 10) { draftState.hidden = false; draftState.textContent = tr('draft.needNotes'); return; }
      if (f.body.value.trim() && !confirm(tr('draft.replace'))) return;
      draftBtn.disabled = true;
      draftState.hidden = false;
      draftState.textContent = tr('draft.working');
      try {
        const r = await api('/api/draft', { method: 'POST', body: { to: f.to.value, notes } });
        f.body.value = r.body;
        f.body.dispatchEvent(new Event('input'));
        draftState.textContent = tr('draft.done');
        f.body.focus();
      } catch (e) {
        draftState.textContent = e.message;
      } finally {
        draftBtn.disabled = false;
      }
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const kind = f.kind.value;
      const err = form.querySelector('[data-error]');
      err.hidden = true;
      const payload = {
        kind, lat: pos.lat, lng: pos.lng,
        place: f.place.value,
        to: f.to.value,
        from: f.from.value,
        body: kind === 'letter' ? f.body.value : kind === 'item' ? f.item.value : f.note.value,
        lang: navigator.language || 'en',
        placeLang: I18N.lang,
      };
      if (kind === 'letter') {
        payload.locked = f.locked.checked;
        payload.radius = Number(f.radius.value);
        if (f.email.value.trim()) payload.email = f.email.value.trim();
      }
      const btn = form.querySelector('[data-submit]');
      btn.disabled = true;
      try {
        const r = await api('/api/offerings', { method: 'POST', body: payload });
        rememberMine({ id: r.id, key: r.key, kind, to: payload.to.trim(), at: Date.now() });
        const restoreData = {
          kind, place: f.place.value, to: f.to.value, from: f.from.value,
          body: f.body.value, item: f.item.value, note: f.note.value, locked: f.locked.checked,
        };
        waitForGuardian(r, { lng: pos.lng, lat: pos.lat, restore: restoreData });
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });

    composing = moveTo;
    f.place.focus({ preventScroll: true });
  }

  function candleSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 40 72');
    svg.setAttribute('class', 'candle');
    svg.setAttribute('aria-hidden', 'true');
    const flame = document.createElementNS(ns, 'path');
    flame.setAttribute('class', 'flame');
    flame.setAttribute('d', 'M20 6c4 7 6 10 6 14a6 6 0 0 1-12 0c0-4 2-7 6-14z');
    const body = document.createElementNS(ns, 'rect');
    Object.entries({ x: 11, y: 32, width: 18, height: 34, rx: 1.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }).forEach(([k, v]) => body.setAttribute(k, v));
    svg.append(flame, body);
    return svg;
  }

  function waitForGuardian(created, back) {
    const link = `/l/${created.id}?k=${encodeURIComponent(created.key)}`;
    const line = h('p', null, '');
    const box = h('div', { class: 'waiting' },
      h('div', { class: 'flame-line' }, candleSvg(), line),
      h('p', { class: 'small' }, tr('wait.close'), h('a', { href: link }, tr('wait.later')), '.'),
    );
    showView(h('button', { type: 'button', class: 'link close', onclick: showIntro }, tr('backToMap')), box);

    const render = (o) => {
      if (o.status === 'approved') {
        line.textContent = tr('wait.approved');
        box.append(h('p', null, h('a', { href: `/l/${created.id}` }, tr('wait.openPage'))));
        if (created.notice) box.append(h('p', { class: 'small' }, tr('wait.mail')));
        loadOfferings();
        clearDraftMarker();
        return true;
      }
      if (o.status === 'rejected' || o.status === 'failed') {
        line.textContent = tr('wait.refused');
        box.append(
          h('p', { class: 'reason' }, o.reason || tr('wait.noReason')),
          h('button', { type: 'button', onclick: () => compose(back) }, tr('wait.retry')),
        );
        return true;
      }
      line.textContent = o.reviewing ? tr('wait.reading') : o.queueAhead > 0 ? tr('wait.ahead', { n: o.queueAhead }) : tr('wait.next');
      return false;
    };

    if (created.status === 'approved') { render({ status: 'approved' }); return; }
    render({ status: 'queued', queueAhead: created.queueAhead });
    const poll = async () => {
      if (!document.body.contains(box)) return;
      try {
        const o = await api(`/api/offerings/${created.id}?k=${encodeURIComponent(created.key)}`);
        if (render(o)) return;
      } catch { /* keep waiting */ }
      setTimeout(poll, 2500);
    };
    setTimeout(poll, 2000);
  }

  // ---------- search ----------
  // While typing: suggestions from Photon (300 ms after the last key). Enter: Photon and
  // Nominatim together, or the highlighted suggestion. Coordinates are understood as they are.
  const qInput = $('#q');
  const resultsEl = $('#results');
  const stateEl = $('#search-state');
  let results = [];
  let active = -1;
  let typingTimer = 0;
  let controller = null;
  let lastAsked = '';

  // Places big enough that a single point would be a guess: zoom there and let the person touch.
  const BROAD = { country: 4.5, state: 6, city: 12, village: 13.5, district: 14.5 };

  function setState(text) {
    stateEl.textContent = text || '';
    stateEl.hidden = !text;
  }

  function closeResults() {
    if (!resultsEl.hidden && view.hidden) panel.classList.remove('tall');
    resultsEl.hidden = true;
    qInput.setAttribute('aria-expanded', 'false');
    qInput.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function highlight(i) {
    const items = resultsEl.querySelectorAll('[role="option"]');
    active = Math.max(-1, Math.min(items.length - 1, i));
    items.forEach((el, j) => el.setAttribute('aria-selected', String(j === active)));
    if (active >= 0) { qInput.setAttribute('aria-activedescendant', items[active].id); items[active].scrollIntoView({ block: 'nearest' }); }
    else qInput.removeAttribute('aria-activedescendant');
  }

  function describe(r) {
    if (r.kind === 'coords') return tr('search.coords');
    const kind = tr(`kind.${r.kind}`);
    const kindWord = kind === `kind.${r.kind}` ? '' : kind;
    return [kindWord, r.context].filter(Boolean).join(' · ');
  }

  function showResults(list) {
    results = list;
    resultsEl.replaceChildren(...list.map((r, i) => h('li', {
      id: `place-${i}`, role: 'option', 'aria-selected': 'false',
      onmousedown: (ev) => ev.preventDefault(), // keep focus in the field until the choice is made
      onclick: () => choose(r),
    }, h('span', { class: 'r-name' }, r.name), h('span', { class: 'r-context' }, describe(r)))));
    resultsEl.hidden = list.length === 0;
    // On a phone the sheet grows while there is a list to read, and shrinks back after.
    if (list.length && narrow()) panel.classList.add('tall');
    qInput.setAttribute('aria-expanded', String(list.length > 0));
    active = -1;
  }

  function choose(r) {
    closeResults();
    setState('');
    qInput.blur();
    const broadZoom = BROAD[r.kind];
    if (broadZoom) {
      map.flyTo({ center: [r.lng, r.lat], zoom: broadZoom, duration: reduceMotion ? 0 : 2200 });
      setState(tr('search.touch', { name: r.name }));
      return;
    }
    map.flyTo({ center: [r.lng, r.lat], zoom: r.kind === 'street' ? 16 : 17, duration: reduceMotion ? 0 : 2200 });
    compose({ lng: r.lng, lat: r.lat, place: r.label || '' });
  }

  async function runSearch(mode) {
    const q = qInput.value.trim();
    if (q.length < 2) { closeResults(); setState(''); return; }
    if (controller) controller.abort();
    controller = new AbortController();
    const asked = `${mode}:${q}`;
    lastAsked = asked;
    const params = new URLSearchParams({ q, mode, lang: I18N.lang });
    if (map) {
      const c = map.getCenter();
      params.set('lat', c.lat.toFixed(3));
      params.set('lng', c.lng.toFixed(3));
      params.set('z', map.getZoom().toFixed(1));
    }
    if (mode === 'full') setState(tr('search.looking'));
    try {
      const res = await fetch(`/api/geo/search?${params}`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (lastAsked !== asked) return;
      if (!res.ok) throw new Error(data.error || tr('error.generic'));
      showResults(data.results || []);
      if (data.results && data.results.length) setState('');
      else if (data.degraded) setState(tr('search.down'));
      else setState(mode === 'suggest' ? tr('search.noneYet') : tr('search.none'));
      if (mode === 'full' && data.results && data.results.length === 1 && data.results[0].kind === 'coords') choose(data.results[0]);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setState(e.message);
    }
  }

  qInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    const q = qInput.value.trim();
    if (q.length < 3) { closeResults(); setState(''); if (controller) controller.abort(); return; }
    typingTimer = setTimeout(() => runSearch('suggest'), 300);
  });

  qInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && results.length) { ev.preventDefault(); if (resultsEl.hidden) showResults(results); highlight(active + 1); }
    else if (ev.key === 'ArrowUp' && results.length) { ev.preventDefault(); highlight(active - 1); }
    else if (ev.key === 'Escape') { closeResults(); }
  });

  qInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== qInput) closeResults(); }, 150));
  qInput.addEventListener('focus', () => { if (results.length && qInput.value.trim().length >= 2) showResults(results); });

  $('#search').addEventListener('submit', (ev) => {
    ev.preventDefault();
    clearTimeout(typingTimer);
    if (active >= 0 && results[active]) { choose(results[active]); return; }
    runSearch('full');
  });

  // ---------- map ----------
  async function loadOfferings() {
    const data = await api('/api/offerings');
    remember(data);
    const src = map.getSource('offerings');
    if (src) src.setData(data);
    return data;
  }

  function addLayers(data) {
    remember(data);
    // Points whose 44 px targets would overlap are grouped, so a finger never has to choose.
    map.addSource('offerings', { type: 'geojson', data, cluster: true, clusterRadius: 40, clusterMaxZoom: 16 });
    map.addLayer({
      id: 'glow', type: 'circle', source: 'offerings', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 11, 14, 20],
        'circle-color': '#e3a645', 'circle-blur': 1,
        'circle-opacity': ['match', ['get', 'kind'], 'candle', 0.7, 0.4],
      },
    });
    map.addLayer({
      id: 'clusters', type: 'circle', source: 'offerings', filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 11, 5, 14, 20, 18],
        'circle-color': '#fbf3e2', 'circle-stroke-color': '#a8691e', 'circle-stroke-width': 1.4,
      },
    });
    map.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'offerings', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
      paint: { 'text-color': '#5a4632' },
    });
    map.addLayer({
      id: 'points', type: 'circle', source: 'offerings', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4.2, 14, 6.5],
        'circle-color': ['match', ['get', 'kind'], 'flower', '#cf8420', 'candle', '#f2c25a', 'item', '#9c5b3f', '#fbf3e2'],
        'circle-stroke-color': ['case', ['==', ['get', 'locked'], 1], '#9a8f80', '#4a3a2b'],
        'circle-stroke-width': ['match', ['get', 'kind'], 'letter', 1.5, 0.8],
      },
    });
    // A thin ring that fades in under the pointer on desktop.
    map.addLayer({
      id: 'hover-ring', type: 'circle', source: 'offerings', filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          1, ['case', ['has', 'point_count'], ['step', ['get', 'point_count'], 15, 5, 18, 20, 22], 8.5],
          14, ['case', ['has', 'point_count'], ['step', ['get', 'point_count'], 15, 5, 18, 20, 22], 11]],
        'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#8a5418', 'circle-stroke-width': 1,
        'circle-stroke-opacity': 0, 'circle-stroke-opacity-transition': { duration: 220 },
      },
    });
    // Invisible, finger-sized targets for both dots and groups. Queried, never seen.
    map.addLayer({
      id: 'hit', type: 'circle', source: 'offerings',
      paint: { 'circle-radius': HIT_RADIUS, 'circle-color': '#000', 'circle-opacity': 0 },
    });

    // The map stays still: redrawing it for an animation costs battery on phones.
    // The candle that flickers lives on the letter page, in CSS.

    let hovered = null;
    map.on('mousemove', (e) => {
      const f = nearestHit(e.point)[0];
      const key = f ? (f.properties.cluster ? `c${f.properties.cluster_id}` : f.properties.id) : null;
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      if (key === hovered) return;
      hovered = key;
      if (f) {
        map.setFilter('hover-ring', f.properties.cluster
          ? ['==', ['get', 'cluster_id'], f.properties.cluster_id]
          : ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], f.properties.id]]);
        map.setPaintProperty('hover-ring', 'circle-stroke-opacity', 0.9);
      } else {
        map.setPaintProperty('hover-ring', 'circle-stroke-opacity', 0);
      }
    });
    map.getCanvas().addEventListener('mouseleave', () => {
      hovered = null;
      map.getCanvas().style.cursor = '';
      map.setPaintProperty('hover-ring', 'circle-stroke-opacity', 0);
    });
  }

  /** Offerings and groups whose finger-sized target covers this screen point, nearest first. */
  function nearestHit(point) {
    const r = HIT_RADIUS;
    const found = map.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]], { layers: ['hit'] });
    const seen = new Set();
    return found
      .map((f) => {
        const p = map.project(coordsOf(f));
        return { f, d: Math.hypot(p.x - point.x, p.y - point.y) };
      })
      .filter(({ f, d }) => {
        const key = f.properties.cluster ? `c${f.properties.cluster_id}` : f.properties.id;
        if (d > r + 2 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.d - b.d)
      .map(({ f }) => f);
  }

  async function openGroup(f) {
    const src = map.getSource('offerings');
    const id = f.properties.cluster_id;
    const leaves = await src.getClusterLeaves(id, 100, 0).catch(() => []);
    const first = leaves[0]?.geometry.coordinates;
    // Everything in the group stands on the same spot: there is nothing to separate, show the list.
    if (first && leaves.every((l) => meters(first, l.geometry.coordinates) <= SAME_PLACE_M)) {
      map.flyTo({ center: first, zoom: Math.max(map.getZoom(), 16), duration: reduceMotion ? 0 : 1600 });
      openPlace(first[0], first[1]);
      return;
    }
    const zoom = await src.getClusterExpansionZoom(id).catch(() => map.getZoom() + 2);
    ease({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.5, 18) });
  }

  function onMapClick(e) {
    const hits = nearestHit(e.point);
    if (composing && !hits.length) { composing(e.lngLat.lng, e.lngLat.lat); return; }
    if (!hits.length) { compose({ lng: e.lngLat.lng, lat: e.lngLat.lat }); return; }
    const first = hits[0];
    if (first.properties.cluster) { openGroup(first); return; }
    const at = coordsOf(first);
    // Two dots under one finger but in different places: come closer instead of guessing.
    const elsewhere = hits.filter((f) => f.properties.cluster || meters(at, coordsOf(f)) > SAME_PLACE_M);
    if (elsewhere.length && map.getZoom() < 18) {
      const all = [first, ...elsewhere].map(coordsOf);
      const lngs = all.map((c) => c[0]);
      const lats = all.map((c) => c[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 18, duration: reduceMotion ? 0 : 900 });
      return;
    }
    openPlace(at[0], at[1]);
  }

  // ---------- language ----------
  document.addEventListener('geoletter:lang', () => {
    renderMine();
    renderRecent();
    if (!view.hidden && currentPlace && !composing) openPlace(currentPlace.lng, currentPlace.lat);
    if (results.length && !resultsEl.hidden) showResults(results);
    if (!stateEl.hidden) setState('');
  });

  async function start() {
    cfg = await api('/api/config').catch(() => cfg);
    const fromHash = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(location.hash);
    const small = narrow();
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: fromHash ? [Number(fromHash[2]), Number(fromHash[1])] : small ? [-20, 25] : [-30, 18],
      zoom: fromHash ? 16 : small ? 0.3 : 1.7,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), small ? 'top-right' : 'bottom-right');
    // Keep the interesting part of the map out from under the panel.
    const pad = () => {
      const isNarrow = narrow();
      // On phones the map ends where the sheet begins, so nothing is hidden under it.
      // On wide screens the side panel floats over the map and padding keeps the centre clear.
      const mapEl = document.getElementById('map');
      const bottom = isNarrow ? `${panel.offsetHeight}px` : '0px';
      if (mapEl.style.bottom !== bottom) { mapEl.style.bottom = bottom; map.resize(); }
      map.setPadding({ left: isNarrow ? 0 : panel.offsetWidth, top: 0, right: 0, bottom: 0 });
    };
    pad();
    new ResizeObserver(pad).observe(panel);
    map.on('load', async () => {
      // A quieter basemap: fewer labels, paper-coloured land.
      for (const layer of map.getStyle().layers) {
        if (layer.type === 'symbol' && /shield|airport|label_other|highway-name-path/.test(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none');
        if (layer.id === 'background') map.setPaintProperty('background', 'background-color', '#f2ead9');
        if (layer.id === 'water') map.setPaintProperty('water', 'fill-color', '#d3d6d0');
        if (layer.type === 'symbol') {
          try { map.setPaintProperty(layer.id, 'text-color', '#7a6a58'); map.setPaintProperty(layer.id, 'text-halo-color', '#f5efe3'); } catch { /* not a text layer */ }
        }
      }
      const data = await api('/api/offerings').catch(() => ({ type: 'FeatureCollection', features: [] }));
      addLayers(data);
      map.on('click', onMapClick);
      if (fromHash) openPlace(Number(fromHash[2]), Number(fromHash[1]));
    });
    renderMine();
    renderRecent();
  }

  start();
})();
