const get = id => document.getElementById(id);
const participants = [];
let assignments;
let joining = false;

function addWish(form, wish = { text: '', url: '' }) {
  const list = form.querySelector('.wishes');
  const row = get('wish-row').content.firstElementChild.cloneNode(true);
  row.querySelector('[name=wish]').value = wish.text;
  row.querySelector('[name=url]').value = wish.url;
  list.append(row);
  for (const button of list.querySelectorAll('.remove')) button.disabled = list.children.length === 1;
  row.querySelector('.remove').onclick = () => {
    row.remove();
    if (list.children.length === 1) list.querySelector('.remove').disabled = true;
  };
  return row;
}

function setWishes(form, wishes) {
  form.querySelector('.wishes').replaceChildren();
  for (const wish of wishes) addWish(form, wish);
}

function readWishes(form) {
  return Array.from(form.querySelectorAll('.wish-row'), row => {
    const text = row.querySelector('[name=wish]').value.trim();
    const url = row.querySelector('[name=url]').value.trim();
    if (!text) throw new Error('Введите пожелание или удалите пустую строку.');
    if (url && !['http:', 'https:'].includes(URL.parse(url)?.protocol)) {
      throw new Error('Введите ссылку с http:// или https://.');
    }
    return { text, url };
  });
}

for (const form of document.querySelectorAll('form')) {
  addWish(form);
  form.querySelector('.add').onclick = () => addWish(form).querySelector('input').focus();
}

function render() {
  const role = get('role').value;
  const person = participants.find(p => p.id === role);
  get('host').hidden = role !== 'host';
  get('join').hidden = role !== 'guest';
  get('member').hidden = !person;
  get('recipient').textContent = '';
  get('notice').textContent = '';
  get('roster').replaceChildren(...participants.map(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    return li;
  }));
  get('draw').disabled = Boolean(assignments) || participants.length < 3;
  get('draw-help').textContent = assignments ? 'Подарки распределены. Каждый участник может открыть свой результат.' :
    'Для жеребьёвки нужны минимум три участника. После неё состав и пожелания фиксируются.';
  if (person) {
    get('member-name').textContent = person.name;
    setWishes(get('edit'), person.wishes);
    get('edit').hidden = Boolean(assignments);
    get('photo').hidden = !person.avatar;
    if (person.avatar) get('photo').src = person.avatar;
    else get('photo').removeAttribute('src');
    get('reveal').hidden = !assignments;
  }
}
get('role').onchange = render;
async function register(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const creating = form.id === 'create';
  if (joining || assignments) return;
  if (creating ? participants.length > 0 : get('role').value !== 'guest') return;
  const fields = form.elements;
  const title = creating ? fields.title.value.trim() : '';
  if (creating && !title) { get('notice').textContent = 'Введите название комнаты.'; return; }
  const name = fields.name.value.trim();
  if (!name) { get('notice').textContent = 'Введите имя.'; return; }
  const file = fields.avatar.files[0];
  let avatar;
  joining = true;
  get('role').disabled = true;
  try {
    const wishes = readWishes(form);
    if (!file) throw new Error('Загрузите фото для участия.');
    if (!['image/jpeg','image/webp','image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)
      throw new Error('Выберите JPEG, PNG или WebP до 2 МБ.');
    avatar = URL.createObjectURL(file);
    const image = new Image();
    image.src = avatar;
    try { await image.decode(); } catch { throw new Error('Не удалось прочитать изображение.'); }
    const id = creating ? 'host' : crypto.randomUUID();
    participants.push({ id, name, avatar, wishes });
    if (creating) {
      get('room-title').textContent = title;
      get('create').hidden = true;
      get('room').hidden = false;
      get('role').options[0].text = name + ' (организатор)';
    } else {
      get('role').add(new Option(name, id));
    }
    get('role').value = id;
    form.reset();
    form.querySelector('.wishes').replaceChildren();
    addWish(form);
    render();
  } catch (error) {
    if (avatar) URL.revokeObjectURL(avatar);
    get('notice').textContent = error.message;
  } finally {
    joining = false;
    get('role').disabled = false;
  }
}
get('create').onsubmit = register;
get('join').onsubmit = register;
get('edit').onsubmit = e => {
  e.preventDefault();
  const person = participants.find(p => p.id === get('role').value);
  if (!person || assignments) return;
  try {
    person.wishes = readWishes(e.currentTarget);
    get('notice').textContent = 'Пожелания сохранены.';
  } catch (error) { get('notice').textContent = error.message; }
};
get('draw').onclick = () => {
  if (get('role').value !== 'host' || assignments || participants.length < 3) return;
  const order = [...participants];
  for (let i = order.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  assignments = new Map(order.map((p, i) => [p.id, order[(i + 1) % order.length]]));
  get('role').querySelector('option[value=guest]').remove();
  render();
};
get('reveal').onclick = () => {
  const recipient = assignments?.get(get('role').value);
  if (!recipient) return;
  const title = document.createElement('h3');
  title.textContent = 'Вы дарите: ' + recipient.name;
  const list = document.createElement('ul');
  for (const wish of recipient.wishes) {
    const item = document.createElement('li');
    item.textContent = wish.text;
    if (wish.url) {
      const link = document.createElement('a');
      link.href = wish.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Открыть ссылку';
      item.append(' · ', link);
    }
    list.append(item);
  }
  get('recipient').replaceChildren(title, list);
};
