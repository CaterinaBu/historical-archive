import { createHmac, timingSafeEqual } from 'node:crypto';

const idPattern = /^[1-9]\d{0,18}$/;
const signaturePattern = /^[A-Za-z0-9_-]{43}$/;
const maxAgeSeconds = 24 * 60 * 60;
const clockSkewSeconds = 5 * 60;

export function createVkLaunchVerifier(appId, secret, now) {
  if (!idPattern.test(appId ?? '') || !secret?.trim()) {
    throw new Error('Для запуска VK укажите VK_APP_ID и VK_APP_SECRET.');
  }

  return authorization => {
    const raw = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!raw) return null;

    let signature;
    const signed = new Map();
    for (const [key, value] of new URLSearchParams(raw)) {
      if (key === 'sign') {
        if (signature !== undefined) return null;
        signature = value;
      } else if (key.startsWith('vk_')) {
        if (signed.has(key)) return null;
        signed.set(key, value);
      }
    }

    const userId = signed.get('vk_user_id');
    const timestamp = signed.get('vk_ts');
    if (!signaturePattern.test(signature ?? '') || signed.get('vk_app_id') !== appId ||
        !idPattern.test(userId ?? '') || !/^\d{1,12}$/.test(timestamp ?? '')) return null;

    const message = [...signed].sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    const expected = createHmac('sha256', secret).update(message).digest('base64url');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    const age = Math.floor(now().getTime() / 1000) - Number(timestamp);
    if (age > maxAgeSeconds || age < -clockSkewSeconds) return null;
    return userId;
  };
}
