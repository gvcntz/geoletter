// Letter page: sealed letters, author status, translation. User text only goes through textContent.
(() => {
  'use strict';
  const root = document.getElementById('letter');
  if (!root) return;
  const id = root.dataset.id;
  const key = new URLSearchParams(location.search).get('k');
  const I18N = window.GeoI18n;
  const tr = (key, params) => I18N.tr(key, params);
  // A letter is offered in the reader's language: the one chosen with "PT · EN", otherwise the
  // browser's own (which may be Spanish, Japanese…). The letter itself is never changed.
  const browserLang = I18N.chosen ? I18N.lang : (navigator.language || 'en').slice(0, 2).toLowerCase();
  const LANG_NAMES = { en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ru: 'Russian', uk: 'Ukrainian', hi: 'Hindi', ar: 'Arabic', tl: 'Tagalog', vi: 'Vietnamese', id: 'Indonesian', sv: 'Swedish' };
  const langName = (l) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'language' }).of(l); } catch { return LANG_NAMES[l] || l; } };
  let reader = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || tr('error.generic'));
    return data;
  }

  function fmtDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    if (m < 100000) return `${(m / 1000).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 })} km`;
    return `${Math.round(m / 1000).toLocaleString(I18N.locale())} km`;
  }

  // ---------- author: wait for the guardian ----------
  if (key && root.dataset.status === 'queued') {
    const poll = async () => {
      try {
        const o = await api(`/api/offerings/${id}?k=${encodeURIComponent(key)}`);
        if (o.status !== 'queued') { location.reload(); return; }
        const note = root.querySelector('.note p');
        if (note && o.reviewing) note.textContent = tr('letter.reading');
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
      ? tr('letter.distance', { d: fmtDistance(o.distance), r: o.radius })
      : tr('letter.noPosition');
    if (demo) dist.textContent += tr('letter.demoOff');
  }

  const openHere = document.getElementById('open-here');
  if (openHere) {
    const err = document.getElementById('geo-error');
    openHere.addEventListener('click', () => {
      err.hidden = true;
      if (!navigator.geolocation) { err.hidden = false; err.textContent = tr('letter.noGeo'); return; }
      openHere.disabled = true;
      openHere.textContent = tr('letter.finding');
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          reader = { lat: p.coords.latitude, lng: p.coords.longitude };
          try { await tryOpen(reader); } catch (e) { err.hidden = false; err.textContent = e.message; }
          openHere.disabled = false;
          openHere.textContent = tr('letter.tryAgain');
        },
        () => {
          err.hidden = false;
          err.textContent = tr('letter.denied');
          openHere.disabled = false;
          openHere.textContent = tr('letter.openHere');
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
    btn.textContent = tr('letter.readIn', { lang: langName(browserLang) });

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
        btn.textContent = tr('letter.readIn', { lang: langName(browserLang) });
        state.hidden = true;
        return;
      }
      if (!translated) {
        btn.disabled = true;
        state.hidden = false;
        state.textContent = tr('letter.translating');
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
      btn.textContent = tr('letter.backTo', { lang: langName(original) });
      state.hidden = false;
      state.textContent = tr('letter.translatedFrom', { lang: langName(original) });
    });
  }
  setupTranslate();
})();
