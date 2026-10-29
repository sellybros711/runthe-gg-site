/* Slate dates and numbers. The slate turns over at midnight Eastern. */
import { CONFIG } from './config.js';

export function slateDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

/* Day arithmetic in UTC, so a clock change never makes two dates 23 hours apart. */
export function slateNumber(date) {
  const d = Date.UTC(...date.split('-').map((x, i) => (i === 1 ? x - 1 : +x)));
  const e = Date.UTC(...CONFIG.EPOCH.split('-').map((x, i) => (i === 1 ? x - 1 : +x)));
  return Math.round((d - e) / 86400000) + 1;
}
