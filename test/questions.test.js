import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { createArchiveContent } from '../content/load.js';
import { dailyQuestionRecords, dailyValuePools, displayField, filmDetails, filmExclusions, normalize } from '../daily.js';
import { createQuizBank } from '../questions.js';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

const data = createArchiveContent(...await Promise.all([
  '../data/historical_archive_data.json',
  '../content/dialogues/istoricheskiy_arhiv_dialogues.json',
  '../content/salary/salary-jokes.json',
  '../assets/avatars/manifest.json',
  '../assets/audio/manifest.json',
].map(readJson)));
const quiz = createQuizBank(data);

test('the quiz reaches each collection fact before reusing restored questions', () => {
  const restored = {};
  const expectedCount = Object.keys(data.facts).length;
  assert.equal(new Set(data.questions.map(question => question.fact)).size, expectedCount);
  let remaining = expectedCount;
  while (remaining > 0) {
    const questions = quiz.start(restored, () => 0.618);
    assert.equal(questions.length, 10);
    assert.equal(new Set(questions.map(question => question.fact)).size, 10);
    const unopened = questions.filter(question => !restored[question.fact]);
    assert.equal(unopened.length, Math.min(remaining, 10));
    for (const question of unopened) {
      assert.ok(question.text);
      const fact = data.facts[question.fact];
      assert.equal(question.person, fact.person);
      assert.equal(question.optionIds[question.right], question.person);
      assert.equal(question.options[question.right], data.people[question.person].name);
      assert.equal(new Set(question.options.map(normalize)).size, 4);
      for (const id of question.optionIds) {
        assert.equal(data.people[id].category, data.people[question.person].category);
        if (id === question.person) continue;
        assert.ok(!quiz.factValues.get(id).has(normalize(fact.value)));
        if (displayField(fact.field) === 'Известный фильм') {
          const title = normalize(filmDetails(fact.value).title);
          const otherTitles = data.people[id].facts.map(id => data.facts[id])
            .filter(item => displayField(item.field) === 'Известный фильм')
            .map(item => filmDetails(item.value).title);
          assert.ok(![...otherTitles, ...(filmExclusions[id] ?? [])].map(normalize).includes(title));
        }
      }
      restored[question.fact] = true;
    }
    remaining -= unopened.length;
  }
  assert.equal(Object.keys(restored).length, expectedCount);
  assert.equal(quiz.start(restored).length, 10);
});

test('every figure in the daily quiz has four distinct options per fact', () => {
  const pools = dailyValuePools(data);
  for (const [person, { facts }] of Object.entries(data.people)) {
    const records = dailyQuestionRecords(data, person, pools, quiz.factValues);
    assert.deepEqual(records.map(record => record.fact), facts);
    for (const { text, answer, primary, fallback } of records) {
      assert.ok(text, person);
      const variants = [answer, ...primary, ...fallback].map(normalize);
      assert.ok(variants.length >= 4, person);
      assert.equal(new Set(variants).size, variants.length, person);
    }
  }
});

test('the original story and asset manifests resolve to the resources used by the interface', async () => {
  assert.equal(Object.keys(data.categoryLines).length, data.story.storylines.length);
  for (const line of data.story.storylines) {
    assert.equal(line.chapters.length, 30);
    assert.ok(Object.values(data.categoryLines).includes(line.id));
  }
  assert.equal(data.story.prologue.tutorial.questionContent.options.length, 4);
  assert.equal(Object.keys(data.finds).length, 30);
  assert.equal(data.salaryJokes.length, 100);
  await Promise.all([
    ...Object.values(data.images),
    ...Object.values(data.audio).map(asset => asset.src),
  ].map(path => access(new URL(`../${path}`, import.meta.url))));
});
