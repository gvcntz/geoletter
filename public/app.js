// GeoLetter map page. Plain JS, no build step. User text only ever goes through textContent.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const browserLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const panel = $('#panel');
  const intro = $('#intro');
  const view = $('#view');
  let cfg = { demo: false, lockRadiusDefault: 200 };
  let map;
  let draftMarker = null;
  let readerPos = null; // only set after the person presses a button that asks for it

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
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again in a moment.');
    return data;
  }

  const fmtDate = (ms) => new Intl.DateTimeFormat(navigator.language || 'en', { day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
  function fmtDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    if (m < 100000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m / 1000).toLocaleString('en')} km`;
  }

  // ---------- remembered offerings (author keys stay in this browser only) ----------
  const MINE_KEY = 'geoletter.mine';
  const loadMine = () => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { return []; } };
  const saveMine = (list) => localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 30)));
  function rememberMine(entry) { saveMine([entry, ...loadMine().filter((e) => e.id !== entry.id)]); }

  async function renderMine() {
    const list = loadMine();
    const box = $('#mine');
    const ul = $('#mine-list');
    ul.replaceChildren();
    box.hidden = list.length === 0;
    for (const m of list.slice(0, 8)) {
      const li = h('li', null, h('a', { href: `/l/${m.id}?k=${encodeURIComponent(m.key)}` }, m.title || 'An offering'), ' ', h('span', { class: 'status' }, ''));
      ul.append(li);
      api(`/api/offerings/${m.id}?k=${encodeURIComponent(m.key)}`)
        .then((o) => {
          li.querySelector('.status').textContent =
            o.status === 'approved' ? 'on the map' : o.status === 'queued' ? 'with the guardian' : 'kept back';
        })
        .catch(() => { li.querySelector('.status').textContent = 'gone'; });
    }
  }

  async function renderRecent() {
    try {
      const { offerings } = await api('/api/recent');
      const ul = $('#recent-list');
      ul.replaceChildren(...offerings.map((o) => h('li', null, h('button', { type: 'button', onclick: () => {
        map.flyTo({ center: [o.lng, o.lat], zoom: 15.5, duration: reduceMotion ? 0 : 2400 });
        openPlace(o.lng, o.lat);
      } }, o.title, h('span', { class: 'where' }, `${o.place || 'Somewhere'} · ${fmtDate(o.created_at)}`)))));
      $('#recent').hidden = offerings.length === 0;
    } catch { /* the map still works without it */ }
  }

  // ---------- panel ----------
  function showIntro() {
    view.hidden = true;
    view.replaceChildren();
    intro.hidden = false;
    panel.classList.remove('tall');
    clearDraftMarker();
    renderMine();
    renderRecent();
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  function showView(...children) {
    intro.hidden = true;
    view.replaceChildren(...children);
    view.hidden = false;
    panel.scrollTop = 0;
  }

  function clearDraftMarker() {
    if (draftMarker) { draftMarker.remove(); draftMarker = null; }
  }

  function placeDraftMarker(lngLat) {
    clearDraftMarker();
    const el = h('div', { class: 'draft-marker', 'aria-hidden': 'true' });
    draftMarker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    // On phones the sheet grows and the map shrinks: keep the chosen spot in view.
    if (innerWidth < 760) setTimeout(() => map.easeTo({ center: lngLat, duration: reduceMotion ? 0 : 600 }), 50);
  }

  // ---------- a place on the map ----------
  async function openPlace(lng, lat) {
    history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)}`);
    const back = h('button', { type: 'button', class: 'link close', onclick: showIntro }, 'Back');
    showView(back, h('p', { class: 'small' }, 'Looking…'));
    let data;
    const q = new URLSearchParams({ lat, lng });
    if (readerPos) { q.set('rlat', readerPos.lat); q.set('rlng', readerPos.lng); }
    try {
      data = await api(`/api/place?${q}`);
    } catch (e) {
      showView(back, h('p', { class: 'error' }, e.message));
      return;
    }
    const list = data.offerings;
    if (!list.length) { compose({ lng, lat }); return; }

    const counts = { flower: 0, candle: 0, letter: 0, item: 0 };
    list.forEach((o) => counts[o.kind]++);
    const words = [
      counts.flower && `${counts.flower} marigold${counts.flower > 1 ? 's' : ''}`,
      counts.candle && `${counts.candle} candle${counts.candle > 1 ? 's' : ''}`,
      counts.letter && `${counts.letter} letter${counts.letter > 1 ? 's' : ''}`,
      counts.item && `${counts.item} other thing${counts.item > 1 ? 's' : ''}`,
    ].filter(Boolean);

    const place = list.find((o) => o.place)?.place || 'This place';
    const items = list.map((o) => {
      const meta = [fmtDate(o.created_at), o.from && `from ${o.from}`].filter(Boolean).join(' · ');
      let content;
      if (!o.open) {
        const far = o.distance !== null ? ` You are about ${fmtDistance(o.distance)} away.` : '';
        content = h('p', { class: 'sealed' }, `Sealed to this place. It opens within ${o.radius} m.${far}`);
      } else if (o.excerpt) {
        content = h('p', { class: 'excerpt', lang: o.lang || undefined }, o.excerpt);
      }
      const isText = o.kind === 'letter' || o.kind === 'item' || o.excerpt;
      return h('li', null,
        h('p', { class: 'title' }, o.title),
        h('p', { class: 'meta' }, meta, o.example ? ' · example' : ''),
        content,
        isText || o.kind === 'letter' ? h('a', { href: `/l/${o.id}` }, o.kind === 'letter' ? (o.open ? 'Read the letter' : 'Go to the letter') : 'Open') : null,
      );
    });

    showView(
      back,
      h('div', { class: 'place-head' }, h('h2', null, place), h('p', { class: 'tally' }, words.join(', '))),
      h('ul', { class: 'offering-list' }, items),
      h('button', { type: 'button', onclick: () => compose({ lng, lat, place }) }, 'Leave something here too'),
    );
  }

  // ---------- leaving something ----------
  const SUBMIT_LABEL = { flower: 'Leave the marigold', candle: 'Light the candle', letter: 'Leave the letter', item: 'Leave it here' };

  async function compose({ lng, lat, place = '', restore = null }) {
    history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)}`);
    placeDraftMarker([lng, lat]);
    const form = $('#compose-tpl').content.firstElementChild.cloneNode(true);
    showView(form);
    panel.classList.add('tall');
    const f = form.elements;
    f.place.value = place;
    if (!place) {
      f.place.placeholder = 'Finding the name of this place…';
      api(`/api/geo/reverse?lat=${lat}&lng=${lng}&lang=${browserLang}`)
        .then((r) => { if (!f.place.value) f.place.value = r.name || ''; })
        .catch(() => {})
        .finally(() => { f.place.placeholder = 'A street, a plaza, a kitchen in Bauru'; });
    }
    f.radius.value = String(cfg.lockRadiusDefault);

    const update = () => {
      const kind = f.kind.value;
      form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(kind); });
      form.querySelector('[data-submit]').textContent = SUBMIT_LABEL[kind];
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
      if (notes.length < 10) { draftState.hidden = false; draftState.textContent = 'Write a few memories first, even loose ones.'; return; }
      if (f.body.value.trim() && !confirm('Replace what is in the letter with the draft?')) return;
      draftBtn.disabled = true;
      draftState.hidden = false;
      draftState.textContent = 'Gemma is writing a first draft from your notes. On this small server it takes about half a minute.';
      try {
        const r = await api('/api/draft', { method: 'POST', body: { to: f.to.value, notes } });
        f.body.value = r.body;
        f.body.dispatchEvent(new Event('input'));
        draftState.textContent = 'Here is a draft. Change anything that is not how you would say it.';
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
        kind, lat, lng,
        place: f.place.value,
        to: f.to.value,
        from: f.from.value,
        body: kind === 'letter' ? f.body.value : kind === 'item' ? f.item.value : f.note.value,
        lang: navigator.language || 'en',
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
        const title = kind === 'letter' ? `A letter${payload.to ? ' for ' + payload.to.trim() : ''}` : SUBMIT_LABEL[kind].replace(/^(Leave|Light) the /, 'A ').replace('Leave it here', 'Something left');
        rememberMine({ id: r.id, key: r.key, title, at: Date.now() });
        const restoreData = {
          kind, place: f.place.value, to: f.to.value, from: f.from.value,
          body: f.body.value, item: f.item.value, note: f.note.value, locked: f.locked.checked,
        };
        waitForGuardian(r, { lng, lat, restore: restoreData });
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });

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
      h('p', { class: 'small' }, 'You can close this. Your link: ', h('a', { href: link }, 'see it later'), '.'),
    );
    showView(h('button', { type: 'button', class: 'link close', onclick: showIntro }, 'Back to the map'), box);

    const render = (o) => {
      if (o.status === 'approved') {
        line.textContent = 'The guardian let it through. It is on the map now.';
        box.append(h('p', null, h('a', { href: `/l/${created.id}` }, 'Open its page')));
        if (created.notice) box.append(h('p', { class: 'small' }, 'If an email was given, the note is on its way.'));
        loadOfferings();
        clearDraftMarker();
        return true;
      }
      if (o.status === 'rejected' || o.status === 'failed') {
        line.textContent = 'The guardian kept it back. Only you can see why:';
        box.append(
          h('p', { class: 'reason' }, o.reason || 'No reason was given.'),
          h('button', { type: 'button', onclick: () => compose(back) }, 'Change it and try again'),
        );
        return true;
      }
      line.textContent = o.reviewing
        ? 'The guardian is reading it now.'
        : o.queueAhead > 0
          ? `Waiting for the guardian. ${o.queueAhead} ${o.queueAhead === 1 ? 'offering is' : 'offerings are'} ahead of yours.`
          : 'Waiting for the guardian. Yours is next.';
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
  $('#search').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = $('#q').value.trim();
    const ol = $('#results');
    if (q.length < 2) return;
    ol.hidden = false;
    ol.replaceChildren(h('li', { class: 'small' }, 'Looking…'));
    try {
      const { results } = await api(`/api/geo/search?q=${encodeURIComponent(q)}&lang=${browserLang}`);
      ol.replaceChildren(...(results.length ? results.map((r) => h('li', null,
        h('button', { type: 'button', onclick: () => {
          ol.hidden = true;
          map.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: reduceMotion ? 0 : 2200 });
          compose({ lng: r.lng, lat: r.lat, place: r.name });
        } }, r.name))) : [h('li', { class: 'small' }, 'Nothing found by that name.')]));
    } catch (e) {
      ol.replaceChildren(h('li', { class: 'small' }, e.message));
    }
  });

  // ---------- map ----------
  async function loadOfferings() {
    const data = await api('/api/offerings');
    const src = map.getSource('offerings');
    if (src) src.setData(data);
    return data;
  }

  function addLayers(data) {
    map.addSource('offerings', { type: 'geojson', data, cluster: true, clusterRadius: 26, clusterMaxZoom: 13 });
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

    // The map stays still: redrawing it for an animation costs battery on phones.
    // The candle that flickers lives on the letter page, in CSS.

    const pointer = (on) => () => { map.getCanvas().style.cursor = on ? 'pointer' : ''; };
    ['points', 'clusters'].forEach((l) => { map.on('mouseenter', l, pointer(true)); map.on('mouseleave', l, pointer(false)); });
  }

  function onMapClick(e) {
    const clusters = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (clusters.length) {
      const f = clusters[0];
      map.getSource('offerings').getClusterExpansionZoom(f.properties.cluster_id).then((zoom) => {
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.5, 17), duration: reduceMotion ? 0 : 900 });
      });
      return;
    }
    const pad = 8;
    const hits = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: ['points'] });
    if (hits.length) {
      const [lng, lat] = hits[0].geometry.coordinates;
      openPlace(lng, lat);
      return;
    }
    compose({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  }

  async function start() {
    cfg = await api('/api/config').catch(() => cfg);
    const fromHash = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(location.hash);
    const small = innerWidth < 760;
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
      const narrow = innerWidth < 760;
      // On phones the map ends where the sheet begins, so nothing is hidden under it.
      // On wide screens the side panel floats over the map and padding keeps the centre clear.
      const mapEl = document.getElementById('map');
      const bottom = narrow ? `${panel.offsetHeight}px` : '0px';
      if (mapEl.style.bottom !== bottom) { mapEl.style.bottom = bottom; map.resize(); }
      map.setPadding({ left: narrow ? 0 : panel.offsetWidth, top: 0, right: 0, bottom: 0 });
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
