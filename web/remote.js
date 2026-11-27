import { config } from './config.js';

const hex = /^[a-f0-9]{64}$/;
export function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}
export function readAccess() {
  if (!location.hash) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const roomId = params.get('room');
  const token = params.get('key');
  const invite = params.get('invite');
  if (!hex.test(roomId) || (!token && !invite) || (token && !hex.test(token)) || (invite && !hex.test(invite)))
    throw new Error('Ссылка неполная. Откройте её ещё раз целиком.');
  return { roomId, token, invite };
}
export function shareURL(access, privateLink) {
  const params = new URLSearchParams({ room: access.roomId });
  if (privateLink) params.set('key', access.token);
  if (access.invite) params.set('invite', access.invite);
  return location.href.split('#')[0] + '#' + params;
}
export function avatarData(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 112;
  const ctx = canvas.getContext('2d');
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 112, 112);
  ctx.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, 112, 112);
  for (const quality of [.82, .65, .45]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= 16000) return result;
  }
  throw new Error('Фото не удалось уменьшить. Выберите другое.');
}
export async function api(action, fields) {
  if (!config.appsScriptUrl) throw new Error('Сервис комнат ещё не подключён. Попробуйте демо.');
  let response;
  try {
    response = await fetch(config.appsScriptUrl, {
      method: 'POST', body: JSON.stringify({action, ...fields}),
      headers: {'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit',
      redirect:'follow', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(25000)
    });
  } catch { throw new Error('Сервис не ответил. Проверьте связь и повторите действие.'); }
  if (response.status === 429) throw new Error('Квота запросов исчерпана. Попробуйте позже.');
  const result = await response.json().catch(() => null);
  if (!result || !response.ok) throw new Error('Сервис временно недоступен. Возможно, исчерпана квота Google.');
  if (!result.ok) {
    const wait = result.error?.retryAfterSeconds;
    throw new Error((result.error?.message || 'Запрос отклонён.') + (wait ? ' Повторите через ' + wait + ' сек.' : ''));
  }
  return result.data;
}
