import { loadArchiveContent } from './content/load.js';
import { createArchiveAudio } from './audio.js';
import { displayField, dailyValuePools, dailyQuestionRecords } from './daily.js';
import { createQuizBank, sample } from './questions.js';
import { quizProgress } from './progress-api.js';

const DATA = await loadArchiveContent();
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const live = document.querySelector('#announcements');
const databaseProgress = document.body.dataset.progress === 'database';
const databaseFields = new Set(['facts', 'discovered', 'earned', 'paid', 'reputation', 'daily', 'dailyYesterday', 'lastNormalResult']);
const sound = createArchiveAudio(DATA.audio);
const icons = {
  archive:'<path d="M4 6h16v4H4zM6 10v9h12v-9M10 14h4M9 6l2-2h6l2 2"/>',
  cards:'<rect x="5" y="6" width="14" height="14" rx="2"/><path d="M8 3h11a3 3 0 0 1 3 3v10M9 11h6m-6 4h4"/>',
  story:'<path d="M3 5h7a2 2 0 0 1 2 2v13a3 3 0 0 0-3-3H3zM21 5h-7a2 2 0 0 0-2 2v13a3 3 0 0 1 3-3h6z"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v5m-4 2h8m-7 0v-2h6v2"/>',
  clip:'<path d="m8 13 6.4-6.4a2 2 0 0 1 2.8 2.8l-7.1 7.1a4 4 0 0 1-5.7-5.7l7.7-7.7a5.5 5.5 0 0 1 7.8 7.8l-7.8 7.8"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="m10 3 4 0 .5 2.5 2 .9L19 5l2 3-1.7 2v3l1.7 2-2 3-2.5-1.4-2 .9L14 21h-4l-.5-3.5-2-.9L5 18l-2-3 1.7-2v-3L3 8l2-3 2.5 1.4 2-.9Z"/>',
  right:'<path d="m9 6 6 6-6 6"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  left:'<path d="M20 12H5m6-6-6 6 6 6"/>',
  calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-8 4v3m-1-2h2"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  find:'<path d="m12 3 6 4 2 7-3 6H7l-3-6 2-7zM9 11l3-3 3 3-3 4z"/>',
  lock:'<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3m-3 4v2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  bag:'<path d="M5 8h14l1 12H4zM9 9V6a3 3 0 0 1 6 0v3"/>',
  film:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16m8-16v16M4 9h4m8 0h4M4 15h4m8 0h4"/>',
  heart:'<path d="M12 20 4.5 13a4.5 4.5 0 0 1 7.5-5 4.5 4.5 0 0 1 7.5 5Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/>',
  portrait:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
};
const e = (value) => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const nbsp = (value) => e(value).replace(/(^|[\s(«—])([а-яё]{1,2}|для|при|без|под|над|перед|через)(?= +\S) +/giu,'$1$2\u00a0');
const label = (value) => nbsp(value);
const number = (value) => new Intl.NumberFormat('ru-RU').format(value);
const icon = (name, small = false) => `<svg class="icon${small ? ' small-icon' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
const button = (text, action, options = {}) => `<button type="button" class="${options.style || 'btn primary'}" data-action="${e(action)}" ${options.id !== undefined ? `data-id="${e(options.id)}"` : ''} ${options.disabled ? 'disabled' : ''} ${options.attrs || ''}>${options.icon ? icon(options.icon, true) : ''}${label(text)}</button>`;
const tooltip = (id, text, content, style = '') => `<span class="with-tooltip ${style}">${content}<span id="${id}" class="ui-tooltip" role="tooltip">${label(text)}</span></span>`;
const photo = (id, css = '', alt = '') => `<img class="${css}" src="${DATA.images[id]}" alt="${e(alt)}">`;
const heading = (title, description = '', kicker = '') => `<div class="page-head">${kicker ? `<div class="kicker">${label(kicker)}</div>` : ''}<h1>${label(title)}</h1>${description ? `<p>${label(description)}</p>` : ''}</div>`;
const listItem = (title, description, action, id, glyph = '', trailing = '') => `<button type="button" class="list-item" data-action="${action}" data-id="${e(id ?? '')}">${glyph ? `<span class="tile-icon">${icon(glyph)}</span>` : ''}<span class="tile-body"><strong>${label(title)}</strong>${description ? `<span class="small subtle">${label(description)}</span>` : ''}</span>${trailing || icon('right', true)}</button>`;
const tabs = (items, current, action, name) => `<div class="tabs" role="group" aria-label="${e(name)}">${items.map(([id,title]) => button(title,action,{id,style:'tab',attrs:`aria-pressed="${id === current}"`})).join('')}</div>`;
const sectionHeading = (title, controls, description = '', backLabel = '') => `<div class="page-head compact-head">
  <div class="heading-title">${backLabel ? button('', 'back',{style:'top-btn title-back',icon:'left',attrs:`aria-label="${e(backLabel)}" title="${e(backLabel)}"`}) : ''}<h1>${label(title)}</h1></div>
  ${controls}${description ? `<p>${label(description)}</p>` : ''}</div>`;
const meter = (value, max, title) => `<progress class="meter" value="${value}" max="${max || 1}" aria-label="${e(title)}"></progress>`;
const note = (title, body, style = 'note') => `<div class="${style} stack compact"><strong>${label(title)}</strong>${body ? `<p>${label(body)}</p>` : ''}</div>`;
const tutorialQuestion = DATA.story.prologue.tutorial.questionContent;
const tutorialStep = DATA.story.prologue.cards.length - 1;
const quizBank = createQuizBank(DATA);
const dailyPools = dailyValuePools(DATA);
const dailyPeople=Object.keys(DATA.people);
const dailyPerson=()=>dailyPeople[state.calendarDay%dailyPeople.length];
function dailyQuestions(person) {
  return dailyQuestionRecords(DATA,person,dailyPools,quizBank.factValues).map(({text,answer,primary,fallback,fact})=>{
    const alternatives=sample(primary,3);
    alternatives.push(...sample(fallback,3-alternatives.length));
    const options=sample([answer,...alternatives],4);
    return {text,options,right:options.indexOf(answer),person,fact};
  });
}
const hintInfo = {
  exclude:{name:'Метод исключения', desc:'Уберёт один неверный вариант.', before:50, now:75},
  retry:{name:'Право на ошибку', desc:'Даёт вторую попытку. Расходуется даже при верном первом ответе.', before:70, now:105},
  expert:{name:'Мнение эксперта', desc:'Покажет верный вариант.', before:150, now:225},
};
const packs = [
  ['Мелочь из кармана',100,1,'Нашли в кармане служебного пиджака.'],
  ['Внеплановая премия',1000,8,'Бухгалтерия отрицает свою причастность.'],
  ['Бюджет согласован',3500,25,'Подпись директора подозрительно похожа на вашу.'],
  ['Бухгалтерия капитулировала',15000,75,'Вы вытрясли из бухгалтерии всё. Даже степлер.']
];
const roots = [
  ['home','Рабочий стол','archive'], ['collection','Коллекция','cards'], ['story','Сюжет','story'],
  ['ratings','Рейтинги','trophy'], ['shop','Магазин','bag'], ['about','Об игре','info'],
];
const researchProducts = {
  fact:{name:'Справка из архива',price:500,hint:'Открывает один выбранный закрытый факт.'},
  all:{name:'Комплексная экспертиза',price:3000,hint:'Открывает все оставшиеся факты этой личности. Выбирать факт не нужно.'},
};
const categoryLines = DATA.categoryLines;
const storyProgress = Object.fromEntries(DATA.categories.map(category=>{
  const line=DATA.story.storylines.find(item=>item.id===categoryLines[category]);
  const people=Object.values(DATA.people).filter(person=>person.category===category);
  return [line.id,{category,line,people,step:people.length/line.chapters.length}];
}));
const moscowFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
function moscowDay() {
  const parts=Object.fromEntries(moscowFormatter.formatToParts(new Date()).map(({type,value})=>[type,value]));
  return Date.UTC(+parts.year,+parts.month-1,+parts.day)/86400000;
}
const initialState = (today = moscowDay()) => ({
  started:false, tutorial:0, tutorialResponse:null, dayNumber:1, calendarDay:today, observedMoscowDay:today, lastSalary:0, salaryJoke:null, pendingYesterday:null,
  earned:0, paid:0, reputation:0, daily:0, playedToday:false, dailyYesterday:null, donations:0, pendingChapters:[], inventory:{exclude:0,retry:0,expert:0},
  discovered:{}, facts:{}, finds:{}, openChapters:{}, readChapters:{}, finaleAvailable:false,
  finaleRead:false, dayResults:{}, lastNormalResult:null, audioConfigured:false, music:true, effects:false, musicVolume:35, effectsVolume:8, absence:0,
});
let storageKey;
let handleStorageError;
let storageFailed = false;
let state;

function failStorage(error) {
  storageFailed = true;
  if (modal.open) modal.close();
  handleStorageError(error);
}

function save() {
  try {
    const local = databaseProgress
      ? Object.fromEntries(Object.entries(state).filter(([field]) => !databaseFields.has(field)))
      : state;
    localStorage.setItem(storageKey, JSON.stringify(local));
  } catch (error) {
    failStorage(error);
    throw error;
  }
}

function applyDatabaseProgress(progress) {
  const { facts, discovered, earned, reputation, daily, yesterday, lastNormalResult, calendarDay } = progress;
  Object.assign(state, { facts, discovered, earned, paid:0, reputation, daily, lastNormalResult, calendarDay,
    dailyYesterday:{score:yesterday} });
  state.finaleAvailable=count(state.facts)===count(DATA.facts);
}

const money = () => state.earned+state.paid;
const count = (object) => Object.keys(object).length;
const announces = (message) => {live.textContent=message;};
const paperclipCount = new Intl.PluralRules('ru-RU');
const paperclipForms = {one:'скрепка',few:'скрепки',many:'скрепок',other:'скрепки'};
const amount = (value) => `${number(value)} ${paperclipForms[paperclipCount.select(value)]}`;
const factsRestored = (person) => person.facts.filter(id => state.facts[id]).length;
const isComplete = (person) => factsRestored(person) === person.facts.length;
const selectedLine = () => DATA.story.storylines.find(line => line.id === route.id);
const currentQuestion = () => session.questions[session.index];
const titleFor = (id) => ({home:'Рабочий стол',collection:'Коллекция',story:'Сюжет',ratings:'Рейтинги'}[id] || '');
const communityUrl = 'https://vk.ru/club242008653';
let route = {page:'home',tab:'people'};
let navigation = [];
let session = null;
let notices = [];
let modalKey = null;
let modalPrevious = null;
let scrollForPop = 0;
let redirectAfterTutorial = null;
let quizRequestPending = false;
let retryQuizRequest = null;
const isPartyPage = page => page==='question'||page==='result';
function setRoute(next, replace = false) {
  const leavingParty=isPartyPage(route.page)&&!isPartyPage(next.page);
  if (!replace) navigation.push(route);
  route = next;
  const method = replace ? 'replaceState':'pushState';
  history[method]({archive:true, route,navigation},'');
  render(true);
  if (leavingParty) flushNotices();
}
history.replaceState({archive:true,route,navigation},'');
function restore(next, stack, scroll = 0) {
  const leavingParty=isPartyPage(route.page)&&!isPartyPage(next.page);
  route=next;
  navigation=stack;
  history.replaceState({archive:true,route,navigation},'');
  render(true,scroll);
  if (leavingParty) flushNotices();
}
function go(page, params = {}) {
  route.scroll = window.scrollY;
  setRoute({page,...params});
}
function nextLocal(patch, focusAction = '') {
  route = {...route,...patch};
  history.replaceState({archive:true,route,navigation},'');
  render(false);
  if (focusAction) app.querySelector(`[data-action="${focusAction}"][aria-pressed="true"]`)?.focus({preventScroll:true});
}
function back() {
  if (modal.open) {closeDialog(); return;}
  if (route.page === 'question') {if(session.finished) revealResult(); else exitConfirm(); return;}
  if (navigation.length) {history.back(); return;}
  if (route.page !== 'home') restore({page:'home'},[]);
}
window.addEventListener('popstate', ({state: locationState}) => {
  if (quizRequestPending) {
    history.pushState({archive:true,route,navigation},'');
    return;
  }
  let next = locationState?.archive ? locationState.route : {page:'home'};
  let stack = locationState?.navigation ?? [];
  if (next.page==='dossier') next=stack.at(-1)?.page==='category'?stack.pop():{page:'collection'};
  if (modal.open || (session && !session.finished && route.page === 'question' && next.page !== 'question')) {
    history.pushState({archive:true,route,navigation},'');
    if (modal.open) closeDialog();
    else exitConfirm();
    return;
  }
  if (route.page==='question' && next.page!=='question') {
    if (session?.finished) {
      history.pushState({archive:true,route,navigation},'');
      revealResult();
      return;
    }
    session=null;
  }
  if ((next.page === 'question' && !session) || (next.page === 'intro' && state.started)) {
    restore({page:'home'},stack.filter(item=>!['question','intro'].includes(item.page)));
    return;
  }
  if (next.page === 'result' && !getResult(next)) {
    restore({page:'home'},stack);
    return;
  }
  scrollForPop = navigation.at(-1)?.page===next.page ? navigation.at(-1).scroll || 0 : next.scroll || 0;
  restore(next,stack,scrollForPop);
  if (state.pendingChapters.length) flushNotices();
});
function showDialog(key,title,body) {
  if (!modal.open) modalPrevious=document.activeElement;
  modalKey=key;
  modal.classList.toggle('story-dialog',key==='chapter-preview');
  const closeButton=key==='first-audio'?'':button('', 'dismiss',{style:'top-btn',icon:'close',attrs:'aria-label="Закрыть окно"'});
  modal.innerHTML=`<div class="dialog-scroll"><div class="stack"><div class="dialog-head"><h2 id="modal-title" tabindex="-1">${label(title)}</h2>${closeButton}</div>${body}</div></div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector('.dialog-scroll').scrollTop=0;
  modal.querySelector('#modal-title').focus();
}
function closeDialog(processQueue = true) {
  if (!modal.open || (modalKey==='first-audio'&&!state.audioConfigured)) return;
  if (modalKey==='chapter-notice'||modalKey==='chapter-preview') {
    state.pendingChapters.shift();
    save();
  }
  modalKey=null;
  modal.close();
  if (modalPrevious && document.contains(modalPrevious)) modalPrevious.focus({preventScroll:true});
  if (processQueue) flushNotices();
}
modal.addEventListener('cancel', event => {event.preventDefault();closeDialog();});
function promptForAudio() {
  if (state.audioConfigured) return;
  showDialog('first-audio','Настроим звук?',`<p>${label('Выберите, что будет звучать в архиве. Изменить выбор можно в настройках.')}</p>
    <div class="stack compact first-audio-options">${audioCheckbox('music','Музыка',true)}${audioCheckbox('effects','Звуковые эффекты',false)}</div>
    ${button('Продолжить','confirm-audio')}`);
}
function earnedFind(id, queue = true) {
  if (state.finds[id]) return;
  state.finds[id]=true;
  if (queue) notices.push({find:id});
}
function findDialogContent(id) {
  const item=DATA.finds[id];
  return `${photo(id,'find-art')}<p>${label(item.description)}</p>${note('За что выдана',item.rule)}`;
}
function flushNotices() {
  if (modal.open || (route.page==='question' && session?.finished)) return;
  const showDayEntry=!isPartyPage(route.page);
  if (showDayEntry) firstDailyEntry();
  if (route.page!=='question'&&state.pendingChapters.length) {
    chapterNotice(state.pendingChapters[0]);
    return;
  }
  const index=notices.findIndex(item=>showDayEntry||!item.salary);
  const [item]=index<0?[]:notices.splice(index,1);
  if (item?.find) {
    const record=DATA.finds[item.find];
    sound.play('event');
    showDialog('award',record.title,findDialogContent(item.find)+button('Забрать','dismiss'));
  } else if (item?.salary) {
    sound.play('event');
    salaryDialog(true);
  } else if (showDayEntry&&state.pendingYesterday) {
    const {score,day,calendarDay}=state.pendingYesterday;
    state.pendingYesterday=null;
    save();
    const title=day===state.dayNumber?'Вчерашний итог':
      `Итог за ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(calendarDay*86400000)}`;
    const text=route.page==='home'?'К рабочему столу':'Продолжить';
    showDialog('yesterday',title,note('Ваш результат',`Очки: ${number(score)}`)+button(text,'dismiss'));
  }
}
function spend(cost) {
  if (money()<cost) return false;
  const before=state.earned;
  const fromPaid=Math.min(cost,state.paid);
  state.paid-=fromPaid;
  state.earned-=cost-fromPaid;
  if (state.earned<before) earnedFind('21');
  return true;
}
function syncChapters(lineId, notify = false) {
  const {line,people,step}=storyProgress[lineId];
  const completed=people.filter(isComplete).length;
  for (const chapter of line.chapters.slice(0,Math.floor(completed/step))) {
    if (state.openChapters[chapter.id]) continue;
    state.openChapters[chapter.id]=true;
    if (notify) state.pendingChapters.push(chapter.id);
  }
}
function checkProgress(person) {
  if (person && isComplete(DATA.people[person])) {
    earnedFind('08');
    syncChapters(categoryLines[DATA.people[person].category],true);
  }
  const found = Object.keys(state.discovered);
  if (found.length===count(DATA.people)) earnedFind('07');
  if (new Set(found.map(id=>DATA.people[id].category)).size===DATA.categories.length) earnedFind('09');
  if (count(state.facts)===count(DATA.facts)) state.finaleAvailable=true;
}
function checkMoney() {
  if (state.earned>=3000) earnedFind('22');
  if (state.reputation>=100) earnedFind('11');
  if (state.reputation>=500) earnedFind('13');
}
function chooseSalaryJoke() {
  const [joke]=sample(DATA.salaryJokes.filter(item=>item.id!==state.salaryJoke),1);
  state.salaryJoke=joke.id;
  return joke;
}
function salaryDialog(paidToday) {
  const message = paidToday ? 'Бухгалтерия начислила 30 скрепок.' : 'Вы ещё не приступили к полноценной работе, а уже интересуетесь зарплатой? Нам нравится ваш подход. Приходите завтра.';
  let joke=paidToday?DATA.salaryJokes.find(item=>item.id===state.salaryJoke):null;
  if (paidToday&&!joke) {
    joke=chooseSalaryJoke();
    save();
  }
  showDialog('salary','Ежедневная зарплата',`<p>${label(message)}</p>
  ${joke?`<figure class="salary-quote note stack compact"><blockquote><p>${label(joke.text)}</p></blockquote><figcaption class="small subtle">Бухгалтерия</figcaption></figure>`:''}
  ${button('Понятно','dismiss')}${paidToday?'<small class="secret">Пароль: КАРТОТЕКА</small>':''}`);
}
function firstDailyEntry() {
  if (databaseProgress || !state.started || state.dayNumber===1 || state.lastSalary===state.dayNumber) return;
  state.lastSalary=state.dayNumber;
  state.earned+=30;
  chooseSalaryJoke();
  notices.push({salary:true});
  earnedFind('18');
  if (state.absence>=7) earnedFind('26');
  checkMoney();
  save();
  render(false);
}
function changeDay(pause = 1, {deferNotices = false} = {}) {
  state.dailyYesterday={score:pause===1 && state.playedToday?state.daily:null};
  if (state.dailyYesterday.score!==null) {
    state.pendingYesterday={score:state.dailyYesterday.score,day:state.dayNumber+pause,calendarDay:state.calendarDay};
  }
  state.daily=0;
  state.playedToday=false;
  state.dayNumber+=pause;
  state.calendarDay+=pause;
  state.absence=pause-1;
  save();
  if (deferNotices||route.page==='question') return;
  render(false);
  flushNotices();
}
function syncMoscowDay(deferNotices = false) {
  if (databaseProgress || storageFailed || !state) return;
  const today=moscowDay();
  const elapsed=today-state.observedMoscowDay;
  if (elapsed>0) {
    state.observedMoscowDay=today;
    changeDay(elapsed,{deferNotices});
  }
}
const todayResult=()=>state.dayResults[state.dayNumber];
function modeCard(title,desc,action,id,glyph) {
  return `<button class="mode" type="button" data-action="${action}" data-id="${id}"><span class="tile-icon">${icon(glyph)}</span><span class="tile-body"><strong>${label(title)}</strong><span class="small subtle">${label(desc)}</span></span>${icon('right',true)}</button>`;
}
function home() {
  return `<div class="dashboard">
    <div class="stack">
      <section class="hero">
        <div class="hero-copy">
          <h1 class="${state.started?'desk-title':''}">${state.started?'Рабочий стол':'Исторический архив'}</h1>
          <p class="lede">${label(state.started?'Восстанавливайте биографии и узнавайте, что случилось в архиве.':'В архиве перепутались биографии. Помогите сотрудникам восстановить документы и выяснить, что произошло.')}</p>
          ${button(state.started?'Начать партию':state.tutorial?'Продолжить пролог':'Начать работу',state.started?'start':'intro',{id:'normal',style:'btn gold',icon:'arrow'})}
        </div>
        <div class="hero-art">${photo('workdesk-hero')}</div>
      </section>
    </div>
    <div class="stack">
      <h2>Сегодня в архиве</h2>
      ${databaseProgress ? note('Тест сохранений', 'В этой сборке доступна обычная викторина. Открытые факты, заработанные скрепки и очки сохраняются в базе.') :
        modeCard('Игра дня',todayResult()?'Готово. Открыть итог':'Одна личность. Одно дело в день','daily','', 'calendar')+
        modeCard('Ежедневная зарплата',state.dayNumber===1?'Со второго календарного дня':state.lastSalary===state.dayNumber?'Сегодня начислена':'К выдаче','salary','', 'clip')}
      <div class="surface stack compact">
        <h3>Восстановление архива</h3>
        <div class="ratio"><strong>${number(count(state.facts))}</strong> из ${number(count(DATA.facts))} фактов</div>
        ${meter(count(state.facts),count(DATA.facts),'Восстановлено фактов')}
      </div>
    </div>
  </div>`;
}
function speech(card) {
  const groups=[];
  for (const line of card.lines) {
    const last=groups.at(-1);
    if (last?.person===line.speaker) last.lines.push(line.text);
    else groups.push({person:line.speaker,lines:[line.text]});
  }
  return `<div class="dialogue">${groups.map(group => {
    const profile=DATA.avatars[group.person];
    const speaker=DATA.story.characters[group.person];
    const role=group.person==='player'?'':profile?.role || speaker.role;
    return `<div class="utterance ${group.person==='player'?'player':''}">${profile?photo(profile.asset):''}
    <div class="speech"><div class="speaker"><strong>${label(profile?.name || speaker.name)}</strong>${role?`<span class="speaker-role small subtle">${label(role)}</span>`:''}</div>
      ${group.lines.map(line=>`<p>${label(line)}</p>`).join('')}
    </div></div>`;
  }).join('')}</div>`;
}
function intro() {
  const replay=route.page==='intro-replay';
  const step=replay?route.step:state.tutorial;
  const prev=button('Предыдущая карточка','intro-prev',{style:'btn secondary',icon:'left'});
  if (step===tutorialStep) {
    const prior=replay?route.response:state.tutorialResponse;
    const correct=prior===tutorialQuestion.correctOptionIndex;
    return `<div class="stack">${heading(tutorialQuestion.question,replay?'Пробный вопрос. Ответ не влияет на прогресс.':'Пробный вопрос. Основной архив пока не меняется.','Пролог · обучение')}
    <div class="options">${tutorialQuestion.options.map((value,index)=>button(value,'training-answer',{id:index,style:`option${prior===index ? correct?' correct':' wrong':''}`,disabled:prior!==null})).join('')}</div>
    ${prior!==null?speech({lines:[{speaker:'elena',text:correct?tutorialQuestion.feedbackCorrect:tutorialQuestion.feedbackIncorrect}]}):''}
    <div class="buttons">${prev}${prior!==null?button('Продолжить','intro-next'):''}</div></div>`;
  }
  const cards=DATA.story.prologue.cards;
  const end=step===cards.length;
  const card=cards[end?step-1:step];
  return `<div class="stack">${heading(card.title,'',`Пролог · ${card.number} из ${cards.length}`)}${speech(card)}
  <div class="buttons">${step>0?prev:''}
  ${button(end?(replay?'Вернуться к сюжету':'Вернуться к работе'):step===tutorialStep-1?'К пробному вопросу':'Следующая карточка',end?(replay?'back':'intro-end'):'intro-next',{icon:'arrow'})}</div></div>`;
}
function moveIntro(direction) {
  if (route.page==='intro-replay') {
    setRoute({...route,step:route.step+direction},true);
    return;
  }
  state.tutorial+=direction;
  save();
  render(true);
}
function start(mode) {
  syncMoscowDay(true);
  if (!state.started) {
    redirectAfterTutorial=mode;
    if (route.page!=='intro') go('intro');
    return;
  }
  if (mode==='day' && todayResult()) {go('result',{mode:'day',day:state.dayNumber});return;}
  if (databaseProgress) {
    const id = crypto.randomUUID();
    performQuizRequest(() => quizProgress.start(id), round => {
      applyDatabaseProgress(round.progress);
      Object.keys(storyProgress).forEach(lineId => syncChapters(lineId));
      session={id:round.id,mode:'normal',day:round.progress.calendarDay,questions:round.questions,index:0,
        attempted:null,wrong:null,feedback:null,hints:{},removed:null};
      go('question');
    });
    return;
  }
  session={mode,day:state.dayNumber,questions:mode==='day'?dailyQuestions(dailyPerson()):quizBank.start(state.facts),index:0,correct:0,newPeople:0,newFacts:0,
    attempted:null,wrong:null,feedback:null,hints:{},removed:null, retryUsed:false};
  go('question');
}

