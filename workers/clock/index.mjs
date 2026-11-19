/*
 * The clock Worker: on every cron tick, start whatever clock.mjs says is due.
 *
 * It holds one secret, GH_TOKEN: a fine-grained GitHub token for sellybros711/runthe-gg-site
 * with "Actions: Read and write" and nothing else. It can start a workflow. It cannot push,
 * read secrets or touch a database. See README.md for the setup.
 */
import { due } from './clock.mjs';

const REPO = 'sellybros711/runthe-gg-site';
const SCHEDULE_URL = 'https://runthe.gg/football/data/nfl_schedule.json';

async function schedule() {
  /* The site's own schedule, kept true by nfl-schedule.yml. Cached at the edge for an hour,
     because it moves when the league flexes a game and not between two ticks. */
  const res = await fetch(SCHEDULE_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error(`schedule: HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.games) ? j.games : [];
}

async function dispatch(env, workflow, inputs) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'runthe-gg-clock',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    });
  /* 204 is the only success. Anything else is logged and the next tick tries what is due then;
     the workflow's own GitHub cron is the second net. */
  return res.status;
}

/* THE COLLEGE SLATE'S KICKOFFS, off the college Fantasy pointer (its `kicks`, written by the
   build and by each Playoff refresh). Ten minutes at the edge: a kickoff moves between builds,
   never between two ticks. */
const CFB_NOW_URL = 'https://runthe.gg/cfb/data/fantasy/now.json';
async function cfbKicks() {
  const res = await fetch(CFB_NOW_URL, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!res.ok) throw new Error(`college pointer: HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.kicks) ? j.kicks : [];
}

export async function tick(env, nowMs) {
  let games = [], ckicks = [];
  try { games = await schedule(); } catch (e) { console.log(String(e)); }
  try { ckicks = await cfbKicks(); } catch (e) { console.log(String(e)); }
  const jobs = due(nowMs, games, ckicks);
  const done = [];
  for (const j of jobs) {
    const status = await dispatch(env, j.workflow, j.inputs);
    done.push(`${j.workflow} (${j.why}): ${status}`);
  }
  console.log(done.length ? done.join(' | ') : 'nothing due');
  return done;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, event.scheduledTime));
  },
};
