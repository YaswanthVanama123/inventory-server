/**
 * Date-window helpers for the RouteStar scrapers.
 *
 * The business runs on Virginia time (America/New_York), so a scraper's
 * "today" must be Virginia's today — not the server's local day, which would
 * shift the window (and silently drop or duplicate a day) whenever the host
 * runs in another timezone.
 */

const VIRGINIA_TIMEZONE = 'America/New_York';

/**
 * Current calendar date in Virginia as { year, month, day } (month is 1-based).
 */
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

/**
 * Virginia's current date as YYYY-MM-DD.
 */
function virginiaToday(now = new Date()) {
  const { year, month, day } = virginiaDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Shift a YYYY-MM-DD date by a number of days (negative = backwards).
 * Anchored at noon UTC so DST transitions can never roll it to the wrong day.
 */
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

/**
 * A rolling look-back window ending today (Virginia time).
 *
 * `lookbackDays` days of overlap is what makes the sync self-healing: every run
 * re-scans the recent past, so invoices closed after a previous run (or on a day
 * a run failed) still get picked up. Upserts are keyed on invoiceNumber, so
 * re-scanning already-stored invoices is a cheap no-op update.
 *
 * @param {number} lookbackDays  How many days back to scan (0 = today only).
 * @returns {{ dateFrom: string, dateTo: string, scope: string }}
 */
function rollingWindow(lookbackDays = 30, now = new Date()) {
  const days = Number.isFinite(Number(lookbackDays)) ? Math.max(0, Number(lookbackDays)) : 30;
  const dateTo = virginiaToday(now);
  const dateFrom = shiftDays(dateTo, -days);
  return { dateFrom, dateTo, scope: `${dateFrom}..${dateTo}` };
}

/**
 * UTC offset (in minutes) that Virginia is at on a given instant — handles EST
 * (-300) vs EDT (-240) without hardcoding either.
 */
function virginiaOffsetMinutes(at) {
  // 'en-US' longOffset renders like "GMT-4" / "GMT-04:00".
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: VIRGINIA_TIMEZONE,
    timeZoneName: 'longOffset'
  }).formatToParts(at).find((p) => p.type === 'timeZoneName').value;
  const m = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
}

/**
 * Convert a YYYY-MM-DD (a calendar day *in Virginia*) plus a wall-clock time
 * into the correct UTC instant.
 *
 * Date-only filters are otherwise parsed by `new Date('2026-08-09')` as midnight
 * UTC — which is 8 PM the previous day in Virginia. That shifts every day
 * boundary by 4-5 hours and makes a same-day range match nothing at all.
 */
function virginiaDayBoundary(isoDate, endOfDay = false) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const h = endOfDay ? 23 : 0;
  const min = endOfDay ? 59 : 0;
  const sec = endOfDay ? 59 : 0;
  const ms = endOfDay ? 999 : 0;
  // Guess using the offset at that wall time, then re-resolve so a DST
  // transition on the day itself still lands on the right instant.
  const naive = Date.UTC(y, m - 1, d, h, min, sec, ms);
  let offset = virginiaOffsetMinutes(new Date(naive));
  let instant = new Date(naive - offset * 60000);
  const settled = virginiaOffsetMinutes(instant);
  if (settled !== offset) {
    instant = new Date(naive - settled * 60000);
  }
  return instant;
}

/** Inclusive [start, end] UTC instants covering the given Virginia day(s). */
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
