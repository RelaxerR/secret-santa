const get = id => document.getElementById(id);
const participants = [];
let assignments;
let joining = false;

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
    get('edit').elements.wishes.value = person.wishes;
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
    if (file) {
      if (!['image/jpeg','image/webp','image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)
        throw new Error('Выберите JPEG, PNG или WebP до 2 МБ.');
      avatar = URL.createObjectURL(file);
      const image = new Image();
      image.src = avatar;
      try { await image.decode(); } catch { throw new Error('Не удалось прочитать изображение.'); }
    }
    const id = creating ? 'host' : crypto.randomUUID();
    participants.push({ id, name, avatar, wishes: fields.wishes.value.trim() });
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
  person.wishes = e.target.elements.wishes.value.trim();
  get('notice').textContent = 'Пожелания сохранены.';
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
  if (recipient) get('recipient').textContent = 'Вы дарите: ' + recipient.name + '\n' + (recipient.wishes || 'Пожелания не указаны.');
};
