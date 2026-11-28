import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../server/database.js';
import { createArchiveServer } from '../server/index.js';

async function launch(database, now, vk) {
  const server = await createArchiveServer(database, now, vk);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

async function api(server, path, { method = 'GET', cookie, authorization, body, status = 200 } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (authorization) headers.Authorization = authorization;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${server.url}/api/${path}`, { method, headers, body: JSON.stringify(body) });
  const payload = await response.json();
  assert.equal(response.status, status, JSON.stringify(payload));
  return { payload, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

async function questionsFromDatabase(database, round) {
  const { rows: [row] } = await database.query('SELECT questions FROM archive_quiz_rounds WHERE id = $1', [round]);
  return row.questions;
}

test('ordinary quiz preserves partial progress and credits a completed round once across retries and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'archive-test-'));
  let date = new Date('2026-11-27T20:59:00Z');
  const now = () => date;
  let database;
  let server;
  try {
    database = await openDatabase({ directory });
    server = await launch(database, now);
    const { cookie } = await api(server, 'progress');
    const secondPlayer = await api(server, 'progress');
    const start = (id, player = cookie) => api(server, `quiz/${id}`, { method: 'PUT', cookie: player });
    const answer = (id, position, choice, status = 200, player = cookie) => api(server, `quiz/${id}/answer`, {
      method: 'POST', cookie: player, body: { position, choice }, status,
    });
    const first = randomUUID();
    const { payload: round } = await start(first);
    assert.deepEqual((await start(first)).payload, round);
    assert.equal(round.questions.length, 10);
    assert.deepEqual(Object.keys(round.questions[0]), ['text', 'options']);
    const firstQuestions = await questionsFromDatabase(database, first);
    await answer(first, 0, 4, 400);
    await answer(first, 1, 0, 409);
    await answer(first, 0, 0, 404, secondPlayer.cookie);
    const { payload: right } = await answer(first, 0, firstQuestions[0].right);
    assert.equal(right.progress.facts[firstQuestions[0].fact], true);
    const { payload: wrong } = await answer(first, 1, (firstQuestions[1].right + 1) % 4);
    assert.equal(wrong.feedback.correct, false);
    assert.equal(wrong.progress.finds['10'], true);
    assert.equal(wrong.progress.discovered[firstQuestions[1].person], true);
    assert.equal(wrong.progress.facts[firstQuestions[1].fact], undefined);
    const abandon = await api(server, `quiz/${first}`, { method: 'DELETE', cookie });
    assert.equal(abandon.payload.progress.earned, 0);
    assert.equal(abandon.payload.progress.reputation, 0);
    assert.equal(abandon.payload.progress.facts[firstQuestions[0].fact], true);
    await answer(first, 2, firstQuestions[2].right, 409);

    const full = randomUUID();
    await start(full);
    const fullQuestions = await questionsFromDatabase(database, full);
    assert.ok(fullQuestions.every(question => question.fact !== firstQuestions[0].fact));
    for (let position = 0; position < 9; position++) {
      const { payload } = await answer(full, position, fullQuestions[position].right);
      assert.equal(payload.progress.earned, 0);
    }
    const choice = fullQuestions[9].right;
    const [firstReply, retryReply] = await Promise.all([answer(full, 9, choice), answer(full, 9, choice)]);
    assert.deepEqual(firstReply, retryReply);
    assert.equal(firstReply.payload.result.correct, 10);
    assert.equal(firstReply.payload.progress.earned, 100);
    assert.equal(firstReply.payload.progress.reputation, 10);
    assert.equal(firstReply.payload.progress.daily, 10);
    await answer(full, 9, (choice + 1) % 4, 409);

    const audioSettings = { music: false, effects: true, musicVolume: 34, effectsVolume: 57 };
    await api(server, 'profile', { method: 'PATCH', cookie, body: { finds: ['25'], initialAudio: audioSettings } });
    await database.query("UPDATE archive_players SET finds = finds - '01' - '10' WHERE id = $1", [cookie.split('=')[1]]);

    await server.close();
    server = null;
    await database.close();
    database = null;
    date = new Date('2026-11-27T21:01:00Z');
    database = await openDatabase({ directory });
    server = await launch(database, now);
    const { payload: restored } = await api(server, 'progress', { cookie });
    assert.equal(Object.keys(restored.facts).length, 11);
    assert.equal(restored.earned, 100);
    assert.equal(restored.reputation, 10);
    assert.equal(restored.daily, 0);
    assert.equal(restored.yesterday, 10);
    assert.deepEqual(restored.lastNormalResult, firstReply.payload.result);
    assert.ok(['01', '10', '25'].every(id => restored.finds[id]));
    assert.deepEqual(restored.audioSettings, audioSettings);
    const { payload: other } = await api(server, 'progress', { cookie: secondPlayer.cookie });
    assert.deepEqual(other.facts, {});
    assert.equal(other.earned, 0);
  } finally {
    await server?.close();
    await database?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('VK launch data identifies an account across sessions and rejects a different or unverified account', async () => {
  const database = await openDatabase({ directory: 'memory://' });
  const date = new Date('2026-11-27T20:59:00Z');
  const appId = '11000000';
  const secret = 'local-test-key';
  const timestamp = Math.floor(date.getTime() / 1000);
  const signedLaunch = (user, ref = 'каталог + сообщество', app = appId, time = timestamp) => {
    const data = new URLSearchParams({
      vk_app_id: app, vk_ref: ref, vk_ts: String(time), vk_user_id: user,
    });
    const canonical = `vk_app_id=${app}&vk_ref=${encodeURIComponent(ref)}&vk_ts=${time}&vk_user_id=${user}`;
    data.set('sign', createHmac('sha256', secret).update(canonical).digest('base64url'));
    data.set('fixture', 'ignored');
    return `Bearer ${data}`;
  };

  let server;
  try {
    server = await launch(database, () => date, { appId, secret });
    const html = await fetch(server.url);
    assert.equal(html.headers.get('referrer-policy'), 'no-referrer');
    assert.match(await html.text(), /data-platform="vk"/);
    assert.equal((await fetch(`${server.url}/vendor/vk-bridge.js`)).status, 200);
    await api(server, 'progress', { cookie: `archive-local-player=${randomUUID()}`, status: 401 });
    const original = signedLaunch('1001');
    for (const invalid of [original.replace('vk_user_id=1001', 'vk_user_id=1002'), original + '&vk_user_id=1001',
      signedLaunch('1001', 'catalog', '12000000'), signedLaunch('1001', 'catalog', appId, timestamp - 86401),
      signedLaunch('1001', 'catalog', appId, timestamp + 301)]) {
      await api(server, 'progress', { authorization: invalid, status: 401 });
    }

    const launchA = { authorization: original };
    const launchB = { authorization: signedLaunch('1001', 'mobile') };
    const [first, second] = await Promise.all([api(server, 'progress', launchA), api(server, 'progress', launchB)]);
    assert.equal(first.cookie, undefined);
    assert.ok(first.payload.settingsProfile);
    assert.equal(first.payload.settingsProfile, second.payload.settingsProfile);
    assert.equal(first.payload.audioSettings, null);
    const initialAudio = { music: false, effects: true, musicVolume: 35, effectsVolume: 8 };
    const profile = (body, launch = launchA, status = 200) => api(server, 'profile', { method: 'PATCH', body, ...launch, status });
    await profile({ finds: ['25'], initialAudio });
    await profile({ finds: ['10'], audio: { musicVolume: 101 } }, launchA, 400);
    await profile({ finds: ['10'] }, launchA, 400);
    await profile({ finds: ['29'] }, {}, 401);
    await Promise.all([
      profile({ finds: ['23'], audio: { musicVolume: 16 } }),
      profile({ finds: ['24'], initialAudio: { ...initialAudio, music: true }, audio: { effectsVolume: 12 } }, launchB),
    ]);
    const id = randomUUID();
    await api(server, `quiz/${id}`, { method: 'PUT', ...launchA });
    const questions = await questionsFromDatabase(database, id);
    for (const [position, question] of questions.entries()) {
      await api(server, `quiz/${id}/answer`, { method: 'POST', body: { position, choice: question.right }, ...launchA });
    }
    const { payload: restored } = await api(server, 'progress', launchB);
    assert.equal(Object.keys(restored.facts).length, 10);
    assert.equal(restored.earned, 100);
    assert.equal(restored.reputation, 10);
    assert.equal(restored.daily, 10);
    assert.ok(['01', '23', '24', '25'].every(id => restored.finds[id]));
    assert.deepEqual(restored.audioSettings, { ...initialAudio, musicVolume: 16, effectsVolume: 12 });

    const other = { authorization: signedLaunch('1002') };
    const { payload: isolated } = await api(server, 'progress', other);
    assert.notEqual(isolated.settingsProfile, restored.settingsProfile);
    assert.deepEqual(isolated.facts, {});
    assert.equal(isolated.earned, 0);
    assert.deepEqual(isolated.finds, {});
    assert.equal(isolated.audioSettings, null);
    await api(server, `quiz/${id}/answer`, { method: 'POST', body: { position: 0, choice: 0 }, ...other, status: 404 });
  } finally {
    await server?.close();
    await database.close();
  }
});

test('daily game survives Moscow midnight and credits each account and day once', async () => {
  const database = await openDatabase({ directory: 'memory://' });
  let date = new Date('2026-11-27T20:59:00Z');
  const appId = '11000001';
  const secret = 'daily-test-key';
  let server;
  const launchFor = (user, ref = 'desktop') => {
    const canonical = `vk_app_id=${appId}&vk_ref=${ref}&vk_ts=${Math.floor(+date / 1000)}&vk_user_id=${user}`;
    return { authorization: `Bearer ${canonical}&sign=${createHmac('sha256',secret).update(canonical).digest('base64url')}` };
  };
  const request = async (user, path, method = 'GET', body, ref) =>
    (await api(server,path,{...launchFor(user,ref),method,body})).payload;
  const enter = (user, ref) => request(user,'day-entry','POST',undefined,ref);
  const start = user => request(user,`quiz/${randomUUID()}?mode=day`,'PUT');
  const answer = (user, id, position, choice) => request(user,`quiz/${id}/answer`,'POST',{position,choice});
  const finish = async (user, id, count, startAt = 0) => {
    const questions = await questionsFromDatabase(database,id);
    let receipt;
    for (const [index, question] of questions.entries()) {
      if (index < startAt) continue;
      receipt = await answer(user,id,index,(question.right + (index < count ? 0 : 1)) % 4);
    }
    return receipt;
  };
  try {
    server = await launch(database,() => date,{appId,secret});
    await Promise.all(['1001','1002','1003'].map(user => request(user,'progress')));
    await request('1001','display','PATCH',{name:'Анна Тестова',photo:'https://sun9-1.userapi.com/test.jpg'});
    await request('1002','display','PATCH',{name:'Борис Тестов'});
    assert.equal((await enter('1001')).earned,0);
    const first = await start('1001');
    const second = await start('1002');
    const third = await start('1003');
    assert.equal(first.person,second.person);
    assert.equal(first.person,third.person);
    assert.ok(first.questions.length >= 2);

    const priorWinner = await finish('1002',second.id,1);
    assert.equal(priorWinner.progress.earned,60);
    assert.equal(priorWinner.progress.finds['19'],true);
    assert.equal(priorWinner.progress.finds['27'],true);
    assert.deepEqual((await start('1002')).result,priorWinner.result);
    const tied = await finish('1003',third.id,1);
    assert.equal(tied.progress.daily,1);
    const { rows:[firstRound] } = await database.query('SELECT questions FROM archive_quiz_rounds WHERE id = $1',[first.id]);
    await answer('1001',first.id,0,firstRound.questions[0].right);

    date = new Date('2026-11-27T21:01:00Z');
    const newDay = await request('1001','progress');
    assert.equal(newDay.calendarDay,first.day + 1);
    assert.notEqual(newDay.dailyPerson,first.person);
    assert.equal(newDay.daily,0);
    assert.equal(newDay.yesterdayResult,null);
    const yesterday = await request('1001','rankings');
    assert.deepEqual(yesterday.yesterday.map(row => [row.place,row.score]),[[1,1],[1,1]]);
    await request('1002','display','PATCH',{name:'Борис Новое Имя'});
    assert.deepEqual((await request('1001','rankings')).yesterday,yesterday.yesterday);
    assert.deepEqual((await request('1002','progress')).yesterdayResult,{place:1,score:1});

    const result = await finish('1001',first.id,1,1);
    assert.equal(result.result.day,first.day);
    assert.equal(result.result.bonus,50);
    assert.equal(result.progress.daily,1);
    assert.equal(result.progress.earned,60);
    const lastIndex = firstRound.questions.length - 1;
    const lastChoice = (firstRound.questions[lastIndex].right + 1) % 4;
    const receipt = await answer('1001',first.id,lastIndex,lastChoice);
    assert.equal(receipt.progress.earned,60);
    assert.deepEqual((await request('1001','rankings')).yesterday,yesterday.yesterday);

    const [desktop,mobile] = await Promise.all([enter('1001'),enter('1001','mobile')]);
    assert.equal(desktop.earned,90);
    assert.equal(mobile.earned,90);
    assert.equal(desktop.salaryPending,true);
    assert.ok(desktop.salaryJoke);
    assert.equal(desktop.salaryJoke,mobile.salaryJoke);
    assert.equal(desktop.finds['18'],true);
    await request('1001','day-notice','POST',{kind:'salary',day:newDay.calendarDay},'mobile');
    assert.equal((await request('1001','progress')).salaryPending,false);

    const newTask = await start('1001');
    assert.equal(newTask.day,first.day + 1);
    assert.equal(newTask.person,newDay.dailyPerson);
    assert.equal(newTask.progress.dailyResult,null);
    const allWrong = await finish('1001',newTask.id,0);
    assert.equal(allWrong.progress.earned,140);
    assert.deepEqual((await request('1001','progress','GET',undefined,'mobile')).dailyResult,allWrong.result);
    await request('1002','day-notice','POST',{kind:'yesterday',day:first.day});
    assert.equal((await request('1002','progress')).yesterdayResult,null);
    assert.deepEqual((await request('1001','rankings')).yesterday,yesterday.yesterday);

    date = new Date('2026-12-05T21:01:00Z');
    const afterAbsence = await enter('1001');
    assert.equal(afterAbsence.earned,170);
    assert.equal(afterAbsence.finds['26'],true);
    assert.notEqual(afterAbsence.salaryJoke,desktop.salaryJoke);
  } finally {
    await server?.close();
    await database.close();
  }
});

test('shop transactions synchronize the wallet, constrain hints, and cannot double-charge', async () => {
  const database = await openDatabase({ directory:'memory://' });
  let server;
  try {
    server = await launch(database);
    const { cookie } = await api(server,'progress');
    const playerId = cookie.split('=')[1];
    const other = await api(server,'progress');
    const progress = async player => (await api(server,'progress',{cookie:player})).payload;
    const shop = async (body,{ operation = randomUUID(), player = cookie, status } = {}) =>
      (await api(server,`shop/${operation}`,{method:'PUT',cookie:player,body,status})).payload;
    const start = async (id, mode = 'normal') => api(server,`quiz/${id}?mode=${mode}`,{method:'PUT',cookie});
    const answer = async (id,position,choice,status) =>
      (await api(server,`quiz/${id}/answer`,{method:'POST',cookie,body:{position,choice},status})).payload;
    await database.query('UPDATE archive_players SET earned = 5000, paid = 50 WHERE id = $1',[playerId]);
    const operation = randomUUID();
    const buy = {kind:'buy',hint:'exclude'};
    const receipts = await Promise.all([shop(buy,{operation}),shop(buy,{operation})]);
    assert.deepEqual(receipts[0],receipts[1]);
    assert.equal(receipts[0].progress.earned,5000);
    assert.equal(receipts[0].progress.paid,0);
    assert.equal(receipts[0].progress.finds['21'],undefined);
    await shop({kind:'buy',hint:'retry'},{operation,status:409});
    await shop({kind:'buy',hint:'constructor'},{status:400});
    await shop({kind:'buy',hint:'retry'});
    await shop({kind:'buy',hint:'retry'});

    const round = randomUUID();
    await start(round);
    const questions = await questionsFromDatabase(database,round);
    const hint = (kind,hint,position = 0) => ({kind,hint,roundId:round,position});
    const excluded = await shop(hint('apply','exclude'));
    assert.notEqual(excluded.removed,questions[0].right);
    assert.equal(excluded.progress.inventory.exclude,0);
    await answer(round,0,excluded.removed,409);
    await shop(hint('apply','exclude'),{status:409});
    await shop(hint('apply','retry'));
    const wrong = [0,1,2,3].find(index => index !== excluded.removed && index !== questions[0].right);
    const missed = await answer(round,0,wrong);
    assert.equal(missed.retryAttempt,true);
    assert.equal(missed.progress.finds['10'],true);
    assert.equal(missed.progress.discovered[questions[0].person],true);
    assert.deepEqual(await answer(round,0,wrong),missed);
    const expert = await shop(hint('rush','expert'));
    assert.equal(expert.right,questions[0].right);
    assert.equal(expert.progress.finds['14'],true);
    assert.equal(expert.progress.finds['21'],true);
    const next = await answer(round,0,questions[0].right);
    assert.equal(next.feedback.correct,true);
    assert.equal(next.newPerson,true);
    assert.equal(next.progress.finds['20'],undefined);
    await shop(hint('apply','retry',1));
    const firstTry = await answer(round,1,questions[1].right);
    assert.equal(firstTry.progress.finds['20'],true);
    assert.equal(firstTry.progress.earned,4635);
    const dayRound = randomUUID();
    await start(dayRound,'day');
    await shop({...hint('rush','expert'),roundId:dayRound},{status:409});

    const dataset = JSON.parse(await readFile(new URL('../data/historical_archive_data.json',import.meta.url),'utf8'));
    const personId = questions[0].person;
    const facts = dataset.facts.filter(fact => fact.personId === personId).map(fact => fact.id);
    const fact = facts.find(id => !firstTry.progress.facts[id]);
    const research = {kind:'research',product:'fact',personId,fact};
    await shop(research,{player:other.cookie,status:409});
    await shop({...research,fact:'another-fact'},{status:409});
    const single = await shop(research);
    assert.equal(single.progress.earned,4135);
    assert.equal(single.progress.facts[fact],true);
    assert.equal(single.progress.finds['16'],true);
    assert.equal(Object.keys(single.progress.facts).length,Object.keys(firstTry.progress.facts).length + 1);
    await shop(research,{status:409});
    const everything = await shop({kind:'research',product:'all',personId});
    assert.equal(everything.progress.earned,1135);
    assert.ok(facts.every(id => everything.progress.facts[id]));
    assert.ok(['08','15'].every(id => everything.progress.finds[id]));
    assert.equal(everything.progress.reputation,0);
    assert.equal(everything.progress.daily,0);

    await database.query('UPDATE archive_players SET paid = 20 WHERE id = $1',[playerId]);
    await shop({kind:'donate',sum:1150},{status:409});
    const transferId = randomUUID();
    const transfer = {kind:'donate',sum:1000};
    await shop(transfer,{operation:transferId});
    await shop(transfer,{operation:transferId});
    const mixed = await shop({kind:'buy',hint:'exclude'});
    assert.equal(mixed.progress.paid,0);
    assert.equal(mixed.progress.earned,105);
    assert.equal(mixed.progress.donations,1000);
    assert.equal(mixed.progress.finds['12'],true);
    const concurrent = await Promise.all([
      fetch(`${server.url}/api/shop/${randomUUID()}`,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{"kind":"donate","sum":100}'}),
      fetch(`${server.url}/api/shop/${randomUUID()}`,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{"kind":"donate","sum":100}'}),
    ]);
    assert.deepEqual(concurrent.map(response => response.status).sort(),[200,409]);
    const saved = await progress(cookie);
    assert.equal(saved.earned,5);
    assert.equal(saved.donations,1100);
    assert.equal((await progress(other.cookie)).donations,0);
    const {payload:ranked} = await api(server,'rankings',{cookie:other.cookie});
    assert.deepEqual(ranked.patrons,[{place:1,score:1100,name:null,photo:null,isSelf:false}]);
  } finally {
    await server?.close();
    await database.close();
  }
});
