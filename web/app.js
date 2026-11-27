import { config } from './config.js';
import { api, avatarData, randomKey, readAccess, shareURL } from './remote.js';
const online = !location.pathname.endsWith('/demo.html');
let access, joiningRoom = false, snapshot, busy = false;
const $ = id => document.getElementById(id);
const screens = ['home', 'create', 'profile', 'wishlist', 'room', 'confirm', 'result'];
const participants = [];
let room;
let user;
let draft;
let pairs;
let pendingPhoto;
let photoVersion = 0;
let page = 'home';
const isHost = () => online ? snapshot?.host : user === participants[0];
const button = (id, fn) => $(id)?.addEventListener('click', fn);
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}
function show(next) {
  page = next;
  notice('');
  for (const id of screens) $(id).hidden = id !== next;
  const home = next === 'home';
  document.querySelector('.top').hidden = !home;
  $('phone').hidden = $('controls').hidden = home;
  $('return').hidden = next === 'room';
  $('edit-wishes').hidden = next !== 'room' || Boolean(pairs);
  $('switch-wrap').hidden = online || next !== 'room';
  if (online) {
    $('refresh').hidden = next !== 'room';
    $('delete-room').hidden = next !== 'room' || !isHost();
    $('personal').hidden = !['room','result'].includes(next);
  }
  if (next === 'room') renderRoom();
  if (next === 'confirm') {
    $('confirm-text').textContent = 'Каждый из ' + participants.length + ' участников узнает имя своего получателя. После этого состав комнаты закроется.';
  }
  if (next === 'result') renderResult();
  window.scrollTo(0, 0);
}
for (const el of document.querySelectorAll('[data-page]')) {
  el.onclick = () => {
    if (online && el.dataset.page === 'create') {
      if (!config.appsScriptUrl) {
        $('home-error').textContent = 'Сервис комнат ещё не подключён.';
        const demo = document.createElement('a'); demo.href = './demo.html'; demo.textContent = 'Открыть демо';
        $('home-error').append(' ', demo); $('home-error').hidden = false; return;
      }
      if (location.hash) history.replaceState(null, '', location.href.split('#')[0]);
      access = null; joiningRoom = false;
      $('home-error').hidden = $('retry-entry').hidden = true;
    }
    show(el.dataset.page);
  };
}
button('how', () => $('guide').showModal());
button('close-guide', () => $('guide').close());
if (config.appsScriptUrl) {
  const diagnostics = document.createElement('a');
  diagnostics.href = config.appsScriptUrl;
  diagnostics.textContent = 'Проверить доступность сервиса';
  diagnostics.rel = 'noopener noreferrer';
  diagnostics.target = '_blank';
  $('guide').append(diagnostics);
}
$('create').onsubmit = e => {
  e.preventDefault();
  const values = new FormData(e.currentTarget);
  const title = values.get('title').trim(), budget = values.get('budget').trim();
  if (!title || !budget) { notice('Укажите название и бюджет подарка.'); return; }
  room = { title, budget, date: values.get('date') };
  for (const el of document.querySelectorAll('.room-label')) el.textContent = 'Комната «' + title + '»';
  if (online && !access) access = { roomId:randomKey(), token:randomKey(), invite:randomKey() };
  startProfile();
};
function clearPhoto() {
  photoVersion++;
  if (pendingPhoto) URL.revokeObjectURL(pendingPhoto);
  pendingPhoto = undefined;
  $('preview').textContent = '+';
}
function startProfile() {
  draft = null;
  clearPhoto();
  $('profile').reset();
  show('profile');
}
const photo = $('profile').elements.avatar;
photo.onchange = async () => {
  clearPhoto();
  notice('');
  const version = photoVersion;
  const file = photo.files[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    photo.value = ''; notice('Выберите JPEG, PNG или WebP до 2 МБ.'); return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    if (version !== photoVersion) { URL.revokeObjectURL(url); return; }
    pendingPhoto = online ? avatarData(img) : url;
    if (online) { img.src = pendingPhoto; URL.revokeObjectURL(url); }
    $('preview').replaceChildren(img);
  } catch {
    URL.revokeObjectURL(url);
    if (version === photoVersion) { photo.value = ''; notice('Не удалось прочитать фото.'); }
  }
};
$('profile').onsubmit = e => {
  e.preventDefault();
  const name = e.currentTarget.elements.name.value.trim();
  if (!name || !pendingPhoto) { notice('Укажите имя и дождитесь загрузки фото.'); return; }
  draft = { name, photo: pendingPhoto, wishes: draft?.wishes || [] };
  openWishes(draft.wishes);
};
function addWish(value = {}) {
  const list = document.querySelector('.wishes');
  const row = $('row-template').content.firstElementChild.cloneNode(true);
  row.querySelector('[name=wish]').value = value.text || '';
  row.querySelector('[name=url]').value = value.url || '';
  list.append(row);
  function refresh() {
    $('add').disabled = online && list.children.length >= 20;
    for (const b of list.querySelectorAll('.remove')) b.hidden = list.children.length === 1;
  }
  row.querySelector('.remove').onclick = () => { row.remove(); refresh(); };
  refresh();
  return row;
}
function openWishes(wishes) {
  document.querySelector('.wishes').replaceChildren();
  for (const item of wishes.length ? wishes : [{}]) addWish(item);
  show('wishlist');
}
function readWishes() {
  return [...document.querySelectorAll('.wish-row')].map(row => ({
    text: row.querySelector('[name=wish]').value.trim(),
    url: row.querySelector('[name=url]').value.trim()
  }));
}
button('add', () => addWish().querySelector('input').focus());
$('wishlist').onsubmit = e => {
  e.preventDefault();
  const wishes = readWishes();
  if (online && JSON.stringify(wishes).length > 16000) { notice('Сократите список пожеланий до 16 000 символов.'); return; }
  if (wishes.some(item => !item.text)) { notice('Введите название каждого пожелания.'); return; }
  for (const item of wishes) {
    if (!item.url) continue;
    let url;
    try { url = new URL(item.url); } catch { /* invalid URL */ }
    if (!url || !['https:', 'http:'].includes(url.protocol)) { notice('Укажите ссылку с https:// или http://.'); return; }
  }
  if (online) {
    const { roomId, token, invite } = access;
    if (draft) {
      const action = joiningRoom ? 'join' : 'create';
      const fields = { roomId, token, invite, profile: {...draft, wishes} };
      if (!joiningRoom) fields.room = room;
      run(async () => {
        const state = await api(action, fields);
        if (joiningRoom) access.invite = null;
        joiningRoom = false;
        draft = null;
        pendingPhoto = undefined;
        history.replaceState(null, '', shareURL(access, true));
        applyState(state);
      });
    } else run(async () => applyState(await api('edit', { roomId, token, wishes })));
    return;
  }
  if (draft) {
    user = draft;
    participants.push(user);
    draft = null;
    pendingPhoto = undefined;
  }
  user.wishes = wishes;
  show('room');
};
function renderRoom() {
  document.querySelector('.room-title').textContent = room.title;
  const date = new Date(room.date + 'T12:00:00');
  $('facts').textContent = date.toLocaleDateString('ru', { day: 'numeric', month: 'long' }) + ' · ' + room.budget;
  $('count').textContent = 'Участники · ' + participants.length;
  $('roster').replaceChildren();
  $('switch').replaceChildren();
  for (const [index, person] of participants.entries()) {
    const li = document.createElement('li');
    const img = new Image(); img.src = person.photo; img.className = 'avatar'; img.alt = '';
    const roles = [(online ? person.id === user.id : person === user) && 'вы', index === 0 && 'организатор'].filter(Boolean);
    li.append(img, person.name + (roles.length ? ' · ' + roles.join(', ') : ''));
    $('roster').append(li);
    $('switch').add(new Option(person.name, String(index), false, person === user));
  }
  $('start-draw').hidden = !isHost() || Boolean(pairs);
  $('start-draw').disabled = participants.length < 3;
  $('start-draw').title = participants.length < 3 ? 'Нужны минимум 3 участника' : '';
  $('show-result').hidden = !pairs;
  $('invite').hidden = Boolean(pairs) || (online && !isHost());
}
button('edit-wishes', () => openWishes(user.wishes));
$('switch').onchange = () => { user = participants[Number($('switch').value)]; show('room'); };
button('invite', () => online ? openLink(false) : $('invitation').showModal());
button('cancel-invite', () => $('invitation').close());
button('register', () => { $('invitation').close(); startProfile(); });
button('start-draw', () => { if (isHost() && !pairs && participants.length >= 3) show('confirm'); });
button('draw', () => {
  if (!isHost() || pairs || participants.length < 3) return;
  if (online) {
    run(async () => { applyState(await api('draw', credentials())); show('result'); });
    return;
  }
  const order = [...participants];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  pairs = new Map(order.map((person, i) => [person, order[(i + 1) % order.length]]));
  show('result');
});
function renderResult() {
  const person = online ? snapshot.recipient : pairs.get(user);
  $('to-name').textContent = person.name;
  $('initial').textContent = Array.from(person.name)[0].toLocaleUpperCase('ru');
  $('gift-list').replaceChildren();
  const linked = person.wishes.filter(w => w.url);
  for (const wish of person.wishes) {
    const li = document.createElement('li');
    li.textContent = wish.text;
    if (wish.url && linked.length > 1) {
      const a = document.createElement('a'); a.href = wish.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Ссылка'; li.append(' · ', a);
    }
    $('gift-list').append(li);
  }
  $('gift-link').hidden = !linked.length;
  if (linked.length) $('gift-link').href = linked[0].url;
}
button('show-result', () => show('result'));
button('return', () => {
  if (page === 'wishlist' && draft) { draft.wishes = readWishes(); show('profile'); return; }
  if (page === 'profile') { clearPhoto(); draft = null; show(user ? 'room' : joiningRoom ? 'home' : 'create'); if (joiningRoom && !user) $('retry-entry').hidden = false; return; }
  show(page === 'create' ? 'home' : 'room');
});

