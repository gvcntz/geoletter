// Eight example offerings. Every person in them is invented. They are inserted as "queued",
// so the guardian (Gemma) reads them like any other letter when the server starts.
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../src/config.ts';
import { openDb } from '../src/db.ts';

interface Seed {
  kind: 'flower' | 'candle' | 'letter' | 'item';
  lat: number;
  lng: number;
  place: string;
  to: string;
  from: string;
  body: string;
  lang: string;
  locked?: boolean;
  daysAgo: number;
}

const SEEDS: Seed[] = [
  {
    kind: 'letter', lat: 17.0594, lng: -96.7216, place: 'Panteón General, Oaxaca', lang: 'es', daysAgo: 6,
    to: 'Abuela Chayo', from: 'Lupe',
    body: `Abuela:

Este año el altar quedó chueco porque lo armé yo sola. Puse tu foto de la boda, el pan con ajonjolí que te gustaba y un vasito de mezcal aunque siempre decías que no tomabas.

Mamá dice que me enojo igualito que tú. Creo que es un halago.

Te traje cempasúchil del mercado de la Merced. El señor de las flores preguntó por ti.`,
  },
  {
    kind: 'letter', lat: -23.5568, lng: -46.6908, place: 'Vila Madalena, São Paulo', lang: 'pt', daysAgo: 5,
    to: 'Mãe', from: 'Tiago',
    body: `Mãe,

passei hoje na padaria da esquina, aquela do sonho de domingo. O seu Antônio ainda lembra de você e perguntou se eu continuava pedindo o pão na chapa sem manteiga. Continuo.

Plantei a muda de manjericão que você deixou no parapeito. Ela pegou.`,
  },
  {
    kind: 'candle', lat: 38.7116, lng: -9.1303, place: 'Miradouro de Santa Luzia, Lisboa', lang: 'pt', daysAgo: 4,
    to: 'Avô Joaquim', from: '',
    body: 'Acendi aqui porque era daqui que o avô via os navios.',
  },
  {
    kind: 'letter', lat: 35.0302, lng: 135.7722, place: '出町柳, 京都', lang: 'ja', daysAgo: 4,
    to: 'おばあちゃん', from: 'ゆき',
    body: `おばあちゃんへ

鴨川の飛び石、今年も渡ったよ。昔みたいに手はつないでもらえないけど、亀の石で一回止まった。

おばあちゃんの梅干し、まだ一瓶だけ残ってる。もったいなくて開けられない。`,
  },
  {
    kind: 'letter', lat: 6.4253, lng: 3.4219, place: 'Bar Beach, Victoria Island, Lagos', lang: 'en', daysAgo: 3, locked: true,
    to: 'Mr. Okafor, who taught us physics', from: 'Ada, class of 2009',
    body: `Mr. Okafor,

You brought us here once to explain waves and half the class spent the afternoon running from them. You laughed so hard you had to sit on the sand.

I teach now. Last week a boy asked me why the sea never stops, and I gave him your answer word for word. He did not believe me either.

Thank you for not giving up on the back row.`,
  },
  {
    kind: 'letter', lat: 48.8583, lng: 2.3375, place: 'Pont des Arts, Paris', lang: 'fr', daysAgo: 2,
    to: 'Camille', from: 'Inès',
    body: `Camille,

Tu es bien vivante, je sais, mais je voulais t'écrire ici quand même. C'est sur ce pont que tu m'as dit que tu partais pour Montréal et que j'ai fait semblant d'être contente.

Je suis contente maintenant. Reviens en avril, les quais sont plus beaux.`,
  },
  {
    kind: 'flower', lat: 19.3500, lng: -99.1626, place: 'Jardín Centenario, Coyoacán', lang: 'es', daysAgo: 1,
    to: 'Tío Beto', from: '', body: '',
  },
  {
    kind: 'item', lat: 52.4731, lng: 13.4039, place: 'Tempelhofer Feld, Berlin', lang: 'de', daysAgo: 1,
    to: 'Opa Klaus', from: 'Jonas',
    body: 'Seinen alten roten Drachen, den mit dem geflickten Schwanz.',
  },
];

const db = openDb(config.dbPath);
const existing = (db.prepare('SELECT COUNT(*) AS n FROM offerings WHERE is_example = 1').get() as { n: number }).n;
if (existing > 0 && !process.argv.includes('--force')) {
  console.log(`There are already ${existing} example offerings. Use --force to add them again.`);
  process.exit(0);
}

const insert = db.prepare(
  `INSERT INTO offerings (id, kind, lat, lng, place, to_name, from_name, body, lang_hint, status, locked, lock_radius_m,
     author_key_hash, sender_hash, is_example, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, 'seed', 1, ?)`,
);
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
for (const s of SEEDS) {
  const id = [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join('');
  const keyHash = createHash('sha256').update(randomBytes(18)).digest('hex');
  const created = Date.now() - s.daysAgo * 86_400_000 - Math.floor(Math.random() * 6) * 3_600_000;
  insert.run(id, s.kind, s.lat, s.lng, s.place, s.to, s.from, s.body, s.lang, s.locked ? 1 : 0, config.lockRadiusDefault, keyHash, created);
  console.log(`queued ${s.kind.padEnd(6)} ${id}  ${s.place}`);
}
console.log('The guardian will read them when the server runs.');
