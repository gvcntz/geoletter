// Interface words in Brazilian Portuguese and English. A plain script: the pages load it before
// anything else, and the server reads the same dictionary to send the map page already translated.
// What people write is never translated here.
(function (root) {
  'use strict';

  const STORE = 'geoletter.lang';

  const plural = (one, other) => ({ one, other });

  const dict = {
    en: {
      'page.title': 'GeoLetter · a map of offerings for the people we carry',
      'page.description': 'Leave a marigold, a candle or a letter at a place that belongs to someone, living or gone. Every word is read first by Gemma, running on this server.',
      'map.label': 'World map with offerings',
      'intro.lede': 'Leave a marigold, a candle or a letter at a place that belongs to someone, here or gone.',
      'search.label': 'Find a place',
      'search.placeholder': 'A street, a town, a plaza, or coordinates',
      'search.button': 'Find',
      'search.looking': 'Looking…',
      'search.none': 'Nothing by that name. Try another spelling, or touch the map where it was.',
      'search.noneYet': 'Nothing yet. Press Enter to look further.',
      'search.down': 'The place search is not answering right now. Touch the map instead, or try again in a moment.',
      'search.touch': (p) => `${p.name}. Now touch the map where it happened.`,
      'search.coords': 'exact point',
      'intro.hint': 'Or touch the map where it happened.',
      'recent.title': 'Left recently',
      'mine.title': 'What you left',
      'colophon': 'Every word is read first by Gemma, an open model running on this server, before anyone else sees it. Letters never leave this machine to be read.',
      'kind.city': 'city', 'kind.village': 'village', 'kind.state': 'state', 'kind.country': 'country',
      'kind.district': 'neighbourhood', 'kind.street': 'street', 'kind.address': 'address', 'kind.square': 'square',
      'kind.park': 'park', 'kind.cemetery': 'cemetery', 'kind.hospital': 'hospital', 'kind.school': 'school',
      'kind.university': 'university', 'kind.church': 'church', 'kind.beach': 'beach', 'kind.market': 'market',
      'kind.station': 'station', 'kind.stop': 'stop', 'kind.shop': 'shop', 'kind.cafe': 'café', 'kind.museum': 'museum',
      'kind.theatre': 'theatre', 'kind.stadium': 'stadium', 'kind.island': 'island', 'kind.memorial': 'memorial',
      'kind.place': '',

      'back': 'Back',
      'backToMap': 'Back to the map',
      'mine.untitled': 'An offering',
      'status.approved': 'on the map',
      'status.queued': 'with the guardian',
      'status.rejected': 'kept back',
      'status.gone': 'gone',
      'somewhere': 'Somewhere',
      'thisPlace': 'This place',
      'count.flower': plural('1 marigold', '{n} marigolds'),
      'count.candle': plural('1 candle', '{n} candles'),
      'count.letter': plural('1 letter', '{n} letters'),
      'count.item': plural('1 other thing', '{n} other things'),
      'from': (p) => `from ${p.name}`,
      'example': 'example',
      'sealedList': (p) => `Sealed to this place. It opens within ${p.r} m.`,
      'away': (p) => ` You are about ${p.d} away.`,
      'readLetter': 'Read the letter',
      'goToLetter': 'Go to the letter',
      'open': 'Open',
      'leaveToo': 'Leave something here too',

      'compose.title': 'Leave something here',
      'compose.place': 'Place',
      'compose.placeFinding': 'Finding the name of this place…',
      'compose.placeHolder': 'A street, a plaza, a kitchen in Bauru',
      'compose.move': 'Not quite the spot? Touch the map or drag the point.',
      'compose.what': 'What are you leaving?',
      'compose.flower': 'A marigold',
      'compose.candle': 'A candle',
      'compose.letter': 'A letter',
      'compose.item': 'Something of theirs',
      'compose.for': 'For',
      'compose.forHolder': 'Abuela Chayo, my brother, Mr. Okafor',
      'compose.itemLabel': 'What you are leaving',
      'compose.itemHolder': 'his blue harmonica, a cup of black coffee',
      'compose.note': 'A line, if you want',
      'compose.optional': 'Optional',
      'compose.assist': 'Help me find the words',
      'compose.assistText': 'Write what you remember, loose, in any language. Gemma turns it into a first draft using only what you wrote. You change it before leaving it.',
      'compose.notesHolder': 'she sang off-key on Sundays; the mango tree in Bauru; I was twelve',
      'compose.draft': 'Write a draft from this',
      'compose.body': 'The letter',
      'compose.sealA': 'Seal it to this place. It only opens for someone standing within',
      'compose.sealB': 'of here.',
      'compose.distance': 'Distance',
      'compose.email': 'If they are alive, their email (optional)',
      'compose.emailHolder': 'name@example.com',
      'compose.emailNote': 'They get one short note saying a letter waits for them here, with a link. Never the letter itself. The address is forgotten once the note is sent.',
      'compose.from': 'From',
      'compose.fromHolder': 'Optional. A first name is enough.',
      'compose.foot': "Anything written waits for the guardian first. Phone numbers, addresses and other people's private details are turned away.",
      'submit.flower': 'Leave the marigold',
      'submit.candle': 'Light the candle',
      'submit.letter': 'Leave the letter',
      'submit.item': 'Leave it here',
      'mine.flower': 'A marigold',
      'mine.candle': 'A candle',
      'mine.item': 'Something left',
      'mine.letter': (p) => (p.to ? `A letter for ${p.to}` : 'A letter'),
      'draft.needNotes': 'Write a few memories first, even loose ones.',
      'draft.replace': 'Replace what is in the letter with the draft?',
      'draft.working': 'Gemma is writing a first draft from your notes. On this small server it takes about half a minute.',
      'draft.done': 'Here is a draft. Change anything that is not how you would say it.',

      'wait.close': 'You can close this. Your link: ',
      'wait.later': 'see it later',
      'wait.approved': 'The guardian let it through. It is on the map now.',
      'wait.openPage': 'Open its page',
      'wait.mail': 'If an email was given, the note is on its way.',
      'wait.refused': 'The guardian kept it back. Only you can see why:',
      'wait.noReason': 'No reason was given.',
      'wait.retry': 'Change it and try again',
      'wait.reading': 'The guardian is reading it now.',
      'wait.ahead': plural('Waiting for the guardian. 1 offering is ahead of yours.', 'Waiting for the guardian. {n} offerings are ahead of yours.'),
      'wait.next': 'Waiting for the guardian. Yours is next.',
      'error.generic': 'Something went wrong. Try again in a moment.',

      'letter.reading': 'The guardian is reading it now. This page updates by itself.',
      'letter.distance': (p) => `You are about ${p.d} away. Come within ${p.r} m and it will open.`,
      'letter.noPosition': 'We could not tell where you are.',
      'letter.demoOff': ' Demo mode is not on for this browser.',
      'letter.noGeo': 'This browser cannot tell where you are.',
      'letter.finding': 'Finding where you are…',
      'letter.tryAgain': 'Try again from here',
      'letter.denied': 'Your browser did not share your position, so the letter stays sealed.',
      'letter.openHere': 'I am here. Open it',
      'letter.readIn': (p) => `Read it in ${p.lang}`,
      'letter.backTo': (p) => `Back to the ${p.lang} original`,
      'letter.translating': 'Gemma is translating it here on the server. The first time takes a little while. After that it is kept.',
      'letter.translatedFrom': (p) => `Translated by Gemma from ${p.lang}.`,

      // the sealed card (public/sealed-card.js), on the letter page and in the preview
      'card.line': 'This letter waits for whoever passes by.',
      'card.sub': (p) => `It only opens for someone standing within ${p.r} m of ${p.place}.`,
      'card.leftFor': (p) => `Left for ${p.to} at ${p.place}`,
      'card.leftAt': (p) => `Left at ${p.place}`,
      'card.sealedToPlace': ', sealed to the place',
      'card.somePlace': 'a place on the map',
      'preview.title': 'How others will see it',
      'preview.lede': (p) => `Until someone comes within ${p.r} m, the letter's page shows only this:`,
      'preview.visible': 'Anyone can see',
      'preview.place': (p) => `The place: ${p.place}`,
      'preview.to': (p) => `Who it is for: ${p.to}`,
      'preview.toNone': 'Who it is for: no name, if you leave "For" empty',
      'preview.date': (p) => `The day it was left: ${p.date}`,
      'preview.hidden': (p) => `Only whoever opens it, within ${p.r} m`,
      'preview.body': 'The letter itself',
      'preview.from': (p) => `Who signed it: ${p.from}`,
      'preview.unsigned': 'Not signed. Nobody sees who it is from, not even after it opens.',
      'preview.email': 'The email, if you give one, is never shown to anyone.',
    },

    pt: {
      'page.title': 'GeoLetter · um mapa de oferendas para quem levamos conosco',
      'page.description': 'Deixe uma flor, uma vela ou uma carta num lugar que pertence a alguém, que ainda está aqui ou que já se foi. Cada palavra é lida primeiro pela Gemma, que roda neste servidor.',
      'map.label': 'Mapa do mundo com oferendas',
      'intro.lede': 'Deixe uma flor, uma vela ou uma carta num lugar que pertence a alguém, que ainda está aqui ou que já se foi.',
      'search.label': 'Procurar um lugar',
      'search.placeholder': 'Uma rua, uma cidade, uma praça ou coordenadas',
      'search.button': 'Procurar',
      'search.looking': 'Procurando…',
      'search.none': 'Nada com esse nome. Tente outra grafia ou toque no mapa onde era.',
      'search.noneYet': 'Nada ainda. Aperte Enter para procurar mais longe.',
      'search.down': 'A busca de lugares não está respondendo agora. Toque no mapa ou tente de novo daqui a pouco.',
      'search.touch': (p) => `${p.name}. Agora toque no mapa onde aconteceu.`,
      'search.coords': 'ponto exato',
      'intro.hint': 'Ou toque no mapa onde aconteceu.',
      'recent.title': 'Deixadas há pouco',
      'mine.title': 'O que você deixou',
      'colophon': 'Cada palavra é lida primeiro pela Gemma, um modelo aberto que roda neste servidor, antes de qualquer outra pessoa. As cartas nunca saem desta máquina para serem lidas.',
      'kind.city': 'cidade', 'kind.village': 'vila', 'kind.state': 'estado', 'kind.country': 'país',
      'kind.district': 'bairro', 'kind.street': 'rua', 'kind.address': 'endereço', 'kind.square': 'praça',
      'kind.park': 'parque', 'kind.cemetery': 'cemitério', 'kind.hospital': 'hospital', 'kind.school': 'escola',
      'kind.university': 'universidade', 'kind.church': 'igreja', 'kind.beach': 'praia', 'kind.market': 'mercado',
      'kind.station': 'estação', 'kind.stop': 'ponto', 'kind.shop': 'loja', 'kind.cafe': 'café', 'kind.museum': 'museu',
      'kind.theatre': 'teatro', 'kind.stadium': 'estádio', 'kind.island': 'ilha', 'kind.memorial': 'monumento',
      'kind.place': '',

      'back': 'Voltar',
      'backToMap': 'Voltar ao mapa',
      'mine.untitled': 'Uma oferenda',
      'status.approved': 'no mapa',
      'status.queued': 'com a guardiã',
      'status.rejected': 'não passou pela guardiã',
      'status.gone': 'não está mais aqui',
      'somewhere': 'Algum lugar',
      'thisPlace': 'Este lugar',
      'count.flower': plural('1 flor', '{n} flores'),
      'count.candle': plural('1 vela', '{n} velas'),
      'count.letter': plural('1 carta', '{n} cartas'),
      'count.item': plural('1 outra coisa', '{n} outras coisas'),
      'from': (p) => `de ${p.name}`,
      'example': 'exemplo',
      'sealedList': (p) => `Selada a este lugar. Só se abre a menos de ${p.r} m daqui.`,
      'away': (p) => ` Você está a cerca de ${p.d}.`,
      'readLetter': 'Ler a carta',
      'goToLetter': 'Ir até a carta',
      'open': 'Abrir',
      'leaveToo': 'Deixar algo aqui também',

      'compose.title': 'Deixe algo aqui',
      'compose.place': 'Lugar',
      'compose.placeFinding': 'Procurando o nome deste lugar…',
      'compose.placeHolder': 'Uma rua, uma praça, uma cozinha em Bauru',
      'compose.move': 'Não é bem aí? Toque no mapa ou arraste o ponto.',
      'compose.what': 'O que você vai deixar?',
      'compose.flower': 'Uma flor',
      'compose.candle': 'Uma vela',
      'compose.letter': 'Uma carta',
      'compose.item': 'Algo da pessoa',
      'compose.for': 'Para',
      'compose.forHolder': 'Vó Chayo, meu irmão, seu Okafor',
      'compose.itemLabel': 'O que você está deixando',
      'compose.itemHolder': 'a gaita azul dele, uma xícara de café preto',
      'compose.note': 'Uma frase, se quiser',
      'compose.optional': 'Opcional',
      'compose.assist': 'Me ajude a encontrar as palavras',
      'compose.assistText': 'Escreva o que você lembra, solto, em qualquer língua. A Gemma transforma isso num primeiro rascunho usando só o que você escreveu. Você muda o que quiser antes de deixar a carta.',
      'compose.notesHolder': 'ela cantava desafinado aos domingos; o pé de manga em Bauru; eu tinha doze anos',
      'compose.draft': 'Escrever um rascunho com isso',
      'compose.body': 'A carta',
      'compose.sealA': 'Selar a carta a este lugar. Ela só se abre para quem estiver a menos de',
      'compose.sealB': 'daqui.',
      'compose.distance': 'Distância',
      'compose.email': 'Se a pessoa está viva, o e-mail dela (opcional)',
      'compose.emailHolder': 'nome@exemplo.com',
      'compose.emailNote': 'Ela recebe um aviso curto dizendo que uma carta a espera aqui, com um link. Nunca a carta em si. O endereço é esquecido assim que o aviso sai.',
      'compose.from': 'De',
      'compose.fromHolder': 'Opcional. O primeiro nome basta.',
      'compose.foot': 'Tudo o que é escrito passa antes pela guardiã. Telefones, endereços e dados pessoais de outras pessoas não entram.',
      'submit.flower': 'Deixar a flor',
      'submit.candle': 'Acender a vela',
      'submit.letter': 'Deixar a carta',
      'submit.item': 'Deixar aqui',
      'mine.flower': 'Uma flor',
      'mine.candle': 'Uma vela',
      'mine.item': 'Algo deixado',
      'mine.letter': (p) => (p.to ? `Uma carta para ${p.to}` : 'Uma carta'),
      'draft.needNotes': 'Escreva antes algumas lembranças, mesmo soltas.',
      'draft.replace': 'Trocar o que está na carta pelo rascunho?',
      'draft.working': 'A Gemma está escrevendo um primeiro rascunho com as suas lembranças. Neste servidor pequeno isso leva uns trinta segundos.',
      'draft.done': 'Aqui está um rascunho. Mude tudo o que não soar como você diria.',

      'wait.close': 'Pode fechar esta página. Seu link: ',
      'wait.later': 'ver depois',
      'wait.approved': 'A guardiã deixou passar. Já está no mapa.',
      'wait.openPage': 'Abrir a página dela',
      'wait.mail': 'Se você deu um e-mail, o aviso já está a caminho.',
      'wait.refused': 'A guardiã não deixou passar. Só você vê o motivo:',
      'wait.noReason': 'Nenhum motivo foi dado.',
      'wait.retry': 'Mudar e tentar de novo',
      'wait.reading': 'A guardiã está lendo agora.',
      'wait.ahead': plural('Esperando a guardiã. Há 1 oferenda antes da sua.', 'Esperando a guardiã. Há {n} oferendas antes da sua.'),
      'wait.next': 'Esperando a guardiã. A sua é a próxima.',
      'error.generic': 'Algo deu errado. Tente de novo daqui a pouco.',

      'letter.reading': 'A guardiã está lendo agora. Esta página se atualiza sozinha.',
      'letter.distance': (p) => `Você está a cerca de ${p.d}. Chegue a menos de ${p.r} m e ela se abre.`,
      'letter.noPosition': 'Não conseguimos saber onde você está.',
      'letter.demoOff': ' O modo de demonstração não está ligado neste navegador.',
      'letter.noGeo': 'Este navegador não consegue dizer onde você está.',
      'letter.finding': 'Procurando onde você está…',
      'letter.tryAgain': 'Tentar de novo daqui',
      'letter.denied': 'Seu navegador não compartilhou a sua posição, então a carta continua selada.',
      'letter.openHere': 'Estou aqui. Abrir a carta',
      'letter.readIn': (p) => `Ler em ${p.lang}`,
      'letter.backTo': (p) => `Voltar ao original em ${p.lang}`,
      'letter.translating': 'A Gemma está traduzindo aqui no servidor. Da primeira vez demora um pouco. Depois a tradução fica guardada.',
      'letter.translatedFrom': (p) => `Traduzida pela Gemma do ${p.lang}.`,

      'card.line': 'Esta carta espera por quem passar por aqui.',
      'card.sub': (p) => `Ela só se abre para quem estiver a menos de ${p.r} m de ${p.place}.`,
      'card.leftFor': (p) => `Deixada para ${p.to} em ${p.place}`,
      'card.leftAt': (p) => `Deixada em ${p.place}`,
      'card.sealedToPlace': ', selada ao lugar',
      'card.somePlace': 'um lugar no mapa',
      'preview.title': 'Como os outros vão ver',
      'preview.lede': (p) => `Até alguém chegar a menos de ${p.r} m, a página da carta mostra só isto:`,
      'preview.visible': 'Todos podem ver',
      'preview.place': (p) => `O lugar: ${p.place}`,
      'preview.to': (p) => `Para quem é: ${p.to}`,
      'preview.toNone': 'Para quem é: nenhum nome, se você deixar "Para" vazio',
      'preview.date': (p) => `O dia em que foi deixada: ${p.date}`,
      'preview.hidden': (p) => `Só quem abrir, a menos de ${p.r} m`,
      'preview.body': 'O texto da carta',
      'preview.from': (p) => `Quem assinou: ${p.from}`,
      'preview.unsigned': 'Sem assinatura. Ninguém vê de quem é, nem depois de abrir.',
      'preview.email': 'O e-mail, se você der um, não aparece para ninguém.',
    },
  };

  /** pt, pt-BR, pt-PT… are Portuguese; everything else gets English. */
  function langFromTag(tag) {
    return /^\s*pt(?:[-_]|$)/i.test(tag || '') ? 'pt' : 'en';
  }

  /** A choice made with "PT · EN" wins; otherwise the browser's own language decides. */
  function pickLang(stored, browserLang) {
    if (stored === 'pt' || stored === 'en') return stored;
    return langFromTag(browserLang);
  }

  function t(lang, key, params) {
    const p = params || {};
    let entry = (dict[lang] && dict[lang][key]) ?? dict.en[key];
    if (entry === undefined) return key;
    if (typeof entry === 'function') return entry(p);
    if (typeof entry === 'object') entry = p.n === 1 ? entry.one : entry.other;
    return String(entry).replace(/\{(\w+)\}/g, (_, k) => (p[k] === undefined ? '' : String(p[k])));
  }

  /** data-i18n="key" sets the text; data-i18n-attr="placeholder:key; aria-label:key" sets attributes. */
  function applyTo(rootEl, lang) {
    rootEl.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(lang, el.dataset.i18n); });
    rootEl.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(lang, key));
      }
    });
    rootEl.querySelectorAll('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
  }

  const api = { dict, langFromTag, pickLang, t, applyTo, STORE };

  if (typeof document !== 'undefined') {
    let stored = null;
    try { stored = localStorage.getItem(STORE); } catch { /* private mode */ }
    api.chosen = stored === 'pt' || stored === 'en';
    api.lang = pickLang(stored, navigator.language);
    api.tr = (key, params) => t(api.lang, key, params);
    api.locale = () => (api.lang === 'pt' ? 'pt-BR' : 'en');

    // The server reads the same choice from this cookie, for its pages and error messages.
    const remember = () => {
      document.cookie = `gl_lang=${api.lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
      document.documentElement.lang = api.locale();
    };
    remember();

    api.apply = (rootEl) => applyTo(rootEl || document, api.lang);

    api.set = (lang) => {
      if (lang !== 'pt' && lang !== 'en') return;
      try { localStorage.setItem(STORE, lang); } catch { /* still works for this page */ }
      api.chosen = true;
      const changed = lang !== api.lang;
      api.lang = lang;
      remember();
      if (!changed) return;
      // The map page re-renders in place; pages drawn by the server are simply drawn again.
      if (document.body && document.body.dataset.liveLang === '1') {
        api.apply();
        document.title = t(lang, 'page.title');
        document.dispatchEvent(new CustomEvent('geoletter:lang', { detail: { lang } }));
      } else {
        location.reload();
      }
    };

    document.addEventListener('click', (ev) => {
      const b = ev.target instanceof Element && ev.target.closest('[data-set-lang]');
      if (b) api.set(b.dataset.setLang);
    });

    // The server already sent the page in the language it guessed. If this browser chose the
    // other one (localStorage, no cookie yet), fix the words before anyone reads them.
    const fix = () => { if (document.documentElement.dataset.lang !== api.lang) api.apply(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fix);
    else fix();
  }

  root.GeoI18n = api;
})(globalThis);
