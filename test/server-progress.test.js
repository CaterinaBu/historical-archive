import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../server/database.js';
import { createArchiveServer } from '../server/index.js';

async function launch(database, now) {
  const server = await createArchiveServer(database, now);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

async function api(server, path, { method = 'GET', cookie, body, status = 200 } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
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
