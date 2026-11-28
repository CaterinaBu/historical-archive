import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { archiveContentPaths, createArchiveContent } from '../content/load.js';
import { audioDefaults, localFindIds } from '../content/profile-rules.js';
import { openDatabase } from './database.js';
import { createQuiz, RequestError } from './quiz.js';
import { createVkLaunchVerifier } from './vk-launch.js';

const cookieName = 'archive-local-player';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const playerCookie = new RegExp(`(?:^|; *)${cookieName}=(${uuid})(?:;|$)`);
const roundRoute = new RegExp(`^/api/quiz/(${uuid})(/answer)?$`);
const root = new URL('../', import.meta.url);
const browserFiles = new Set([
  'index.html', 'app.js', 'bootstrap.js', 'audio.js', 'daily.js', 'questions.js', 'progress-api.js', 'styles.css',
  'content/load.js', 'content/finds.js', 'content/profile-rules.js', ...archiveContentPaths,
]);
const contentTypes = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
const mediaFile = /^assets\/(?:audio|avatars|category-icons|finds|illustrations|portraits)\/[a-zA-Z0-9_-]+\.(?:png|webp|mp3|wav)$/;

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  if (request.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Ожидается JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024) throw new RequestError(413, 'Запрос слишком длинный.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'Запрос не удалось прочитать.');
  }
}

async function readAnswer(request) {
  const { position, choice } = (await readJson(request)) ?? {};
  if (!Number.isInteger(position) || position < 0 || position >= 10 || !Number.isInteger(choice) || choice < 0 || choice >= 4) {
    throw new RequestError(400, 'Номер вопроса или ответа вне диапазона.');
  }
  return { position, choice };
}

const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

function validAudio(audio, full = false) {
  if (!isRecord(audio)) return false;
  const fields = Object.keys(audio);
  if (full && fields.length !== Object.keys(audioDefaults).length) return false;
  return fields.every(field => {
    if (!Object.hasOwn(audioDefaults, field)) return false;
    const value = audio[field];
    return typeof audioDefaults[field] === 'boolean' ? typeof value === 'boolean'
      : Number.isInteger(value) && value >= 0 && value <= 100;
  });
}

async function readProfile(request) {
  const payload = await readJson(request);
  if (!isRecord(payload)) throw new RequestError(400, 'Неверные данные профиля.');
  const { finds = [], audio = {}, initialAudio = null } = payload;
  if (!Array.isArray(finds) || finds.length > localFindIds.size || !finds.every(id => localFindIds.has(id)) ||
      !validAudio(audio) || (initialAudio !== null && !validAudio(initialAudio, true))) {
    throw new RequestError(400, 'Неверные данные находок или звука.');
  }
  return { finds: Object.fromEntries(finds.map(id => [id, true])), audio, initialAudio };
}

async function handleApi(request, response, path, quiz, vk) {
  const loadProgress = request.method === 'GET' && path === '/api/progress';
  let player;
  if (vk) {
    const userId = vk.verify(request.headers.authorization);
    if (!userId) throw new RequestError(401, 'Откройте игру заново из ВКонтакте.');
    player = await quiz.vkPlayer(vk.appId, userId, loadProgress);
    if (loadProgress) return json(response, 200, { ...await quiz.progress(player), settingsProfile: player });
  } else {
    player = request.headers.cookie?.match(playerCookie)?.[1];
  }
  if (loadProgress) {
    const existing = player && await quiz.progress(player);
    if (existing) return json(response, 200, existing);
    const id = randomUUID();
    await quiz.createPlayer(id);
    response.setHeader('Set-Cookie', `${cookieName}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`);
    return json(response, 200, await quiz.progress(id));
  }
  if (request.method === 'PATCH' && path === '/api/profile') {
    if (!player) throw new RequestError(401, 'Откройте игру, чтобы начать тестовую сессию.');
    return json(response, 200, await quiz.updateProfile(player, await readProfile(request)));
  }
  const round = path.match(roundRoute);
  if (!round) throw new RequestError(404, 'Адрес не найден.');
  if (!player) throw new RequestError(401, 'Откройте игру, чтобы начать тестовую сессию.');
  const [, id, answer] = round;
  if (request.method === 'PUT' && !answer) return json(response, 200, await quiz.start(player, id));
  if (request.method === 'POST' && answer) {
    const { position, choice } = await readAnswer(request);
    return json(response, 200, await quiz.answer(player, id, position, choice));
  }
  if (request.method === 'DELETE' && !answer) return json(response, 200, await quiz.abandon(player, id));
  throw new RequestError(405, 'Метод не поддерживается.');
}

