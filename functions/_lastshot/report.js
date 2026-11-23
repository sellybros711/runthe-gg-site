/* THE TESTER ROUND REPORT, /last-shot/report, for admins only (a tester gets
 * the site 404 like anybody else). Plain server-rendered HTML from
 * game_round_report (supabase/170): the four launch targets, each met or
 * not, and who reached each step.
 *
 * ?since=YYYY-MM-DD&until=YYYY-MM-DD (Eastern dates, until exclusive) and
 * &admins=1 to count admins. The default is the round: the last 14 days. */

/* The owner's targets (2026-11-13, [[2026-11-13-last-shot-launch-plan]]). */
export const TARGETS = Object.freeze([
  { key: 'first_run_median_s', label: 'Time to first Run It', goal: 'under 20 s', ok: v => v != null && v < 20, show: v => v == null ? '-' : v >= 2147483 ? 'never' : v + ' s' },
  { key: 'win_in_5', label: 'New players who win in 5 tries', goal: '60% or more', ok: v => v != null && v >= 0.6, show: pct },
  { key: 'tries_per_session', label: 'Tries a session (median)', goal: '6 or more', ok: v => v != null && v >= 6, show: v => v == null ? '-' : String(v) },
  { key: 'day1_return', label: 'Back the next day', goal: '25% or more', ok: v => v != null && v >= 0.25, show: pct }
]);
function pct(v) { return v == null ? '-' : Math.round(v * 100) + '%'; }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/* An Eastern date at midnight, as an ISO string the database reads. Eastern
   is UTC-5 or -4; midnight local is taken at -05:00, an hour's slack. */
const at = d => d + 'T00:00:00-05:00';

export function rangeOf(query, nowMs) {
  const today = new Date(nowMs - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const back = new Date(Date.parse(today) - 13 * 86400000).toISOString().slice(0, 10);
  const next = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const since = DAY.test(query.since || '') ? query.since : back;
  const until = DAY.test(query.until || '') ? query.until : next;
  return { since, until, sinceAt: at(since), untilAt: at(until), admins: query.admins === '1' };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderReport(r, range) {
  const head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>Last Shot round</title><style>'
    + 'body{font:16px/1.4 system-ui,sans-serif;margin:0;padding:16px;background:#f6f4ef;color:#1b1b1b}main{max-width:720px;margin:0 auto}'
    + 'h1{font-size:24px;margin:0 0 4px}.sub{color:#555;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}'
    + '.t{background:#fff;border-radius:12px;padding:12px;border:2px solid #ddd}.t.ok{border-color:#1f9d6b}.t.no{border-color:#d9534f}'
    + '.v{font-size:28px;font-weight:700}.g{color:#555;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;background:#fff;border-radius:12px}'
    + 'td{padding:8px 12px;border-bottom:1px solid #eee}td:last-child{text-align:right}form{margin:16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}'
    + '@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}.t,table{background:#222;border-color:#333}td{border-color:#333}.sub,.g{color:#aaa}}'
    + '</style></head><body><main>';
  const form = '<form method="get"><label>From <input type="date" name="since" value="' + esc(range.since) + '"></label>'
    + '<label>to <input type="date" name="until" value="' + esc(range.until) + '"></label>'
    + '<label><input type="checkbox" name="admins" value="1"' + (range.admins ? ' checked' : '') + '> count admins</label><button>Show</button></form>';
  if (!r) return head + '<h1>Last Shot round</h1><p class="sub">The report could not be read. Has supabase/170 run?</p>' + form + '</main></body></html>';
  const met = TARGETS.filter(t => t.ok(r[t.key])).length;
  const tiles = TARGETS.map(t => {
    const v = r[t.key], ok = t.ok(v);
    return '<div class="t ' + (v == null ? '' : ok ? 'ok' : 'no') + '"><div class="g">' + esc(t.label) + '</div><div class="v">' + esc(t.show(v)) + '</div><div class="g">Goal: ' + esc(t.goal) + (v == null ? '' : ok ? ' · met' : ' · not yet') + '</div></div>';
  }).join('');
  const f = r.funnel || {};
  const steps = [['open', 'Opened it'], ['run', 'Ran a play'], ['result', 'Saw a result'], ['level_open', 'Opened a Ladder level'], ['daily_open', 'Opened the Daily'],
    ['daily_filed', 'Took the Daily shot'], ['plays_load', 'Loaded a starter'], ['save', 'Saved a play'], ['share', 'Shared'], ['beat_open', 'Opened a Beat my play link']];
  const rows = steps.map(([k, l]) => '<tr><td>' + esc(l) + '</td><td>' + (f[k] || 0) + '</td></tr>').join('');
  const small = 'New players: ' + (r.new_players || 0) + ' · veterans left out: ' + (r.veterans || 0) + ' · ran: ' + (r.ran || 0) + ' · never ran: ' + (r.first_run_never || 0)
    + ' · sessions with a run: ' + (r.sessions || 0) + ' (mean ' + (r.tries_mean == null ? '-' : r.tries_mean) + ')'
    + ' · day 1 counted for ' + (r.day1_eligible || 0) + ' · events: ' + (r.events || 0);
  return head + '<h1>Last Shot round</h1><p class="sub">' + met + ' of 4 targets met. ' + esc(range.since) + ' to ' + esc(range.until) + (range.admins ? ', admins counted' : ', admins left out') + '.</p>'
    + '<div class="grid">' + tiles + '</div><p class="sub">' + esc(small) + '</p>'
    + '<table><tbody><tr><td><b>Players who</b></td><td><b>count</b></td></tr>' + rows + '</tbody></table>' + form
    + '<p class="sub">Small numbers swing. Judge the round on 20 or more new players.</p></main></body></html>';
}