async function performQuizRequest(request, apply) {
  if (quizRequestPending) return;
  retryQuizRequest = null;
  quizRequestPending = true;
  app.setAttribute('aria-busy','true');
  let result;
  try {
    result = await request();
  } catch (error) {
    const retryable = !error.status || error.status >= 500;
    if (retryable) retryQuizRequest = () => performQuizRequest(request, apply);
    const message = retryable ? 'Проверьте соединение с тестовым сервером и повторите действие.' : error.message;
    showDialog('quiz-error','Не удалось продолжить',`<p>${label(message)}</p>${button(retryable?'Повторить':'Закрыть',retryable?'retry-quiz':'dismiss')}`);
    return;
  } finally {
    quizRequestPending = false;
    app.removeAttribute('aria-busy');
  }
  apply(result);
}
function question() {
  const q=currentQuestion();
  const final=session.feedback!==null;
  const day=session.mode==='day';
  const name = day ? DATA.people[q.person].name : '';
  return `<div class="stack">
    <div class="stack compact">
      <div class="inline spread"><span class="kicker">${day?'Игра дня':'Викторина'}</span><span class="ratio">Вопрос ${session.index+1} из ${session.questions.length}</span></div>
      ${meter(session.index+(final?1:0),session.questions.length,'Вопросы в текущей партии')}
    </div>
    <div class="surface prompt stack compact">${name?`<span class="kicker">${label(name)}</span>`:''}<h1>${label(q.text)}</h1></div>
    <div class="options" aria-label="Варианты ответа">
      ${q.options.map((text,i) => {
        const correct=(session.hints.expert || (final && session.feedback.correct)) && q.right===i;
        const wrong=(session.wrong===i || (final && session.attempted===i && q.right!==i));
        const removed=session.removed===i;
        const status=correct ? final?'Верно':'Подсказка' : wrong?'Ошибка':removed?'Исключён':'';
        return `<button type="button" class="option ${correct?'correct':wrong?'wrong':removed?'removed':''}" data-action="answer" data-id="${i}" ${final||removed||wrong?'disabled':''}><span aria-hidden="true" class="tag">${['А','Б','В','Г'][i]}</span><span>${label(text)}</span>${status?`<strong>${status}</strong>`:''}</button>`;
      }).join('')}
    </div>
    ${final?note(session.feedback.title,session.feedback.text,`feedback ${session.feedback.correct?'good':'bad'}`):session.rewardRetry?note('Есть вторая попытка','Выберите другой ответ.','feedback bad'):session.hints.retry?note('Право на ошибку активно','') : ''}
    <div class="question-controls">
    ${final?button(session.index+1===session.questions.length?'К результатам':'Следующий вопрос','question-next',{icon:'arrow'}):
    !day&&!databaseProgress?button('Подсказки','hints',{style:'btn secondary',icon:'info'}):''}
    </div>
  </div>`;
}
function answer(index) {
  syncMoscowDay();
  const q=currentQuestion();
  if (!Number.isInteger(index) || index<0 || index>=q.options.length || session.feedback || index===session.removed || index===session.wrong) return;
  if (databaseProgress) {
    performQuizRequest(() => quizProgress.answer(session.id,session.index,index), receipt => {
      applyDatabaseProgress(receipt.progress);
      session.attempted=index;
      session.feedback=receipt.feedback;
      session.finished=Boolean(receipt.result);
      q.right=receipt.right;
      sound.play(receipt.feedback.correct?'correct':'incorrect');
      if (!receipt.feedback.correct) earnedFind('10');
      checkProgress(receipt.person);
      if (session.finished) checkMoney();
      save();
      render(false);
      app.querySelector('[data-action="question-next"]')?.focus();
      announces(receipt.feedback.title);
      flushNotices();
    });
    return;
  }
  const isRight=q.right===index;
  sound.play(isRight?'correct':'incorrect');
  const discoveredNow=!state.discovered[q.person];
  if (discoveredNow) {state.discovered[q.person]=true;session.newPeople++;}
  if (!isRight && session.hints.retry && !session.retryUsed) {
    session.retryUsed=true;
    session.wrong=index;
    session.rewardRetry=true;
    earnedFind('10');
    checkProgress(q.person);
    save();
    render(false);
    announces('Есть вторая попытка');
    return;
  }
  session.attempted=index;
  let firstFact=false;
  if (isRight) {
    session.correct++;
    if (!state.facts[q.fact]) {
      state.facts[q.fact]=true;
      session.newFacts++;
      firstFact=true;
    }
    if (session.hints.retry && !session.retryUsed) earnedFind('20');
  } else earnedFind(session.mode==='day'?'27':'10');
  checkProgress(q.person);
  const fact=DATA.facts[q.fact];
  session.feedback={correct:isRight,title:isRight?(firstFact?'Факт восстановлен':'Верно · факт уже известен'):'Факт не восстановлен',
    text:isRight?`${DATA.people[q.person].name} · ${displayField(fact.field)}: ${fact.value}`:discoveredNow?'В коллекции появилась новая карточка.':'Попробуйте следующий вопрос.'};
  if (session.index+1===session.questions.length) commitResult();
  save();
  render(false);
  app.querySelector('[data-action="question-next"]')?.focus();
  announces(session.feedback.title);
  flushNotices();
}
function endQuestion() {
  if (!session.feedback) return;
  if (session.index+1 < session.questions.length) {
    Object.assign(session,{index:session.index+1,attempted:null,wrong:null,feedback:null,hints:{},removed:null,retryUsed:false,rewardRetry:false});
    render(true);
    return;
  }
  revealResult();
}
function commitResult() {
  if (session.finished) return;
  const result={mode:session.mode,day:session.day, answered:session.questions.length, correct:session.correct,
    reward:session.correct*10, bonus:session.mode==='day'?50:0, fresh:session.newFacts,newPeople:session.newPeople};
  state.earned+=result.reward+result.bonus;
  state.reputation+=result.correct;
  state.daily+=result.correct;
  state.playedToday=true;
  if (result.mode==='day') {state.dayResults[session.day]=result;earnedFind('19');}
  if(result.mode==='normal') state.lastNormalResult=result;
  checkMoney();
  session.finished=true;
}
function revealResult() {
  const {mode,day}=session;
  session=null;
  setRoute({page:'result',mode,day},true);
  flushNotices();
}
function exitConfirm() {
  showDialog('exit','Завершить досрочно?',`<p>${label('Обнаруженные личности и открытые факты сохранятся. Скрепки и очки за незавершённую партию сгорят. В следующий раз начнётся новая попытка.')}</p><div class="buttons">${button('Продолжить игру','dismiss',{style:'btn secondary'})}${button('Выйти','exit',{style:'btn danger'})}</div>`);
}
function exitParty() {
  closeDialog(false);
  const leave = () => {
    session=null;
    history.back();
    setTimeout(flushNotices,100);
  };
  if (!databaseProgress) {leave();return;}
  performQuizRequest(() => quizProgress.abandon(session.id), result => {
    applyDatabaseProgress(result.progress);
    if (result.finished) revealResult();
    else leave();
  });
}
function daily() {
  syncMoscowDay(true);
  if (!state.started) {start('day');return;}
  if (todayResult()) {go('result',{mode:'day',day:state.dayNumber});return;}
  go('daily');
  flushNotices();
}
function dayIntro() {
  const person=DATA.people[dailyPerson()];
  return `<div class="stack">${heading('Игра дня','Сегодня все вопросы об одной личности. Задание обновится в 00:00 МСК.')}
  <div class="surface stack"><h2>${label(person.name)}</h2><p>${person.facts.length} ${({one:'вопрос',few:'вопроса',many:'вопросов'})[paperclipCount.select(person.facts.length)]} · 50 скрепок за завершение</p>
    ${button('Открыть дело','start',{id:'day',icon:'arrow'})}</div></div>`;
}
const getResult = (location = route) => location.mode==='day'?state.dayResults[location.day??state.dayNumber]:state.lastNormalResult;
function results() {
  const r=getResult();
  if (!r) return note('Пока нет результата','Начните партию на рабочем столе.')+button('К рабочему столу','home');
  const nextDay = r.mode==='day' && route.day!=null && route.day < state.dayNumber;
  const subtitle = r.mode==='day'?(nextDay?'Вчерашнее задание выполнено. Новая игра дня уже открыта.':'Задание выполнено. Следующее откроется в 00:00 МСК.'):'Скрепки и очки начислены.';
  return `<div class="stack">${heading(r.mode==='day'?'Итог Игры дня':'Итог партии',subtitle)}
   <div class="surface stack"><div class="stats">
     <div class="stat"><b>${r.correct}/${r.answered}</b><span>Верные ответы</span></div>
     <div class="stat"><b>+${r.reward+r.bonus}</b><span>Скрепки</span></div>
     <div class="stat"><b>+${r.fresh}</b><span>Новые факты</span></div></div>
     <p class="small subtle">${label(`+${r.correct} к репутации · +${r.correct} к настрою дня · новых личностей: ${r.newPeople}`)}${r.bonus?'<br>Включена премия 50 скрепок.':''}</p>
   </div>
   ${nextDay?button('Открыть новую Игру дня','daily',{icon:'arrow'}): ''}
   <div class="buttons">${r.mode==='normal'?button('Ещё партия','start',{id:'normal'}):button('К рабочему столу','home',{style:nextDay?'btn secondary':'btn primary'})}
   ${button('Открыть коллекцию','root',{id:'collection',style:'btn secondary'})}</div>
   ${r.mode==='normal'?button('К рабочему столу','home',{style:'btn secondary',icon:'archive'}):''}</div>`;
}
function hints() {
  if (!session || session.mode==='day') return;
  const body=Object.entries(hintInfo).map(([id, item])=>{
    const left=state.inventory[id];
    const applied=session.hints[id];
    return `<div class="surface stack compact"><h3>${label(item.name)}</h3><p class="small subtle">${label(item.desc)}</p>
      ${button(applied?'Уже применено':left?`Применить · в запасе ${left}`:`Купить и применить · ${amount(item.now)}`,'hint',{id,disabled:applied,style:'btn secondary'})}</div>`;
  }).join('');
  showDialog('hints','Подсказки',`<p class="small subtle">${label('Здесь цены уже включают наценку 50%. На будущее выгоднее купить подсказки заранее в магазине.')}</p><div class="stack compact">${body}</div>`);
}
function applyHint(id, bought) {
  if (!session || session.mode==='day' || session.feedback || session.hints[id]) return;
  const q=currentQuestion();
  if (bought) {
    if (!spend(hintInfo[id].now)) return;
    earnedFind('14');
  } else state.inventory[id]--;
  session.hints[id]=true;
  if (id==='exclude') session.removed=q.options.findIndex((value,i)=>i!==q.right && i!==session.wrong);
  save();
  closeDialog(false);
  render(false);
  announces(`Применено: ${hintInfo[id].name}`);
  flushNotices();
}
function collection() {
  const current=route.tab || 'people';
  const gallery=`<div class="inline spread"><h2>Архивные находки</h2><span class="ratio">${count(state.finds)}/30</span></div><div class="gallery" aria-label="30 архивных находок">${Object.entries(DATA.finds).map(([id,item])=>
    state.finds[id]?`<div class="find-slot"><button type="button" class="find" data-action="find" data-id="${id}" aria-describedby="find-rule-${id}">${photo(id)}<strong>${label(item.title)}</strong></button><span class="find-rule" id="find-rule-${id}" role="tooltip">${label(item.rule)}</span></div>`:
      `<button type="button" class="find" aria-label="Находка ещё не открыта" disabled>?</button>`).join('')}</div>`;
  const categories=`<div class="categories">${DATA.categories.map(category=>{
    const ids=Object.entries(DATA.people).filter(([id,p])=>p.category===category);
    const seen=ids.filter(([id])=>state.discovered[id]).length;
    const restored=ids.filter(([id,p])=>isComplete(p)).length;
    return `<button type="button" class="tile stack compact" data-action="category" data-id="${e(category)}"><span class="tile-icon">${photo(DATA.categoryIcons[category])}</span>
      <strong>${label(category)}</strong><span class="small">Обнаружено ${seen}/${ids.length} · восстановлено ${restored}/${ids.length}</span>
      ${meter(seen,ids.length,`Обнаружено в категории ${category}`)}</button>`;
  }).join('')}</div>`;
  const controls=tabs([['people','Личности'],['finds','Находки']],current,'collection-tab','Раздел коллекции');
  return `<div class="stack">${sectionHeading('Коллекция',controls)}
    ${current==='finds'?gallery:categories}</div>`;
}
function personCard(id, person) {
  const restored=factsRestored(person);
  const complete=isComplete(person);
  const active=route.researchPerson===id&&!complete;
  const facts=person.facts.map(fid=>{
    const fact=DATA.facts[fid];
    const field=displayField(fact.field);
    if (state.facts[fid]) return `<li class="person-fact"><strong>${label(field)}</strong><span>${label(fact.value)}</span></li>`;
    const locked=`<strong>${label(field)}</strong><span class="masked-fact"><span class="visually-hidden">Факт закрыт</span>${icon('lock',true)}<span class="mask" aria-hidden="true"></span></span>`;
    return active
      ? `<li class="person-fact fact-choice"><button type="button" class="fact-select" data-action="select-fact" data-id="${fid}" aria-pressed="${route.fact===fid}">${locked}</button></li>`
      : `<li class="person-fact">${locked}</li>`;
  }).join('');
  const controls=Object.entries(researchProducts).map(([key,item])=>{
    const tipId=`research-tip-${id}-${key}`;
    const disabled=key==='fact'&&!route.fact;
    return tooltip(tipId,item.hint,button(`${item.name} · ${amount(item.price)}`,'research',{
      id:key,style:'btn secondary',attrs:`aria-describedby="${tipId}"${disabled?' aria-disabled="true"':''}`,
    }));
  }).join('');
  return `<article class="person-card" aria-labelledby="card-${id}">
    <div class="person-portrait" aria-hidden="true"><img src="${DATA.images[id]}" loading="lazy" alt=""></div>
    <div class="person-profile"><h2 id="card-${id}" tabindex="-1">${label(person.name)}</h2>
      <p class="small subtle">Факты ${restored}/${person.facts.length}</p>
      <ul class="person-facts" id="person-facts-${id}">${facts}</ul>
      ${active?`<div class="research-controls" id="research-${id}"><p class="small subtle">${route.fact?'Факт выбран.':'Выберите закрытый факт для справки.'}</p>${controls}
        ${button('Закрыть исследование','toggle-research',{id,style:'person-research',attrs:'aria-expanded="true"'})}</div>`:
        complete||databaseProgress?'':button('Исследование','toggle-research',{id,style:'person-research',attrs:`aria-label="Исследование: ${e(person.name)}" aria-expanded="false"`})}
    </div></article>`;
}
function category() {
  const people=Object.entries(DATA.people).filter(([id,p])=>p.category===route.id);
  const shown=people.filter(([id,p])=>state.discovered[id] && (route.tab!=='full'||isComplete(p)));
  const seen=people.filter(([id])=>state.discovered[id]);
  const hidden=people.length-seen.length;
  const full=seen.filter(([id,p])=>isComplete(p)).length;
  const summary=`Обнаружено ${seen.length} из ${people.length} · восстановлено ${full} из ${people.length}`;
  const controls=tabs([['all','Обнаружено'],['full','Восстановлено']],route.tab||'all','category-tab','Показать личности');
  return `<div class="stack">${sectionHeading(route.id,controls,summary,'Назад к категориям')}
   ${shown.length?`<div class="person-grid">${shown.map(([id,p])=>personCard(id,p)).join('')}</div>`:
   note(route.tab==='full'?'Нет полностью восстановленных досье':'Пока никого не обнаружили',route.tab==='full'?'Заполните все факты о личности.':'Карточки появляются по мере игры.')}
   ${route.tab!=='full'&&hidden?note(`Скрытых карточек: ${hidden}`,''):''}</div>`;
}
function selectedResearch(kind) {
  const item=researchProducts[kind];
  const person=DATA.people[route.researchPerson];
  if (route.page!=='category'||!item||!person||person.category!==route.id||!state.discovered[route.researchPerson]) return;
  const remaining=person.facts.filter(id=>!state.facts[id]);
  const ids=kind==='all'?remaining:remaining.filter(id=>id===route.fact);
  if (ids.length) return {item,person,ids};
}
function research(kind) {
  const selection=selectedResearch(kind);
  if (!selection) return;
  const {item,person,ids}=selection;
  const description=kind==='all'?item.hint:`Откроет факт «${displayField(DATA.facts[ids[0]].field)}» в карточке «${person.name}».`;
  purchaseDialog(item.name,description,item.price,'buy-research',kind);
}
function buyResearch(kind) {
  const selection=selectedResearch(kind);
  if (!selection||!spend(selection.item.price)) return;
  const personId=route.researchPerson;
  for (const id of selection.ids) state.facts[id]=true;
  earnedFind(kind==='all'?'15':'16');
  checkProgress(personId);
  save();
  closeDialog(false);
  nextLocal({fact:null,researchPerson:isComplete(selection.person)?null:personId});
  app.querySelector(`#card-${personId}`)?.focus({preventScroll:true});
  announces(kind==='all'?'Оставшиеся факты восстановлены.':'Факт восстановлен.');
  flushNotices();
}
function story() {
  const open=count(state.openChapters);
  const prologueStatus=state.started?'Пролог · перечитать':state.tutorial?'Пролог · продолжить':'Пролог · начать';
  const finaleStatus=state.finaleRead?'Финал · перечитать':'Финал · готов к чтению';
  return `<div class="stack">${heading('Сюжет','Десять историй о том, что случилось в архиве.')}
    <div class="chapter-grid">
    ${listItem(DATA.story.prologue.title,prologueStatus,state.started?'read-prologue':'intro','','story')}
    ${DATA.story.storylines.map(line=>{
      const opened=line.chapters.filter(ch=>state.openChapters[ch.id]).length;
      return listItem(line.title,`${storyProgress[line.id].category} · открыто ${opened}/30`,'line',line.id,'story');
    }).join('')}
    ${state.finaleAvailable||state.finaleRead?listItem('Общий финал',finaleStatus,'finale','',state.finaleRead?'check':'story'):
    `<div class="list-item chapter-locked"><span class="tile-icon">${icon('lock')}</span><span class="tile-body"><strong>Общий финал</strong><span class="small">Откроется, когда вы восстановите все факты основной базы.</span></span></div>`}
    </div>
    ${!open?'<p class="small subtle">Открытые главы появятся по мере работы с архивом.</p>':''}</div>`;
}
function storyLine() {
  const line=selectedLine();
  const {category,step}=storyProgress[line.id];
  const requirement=step===1?'за каждую полностью открытую личность':'за каждые две полностью открытые личности';
  return `<div class="stack">${heading(line.title,`Открыто ${line.chapters.filter(ch=>state.openChapters[ch.id]).length} из 30 глав`)}
    <p class="small subtle">${label(`Категория «${category}». Новая глава ${requirement}.`)}</p>
    <div class="chapter-grid">${line.chapters.map(ch=>state.openChapters[ch.id]?
    listItem(`Глава ${ch.number}. ${ch.title}`,state.readChapters[ch.id]?'Прочитано':'Новая глава','chapter',ch.id,state.readChapters[ch.id]?'check':'story'):
    `<div class="list-item chapter-locked"><span>Глава ${ch.number}</span><span class="inline small">${icon('lock',true)} Закрыта</span></div>`).join('')}</div></div>`;
}
const allChapters = Object.fromEntries(DATA.story.storylines.flatMap(line=>line.chapters.map((ch,index)=>
  [ch.id,{...ch,line:line.title,nextId:line.chapters[index+1]?.id}])));
