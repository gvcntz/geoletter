// Interface language on the server: Brazilian Portuguese or English. What people write is never
// translated here; that stays with the "read it in…" button on the letter page.

export type Lang = 'pt' | 'en';
export const LANGS: Lang[] = ['pt', 'en'];

/** pt, pt-BR, pt-PT… are Portuguese; everything else gets English. */
export function langFromTag(tag: string | null | undefined): Lang {
  return /^\s*pt(?:[-_]|$)/i.test(tag ?? '') ? 'pt' : 'en';
}

/**
 * The choice made with "PT · EN" travels in the gl_lang cookie (the page mirrors localStorage
 * into it). Without a choice, the first language the browser asks for decides.
 */
export function pickLang(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (cookie === 'pt' || cookie === 'en') return cookie;
  const first = (acceptLanguage ?? '').split(',')[0]?.split(';')[0] ?? '';
  return langFromTag(first);
}

type Params = Record<string, string | number>;
type Entry = string | ((p: Params) => string);

const en = {
  // errors
  sendJson: 'Send JSON.',
  bodyTooBig: 'That is too long.',
  badJson: 'That did not arrive in one piece.',
  tooMany: (p: Params) => `Too many ${p.what} from here. Try again in ${p.min} min.`,
  chooseKind: 'Choose a marigold, a candle, a letter or something else.',
  pickPlace: 'Pick a place on the map first.',
  keepUnder: (p: Params) => `Keep it under ${p.n} characters.`,
  namesMax: (p: Params) => `Names can have up to ${p.n} characters.`,
  letterEmpty: 'The letter is empty.',
  sayWhat: 'Say what you are leaving.',
  badEmail: 'That email address does not look right.',
  senderLimit: (p: Params) => `You have already sent ${p.n} notices today. Leave the letter without an email, or try again tomorrow.`,
  recipientLimit: 'This person was already told about a letter today. Leave it without an email, or try again tomorrow.',
  badPosition: 'Bad position.',
  notesMax: (p: Params) => `Keep the notes under ${p.n} characters.`,
  notesShort: 'Write a few memories first, even loose ones.',
  nothingRests: 'Nothing rests here.',
  nothingToTranslate: 'There is nothing to translate.',
  unknownLang: 'Unknown language.',
  alreadyInLang: 'It is already in that language.',
  onlyNear: 'This letter only opens near its place.',
  notAllowed: 'Not allowed.',
  notFound: 'Not found.',
  serverError: 'Something went wrong on our side.',
  guardianFailed: 'The guardian could not read this letter. Please try again later.',
  // what, for tooMany
  'what.offerings': 'offerings', 'what.drafts': 'drafts', 'what.translations': 'translations',
  'what.searches': 'searches', 'what.lookups': 'lookups', 'what.requests': 'requests',
  // offering titles
  'title.flower': (p: Params) => (p.to ? `A marigold for ${p.to}` : 'A marigold'),
  'title.candle': (p: Params) => (p.to ? `A candle for ${p.to}` : 'A candle'),
  'title.item': (p: Params) => (p.to ? `Something left for ${p.to}` : 'Something left here'),
  'title.letter': (p: Params) => (p.to ? `A letter for ${p.to}` : 'A letter'),
  'kind.flower': 'marigold', 'kind.candle': 'candle', 'kind.letter': 'letter', 'kind.item': 'offering',
  // pages
  backToMap: 'Back to the map',
  somePlace: 'a place on the map',
  sealedLine: 'This letter waits for whoever passes by.',
  sealedSub: (p: Params) => `It only opens for someone standing within ${p.r} m of ${p.place}.`,
  openHere: 'I am here. Open it',
  openDemo: 'Demo: open as if I were there',
  queued: (p: Params) => `Your ${p.kind} is with the guardian. Gemma reads everything before it goes on the map. ${p.ahead} This page updates by itself.`,
  aheadNone: 'Yours is the next one she reads.',
  aheadOne: 'There is 1 offering ahead of yours.',
  aheadMany: (p: Params) => `There are ${p.n} offerings ahead of yours.`,
  refused: 'The guardian kept this back. Only you can see it.',
  refusedHow: 'You can copy the text below, change it, and leave it again from the map.',
  noReason: 'No reason was given.',
  approved: 'The guardian let it through. It is on the map now. Keep this address if you want to come back to it.',
  leftFor: (p: Params) => `Left for ${p.to} at ${p.place}`,
  leftAt: (p: Params) => `Left at ${p.place}`,
  sealedToPlace: ', sealed to the place',
  exampleNote: 'This is an example offering. The people in it are invented.',
  notHereTitle: 'Nothing rests here',
  notHereBody: 'This letter is not on the map. It may still be with the guardian, or it was never left.',
  wrongTitle: 'Something went wrong',
  unsubBadTitle: 'This link does not work',
  unsubBadBody: 'It may have been cut in two by your email app. Try opening it again from the email.',
  unsubDoneTitle: 'Done',
  unsubDoneBody: 'GeoLetter will not write to this address again. We only kept a one-way fingerprint of it, never the address itself.',
  unsubAskTitle: 'No more letters by email',
  unsubAskBody: 'Press the button and GeoLetter will never email this address again.',
  unsubButton: 'Stop these emails',
  // email
  mailSubject: (p: Params) => `Someone left a letter for you in ${p.place}`,
  mailLine: (p: Params) => `Someone left a letter for you in ${p.place}.`,
  mailReadAt: (p: Params) => `You can read it here: ${p.url}`,
  mailRead: 'Read the letter',
  mailOnly: 'This is the only email you will get about this letter. GeoLetter does not keep your address.',
  mailStopAt: (p: Params) => `If you would rather not receive these: ${p.url}`,
  mailStop: "I don't want to receive these",
} satisfies Record<string, Entry>;

