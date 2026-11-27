import { config } from './config.js';
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
const isHost = () => user === participants[0];
const button = (id, fn) => $(id).addEventListener('click', fn);
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
  $('switch-wrap').hidden = next !== 'room';
  if (next === 'room') renderRoom();
  if (next === 'confirm') {
    $('confirm-text').textContent = 'Каждый из ' + participants.length + ' участников узнает имя своего получателя. После этого состав комнаты закроется.';
  }
  if (next === 'result') renderResult();
  window.scrollTo(0, 0);
}
for (const el of document.querySelectorAll('[data-page]')) {
  el.onclick = () => show(el.dataset.page);
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
    pendingPhoto = url;
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
  if (wishes.some(item => !item.text)) { notice('Введите название каждого пожелания.'); return; }
  for (const item of wishes) {
    if (!item.url) continue;
    let url;
    try { url = new URL(item.url); } catch { /* invalid URL */ }
    if (!url || !['https:', 'http:'].includes(url.protocol)) { notice('Укажите ссылку с https:// или http://.'); return; }
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
    const roles = [person === user && 'вы', index === 0 && 'организатор'].filter(Boolean);
    li.append(img, person.name + (roles.length ? ' · ' + roles.join(', ') : ''));
    $('roster').append(li);
    $('switch').add(new Option(person.name, String(index), false, person === user));
  }
  $('start-draw').hidden = !isHost() || Boolean(pairs);
  $('start-draw').disabled = participants.length < 3;
  $('start-draw').title = participants.length < 3 ? 'Нужны минимум 3 участника' : '';
  $('show-result').hidden = !pairs;
  $('invite').hidden = Boolean(pairs);
}
button('edit-wishes', () => openWishes(user.wishes));
$('switch').onchange = () => { user = participants[Number($('switch').value)]; show('room'); };
button('invite', () => $('invitation').showModal());
button('cancel-invite', () => $('invitation').close());
button('register', () => { $('invitation').close(); startProfile(); });
button('start-draw', () => { if (isHost() && !pairs && participants.length >= 3) show('confirm'); });
button('draw', () => {
  if (!isHost() || pairs || participants.length < 3) return;
  const order = [...participants];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  pairs = new Map(order.map((person, i) => [person, order[(i + 1) % order.length]]));
  show('result');
});
function renderResult() {
  const person = pairs.get(user);
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
  if (page === 'profile') { clearPhoto(); draft = null; show(user ? 'room' : 'create'); return; }
  show(page === 'create' ? 'home' : 'room');
});
