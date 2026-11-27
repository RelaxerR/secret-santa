/** All game traffic uses one lock shared with diagnostics. JSON only, no query secrets. */
function doPost(e) {
  const reply = admitted_(function (settings, now) {
    const raw = e && e.postData && e.postData.contents;
    requireInput_(typeof raw === 'string' && raw.length <= 64000);
    let request;
    try { request = JSON.parse(raw); } catch (_) { requireInput_(false); }
    requireInput_(request && typeof request === 'object');
    requireInput_(['create','join','peek','state','edit','draw','delete'].includes(request.action));
    const key = roomKey_(request.roomId);
    if (['create','join','peek'].includes(request.action)) secret_(request.invite);
    if (request.action !== 'peek') secret_(request.token);
    if (request.action === 'create' || request.action === 'join') {
      requireInput_(request.invite !== request.token && request.token !== request.roomId && request.invite !== request.roomId);
    }
    return routeRoom_(request, roomStore_(settings), key, now);
  });
  return ContentService.createTextOutput(JSON.stringify(reply)).setMimeType(ContentService.MimeType.JSON);
}

function rejectRoom_(code, message) {
  const error = new Error(code);
  error.santaFailure = failure_(code, message);
  throw error;
}

function requireInput_(ok) {
  if (!ok) rejectRoom_('INVALID_INPUT', 'Проверьте введённые данные.');
}

function noAccess_() {
  rejectRoom_('ACCESS_DENIED', 'Ссылка недействительна или срок комнаты истёк.');
}

function secret_(value) {
  requireInput_(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
  return value;
}

function roomKey_(id) {
  return 'room:' + secret_(id);
}

function digest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (byte) { return (byte & 255).toString(16).padStart(2, '0'); }).join('');
}

