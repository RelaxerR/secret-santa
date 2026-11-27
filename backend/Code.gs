/** Web app diagnostic. Domain helpers end in _ to block google.script.run access. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Status').setTitle('Тайный Санта — проверка сервиса');
}

/** Public diagnostic RPC. */
function serviceStatus() {
  return admitted_(function () { return { status: 'ready', version: '1.0.0' }; });
}

function admitted_(operation) {
  try {
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty('SERVICE_ENABLED') !== 'true') {
      return failure_('MAINTENANCE', 'Сервис временно выключен. Попробуйте позже.');
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return failure_('BUSY', 'Сервис занят. Попробуйте немного позже.', 5);
    try {
      const now = Date.now();
      const raw = properties.getProperty('REQUEST_BUDGET_V1');
      const decision = consumeBudget_(raw ? JSON.parse(raw) : {}, now, {
        minute: positiveLimit_(properties.getProperty('REQUESTS_PER_MINUTE'), 30),
        day: positiveLimit_(properties.getProperty('REQUESTS_PER_DAY'), 500)
      });
      if (!decision.allowed) return failure_(decision.code,
        decision.code === 'DAILY_LIMIT' ? 'Лимит запросов на сегодня исчерпан. Возвращайтесь завтра (после 00:00 UTC).' : 'Слишком много запросов. Подождите немного.',
        decision.retryAfterSeconds);
      properties.setProperty('REQUEST_BUDGET_V1', JSON.stringify(decision.state));
      return { ok: true, data: operation(properties, now) };
    } finally { lock.releaseLock(); }
  } catch (error) {
    if (error && error.santaFailure) return error.santaFailure;
    // Never return Google errors, identifiers, stack traces or user data to clients.
    if (/quota|too many times|limit exceeded|service invoked/i.test(String(error && error.message))) {
      return failure_('QUOTA_EXCEEDED', 'Квота Google временно исчерпана. Попробуйте позже.');
    }
    return failure_('UNAVAILABLE', 'Не удалось проверить сервис. Попробуйте позже.');
  }
}
function failure_(code, message, retryAfterSeconds) {
  return { ok: false, error: { code: code, message: message, retryAfterSeconds: retryAfterSeconds || null } };
}
function positiveLimit_(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