function credentials() {
  return {roomId:access.roomId, token:access.token};
}
function applyState(state) {
  snapshot = state;
  participants.splice(0, participants.length, ...state.members);
  room = state.room;
  user = state.me;
  pairs = state.drawn;
  for (const el of document.querySelectorAll('.room-label')) el.textContent = 'Комната «' + room.title + '»';
  show('room');
}
async function run(operation) {
  if (busy) return;
  busy = true;
  const surface = document.querySelector('main');
  surface.inert = true;
  notice('Загрузка…');
  try { await operation(); }
  catch (error) {
    notice(error.message);
    if (page === 'home') {
      $('home-error').textContent = error.message;
      $('home-error').hidden = false;
      $('retry-entry').hidden = false;
    }
  }
  finally { surface.inert = false; busy = false; }
}
function openLink(personal) {
  $('link-title').textContent = personal ? 'Моя личная ссылка' : 'Пригласить участника';
  $('link-hint').textContent = personal ? 'Сохраните ссылку для возвращения в свой профиль. Она открывает ваши данные.' : 'Отправьте эту ссылку участникам, чтобы они вступили в комнату.';
  $('share-url').value = shareURL(access, personal);
  $('copy').textContent = 'Скопировать';
  $('invitation').showModal();
}
button('copy', async () => {
  try { await navigator.clipboard.writeText($('share-url').value); $('copy').textContent = 'Скопировано'; }
  catch { $('share-url').select(); $('link-hint').textContent = 'Скопируйте выделенную ссылку.'; }
});
button('personal', () => openLink(true));
button('refresh', () => run(async () => applyState(await api('state', credentials()))));
async function enter() {
  $('home-error').hidden = $('retry-entry').hidden = true;
  access = readAccess();
  if (!access) return;
  if (access.token) { applyState(await api('state', credentials())); return; }
  joiningRoom = true;
  const info = await api('peek', {roomId:access.roomId, invite:access.invite});
  if (info.drawn) throw new Error('Жеребьёвка уже прошла. Регистрация закрыта.');
  room = info.room;
  access.token = randomKey();
  for (const el of document.querySelectorAll('.room-label')) el.textContent = 'Комната «' + room.title + '»';
  startProfile();
}
if (online) {
  button('retry-entry', () => run(enter));
  if (location.hash) run(enter);
  window.addEventListener('hashchange', () => location.reload());
}

button('delete-room', () => {
  if (online && page === 'room' && isHost()) $('deletion').showModal();
});
button('keep-room', () => $('deletion').close());
button('confirm-delete', () => {
  if (!online || page !== 'room' || !isHost()) return;
  $('deletion').close();
  run(async () => {
    const result = await api('delete', credentials());
    if (!result?.deleted) throw new Error('Сервис не подтвердил удаление комнаты.');
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  });
});
