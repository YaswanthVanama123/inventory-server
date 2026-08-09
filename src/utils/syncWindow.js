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

module.exports = {
  VIRGINIA_TIMEZONE,
  virginiaToday,
  shiftDays,
  rollingWindow
};
