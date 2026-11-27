export const displayField = field => field.replace(/\s*№\s*\d+$/u, '').trim();
export const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Question wording and answer presentation are separate from the historical facts.
const dailyPrompts = {
  'Год рождения':'В каком году родилась эта личность?',
  'Год смерти':'В каком году умерла эта личность?',
  'Место рождения':'Где родилась эта личность?',
  'Место смерти':'Где умерла эта личность?',
  'Интересный факт':'Что известно об этой личности?',
  'Государство':'Каким государством правила эта личность?',
  'Срок правления, лет':'Сколько лет длилось её правление?',
  'Главный военный конфликт':'В каком военном конфликте участвовала эта личность?',
  'Сторона конфликта':'На чьей стороне сражалась эта личность?',
  'Область науки':'В какой области науки работала эта личность?',
  'Научный труд':'Какой научный труд принадлежит этой личности?',
  'Главное открытие':'Какое открытие или научное достижение связано с этой личностью?',
  'Исследованная территория':'Какую территорию исследовала эта личность?',
  'Географическое открытие':'Какое географическое открытие связано с этой личностью?',
  'Произведение':'Какое произведение создала эта личность?',
  'Художественное направление':'С каким художественным направлением связано её творчество?',
  'Компания или предприятие':'С какой компанией или предприятием связана эта личность?',
  'Сфера деятельности':'В какой сфере работала эта личность?',
  'Главное достижение':'Какое достижение связано с этой личностью?',
  'Известная роль':'Какую роль сыграла эта личность?',
  'Философская школа или направление':'С каким философским направлением связана эта личность?',
  'Известный труд':'Какой труд принадлежит этой личности?',
};
const filmPrompts = {
  'режиссёр':'Какой фильм сняла эта личность?',
  'актёр':'В каком фильме или сериале снималась эта личность?',
  'актёр и режиссёр':'В каком фильме эта личность выступила одновременно как актёр и режиссёр?',
};

// Rephrasing only affects the options shown before answering.
const dailyRewording = {
  FACT_0297:'При нём составили известный словарь китайских иероглифов.',
  FACT_0475:'Руководил наступлением 1916 года на Юго-Западном фронте.',
  FACT_0555:'Закон о выталкивающей силе, действующей на тело в жидкости или газе.',
  FACT_0661:'Открытие полония и радия.',
  FACT_0691:'Модель атома с дискретными орбитами электронов.',
  FACT_0721:'Тепловое излучение чёрных дыр.',
  FACT_0727:'Разработал наглядный способ изображать взаимодействия частиц.',
  FACT_0729:'Диаграммы для изображения взаимодействий частиц.',
  FACT_0761:'Закон о равном числе молекул в равных объёмах газов при одинаковых условиях.',
  FACT_0768:'Закон об обратной зависимости давления газа от объёма при постоянной температуре.',
  FACT_0800:'Законы наследования признаков.',
  FACT_0806:'Разработал метод тепловой обработки продуктов для увеличения срока их хранения.',
  FACT_0884:'Формула, связывающая комплексную экспоненту, синус и косинус.',
  FACT_0908:'Развитие теоремы о существовании и единственности решения задачи Коши.',
  FACT_0916:'Абстрактная вычислительная машина с лентой и читающе-пишущей головкой.',
  FACT_0930:'Гипотеза о том, что всякое замкнутое односвязное трёхмерное многообразие гомеоморфно трёхмерной сфере.',
  FACT_1046:'В 1642 году достиг острова, которому позднее дали его имя.',
  FACT_1105:'17 января 1912 года его экспедиция достигла Южного полюса и обнаружила, что другая команда её опередила.',
  FACT_1238:'«Ворона и Лисица» (русская стихотворная басня)',
  FACT_1285:'Публиковала стихи под фамилией, которую выбрала как литературный псевдоним.',
  FACT_2018:'Превратил семейный банк в один из влиятельнейших финансовых домов Европы.',
  FACT_2049:'Положил начало промышленной династии.',
  FACT_2065:'Создал художественное собрание, ставшее основой известной московской галереи.',
  FACT_2077:'Его фамилия закрепилась в названии известного завода.',
  FACT_2117:'Его компания выпускала массовый автомобиль Model T.',
  FACT_2120:'На заводах его компании внедрили движущийся сборочный конвейер для массового выпуска автомобилей.',
  FACT_2164:'В 1873 году вместе с портным Джейкобом Дэвисом получил патент на усиление рабочих брюк металлическими заклёпками. Идею предложил Дэвис.',
  FACT_2211:'Создал промышленный город, названный в его честь.',
  FACT_2246:'Соосновал Apple вместе с Возняком и Рональдом Уэйном.',
  FACT_2251:'В его комедиях появилась знаменитая троица Трус, Балбес и Бывалый.',
  FACT_2265:'Снял «Солярис» по роману Станислава Лема.',
  FACT_2593:'Его настоящее имя — Франсуа-Мари Аруэ.',
  FACT_2672:'Каменные эдикты',
};

