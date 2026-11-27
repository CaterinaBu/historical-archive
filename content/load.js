import { findAssets, finds } from './finds.js';

const categoryLines = {
  rulers: 'line_09',
  military: 'line_07',
  scientists: 'line_04',
  explorers: 'line_10',
  artists: 'line_01',
  composers: 'line_02',
  writers: 'line_05',
  philosophers: 'line_03',
  'actors-directors': 'line_08',
  entrepreneurs: 'line_06',
};

const characterAssets = {
  viktor: 'victor-orlov',
  boris: 'boris-gromov',
  elena: 'elena-mironova',
  alice: 'alisa-mironova',
  arkady: 'arkady-belkin',
  maxim: 'maxim-volkov',
  anna: 'anna-volkova',
  zinaida: 'zinaida-kuznetsova',
  nikolai: 'nikolay-fomin',
  konstantin: 'konstantin-vorontsov',
  timofey: 'timofey-rudnev',
  player: 'player',
};

const musicLoop = {
  start: 4.096, end: 130.096, crossfade: 0.065, cueInterval: 0.25, cuePhase: 0.01,
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot load ${path} (HTTP ${response.status})`);
  return response.json();
}

export function createArchiveContent(dataset, story, salaryJokes, avatars, audio) {
  const categoryNames = new Map(dataset.categories.map(({ id, name }) => [id, name]));
  const people = Object.fromEntries(dataset.persons.map(({ id, name, categoryId }) =>
    [id, { name, category: categoryNames.get(categoryId), facts: [] }]));
  const facts = Object.fromEntries(dataset.facts.map(({ id, personId, field, value }) => {
    people[personId].facts.push(id);
    return [id, { person: personId, field, value }];
  }));
  const portraitManifest = new Map(avatars.map(person => [person.id, person]));
  const images = {
    ...findAssets,
    'workdesk-hero': 'assets/illustrations/workdesk-hero.png',
  };
  for (const { id } of dataset.categories) images[id] = `assets/category-icons/${id}.png`;
  for (const id of Object.keys(people)) images[id] = `assets/portraits/${id}.webp`;
  for (const { id, file } of avatars) images[id] = `assets/avatars/${file}`;

  return {
    people,
    facts,
    categories: [...categoryNames.values()],
    categoryIcons: Object.fromEntries(dataset.categories.map(({ id, name }) => [name, id])),
    categoryLines: Object.fromEntries(dataset.categories.map(({ id, name }) => [name, categoryLines[id]])),
    questions: dataset.questions.map(({ id, text, options, correctOptionIndex, correctPersonId, factId, optionPersonIds }) =>
      ({ id, text, options, right: correctOptionIndex, person: correctPersonId, fact: factId, optionIds: optionPersonIds })),
    story,
    salaryJokes,
    finds,
    images,
    avatars: Object.fromEntries(Object.entries(characterAssets).map(([speaker, asset]) => {
      const { name, role } = portraitManifest.get(asset);
      return [speaker, { name, role, asset }];
    })),
    audio: Object.fromEntries(audio.files.map(({ file, role }) =>
      [role, { src: `assets/audio/${file}`, ...(role === 'background' ? { loop: musicLoop } : {}) }])),
  };
}

export const archiveContentPaths = [
  'data/historical_archive_data.json',
  'content/dialogues/istoricheskiy_arhiv_dialogues.json',
  'content/salary/salary-jokes.json',
  'assets/avatars/manifest.json',
  'assets/audio/manifest.json',
];

export async function loadArchiveContent() {
  return createArchiveContent(...await Promise.all(archiveContentPaths.map(loadJson)));
}
