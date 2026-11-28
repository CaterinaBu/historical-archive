const vkLaunch = document.body.dataset.platform === 'vk';
const vkParams = vkLaunch ? window.location.search.slice(1) : '';

async function request(path, method = 'GET', body, keepalive = false) {
  const headers = {};
  const options = { method, headers, keepalive, signal: AbortSignal.timeout(10000) };
  if (vkLaunch) {
    if (vkParams) headers.Authorization = `Bearer ${vkParams}`;
    options.credentials = 'omit';
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api/${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error), { status: response.status });
  return payload;
}

export const quizProgress = {
  load: () => request('progress'),
  saveProfile: profile => request('profile', 'PATCH', profile, true),
  setDisplay: display => request('display', 'PATCH', display),
  dayEntry: () => request('day-entry', 'POST'),
  acknowledge: notice => request('day-notice', 'POST', notice, true),
  rankings: () => request('rankings'),
  shop: (id, command) => request(`shop/${id}`, 'PUT', command),
  start: (id, mode) => request(`quiz/${id}${mode === 'day' ? '?mode=day' : ''}`, 'PUT'),
  answer: (id, position, choice) => request(`quiz/${id}/answer`, 'POST', { position, choice }),
  abandon: id => request(`quiz/${id}`, 'DELETE'),
};
