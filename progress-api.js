async function request(path, method = 'GET', body) {
  const options = { method, signal: AbortSignal.timeout(10000) };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api/${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error), { status: response.status });
  return payload;
}

export const quizProgress = {
  load: () => request('progress'),
  start: id => request(`quiz/${id}`, 'PUT'),
  answer: (id, position, choice) => request(`quiz/${id}/answer`, 'POST', { position, choice }),
  abandon: id => request(`quiz/${id}`, 'DELETE'),
};
