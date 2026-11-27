import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const budgetCode = readFileSync(new URL('../backend/Budget.gs', import.meta.url), 'utf8');
const rpcCode = readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8');
function fixture(options = {}) {
  const values = { SERVICE_ENABLED: 'true', ...options.values };
  let releases = 0;
  let writes = 0;
  const context = vm.createContext({
    Date,
    PropertiesService: { getScriptProperties() {
      if (options.error) throw new Error(options.error);
      return {
        getProperty: key => values[key] ?? null,
        setProperty(key, value) { writes++; values[key] = value; }
      };
    } },
    LockService: { getScriptLock: () => ({
      tryLock: () => options.lock !== false,
      releaseLock() { releases++; }
    }) }
  });
  vm.runInContext(budgetCode + '\n' + rpcCode, context);
  return { context, values, releases: () => releases, writes: () => writes };
}
const plain = value => JSON.parse(JSON.stringify(value));
const limits = { minute: 2, day: 3 };

test('allows first request and tracks both windows', () => {
  const { context } = fixture();
  const decision = plain(context.consumeBudget_({}, 90000, limits));
  assert.deepEqual(decision, { allowed: true, state: { minute: 1, day: 0, minuteCount: 1, dayCount: 1 } });
});
test('minute exhaustion returns wait without changing prior state', () => {
  const { context } = fixture();
  const previous = { minute: 1, day: 0, minuteCount: 2, dayCount: 2 };
  assert.deepEqual(plain(context.consumeBudget_(previous, 90000, limits)), {
    allowed: false, code: 'RATE_LIMITED', retryAfterSeconds: 30
  });
  assert.equal(previous.minuteCount, 2);
});
test('new minute preserves daily count', () => {
  const { context } = fixture();
  const decision = context.consumeBudget_({ minute: 1, day: 0, minuteCount: 2, dayCount: 2 }, 120000, limits);
  assert.equal(decision.allowed, true);
  assert.equal(decision.state.dayCount, 3);
  assert.equal(decision.state.minuteCount, 1);
});
test('daily exhaustion takes precedence over minute limit', () => {
  const { context } = fixture();
  const result = context.consumeBudget_({ minute: 1, day: 0, minuteCount: 2, dayCount: 3 }, 90000, limits);
  assert.equal(result.code, 'DAILY_LIMIT');
  assert.equal(result.retryAfterSeconds, 86310);
});
test('UTC midnight resets both counters', () => {
  const { context } = fixture();
  const result = context.consumeBudget_({ minute: 1439, day: 0, minuteCount: 2, dayCount: 3 }, 86400000, limits);
  assert.equal(result.allowed, true);
  assert.equal(result.state.dayCount, 1);
  assert.equal(result.state.minuteCount, 1);
});
test('RPC consumes persisted budget and releases lock', () => {
  const f = fixture();
  assert.equal(f.context.serviceStatus().ok, true);
  assert.equal(f.writes(), 1);
  assert.equal(f.releases(), 1);
  assert.equal(JSON.parse(f.values.REQUEST_BUDGET_V1).dayCount, 1);
});
test('RPC enforces global cap across callers and does not persist rejected calls', () => {
  const f = fixture({ values: { REQUESTS_PER_DAY: '1' } });
  assert.equal(f.context.serviceStatus().ok, true);
  assert.equal(f.context.serviceStatus().error.code, 'DAILY_LIMIT');
  assert.equal(f.writes(), 1);
  assert.equal(f.releases(), 2);
});
test('disabled service fails closed without budget writes', () => {
  const f = fixture({ values: { SERVICE_ENABLED: 'false' } });
  assert.equal(f.context.serviceStatus().error.code, 'MAINTENANCE');
  assert.equal(f.writes(), 0);
});
test('unavailable lock rejects without writes', () => {
  const f = fixture({ lock: false });
  assert.equal(f.context.serviceStatus().error.code, 'BUSY');
  assert.equal(f.writes(), 0);
  assert.equal(f.releases(), 0);
});
test('quota error is safe and has no invented reset time', () => {
  const f = fixture({ error: 'Service invoked too many times: secret identifier' });
  const result = f.context.serviceStatus();
  assert.equal(result.error.code, 'QUOTA_EXCEEDED');
  assert.equal(result.error.retryAfterSeconds, null);
  assert.ok(!JSON.stringify(result).includes('secret identifier'));
});
test('unknown error does not leak stack or private identifiers', () => {
  const f = fixture({ error: 'private-sheet-id' });
  const result = f.context.serviceStatus();
  assert.equal(result.error.code, 'UNAVAILABLE');
  assert.ok(!JSON.stringify(result).includes('private-sheet-id'));
});
test('invalid budget fails closed and still releases lock', () => {
  const f = fixture({ values: { REQUEST_BUDGET_V1: 'invalid json' } });
  assert.equal(f.context.serviceStatus().error.code, 'UNAVAILABLE');
  assert.equal(f.writes(), 0);
  assert.equal(f.releases(), 1);
});
test('invalid limits fall back to conservative defaults', () => {
  const { context } = fixture();
  for (const value of ['', null, '0', '-1', '1.5', 'NaN', 'Infinity']) {
    assert.equal(context.positiveLimit_(value, 30), 30);
  }
  assert.equal(context.positiveLimit_('15', 30), 15);
});
