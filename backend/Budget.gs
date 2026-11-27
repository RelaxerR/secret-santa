/** Pure fixed-window global budget; persistence MUST happen under ScriptLock. */
function consumeBudget_(previous, now, limits) {
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  const state = {
    minute: minute, day: day,
    minuteCount: previous.minute === minute ? previous.minuteCount || 0 : 0,
    dayCount: previous.day === day ? previous.dayCount || 0 : 0
  };
  if (state.dayCount >= limits.day) return {
    allowed: false, code: 'DAILY_LIMIT', retryAfterSeconds: Math.ceil(((day + 1) * 86400000 - now) / 1000)
  };
  if (state.minuteCount >= limits.minute) return {
    allowed: false, code: 'RATE_LIMITED', retryAfterSeconds: Math.ceil(((minute + 1) * 60000 - now) / 1000)
  };
  state.minuteCount++;
  state.dayCount++;
  return { allowed: true, state: state };
}