async function serveBrowser(request, response, path, index, vkBridge) {
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new RequestError(405, 'Метод не поддерживается.');
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (name === 'index.html') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    });
    response.end(request.method === 'HEAD' ? undefined : index);
    return;
  }
  const file = vkBridge && name === 'vendor/vk-bridge.js' ? vkBridge :
    (browserFiles.has(name) || mediaFile.test(name)) ? new URL(name, root) : null;
  if (!file) throw new RequestError(404, 'Файл не найден.');
  const entry = await stat(file).catch(error => {
    if (error.code === 'ENOENT') throw new RequestError(404, 'Файл не найден.');
    throw error;
  });
  response.writeHead(200, { 'Content-Type': contentTypes[extname(name)], 'Content-Length': entry.size });
  if (request.method === 'HEAD') response.end();
  else await pipeline(createReadStream(file), response);
}

export async function createArchiveServer(database, now = () => new Date(), vkConfig = {}) {
  const { appId, secret, tunnelHost } = vkConfig;
  const vk = appId || secret ? { appId, verify: createVkLaunchVerifier(appId, secret, now) } : null;
  if (tunnelHost && (!vk || !/^[a-z0-9][a-z0-9.-]+(?::\d+)?$/i.test(tunnelHost))) {
    throw new Error('В VK_TUNNEL_HOST укажите имя тестового хоста без протокола и пути.');
  }
  const read = name => readFile(new URL(name, root), 'utf8');
  const [html, ...sources] = await Promise.all([read('index.html'), ...archiveContentPaths.map(read)]);
  const vkBridge = vk ? new URL(import.meta.resolve('@vkontakte/vk-bridge/dist/browser.min.js')) : null;
  let index = html.replace('<body>', vk ? '<body data-progress="database" data-platform="vk">' : '<body data-progress="database">');
  if (vk) index = index.replace('<script type="module"', '<script src="vendor/vk-bridge.js"></script>\n<script type="module"');
  const quiz = createQuiz(database, createArchiveContent(...sources.map(source => JSON.parse(source))), now);

  return createServer(async (request, response) => {
    try {
      const host = request.headers.host ?? '';
      if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host) && host.toLowerCase() !== tunnelHost?.toLowerCase()) {
        throw new RequestError(403, 'Локальный сервер доступен только с этого компьютера.');
      }
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname.startsWith('/api/')) await handleApi(request, response, pathname, quiz, vk);
      else await serveBrowser(request, response, pathname, index, vkBridge);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (error instanceof RequestError) json(response, error.status, { error: error.message });
      else {
        console.error(error);
        json(response, 500, { error: 'Не удалось сохранить или загрузить прогресс. Попробуйте ещё раз.' });
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const database = await openDatabase({ url: process.env.DATABASE_URL });
  try {
    const server = await createArchiveServer(database, undefined, {
      appId: process.env.VK_APP_ID, secret: process.env.VK_APP_SECRET, tunnelHost: process.env.VK_TUNNEL_HOST,
    });
    const port = Number(process.env.PORT ?? 3000);
    await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
    console.log(`Исторический архив: http://127.0.0.1:${server.address().port}`);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => server.close(() => database.close().catch(console.error)));
    }
  } catch (error) {
    await database.close();
    throw error;
  }
}
