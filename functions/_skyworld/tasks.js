/* The task queue: a tester tasks an agent from the Sky World, and the dispatcher delivers it to the agent's
 * chat on its next run. The queue lives on the vault's `status` branch (never main), written with
 * SKY_VAULT_TOKEN, a token that can write to the vault and nothing else:
 *
 *   tasks/queued/<id>.json   one per task waiting: { id, agent, text, place, by, at }
 *   tasks/log.json           the dispatcher's record, newest first: the same with state, session, delivered
 *
 * The dispatcher (dispatch/plan.mjs, dispatch/record.mjs) moves a task from queued/ to the log when it
 * delivers it. A web page cannot reach a Claude chat, which is why there is a queue at all. */
import { OWNER, VAULT } from './github.js';
import { STATUS_BRANCH } from './agents.js';

const API = 'https://api.github.com';
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(String(s).replace(/\n/g, ''))));
async function gh(env, method, path, body){
  const r = await fetch(API + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: 'Bearer ' + env.SKY_VAULT_TOKEN,
    'User-Agent': 'runthe-gg-skyworld', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('github ' + r.status);
  return r.json(); }

export function newId(now = Date.now()){ return new Date(now).toISOString().replace(/[-:]/g, '').replace(/\..*$/, '') + '-' + Math.random().toString(36).slice(2, 7); }
export function clean(t){ return { agent: String(t.agent || '').slice(0, 64), text: String(t.text || '').trim().slice(0, 4000),
  place: { game: t.game ? String(t.game).slice(0, 64) : null, layer: t.layer ? String(t.layer).slice(0, 32) : null } }; }

export async function queueTask(env, task){
  const id = newId(), body = { id, ...task, at: new Date().toISOString() };
  await gh(env, 'PUT', '/repos/' + OWNER + '/' + VAULT + '/contents/tasks/queued/' + id + '.json',
    { message: 'Sky World task for ' + task.agent, content: b64(JSON.stringify(body, null, 1) + '\n'), branch: STATUS_BRANCH });
  return body; }

export async function listTasks(env){
  const dir = (await gh(env, 'GET', '/repos/' + OWNER + '/' + VAULT + '/contents/tasks/queued?ref=' + STATUS_BRANCH)) || [];
  const queued = [];
  for (const f of dir.filter(f => /\.json$/.test(f.name)).slice(-20)) { const c = await gh(env, 'GET', '/repos/' + OWNER + '/' + VAULT + '/contents/' + f.path + '?ref=' + STATUS_BRANCH);
    try { queued.push({ ...JSON.parse(unb64(c.content)), state: 'queued' }); } catch (e) {} }
  const lg = await gh(env, 'GET', '/repos/' + OWNER + '/' + VAULT + '/contents/tasks/log.json?ref=' + STATUS_BRANCH);
  let log = []; try { log = lg ? JSON.parse(unb64(lg.content)) : []; } catch (e) { log = []; }
  return { queued: queued.reverse(), log: log.slice(0, 40) }; }