// Specific prompts for facts with too few comparable values, or a more precise question.
const dailySpecific = {
  FACT_1052:{text:'Какой географический объект стал местом смерти этой личности?',answer:'Остров, позже названный в её честь',alternatives:['Портовый город','Горный перевал','Поселение на материке']},
  FACT_2210:{text:'В каком штате умер этот предприниматель?',answer:'Пенсильвания',alternatives:['Массачусетс','Мичиган','Нью-Йорк']},
  FACT_2251:{
    text:'Какая троица персонажей появилась в комедиях этого режиссёра?',
    answer:'Трус, Балбес и Бывалый',
    alternatives:['Атос, Портос и Арамис','Хьюи, Дьюи и Луи','Кот Матроскин, Шарик и почтальон Печкин'],
  },
  FACT_2672:{text:'Какие памятники сохранили распоряжения этого правителя?',alternatives:['Глиняные таблички','Берестяные грамоты','Бронзовые печати']},
  FACT_2673:{text:'С какой войной связан этот правитель?',alternatives:['Вторая Пуническая война','Столетняя война','Греко-персидские войны']},
  FACT_2675:{text:'К какой исторической эпохе относят эту личность?',alternatives:['Средневековье','Эпоха Возрождения','Новое время']},
  FACT_2676:{text:'Как назывался корабль этой экспедиции?',alternatives:['«Санта-Мария»','«Индевор»','«Фрам»']},
  FACT_2677:{text:'Из какого порта отправилась эта экспедиция?',alternatives:['Лиссабон','Кадис','Севилья']},
  FACT_2678:{text:'Кто покровительствовал этой экспедиции?',alternatives:['Генрих VIII','Филипп II','Людовик XII']},
  FACT_2679:{text:'С каким литературным жанром прежде всего связана эта личность?',alternatives:['Ода','Элегия','Сонет']},
  FACT_2680:{text:'К какой культурной традиции относится эта личность?',alternatives:['Древний Египет','Древняя Индия','Древний Китай']},
  FACT_2681:{text:'Какая басня относится к литературной традиции этой личности?',alternatives:['«Квартет»','«Мартышка и очки»','«Демьянова уха»']},
};

export function filmDetails(value) {
  const colon=value.indexOf(':');
  return {role:value.slice(0,colon), title:value.slice(colon+1).trim()};
}

function dailyGroup(field,value) {
  return field==='Известный фильм'?`${field}/${filmDetails(value).role}`:field;
}

function dailyAnswer(id,fact) {
  return dailySpecific[id]?.answer ?? dailyRewording[id] ??
    (displayField(fact.field)==='Известный фильм'?filmDetails(fact.value).title:fact.value);
}

function dailyAnswerKey(field,value) {
  // Avoid showing both a city and that same city with a region as separate answers.
  if (field==='Место рождения'||field==='Место смерти') return normalize(value.split(',')[0]);
  return normalize(value);
}

export function dailyValuePools(DATA) {
  const pools=new Map();
  for (const [id,fact] of Object.entries(DATA.facts)) {
    const field=displayField(fact.field);
    const group=dailyGroup(field,fact.value);
    if (!pools.has(group)) pools.set(group,[]);
    pools.get(group).push({person:fact.person, value:dailyAnswer(id,fact), raw:fact.value});
  }
  return pools;
}

export function dailyQuestionRecords(DATA,person,pools,factValues) {
  const profile=DATA.people[person];
  const own=profile.facts.map(id=>DATA.facts[id]);
  const relatedFilms=new Set([...filmExclusions[person]??[],...own.filter(item=>displayField(item.field)==='Известный фильм')
    .map(item=>filmDetails(item.value).title)].map(normalize));
  return profile.facts.map(id=>{
    const fact=DATA.facts[id];
    const field=displayField(fact.field);
    const film=field==='Известный фильм'?filmDetails(fact.value):null;
    const special=dailySpecific[id];
    const text=special?.text ?? (film?filmPrompts[film.role]:dailyPrompts[field]);
    const answer=dailyAnswer(id,fact);
    if (special?.alternatives) return {text,answer,primary:special.alternatives,fallback:[],person,fact:id};
    const key=value=>dailyAnswerKey(field,value);
    const seen=new Set([key(answer),...own.map(item=>key(item.value)),...profile.facts.map(fid=>key(dailyAnswer(fid,DATA.facts[fid])))]);
    const categoryPool=[];
    const otherPool=[];
    const group=film?.role==='актёр и режиссёр'?'Известный фильм/режиссёр':dailyGroup(field,fact.value);
    for (const other of pools.get(group)) {
      const option=key(other.value);
      if (other.person===person||seen.has(option)||factValues.get(person).has(normalize(other.raw))) continue;
      if (film&&relatedFilms.has(option)) continue;
      if (DATA.people[other.person].category===profile.category) categoryPool.push(other.value);
      else otherPool.push(other.value);
    }
    const unique=items=>items.filter(value=>{
      const candidate=key(value);
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      return true;
    });
    return {text,answer,primary:unique(categoryPool),fallback:unique(otherPool),person,fact:id};
  });
}

// Other credits that would make a title a possible second answer.
export const filmExclusions = {
  PERSON_0332:['Берегись автомобиля','Карнавальная ночь'],
  PERSON_0336:['Операция «Ы» и другие приключения Шурика'],
  PERSON_0337:['Берегись автомобиля'],
  PERSON_0340:['Джентльмены удачи'],
};

export function standardQuestionText(DATA,question) {
  const fact=DATA.facts[question.fact];
  if (displayField(fact.field)==='Известный фильм') {
    const {role,title}=filmDetails(fact.value);
    const name=title.replace(/«([^»]+)»/g,'„$1“');
    const prompt=role==='режиссёр'?'Кто снял картину':
      role==='актёр и режиссёр'?'Кто был режиссёром и сыграл в картине':'Кто снимался в картине';
    return `${prompt} «${name}»?`;
  }
  const wording=dailyRewording[question.fact];
  if (wording&&question.text.includes(fact.value)) {
    return `С кем связан этот факт? ${wording.replace(/[.!?]$/u,'')}.`;
  }
  return question.text;
}
