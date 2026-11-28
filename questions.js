import { dailyQuestionRecords, dailyValuePools, displayField, normalize, filmDetails, filmExclusions, standardQuestionText } from './daily.js';

export function sample(items, limit, random = Math.random) {
  const copy = [...items];
  for (let i = 0; i < Math.min(limit, copy.length); i++) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, limit);
}

export function createDailyQuiz(data, factValues) {
  const people = Object.keys(data.people);
  const pools = dailyValuePools(data);
  return {
    person: day => people[day % people.length],
    questions: person => dailyQuestionRecords(data, person, pools, factValues).map(({text,answer,primary,fallback,fact}) => {
      const alternatives = sample(primary, 3);
      alternatives.push(...sample(fallback, 3 - alternatives.length));
      const options = sample([answer, ...alternatives], 4);
      return {text,options,right:options.indexOf(answer),person,fact};
    }),
  };
}

export function createQuizBank(data) {
  const factValues = new Map();
  const filmTitles = new Map();
  const peopleByCategory = new Map();
  for (const [id, person] of Object.entries(data.people)) {
    if (!peopleByCategory.has(person.category)) peopleByCategory.set(person.category, []);
    peopleByCategory.get(person.category).push(id);
    const facts = person.facts.map(factId => data.facts[factId]);
    factValues.set(id, new Set(facts.map(fact => normalize(fact.value))));
    const titles = facts.filter(fact => displayField(fact.field) === 'Известный фильм')
      .map(fact => filmDetails(fact.value).title);
    filmTitles.set(id, new Set([...titles, ...(filmExclusions[id] ?? [])].map(normalize)));
  }

  function distractorsFor(question, candidates) {
    const fact = data.facts[question.fact];
    const truth = normalize(fact.value);
    const film = displayField(fact.field) === 'Известный фильм'
      ? normalize(filmDetails(fact.value).title) : null;
    const names = new Set([normalize(data.people[question.person].name)]);
    return candidates.filter(id => {
      const name = normalize(data.people[id].name);
      if (names.has(name) || factValues.get(id).has(truth) || (film && filmTitles.get(id).has(film))) {
        return false;
      }
      names.add(name);
      return true;
    });
  }

  const questions = data.questions.map(question => {
    const { category } = data.people[question.person];
    const candidateIds = distractorsFor(question, peopleByCategory.get(category));
    const distractors = candidateIds.length >= 3
      ? candidateIds : distractorsFor(question, question.optionIds);
    if (distractors.length < 3) throw new Error(`Not enough distinct answers for ${question.id}`);
    return { ...question, text: standardQuestionText(data, question), distractors };
  });

  function withRandomOptions(question, random) {
    const { distractors, ...record } = question;
    const ids = sample([record.person, ...sample(distractors, 3, random)], 4, random);
    return { ...record, optionIds: ids, options: ids.map(id => data.people[id].name), right: ids.indexOf(record.person) };
  }

  function start(restored, random = Math.random) {
    const unopened = questions.filter(question => !restored[question.fact]);
    const selected = sample(unopened, 10, random);
    if (selected.length < 10) {
      const opened = questions.filter(question => restored[question.fact]);
      selected.push(...sample(opened, 10 - selected.length, random));
    }
    return selected.map(question => withRandomOptions(question, random));
  }

  return { factValues, start };
}