export type Key = keyof typeof en;

const pt: Record<Key, Entry> = {
  sendJson: 'Envie JSON.',
  bodyTooBig: 'Isso ficou longo demais.',
  badJson: 'Isso não chegou inteiro.',
  tooMany: (p) => `Muitos pedidos seguidos daqui. Tente de novo em ${p.min} min.`,
  chooseKind: 'Escolha uma flor, uma vela, uma carta ou outra coisa.',
  pickPlace: 'Escolha antes um lugar no mapa.',
  keepUnder: (p) => `Use no máximo ${p.n} caracteres.`,
  namesMax: (p) => `Os nomes podem ter até ${p.n} caracteres.`,
  letterEmpty: 'A carta está vazia.',
  sayWhat: 'Diga o que você está deixando.',
  badEmail: 'Esse e-mail não parece certo.',
  senderLimit: (p) => `Você já mandou ${p.n} avisos hoje. Deixe a carta sem e-mail ou tente de novo amanhã.`,
  recipientLimit: 'Essa pessoa já recebeu um aviso de carta hoje. Deixe a carta sem e-mail ou tente de novo amanhã.',
  badPosition: 'Posição inválida.',
  notesMax: (p) => `Use no máximo ${p.n} caracteres nas lembranças.`,
  notesShort: 'Escreva antes algumas lembranças, mesmo soltas.',
  nothingRests: 'Não há nada aqui.',
  nothingToTranslate: 'Não há nada para traduzir.',
  unknownLang: 'Idioma desconhecido.',
  alreadyInLang: 'Ela já está nesse idioma.',
  onlyNear: 'Esta carta só se abre perto do lugar dela.',
  notAllowed: 'Não permitido.',
  notFound: 'Não encontrado.',
  serverError: 'Algo deu errado do nosso lado.',
  guardianFailed: 'A guardiã não conseguiu ler esta carta. Tente de novo mais tarde.',
  'what.offerings': 'oferendas', 'what.drafts': 'rascunhos', 'what.translations': 'traduções',
  'what.searches': 'buscas', 'what.lookups': 'consultas', 'what.requests': 'pedidos',
  'title.flower': (p) => (p.to ? `Uma flor para ${p.to}` : 'Uma flor'),
  'title.candle': (p) => (p.to ? `Uma vela para ${p.to}` : 'Uma vela'),
  'title.item': (p) => (p.to ? `Algo deixado para ${p.to}` : 'Algo deixado aqui'),
  'title.letter': (p) => (p.to ? `Uma carta para ${p.to}` : 'Uma carta'),
  'kind.flower': 'flor', 'kind.candle': 'vela', 'kind.letter': 'carta', 'kind.item': 'oferenda',
  backToMap: 'Voltar ao mapa',
  somePlace: 'um lugar no mapa',
  sealedLine: 'Esta carta espera por quem passar por aqui.',
  sealedSub: (p) => `Ela só se abre para quem estiver a menos de ${p.r} m de ${p.place}.`,
  openHere: 'Estou aqui. Abrir a carta',
  openDemo: 'Demonstração: abrir como se eu estivesse lá',
  queued: (p) => `Sua ${p.kind} está com a guardiã. A Gemma lê tudo antes que vá para o mapa. ${p.ahead} Esta página se atualiza sozinha.`,
  aheadNone: 'A sua é a próxima que ela vai ler.',
  aheadOne: 'Há 1 oferenda antes da sua.',
  aheadMany: (p) => `Há ${p.n} oferendas antes da sua.`,
  refused: 'A guardiã não deixou esta oferenda passar. Só você pode vê-la.',
  refusedHow: 'Você pode copiar o texto abaixo, mudar o que quiser e deixá-lo de novo pelo mapa.',
  noReason: 'Nenhum motivo foi dado.',
  approved: 'A guardiã deixou passar. Já está no mapa. Guarde este endereço se quiser voltar aqui.',
  leftFor: (p) => `Deixada para ${p.to} em ${p.place}`,
  leftAt: (p) => `Deixada em ${p.place}`,
  sealedToPlace: ', selada ao lugar',
  exampleNote: 'Esta é uma oferenda de exemplo. As pessoas nela são inventadas.',
  notHereTitle: 'Não há nada aqui',
  notHereBody: 'Esta carta não está no mapa. Talvez ainda esteja com a guardiã, ou nunca tenha sido deixada.',
  wrongTitle: 'Algo deu errado',
  unsubBadTitle: 'Este link não funciona',
  unsubBadBody: 'Talvez o seu aplicativo de e-mail tenha partido o link em dois. Tente abrir de novo pelo e-mail.',
  unsubDoneTitle: 'Pronto',
  unsubDoneBody: 'O GeoLetter não vai mais escrever para este endereço. Guardamos só uma impressão dele, que não pode ser revertida, nunca o endereço em si.',
  unsubAskTitle: 'Sem mais cartas por e-mail',
  unsubAskBody: 'Aperte o botão e o GeoLetter nunca mais vai escrever para este endereço.',
  unsubButton: 'Parar estes e-mails',
  mailSubject: (p) => `Alguém deixou uma carta para você em ${p.place}`,
  mailLine: (p) => `Alguém deixou uma carta para você em ${p.place}.`,
  mailReadAt: (p) => `Você pode lê-la aqui: ${p.url}`,
  mailRead: 'Ler a carta',
  mailOnly: 'Este é o único e-mail que você vai receber sobre esta carta. O GeoLetter não guarda o seu endereço.',
  mailStopAt: (p) => `Se preferir não receber mais avisos assim: ${p.url}`,
  mailStop: 'Não quero receber estes avisos',
};

const DICT: Record<Lang, Record<Key, Entry>> = { en, pt };

export function t(lang: Lang, key: Key, params: Params = {}): string {
  const entry = DICT[lang][key] ?? DICT.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

export function hasKey(key: string): key is Key {
  return key in en;
}