function nextOpenChapter(id) {
  const nextId=allChapters[id]?.nextId;
  return nextId&&state.openChapters[nextId]?nextId:null;
}
function chapterNotice(id) {
  const chapter=allChapters[id];
  sound.play('event');
  showDialog('chapter-notice','Новая глава',`
    <div class="note stack compact"><p class="kicker">${label(chapter.line)}</p><h3>${label(chapter.title)}</h3></div>
    <div class="buttons">${button('Позже','dismiss',{style:'btn secondary'})}${button('Читать главу','chapter-preview',{id:0,icon:'story'})}</div>`);
}
function chapterPreview(index) {
  const chapter=allChapters[state.pendingChapters[0]];
  if (!chapter?.cards[index]) return;
  const end=index===chapter.cards.length-1;
  showDialog('chapter-preview',chapter.title,`
    <p class="kicker">${label(`${chapter.line} · ${index+1} из ${chapter.cards.length}`)}</p>
    ${speech(chapter.cards[index])}
    <div class="buttons">${index?button('Назад','chapter-preview',{id:index-1,style:'btn secondary'}):''}
      ${button(end?'Продолжить':'Следующая карточка',end?'chapter-preview-done':'chapter-preview',{id:index+1})}</div>`);
}
function markChapterRead(id) {
  if (!allChapters[id]||state.readChapters[id]) return;
  state.readChapters[id]=true;
  const award={'line_03_ch03':'02','line_03_ch24':'03','line_08_ch24':'04','line_10_ch21':'05'}[id];
  if (award) earnedFind(award);
  save();
}
function readChapter() {
  const finish=route.id==='finale';
  const chapter=finish?DATA.story.finale:allChapters[route.id];
  const index=route.card || 0;
  const card=chapter.cards[index];
  const end=index===chapter.cards.length-1;
  const next=end?nextOpenChapter(route.id):null;
  const chapterTitle=finish?'Общий финал':chapter.title || `Глава ${chapter.number}`;
  const endLabel=finish?(state.finaleRead?'Вернуться к сюжету':'Вернуться к работе'):'К списку глав';
  return `<div class="stack">${heading(chapterTitle,card.title&&card.title!==chapterTitle?card.title:'',`${chapter.line||'Сюжет'} · ${index+1} из ${chapter.cards.length}`)}
   ${speech(card)}
   <div class="buttons chapter-actions">${index?button('Предыдущая карточка','chapter-step',{id:index-1,style:'btn secondary',icon:'left'}):''}
    ${button(end?endLabel:'Следующая карточка',end?'chapter-end':'chapter-step',{id:index+1,style:next?'btn secondary':'btn primary',icon:next?'left':'arrow'})}
    ${next?button('Следующая глава','chapter-next',{icon:'arrow'}):''}</div>
   </div>`;
}
function advanceChapter() {
  const current=allChapters[route.id];
  const next=route.page==='chapter'?nextOpenChapter(route.id):null;
  if (!next||route.card!==current.cards.length-1) return;
  markChapterRead(current.id);
  setRoute({page:'chapter',id:next,card:0},true);
  flushNotices();
}
function finishChapter() {
  if (route.id==='finale'&&!state.finaleRead) {
    state.finaleRead=true;
    earnedFind('06');
    save();
    setRoute({page:'finale-done'},true);
    flushNotices();
    return;
  }
  markChapterRead(route.id);
  if (navigation.length) {
    history.back();
    setTimeout(flushNotices,100);
  } else {
    restore({page:'story'},[]);
    flushNotices();
  }
}
function personalScore(score) {
  return `<div class="inline spread"><strong>Ваши очки</strong><span>${number(score)}</span></div>`;
}

