// Letter page: sealed letters, author status, translation. User text only goes through textContent.
(() => {
  'use strict';
  const root = document.getElementById('letter');
  if (!root) return;
  const id = root.dataset.id;
  const key = new URLSearchParams(location.search).get('k');
  const browserLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const LANG_NAMES = { en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ru: 'Russian', uk: 'Ukrainian', hi: 'Hindi', ar: 'Arabic', tl: 'Tagalog', vi: 'Vietnamese', id: 'Indonesian', sv: 'Swedish' };
  const langName = (l) => { try { return new Intl.DisplayNames([browserLang], { type: 'language' }).of(l); } catch { return LANG_NAMES[l] || l; } };
  let reader = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again in a moment.');
    return data;
  }

  function fmtDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    if (m < 100000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m / 1000).toLocaleString('en')} km`;
  }

  // ---------- author: wait for the guardian ----------
  if (key && root.dataset.status === 'queued') {
    const poll = async () => {
      try {
        const o = await api(`/api/offerings/${id}?k=${encodeURIComponent(key)}`);
        if (o.status !== 'queued') { location.reload(); return; }
        const note = root.querySelector('.note p');
        if (note && o.reviewing) note.textContent = 'The guardian is reading it now. This page updates by itself.';
      } catch { /* try again */ }
      setTimeout(poll, 2500);
    };
    setTimeout(poll, 2500);
  }

  // ---------- sealed letters ----------
  function renderOpened(o) {
    const sealed = root.querySelector('.sheet.sealed');
    const article = document.createElement('article');
    article.className = 'sheet';
    article.lang = o.lang || 'en';
    const dateline = document.createElement('p');
    dateline.className = 'dateline';
    dateline.append(o.place || '', document.createElement('br'),
      new Intl.DateTimeFormat(o.lang || 'en', { day: 'numeric', month: 'long', year: 'numeric' }).format(o.created_at));
    article.append(dateline);
    const body = document.createElement('div');
    body.className = 'letter-body fading';
    body.id = 'letter-body';
    body.textContent = o.body || '';
    article.append(body);
    if (o.from) {
      const sig = document.createElement('p');
      sig.className = 'signature';
      sig.textContent = o.from;
      article.append(sig);
    }
    sealed.replaceWith(article);
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('fading')));
    root.dataset.open = '1';
    setupTranslate();
  }

  async function tryOpen(pos, demo) {
    const q = new URLSearchParams();
    if (pos) { q.set('lat', pos.lat); q.set('lng', pos.lng); }
    if (key) q.set('k', key);
    if (demo) q.set('demo', '1');
    const o = await api(`/api/offerings/${id}?${q}`);
    const dist = document.getElementById('distance');
    if (o.open) { renderOpened(o); return; }
    dist.hidden = false;
    dist.textContent = o.distance !== null
      ? `You are about ${fmtDistance(o.distance)} away. Come within ${o.radius} m and it will open.`
      : 'We could not tell where you are.';
    if (demo) dist.textContent += ' Demo mode is not on for this browser.';
  }

  const openHere = document.getElementById('open-here');
  if (openHere) {
    const err = document.getElementById('geo-error');
    openHere.addEventListener('click', () => {
      err.hidden = true;
      if (!navigator.geolocation) { err.hidden = false; err.textContent = 'This browser cannot tell where you are.'; return; }
      openHere.disabled = true;
      openHere.textContent = 'Finding where you are…';
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          reader = { lat: p.coords.latitude, lng: p.coords.longitude };
          try { await tryOpen(reader); } catch (e) { err.hidden = false; err.textContent = e.message; }
          openHere.disabled = false;
          openHere.textContent = 'Try again from here';
        },
        () => {
          err.hidden = false;
          err.textContent = 'Your browser did not share your position, so the letter stays sealed.';
          openHere.disabled = false;
          openHere.textContent = 'I am here. Open it';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    });
    const demoBtn = document.getElementById('open-demo');
    if (demoBtn) {
      demoBtn.addEventListener('click', async () => {
        // Pretend to stand 40 m north of the place. The server only accepts this with the demo cookie.
        reader = { lat: Number(root.dataset.lat) + 0.00036, lng: Number(root.dataset.lng) };
        try { await tryOpen(reader, true); } catch (e) { const err = document.getElementById('geo-error'); err.hidden = false; err.textContent = e.message; }
      });
    }
  }

  // ---------- translation ----------
  function setupTranslate() {
    const btn = document.getElementById('translate');
    const state = document.getElementById('translate-state');
    const body = document.getElementById('letter-body');
    if (!btn || !body || root.dataset.open !== '1') return;
    const original = root.dataset.lang;
    if (!original || original === browserLang) return;
    const originalText = body.textContent;
    let translated = null;
    let showing = 'original';
    btn.hidden = false;
    btn.textContent = `Read it in ${langName(browserLang)}`;

    const swap = (text, lang) => {
      body.classList.add('fading');
      setTimeout(() => {
        body.textContent = text;
        body.closest('[lang]')?.setAttribute('lang', lang);
        body.classList.remove('fading');
      }, 350);
    };

    btn.addEventListener('click', async () => {
      if (showing === 'translated') {
        swap(originalText, original);
        showing = 'original';
        btn.textContent = `Read it in ${langName(browserLang)}`;
        state.hidden = true;
        return;
      }
      if (!translated) {
        btn.disabled = true;
        state.hidden = false;
        state.textContent = 'Gemma is translating it here on the server. The first time takes a little while; after that it is kept.';
        try {
          const q = key ? `?k=${encodeURIComponent(key)}` : '';
          const r = await api(`/api/offerings/${id}/translate${q}`, { method: 'POST', body: { to: browserLang, ...(reader || {}) } });
          translated = r.body;
        } catch (e) {
          state.textContent = e.message;
          btn.disabled = false;
          return;
        }
        btn.disabled = false;
      }
      swap(translated, browserLang);
      showing = 'translated';
      btn.textContent = `Back to the ${langName(original)} original`;
      state.hidden = false;
      state.textContent = `Translated by Gemma from ${langName(original)}.`;
    });
  }
  setupTranslate();
})();
