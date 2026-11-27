import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
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

    const other = { authorization: signedLaunch('1002') };
    const { payload: isolated } = await api(server, 'progress', other);
    assert.notEqual(isolated.settingsProfile, restored.settingsProfile);
    assert.deepEqual(isolated.facts, {});
    assert.equal(isolated.earned, 0);
    await api(server, `quiz/${id}/answer`, { method: 'POST', body: { position: 0, choice: 0 }, ...other, status: 404 });
  } finally {
    await server?.close();
    await database.close();
  }
});