function ratings() {
  const current=route.tab || 'reputation';
  const controls=tabs([['reputation','Репутация'],['day','Настрой дня']],current,'rating-tab','Рейтинг');
  return `<div class="stack">${sectionHeading('Рейтинги',controls,databaseProgress?'Здесь показаны ваши очки из тестовой базы.':'Здесь показаны очки из этого браузера. Общие рейтинги появятся после подключения VK.')}
   <p class="small subtle">${current==='reputation'?'Очки накапливаются без сброса.':'Суточный рейтинг обновляется в 00:00 МСК.'}</p>
   ${current==='reputation'?`<section class="surface">${personalScore(state.reputation)}</section>`:`<div class="daily-ranks">
     <section class="surface stack compact" aria-labelledby="today-title"><h2 id="today-title">Сегодня</h2>${personalScore(state.daily)}</section>
     <section class="surface stack compact" aria-labelledby="yesterday-title"><h2 id="yesterday-title" tabindex="-1">Вчера</h2>
       ${state.dailyYesterday?.score==null?'<p class="small subtle">Вашего результата за вчера нет.</p>':personalScore(state.dailyYesterday.score)}</section>
   </div>`}
   </div>`;
}
function shop() {
  if (databaseProgress) return `<div class="stack">${heading('Магазин',`Баланс · ${amount(money())}`)}${note('Магазин пока закрыт','В тестовой сборке можно заработать скрепки в обычной викторине.')}</div>`;
  return `<div class="stack">${heading('Магазин',`Баланс · ${amount(money())}`)}
   ${listItem('Пополнить баланс','Пакеты скрепок за голоса VK','topup','','clip')}
   <section class="stack" aria-labelledby="shop-hints">
    <h2 id="shop-hints">Подсказки</h2>
    <div class="categories">${Object.entries(hintInfo).map(([id,item])=>listItem(item.name,`В запасе: ${state.inventory[id]} · ${amount(item.before)}`,'prebuy',id,'info')).join('')}</div>
   </section>
   <section class="stack" aria-labelledby="shop-research">
    <h2 id="shop-research">Исследования</h2>
    <div class="categories">${Object.values(researchProducts).map(item=>listItem(item.name,`${amount(item.price)} · Заказать в карточке личности`,'root','collection','cards')).join('')}</div>
   </section>
   <section class="stack shop-support" aria-labelledby="shop-support">
    <h2 id="shop-support">Поддержка игры</h2>
    ${listItem('Фонд моральной поддержки архива',`Ваш вклад: ${amount(state.donations)}`,'fund','','heart')}
   </section>
   </div>`;
}
function purchaseDialog(title,description,price,action,id) {
  if (money()>=price) {
    showDialog('purchase',title,`<p>${label(description)}</p><p>Стоимость · <strong>${amount(price)}</strong></p>
      <div class="buttons">${button('Отмена','dismiss',{style:'btn secondary'})}${button('Подтвердить покупку',action,{id})}</div>`);
    return;
  }
  showDialog('poor','Не хватает скрепок',`<p>${label(`${title}. Нужно ${amount(price)}. На балансе ${amount(money())}.`)}</p><p class="small subtle">${label(description)}</p>
      <div class="buttons">${button('Вернуться','dismiss',{style:'btn secondary'})}</div>`);
}
function packages() {
  const body = packs.map(([title, clips, votes, description]) =>
    `<div class="surface stack compact"><h3>${label(title)}</h3>
      <p>${label(`${amount(clips)} · ${votes} ${votes===1?'голос':'голосов'} VK`)}</p>
      <p class="small subtle">${label(description)}</p></div>`).join('');
  showDialog('packages','Пополнение баланса',`<p>Пополнение будет доступно в VK после подключения оплаты.</p>
    <div class="stack compact">${body}</div>
    <p class="small subtle">${label('Купленные скрепки ничем не отличаются от заработанных и подходят для любых покупок в магазине. Единственное исключение — их нельзя перечислить в «Фонд моральной поддержки архива».')}</p>`);
}

