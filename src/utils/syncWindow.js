
const VIRGINIA_TIMEZONE = 'America/New_York';

function virginiaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIRGINIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function virginiaToday(now = new Date()) {
  const { year, month, day } = virginiaDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return [
    anchor.getUTCFullYear(),
    String(anchor.getUTCMonth() + 1).padStart(2, '0'),
    String(anchor.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function rollingWindow(lookbackDays = 30, now = new Date()) {
  const days = Number.isFinite(Number(lookbackDays)) ? Math.max(0, Number(lookbackDays)) : 30;
  const dateTo = virginiaToday(now);
  const dateFrom = shiftDays(dateTo, -days);
  return { dateFrom, dateTo, scope: `${dateFrom}..${dateTo}` };
}

function virginiaOffsetMinutes(at) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: VIRGINIA_TIMEZONE,
    timeZoneName: 'longOffset'
  }).formatToParts(at).find((p) => p.type === 'timeZoneName').value;
  const m = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
}

function virginiaDayBoundary(isoDate, endOfDay = false) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const h = endOfDay ? 23 : 0;
  const min = endOfDay ? 59 : 0;
  const sec = endOfDay ? 59 : 0;
  const ms = endOfDay ? 999 : 0;
  const naive = Date.UTC(y, m - 1, d, h, min, sec, ms);
  let offset = virginiaOffsetMinutes(new Date(naive));
  let instant = new Date(naive - offset * 60000);
  const settled = virginiaOffsetMinutes(instant);
  if (settled !== offset) {
    instant = new Date(naive - settled * 60000);
  }
  return instant;
}

function virginiaDateRange(startDate, endDate) {
  return {
    start: startDate ? virginiaDayBoundary(startDate, false) : null,
    end: endDate ? virginiaDayBoundary(endDate, true) : null
  };
}

module.exports = {
  VIRGINIA_TIMEZONE,
  virginiaToday,
  shiftDays,
  rollingWindow,
  virginiaOffsetMinutes,
  virginiaDayBoundary,
  virginiaDateRange
};
