import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = ['Budget', 'Code', 'Rooms'].map(file =>
  readFileSync(new URL('../backend/' + file + '.gs', import.meta.url), 'utf8')).join('\n');
const id = n => n.toString(16).padStart(64, '0');
const body = { title: '=PRIVATE_FORMULA()', budget: '2000', date: '2027-01-01' };
const jpeg = Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
const photo = 'data:image/jpeg;base64,' + jpeg.toString('base64');
function profile(n) { return { name: 'Person ' + n, photo, wishes: [{ text: 'Private wish ' + n, url: '' }] }; }

function fixture() {
  const props = { SERVICE_ENABLED: 'true', SPREADSHEET_ID: 'fixture', REQUESTS_PER_MINUTE: '1000', REQUESTS_PER_DAY: '5000' };
  const table = [];
  let canLock = true, held = false, added = false, cols = 26, calls = 0, failNext = false;
  let now = Date.UTC(2026, 0, 1);
  class Clock extends Date { static now() { return now; } }
  const sheet = {
    getMaxColumns: () => cols,
    insertColumnsAfter: (_, n) => { cols += n; },
    getLastRow: () => table.length,
    getRange(row, col, height, width) {
      assert.ok(held && width + col - 1 <= cols);
      return {
        getValues: () => Array.from({ length: height }, (_, j) =>
          Array.from({ length: width }, (_, i) => table[row - 1 + j]?.[col - 1 + i] ?? '')),
        setValues(rows) {
          assert.equal(rows.length, 1);
          if (failNext) { failNext = false; throw Error('storage write failed'); }
          calls++;
          table[row - 1] ??= [];
          rows[0].forEach((v,i) => {
            assert.ok(typeof v !== 'string' || (v.length < 50000 && !/^[=+@-]/.test(v)));
            table[row - 1][col - 1 + i] = v;
          });
        },
        clearContent: () => { table[row - 1] = []; }
      };
    }
  };
  const engine = vm.createContext({
    Date: Clock,
    LockService: { getScriptLock: () => ({ tryLock() { if (canLock) held = true; return canLock; },
      releaseLock() { assert.ok(held); held = false; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props[k] ?? null, setProperty: (k,v) => props[k] = v
    }) },
    SpreadsheetApp: { openById: name => {
      assert.ok(held); assert.equal(name, 'fixture');
      return { getSheetByName: () => added ? sheet : null, insertSheet: () => { added = true; return sheet; } };
    }, flush: () => assert.ok(held) },
    Utilities: { DigestAlgorithm: { SHA_256: true }, Charset: { UTF_8: true },
      computeDigest: (_, s) => Array.from(createHash('sha256').update(s).digest()),
      getUuid: randomUUID, base64Decode: s => Array.from(Buffer.from(s,'base64')) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) }
  });
  vm.runInContext(source, engine);
  const raw = s => engine.doPost({ postData: { contents: s } });
  const api = (action, n = 3, values = {}) =>
    raw(JSON.stringify({ action, token: id(n), roomId: id(1), invite: id(2), ...values }));
  const join = n => api('join', n, { profile: profile(n) });
  const create = (extra = {}) => api('create', 3, { room: body, profile: profile(3), ...extra });
  return { api, join, create, raw, props, table, writes: () => calls,
    advance: () => { now += 90 * 86400000; }, busy: () => { canLock = false; }, fail: () => { failNext = true; } };
}

test('room and join retries never duplicate an existing member or return hidden fields', () => {
  const f = fixture();
  const host = f.create().data;
  assert.ok(host.host); assert.equal(host.members.length, 1);
  assert.deepEqual(f.create().data, host);
  assert.deepEqual(f.api('peek').data, { room: body, drawn: false });
  const guest = f.join(4).data;
  assert.equal(guest.host,false);
  assert.deepEqual(f.join(4).data, guest);
  assert.equal(f.writes(),2);
  assert.equal(JSON.stringify(guest).includes('Private wish 3'),false);
  assert.equal(JSON.stringify(f.table).includes(id(3)),false);
  assert.equal(JSON.stringify(f.table).includes(id(2)),false);
  assert.deepEqual(Object.keys(guest.members[0]).sort(), ['id','name','photo']);
  assert.equal(f.api('state', 20).error.code,'ACCESS_DENIED');
  assert.equal(f.api('peek', 3, { invite: id(33) }).error.code, 'ACCESS_DENIED');
  assert.equal(f.api('draw', 4).error.code, 'ACCESS_DENIED');
  assert.equal(f.api('delete', 4).error.code, 'ACCESS_DENIED');
  assert.equal(f.api('draw').error.code,'TOO_FEW');
});