function fund() {
  return `<div class="stack">${heading('Фонд моральной поддержки архива')}
   <div class="surface stack compact">
    <p>${label('Если хочется поддержать игру без денежного взноса, можно перечислить в фонд скрепки, которые вы заработали в игре. Это ваш способ сказать архиву «Я играю и хочу, чтобы вы продолжали».')}</p>
    <p>Купленные скрепки фонд не принимает. Денежные взносы принимают отдельно, в <a href="${e(communityUrl)}" target="_blank" rel="noopener noreferrer">сообществе игры во ВКонтакте</a>.</p>
   </div>
   <div class="surface stack">
     <div class="stack compact">
       <div class="inline spread fund-stat"><span>Ваш вклад</span><strong>${amount(state.donations)}</strong></div>
       <div class="inline spread fund-stat"><span>Доступно для перевода</span><strong>${amount(state.earned)}</strong></div>
       <p class="small subtle">Вклад хранится в этом браузере. Общий итог появится после подключения VK.</p>
     </div>
     <form class="stack compact" id="donation" novalidate>
      <label class="field">Сумма в скрепках<input name="sum" inputmode="numeric" type="number" min="1" step="1" aria-describedby="donation-error" placeholder="Введите сумму" required></label>
      <p id="donation-error" class="feedback bad small" role="alert" hidden></p>
      <button class="btn primary" type="submit">Продолжить</button>
     </form></div>
   ${listItem('Почётные меценаты архива','Рейтинг добровольных переводов','patrons','','trophy')}</div>`;
}
function donationError(sum) {
  if (!Number.isSafeInteger(sum)||sum<1) return 'Введите целое число от 1.';
  if (sum>money()) return `На общем балансе не хватает скрепок. Сейчас у вас ${amount(money())}, из них заработано ${amount(state.earned)}.`;
  if (sum>state.earned) return `На общем балансе скрепок хватает, но заработанных только ${amount(state.earned)}. Купленные скрепки перевести нельзя.`;
  return '';
}
function showDonationError(form, message) {
  const error=form.querySelector('#donation-error');
  error.hidden=!message;
  error.textContent=message;
  form.elements.sum.setAttribute('aria-invalid',String(Boolean(message)));
  if (message) form.elements.sum.focus({preventScroll:true});
}
function donate(id) {
  const sum=Number(id);
  const error=donationError(sum);
  if (error) {
    closeDialog(false);
    showDonationError(app.querySelector('#donation'),error);
    return;
  }
  state.earned-=sum;
  state.donations+=sum;
  earnedFind('12');
  save();
  render(false);
  showDialog('donated','Спасибо, что поддерживаете архив!',`
    <p>${label(`Вы перечислили ${amount(sum)} в фонд. Спасибо, что играете и поддерживаете нас таким способом. Для архива это знак, что его работа кому-то нужна.`)}</p>
    <p class="small subtle">${label('Это символический вклад игровыми скрепками. Денежный платёж не проводился.')}</p>
    ${button('Понятно','dismiss')}`);
}
function patrons() {
  return `<div class="stack">${heading('Почётные меценаты архива','Рейтинг переводов заработанных скрепок.')}
    <div class="note stack compact"><h2>Спасибо, что вы с нами!</h2>
      <p>${label('В рейтинге учитываются символические взносы игровыми скрепками. Спасибо каждому, кто играет, восстанавливает архив и делится заработанным. Для нас это знак поддержки.')}</p></div>
    <p class="small subtle">Общий рейтинг появится после подключения VK.</p>
    <div class="surface inline spread"><strong>Ваш вклад</strong><span>${amount(state.donations)}</span></div></div>`;
}
function audioCheckbox(name,title,checked,attribute='name') {
  return `<label class="setting"><span>${label(title)}</span><input type="checkbox" ${attribute}="${name}" ${checked?'checked':''}></label>`;
}
function settings() {
  return `<div class="stack">${heading('Настройки')}
   <section class="surface stack"><h2>Звук</h2>
    ${audioCheckbox('music','Музыка',state.music,'data-setting')}
    ${audioCheckbox('effects','Звуковые эффекты',state.effects,'data-setting')}
    <label class="setting volume"><span>Громкость музыки</span><input type="range" min="0" max="100" value="${state.musicVolume}" data-volume="musicVolume"></label>
    <label class="setting volume"><span>Громкость эффектов</span><input type="range" min="0" max="100" value="${state.effectsVolume}" data-volume="effectsVolume"></label>
   </section></div>`;
}
function about() {
  return `<div class="stack">${heading('Об игре')}
   <section class="surface stack">
     <p><strong>Дорогой сотрудник Архива!</strong></p>
     <p>${label('Пусть эта игра поможет вспомнить забытое и узнать новое. Особенно здорово, если после очередного вопроса захочется почитать о ком-нибудь подробнее.')}</p>
     <p>${label('Некоторые исторические факты в игре упрощены, другие могут содержать неточности. Архив, как вы уже могли заметить, — вообще не самое надёжное учреждение.')}</p>
     <p>${label('Удачных открытий и побольше скрепок!')}</p>
     <p><strong>Ваш Архив</strong></p>
   </section>
   <div class="surface stack"><h2>Правила</h2><p>${label('Обычная партия состоит из десяти вопросов. Верный ответ восстанавливает факт. Скрепки и очки рейтингов начисляются после завершения партии.')}</p>
   <p>${label('Игра дня посвящена одной личности. Новое задание открывается в 00:00 МСК. Начатое задание можно закончить после полуночи.')}</p></div>
   <div class="stack compact small subtle">
     <p>${label('Портреты исторических личностей созданы с помощью искусственного интеллекта и представляют собой художественные интерпретации их внешности.')}</p>
     <p>${label('Музыка «Walking Along», Kevin MacLeod (incompetech.com). В игре фрагмент зациклен с плавным переходом.')}</p>
     <p>Источник · https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100020<br>Лицензия CC BY 4.0 · https://creativecommons.org/licenses/by/4.0/</p>
   </div>
   <form class="surface stack compact" id="password"><label class="field">Служебный доступ<input type="text" name="secret" maxlength="32" autocomplete="off" required></label>
   <button class="btn secondary" type="submit">Проверить пароль</button><p id="password-status" class="small" role="status"></p></form>
   ${button('Не нажимать','secret-button',{style:'btn danger secret-button'})}</div>`;
}
function render(focus = false, scroll = null) {
  const page=route.page;
  if (page==='question'&&!session) {restore({page:'home'},[]);return;}
  const span = ['intro','intro-replay','question'].includes(page);
  const hasNav=!span&&page!=='chapter';
  const introBack=page==='intro-replay'||navigation.at(-1)?.page==='story'?'К сюжету':'К рабочему столу';
  const ancestor=roots.some(([id])=>id===page)?page:[...navigation].reverse().find(x=>roots.some(([id])=>id===x.page))?.page;
  const mainNav = css => `<nav class="${css}" aria-label="Основные разделы">${roots.map(([id,title,glyph])=>
    button(title,'root',{id,style:'nav-button',icon:glyph,attrs:id===ancestor?'aria-current="page"':''})).join('')}</nav>`;
  const top = `<header class="top"><div class="frame top-inner">
    ${span?button(page==='question'?(session.finished?'К результатам':'Выйти из партии'):introBack,'back',{style:'back',icon:'left'}):
    `<button type="button" class="brand" data-action="root" data-id="home" aria-label="Исторический архив — к рабочему столу"><span class="brand-icon">${icon('archive')}</span><span class="brand-title">Исторический<br>архив</span></button>
      ${hasNav?mainNav('top-nav'):''}
      <div class="top-actions">
        ${tooltip('rep-tip','Репутация. Накапливается во время игры и не тратится.',button(number(state.reputation),'reputation',{style:'reputation',icon:'trophy',attrs:`aria-label="Репутация ${state.reputation}. Открыть рейтинг" aria-describedby="rep-tip"`}), 'header-tooltip')}
        ${tooltip('clips-tip','Скрепки. Внутриигровая валюта.',button(number(money()),'shop',{style:'balance',icon:'clip',attrs:`aria-label="Скрепки ${money()}. Открыть магазин" aria-describedby="clips-tip"`}), 'header-tooltip')}
        ${button('','settings',{style:'top-btn',icon:'gear',attrs:'aria-label="Настройки" title="Настройки"'})}
      </div>`}
    </div></header>`;
  const nav=hasNav?`<div class="nav-wrap">${mainNav('bottom-nav')}</div>`:'';
  const pages={home, intro,'intro-replay':intro,question,daily:dayIntro,result:results,collection,category,story,line:storyLine,
    chapter:readChapter,ratings,shop,fund,settings,about,
    patrons,
    'finale-done':()=>`<div class="stack">${heading(DATA.story.finale.endTitle,DATA.story.finale.endMessage)}
      ${button('Продолжить работу','home')}${button('Вернуться к сюжету','back',{style:'btn secondary'})}</div>`};
  const showBack=!span&&page!=='category'&&!roots.some(([id])=>id===page);
  const wide=['home','collection','category','story','ratings','line','shop'].includes(page);
  app.classList.toggle('has-nav',hasNav);
  const reading=['intro','intro-replay','chapter'].includes(page);
  app.innerHTML=`${top}<main id="main" tabindex="-1" class="frame"><div class="layout${wide?'':' narrow'}${reading?' reading-layout':''}">
     ${showBack?button('Назад','back',{style:'back',icon:'left'}):''}${(pages[page]||home)()}</div></main>${nav}`;
  if (focus) {
    announces('');
    app.querySelector('#main').focus({preventScroll:true});
    window.scrollTo(0,scroll ?? 0);
  }
}
function openRoot(id, params = {}) {
  if (route.page===id) {
    if (Object.keys(params).length) nextLocal(params,'rating-tab');
    window.scrollTo(0,0);
    return;
  }
  const find={ratings:'23',shop:'24',story:'25'}[id];
  if (find) {earnedFind(find);save();}
  go(id,params);
  flushNotices();
}
app.addEventListener('change', event=>{
  const setting=event.target.dataset.setting;
  if (setting) {state[setting]=event.target.checked;save();sound.update(state);sound.unlock(state);}
});
app.addEventListener('input', event=>{
  if (event.target.form?.id==='donation') showDonationError(event.target.form,'');
  const volume=event.target.dataset.volume;
  if (volume) {state[volume]=Number(event.target.value);save();sound.update(state);}
});
app.addEventListener('submit', event=>{
  event.preventDefault();
  const form=event.target;
  if (form.id==='password') {
    const message=form.querySelector('#password-status');
    const correct=form.elements.secret.value.trim().toLocaleUpperCase('ru')==='КАРТОТЕКА';
    const issued=state.finds['30'];
    message.textContent = correct?(issued?'Доступ был выдан ранее.':'Доступ разрешён.'):'Пароль не подошёл.';
    if (correct&&!issued) {earnedFind('30');save();flushNotices();}
  }
  if (form.id==='donation') {
    const sum=Number(form.elements.sum.value);
    const error=donationError(sum);
    showDonationError(form,error);
    if (error) return;
    showDialog('donation','Подтвердить перевод?',`<p>${amount(sum)} в «Фонд моральной поддержки архива».</p>
      <div class="buttons">${button('Отмена','dismiss',{style:'btn secondary'})}${button('Перевести','donate',{id:sum})}</div>`);
  }
});
const actions = {
  back, home:()=>openRoot('home'), root:openRoot, shop:()=>openRoot('shop'), dismiss:closeDialog,
  'confirm-audio':()=>{
    if (modalKey!=='first-audio') return;
    state.music=modal.querySelector('[name="music"]').checked;
    state.effects=modal.querySelector('[name="effects"]').checked;
    state.audioConfigured=true;
    save();
    sound.unlock(state);
    closeDialog();
  },
  reputation:()=>openRoot('ratings',{tab:'reputation'}),
  settings:()=>go('settings'), intro:()=>{redirectAfterTutorial=null;go('intro');},
  'intro-prev':()=>moveIntro(-1), 'intro-next':()=>moveIntro(1),
  'training-answer':id=>{
    const replay=route.page==='intro-replay';
    if ((replay?route.response:state.tutorialResponse)!==null) return;
    const response=Number(id);
    if (replay) nextLocal({response});
    else {
      state.tutorialResponse=response;
      save();
      render(false);
    }
    const correct=response===tutorialQuestion.correctOptionIndex;
    sound.play(correct?'correct':'incorrect');
    announces(correct?tutorialQuestion.feedbackCorrect:tutorialQuestion.feedbackIncorrect);
    app.querySelector('[data-action="intro-next"]')?.focus({preventScroll:true});
  },
  'intro-end':()=>{state.started=true;earnedFind('01');save();setRoute({page:'home'},true);
    if (redirectAfterTutorial==='day') {redirectAfterTutorial=null;daily();}
    flushNotices();},
  start, daily, salary:()=>{if (state.started&&state.dayNumber>1&&state.lastSalary!==state.dayNumber) flushNotices();else salaryDialog(state.lastSalary===state.dayNumber);},
  answer:id=>answer(Number(id)), 'question-next':endQuestion,
  exit:exitParty,
  'retry-quiz':()=>{closeDialog(false);retryQuizRequest?.();},
  hints, hint:id=>{if (!session || session.mode==='day')return;if (state.inventory[id]) applyHint(id,false);else
    purchaseDialog(hintInfo[id].name,`${hintInfo[id].desc} В цену включена наценка 50%. В магазине заранее дешевле.`,hintInfo[id].now,'rush',id);},
  rush:id=>applyHint(id,true),
  prebuy:id=>purchaseDialog(hintInfo[id].name,hintInfo[id].desc,hintInfo[id].before,'buy-hint',id),
  'buy-hint':id=>{if(!spend(hintInfo[id].before))return;state.inventory[id]++;save();closeDialog(false);render(false);flushNotices();},
  'collection-tab':id=>nextLocal({tab:id},'collection-tab'),
  category:id=>go('category',{id}),
  'category-tab':id=>nextLocal({tab:id,researchPerson:null,fact:null},'category-tab'),
  'toggle-research':id=>{
    const active=route.researchPerson!==id;
    nextLocal({researchPerson:active?id:null,fact:null});
    const target=active?`#person-facts-${id} .fact-select`:`[data-action="toggle-research"][data-id="${id}"]`;
    app.querySelector(target)?.focus({preventScroll:true});
  },
  'select-fact':id=>{
    nextLocal({fact:route.fact===id?null:id});
    app.querySelector(`[data-action="select-fact"][data-id="${id}"]`)?.focus({preventScroll:true});
  },
  research, 'buy-research':buyResearch,
  find:id=>{earnedFind('28');save();showDialog('find',DATA.finds[id].title,
    findDialogContent(id)+button('Закрыть','dismiss',{style:'btn secondary'}));},
  line:id=>go('line',{id}),
  chapter:id=>go('chapter',{id,card:0}),
  'chapter-preview':id=>chapterPreview(Number(id)),
  'chapter-preview-done':()=>{markChapterRead(state.pendingChapters[0]);closeDialog();},
  'read-prologue':()=>go('intro-replay',{step:0,response:null}),
  finale:()=>go('chapter',{id:'finale',card:0}),
  'chapter-step':id=>{nextLocal({card:Number(id)});window.scrollTo(0,0);app.querySelector('#main').focus();},
  'chapter-end':finishChapter,
  'chapter-next':advanceChapter,
  'rating-tab':id=>nextLocal({tab:id},'rating-tab'),
  topup:packages, fund:()=>go('fund'), patrons:()=>go('patrons'),
  donate,
  'secret-button':()=>{
    if (state.finds['29']) {
      showDialog('repeat-secret','Вы уже нажимали.',`<p>${label('Мы подшили первое нажатие в дело. Второе к делу не приобщаем.')}</p>${button('Понятно','dismiss')}`);
      return;
    }
    earnedFind('29');save();flushNotices();
  },

};
const unlockSound = () => {
  if (state && !storageFailed) sound.unlock(state);
};
document.addEventListener('pointerdown', unlockSound, {passive:true});
document.addEventListener('keydown', unlockSound);
document.addEventListener('visibilitychange',()=>{
  sound.visibility();
  if (!document.hidden) syncMoscowDay();
});
document.addEventListener('click', event=>{
  if (!state || storageFailed || quizRequestPending) return;
  sound.unlock(state);
  const control=event.target.closest('[data-action]');
  if (control&&!control.disabled&&control.getAttribute('aria-disabled')!=='true') actions[control.dataset.action]?.(control.dataset.id);
});
export async function startArchive(key, onStorageError) {
  storageKey = key;
  handleStorageError = onStorageError;
  state = initialState();
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) state = { ...state, ...JSON.parse(raw) };
    if (databaseProgress) applyDatabaseProgress(await quizProgress.load());
    Object.keys(storyProgress).forEach(lineId => syncChapters(lineId));
    save();
  } catch (error) {
    failStorage(error);
    return false;
  }

  render();
  promptForAudio();
  syncMoscowDay();
  flushNotices();
  if (!databaseProgress) window.setInterval(syncMoscowDay, 15000);
  return true;
}
