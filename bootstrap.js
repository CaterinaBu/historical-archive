const app = document.querySelector('#app');

function showStatus(message) {
  const text = document.createElement('p');
  text.setAttribute('role', 'status');
  text.textContent = message;
  const retry = document.createElement('button');
  retry.className = 'btn primary';
  retry.type = 'button';
  retry.textContent = 'Повторить';
  retry.addEventListener('click', () => location.reload());
  const panel = document.createElement('section');
  panel.className = 'frame surface stack';
  panel.append(text, retry);
  app.replaceChildren(panel);
}

const databaseProgress = document.body.dataset.progress === 'database';
const vkLaunch = document.body.dataset.platform === 'vk';
if (vkLaunch && /^desktop_/.test(new URLSearchParams(location.search).get('vk_platform') ?? '')) {
  document.body.dataset.vkLayout = 'desktop';
}
const storageKey = databaseProgress ? 'historical-archive-database-settings-v1' : 'historical-archive-progress-v1';

function onStorageError(error) {
  console.error(error);
  if (vkLaunch && error.status === 401) {
    showStatus('Откройте игру заново из ВКонтакте.');
    return;
  }
  showStatus(databaseProgress
    ? 'Не удалось открыть тестовое сохранение. Проверьте, запущен ли сервер, и попробуйте снова.'
    : 'Не удалось сохранить прогресс. Проверьте, разрешено ли браузеру хранить данные сайта, и попробуйте снова.');
}

async function start() {
  try {
    if (vkLaunch) window.vkBridge?.send('VKWebAppInit').catch(() => console.warn('VK Bridge не подтвердил запуск.'));
    const { startArchive } = await import('./app.js');
    return await startArchive(storageKey, onStorageError);
  } catch (error) {
    console.error(error);
    showStatus('Не удалось открыть архив. Попробуйте загрузить игру снова.');
    return false;
  }
}

if (vkLaunch) {
  await start();
} else if (navigator.locks) {
  navigator.locks.request(storageKey, { ifAvailable: true }, async lock => {
    if (!lock) {
      showStatus('Архив уже открыт в другой вкладке. Закройте её и нажмите «Повторить».');
      return;
    }
    if (!await start()) return;
    // Keep one writer for this browser while the app is open.
    window.addEventListener('pageshow', event => {
      if (event.persisted) location.reload();
    });
    await new Promise(resolve => window.addEventListener('pagehide', resolve, { once: true }));
  }).catch(onStorageError);
} else {
  window.addEventListener('storage', event => {
    if (event.key === storageKey) location.reload();
  });
  await start();
}