function equalHash_(a, b) {
  if (a.length !== 64 || b.length !== 64) return false;
  let different = 0;
  for (let i = 0; i < 64; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

function plainText_(value, max) {
  requireInput_(typeof value === 'string' && value.trim() && value.length <= max);
  return value.trim();
}

function roomInfo_(room) {
  requireInput_(room && typeof room === 'object');
  const date = plainText_(room.date, 10);
  requireInput_(/^\d{4}-\d{2}-\d{2}$/.test(date));
  const parsed = new Date(date + 'T00:00:00Z');
  requireInput_(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date);
  return { title: plainText_(room.title, 120), budget: plainText_(room.budget, 80), date: date };
}

function wishes_(items) {
  requireInput_(Array.isArray(items) && items.length >= 1 && items.length <= 20);
  const list = items.map(function (item) {
    requireInput_(item && typeof item === 'object');
    const text = plainText_(item.text, 2000);
    const url = item.url === undefined ? '' : item.url;
    requireInput_(typeof url === 'string' && url.length <= 2048 &&
      (url === '' || /^https?:\/\/[^\s\\/]+(?:[/?#][^\s\\]*)?$/i.test(url)));
    return { text: text, url: url };
  });
  requireInput_(JSON.stringify(list).length <= 16000);
  return list;
}

/** Validate JPEG envelope, bounded dimensions and a complete frame/scan header before storage. */
function avatar_(value) {
  const prefix = 'data:image/jpeg;base64,';
  requireInput_(typeof value === 'string' && value.length <= 16000 && value.startsWith(prefix));
  const data = value.slice(prefix.length);
  requireInput_(data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(data));
  const b = Utilities.base64Decode(data).map(function (v) { return v & 255; });
  const word = function (i) { return b[i] * 256 + b[i + 1]; };
  requireInput_(b.length >= 20 && word(0) === 0xffd8 && word(b.length - 2) === 0xffd9);
  let frame = false;
  for (let i = 2; i + 4 < b.length;) {
    requireInput_(b[i++] === 255);
    while (b[i] === 255) i++;
    const marker = b[i++];
    const length = word(i);
    requireInput_(length >= 2 && i + length <= b.length - 2);
    if ([192,193,194].includes(marker)) {
      const height = word(i + 3), width = word(i + 5);
      requireInput_(length >= 11 && width > 0 && height > 0 && width <= 1024 && height <= 1024);
      frame = true;
    }
    if (marker === 218) {
      requireInput_(frame && length >= 8 && i + length < b.length - 2);
      return value;
    }
    i += length;
  }
  requireInput_(false);
}

function member_(profile, auth) {
  requireInput_(profile && typeof profile === 'object');
  return { id: Utilities.getUuid(), auth: auth, name: plainText_(profile.name, 80),
    photo: avatar_(profile.photo), wishes: wishes_(profile.wishes) };
}

function roomStore_(settings) {
  const id = settings.getProperty('SPREADSHEET_ID');
  if (!id) rejectRoom_('UNAVAILABLE', 'Хранилище комнат пока не настроено.');
  const book = SpreadsheetApp.openById(id);
  const sheet = book.getSheetByName('SantaRoomsV1') || book.insertSheet('SantaRoomsV1');
  const columns = 53;
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  return {
    index: function () {
      const last = sheet.getLastRow();
      return last ? sheet.getRange(1, 1, last, 2).getValues() : [];
    },
    load: function (row) {
      const cells = sheet.getRange(row, 3, 1, columns - 2).getValues()[0];
      return { metadata: JSON.parse(cells[0]), people: cells.slice(1).filter(Boolean).map(function (v) { return JSON.parse(v); }) };
    },
    save: function (row, key, expires, state) {
      // Each profile is bounded below the Sheets 50,000-character cell limit.
      // One contiguous range is the commit, including draw assignments. JSON cells always start with "{".
      const cells = [key, expires, JSON.stringify(state.metadata)].concat(state.people.map(function (p) { return JSON.stringify(p); }));
      sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
      SpreadsheetApp.flush();
    },
    clear: function (row) {
      sheet.getRange(row, 1, 1, columns).clearContent();
      SpreadsheetApp.flush();
    }
  };
}

function activeSlots_(store, now) {
  const index = store.index();
  for (let i = 0; i < index.length; i++) {
    if (index[i][0] && Number(index[i][1]) <= now) {
      store.clear(i + 1);
      index[i] = ['', ''];
    }
  }
  return index;
}

// An owner may attach a daily time-driven trigger to purge even while the service is idle.
function purgeExpiredRooms_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { activeSlots_(roomStore_(PropertiesService.getScriptProperties()), Date.now()); }
  finally { lock.releaseLock(); }
}

function drawRoom_(people) {
  if (people.length < 3) rejectRoom_('TOO_FEW', 'Для жеребьёвки нужны хотя бы три участника.');
  // A private shuffle seeded with every member's browser-generated secret digest and fresh server entropy.
  const seed = Utilities.getUuid() + people.map(function (p) { return p.auth; }).join('');
  const ordered = people.map(function (p) { return { p: p, key: digest_(seed + ':' + p.id) }; })
    .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  ordered.forEach(function (entry, i) { entry.p.to = ordered[(i + 1) % ordered.length].p.id; });
}

function publicPerson_(p) { return { id: p.id, name: p.name, photo: p.photo }; }

function snapshot_(state, person) {
  const recipient = person.to && state.people.find(function (p) { return p.id === person.to; });
  return { room: state.metadata.room, drawn: state.metadata.drawn, host: state.people[0].id === person.id,
    members: state.people.map(publicPerson_), me: Object.assign(publicPerson_(person), { wishes: person.wishes }),
    recipient: recipient ? { name: recipient.name, photo: recipient.photo, wishes: recipient.wishes } : null };
}

function routeRoom_(q, store, key, now) {
  const index = activeSlots_(store, now);
  const position = index.findIndex(function (r) { return r[0] === key; });
  const auth = q.action === 'peek' ? null : digest_('member:' + key + ':' + q.token);
  if (position < 0) {
    if (q.action !== 'create') noAccess_();
    if (index.filter(function (r) { return r[0]; }).length >= 10) rejectRoom_('ROOM_LIMIT', 'Все комнаты заняты. Попробуйте позже.');
    const creator = member_(q.profile, auth);
    const fresh = { metadata: { room: roomInfo_(q.room), invite: digest_('invite:' + key + ':' + q.invite), drawn: false }, people: [creator] };
    const empty = index.findIndex(function (r) { return !r[0]; });
    store.save(empty < 0 ? index.length + 1 : empty + 1, key, now + 90 * 86400000, fresh);
    return snapshot_(fresh, creator);
  }
  const row = position + 1;
  const state = store.load(row);
  if (['create','peek','join'].includes(q.action) && !equalHash_(state.metadata.invite, digest_('invite:' + key + ':' + q.invite))) noAccess_();
  if (q.action === 'peek') return { room: state.metadata.room, drawn: state.metadata.drawn };
  let person = state.people.find(function (p) { return equalHash_(p.auth, auth); });
  let changed = false;
  if (q.action === 'join' && !person) {
    if (state.metadata.drawn) rejectRoom_('ROOM_CLOSED', 'Жеребьёвка уже прошла.');
    if (state.people.length >= 50) rejectRoom_('ROOM_FULL', 'В комнате уже 50 участников.');
    person = member_(q.profile, auth);
    state.people.push(person);
    changed = true;
  }
  if (!person) noAccess_();
  if (['create','draw','delete'].includes(q.action) && person.id !== state.people[0].id) noAccess_();
  if (q.action === 'delete') {
    store.clear(row);
    return { deleted: true };
  }
  if (q.action === 'edit') {
    if (state.metadata.drawn) rejectRoom_('ROOM_CLOSED', 'После жеребьёвки пожелания зафиксированы.');
    person.wishes = wishes_(q.wishes);
    changed = true;
  }
  if (q.action === 'draw' && !state.metadata.drawn) {
    drawRoom_(state.people);
    state.metadata.drawn = true;
    changed = true;
  }
  if (changed) store.save(row, key, index[position][1], state);
  return snapshot_(state, person);
}