test('draw survives retry and only returns the individual assignment and wishes', () => {
  const f = fixture();
  f.create(); f.join(4); f.join(5);
  const wishes = [{ text: 'Book', url: 'https://example.org/book' }];
  assert.deepEqual(f.api('edit', 5, { wishes }).data.me.wishes, wishes);
  f.fail();
  assert.equal(f.api('draw').error.code, 'UNAVAILABLE');
  assert.equal(f.api('state').data.drawn, false);
  const first = f.api('draw').data;
  const writes = f.writes();
  assert.deepEqual(f.api('draw').data, first);
  assert.equal(f.writes(),writes);
  const seen = new Set();
  for (const n of [3,4,5]) {
    const state = f.api('state',n).data;
    assert.equal(state.drawn,true);
    assert.notEqual(state.me.name,state.recipient.name);
    assert.ok(!seen.has(state.recipient.name)); seen.add(state.recipient.name);
    const outsider = [3,4,5].find(k => ![state.me.name,state.recipient.name].includes('Person '+k));
    const hiddenWish = outsider === 5 ? '"Book"' : 'Private wish '+outsider;
    assert.equal(JSON.stringify(state).includes(hiddenWish),false);
  }
  assert.equal(f.join(6).error.code,'ROOM_CLOSED');
  assert.equal(f.api('edit', 5, { wishes }).error.code,'ROOM_CLOSED');
});

test('validation rejects invalid dates, image payloads, collection overflow and unsafe URLs before a room is written', () => {
  const f = fixture(), good = profile(3);
  for (const overrides of [
    { room: { ...body, date:'2027-02-31' } }, { profile: { ...good, photo:'data:image/png;base64,AAAA' } },
    { profile: { ...good, photo:'data:image/jpeg;base64,/9j/2Q==' } }, { profile: { ...good, wishes:[] } },
    { profile: { ...good, wishes: [{text:'gift',url:'javascript:alert(1)'}] } },
    { profile: { ...good, wishes: Array(20).fill({ text:'a'.repeat(1000) }) } }
  ]) assert.equal(f.create(overrides).error.code,'INVALID_INPUT');
  assert.equal(f.writes(),0);
  assert.equal(f.raw('bad JSON').error.code,'INVALID_INPUT');
});

test('rooms expire, release storage and can be erased explicitly by the organizer', () => {
  const f = fixture();
  for (let n=10;n<20;n++) assert.ok(f.create({ roomId:id(n) }).ok);
  assert.equal(f.create().error.code,'ROOM_LIMIT');
  f.advance();
  assert.equal(f.api('state',3,{roomId:id(10)}).error.code,'ACCESS_DENIED');
  assert.ok(!JSON.stringify(f.table).includes('Private wish'));
  assert.ok(f.create().ok);
  assert.deepEqual(f.api('delete').data,{deleted:true});
  assert.equal(f.api('state').error.code,'ACCESS_DENIED');
});

test('max membership, service switch, busy lock and shared daily budget are enforced', () => {
  const f = fixture();
  f.create();
  for (let i=4;i<=52;i++) assert.ok(f.join(i).ok);
  assert.equal(f.join(53).error.code,'ROOM_FULL');
  f.props.REQUESTS_PER_DAY = '1';
  assert.equal(f.api('state').error.code,'DAILY_LIMIT');
  f.busy(); assert.equal(f.api('state').error.code,'BUSY');
  f.props.SERVICE_ENABLED = 'false'; assert.equal(f.api('state').error.code,'MAINTENANCE');
});
