/* The event catalog compiler.

     node wrestling/build/events.mjs          writes wrestling/events/s1.js ... s6.js
     node wrestling/build/events.mjs --check  reports what it could not read, writes nothing

   docs/NARRATIVE-EVENTS.md is the content: one table row per event. This turns
   each row into data the page runs (C1, the data driven event engine):

     needs         parsed into conditions where it names a flag, a meter or a
                   relationship; anything else is kept as the scene's setup text
     choices       the [R] real / [K] kayfabe tag is kept per choice
     consequences  parsed into effects; an effect it cannot read is reported
     follows       the rows a choice unlocks (the chain)
     rarity        sets the weight

   A row that some other row follows is CHAINED: it only plays once something
   unlocked it. A row nobody follows is an ENTRY: it plays when its stage and
   conditions fit. Each stage gets its own file, and a row goes in the file of
   the first stage it can play in, so the page loads stages as a career reaches
   them. Legend arcs, epilogues and secret endings are Phase D and are skipped. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'docs', 'NARRATIVE-EVENTS.md');
const OUT = process.env.EV_OUT || path.join(HERE, '..', 'events');   // EV_OUT: verify.mjs builds to a scratch dir
const CHECK = process.argv.includes('--check');

const STAT = { money: 'money', pop: 'pop', push: 'push', standing: 'standing', momentum: 'mom', health: 'cond',
  technique: 'te', charisma: 'ch', stamina: 'st', power: 'po', aerial: 'ae', toughness: 'to', ring_iq: 'ps',
  psychology: 'ps', morale: 'morale', cardio: 'st', ringIQ: 'ps', ring_general: 'ps' };
const WEIGHT = { common: 10, uncommon: 5, rare: 2, legend: 1 };
const FLAG = /^(x|a|p|k|e|h|o|r)_[a-z0-9_.]+$/;   // o_ origins and r_ routes are set by Phase D
const unread = { needs: {}, eff: {} };
const tally = (m, k) => { m[k] = (m[k] || 0) + 1; };

function stages(s) {
  const m = s.match(/S(\d)(?:-S(\d))?/); if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a; const out = []; for (let i = a; i <= b; i++) out.push(i); return out;
}
function atom(t) {
  t = t.trim().replace(/\.$/, '');
  let m;
  if ((m = t.match(/^not (\S+)$/)) && FLAG.test(m[1])) return { not: m[1] };
  if (FLAG.test(t)) return { f: t };
  if ((m = t.match(/^([a-z]\d\d_\d\w*) seen$/))) return { seen: m[1] };
  if ((m = t.match(/^(respect|heat)\((\w+)\)\s*(>=|<=|<|>)\s*(\d+)$/))) return { rel: m[1], who: m[2], op: m[3], v: +m[4] };
  if ((m = t.match(/^([a-z_]+)\s*(>=|<=|<|>)\s*(\d+)$/)) && STAT[m[1]]) return { s: STAT[m[1]], op: m[2], v: +m[3] };
  if ((m = t.match(/^(\d+) (?:indie |pro |tv |televised )?matches/))) return { s: 'matches', op: '>=', v: +m[1] };
  return null;
}
/* C2, the memory. A flag a row names (as a condition, or in its setup prose as
   "he quotes x_...") is something the page can quote back: the choice that set
   it, and the year. Flag names never reach the screen, so prose loses them. */
const FLAGS_IN = /\b(?:x|a|p|k|e|h|o|r)_[a-z0-9_]+(?:\.[a-z0-9]+)?\b/g;
function cleanProse(t) {
  t = t.replace(/\([^)]*\b(?:x|a|p|k|e|h|o|r)_[a-z0-9_]+[^)]*\)/g, '');   // "(he quotes x_a or x_b)"
  t = t.replace(/memory payoff:\s*/i, '');
  const F = '(?:x|a|p|k|e|h|o|r)_[a-z0-9_.]+';
  t = t.replace(new RegExp(`\\b(brings up|quotes|remembers|mentions)\\s+${F}(?:\\s*(?:,|or|and)\\s*${F})*`, 'g'), '$1 the old days');
  t = t.replace(/\b(?:if|the one from|unless|and|or|not)\s+(?:x|a|p|k|e|h|o|r)_[a-z0-9_.]+(?:\s+(?:set|resolved|done))?/g, '');
  t = t.replace(/reads every \S+ flag/g, 'remembers everything');
  t = t.replace(new RegExp(`${F}(?:\\s+(?:set|resolved|done))?`, 'g'), '');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[\s,;:]+|[\s,;:]+$/g, '');
  return /[a-z]{3}/i.test(t) && !/^(or|and|years later)$/i.test(t) ? t : '';
}
function needs(raw) {
  const all = [], prose = [], recall = new Set();
  (raw.match(FLAGS_IN) || []).forEach(f => recall.add(f));
  raw.split(/,\s*|;\s*/).forEach(part => {
    const alts = part.split(/\s+or\s+/).map(atom);
    if (part.trim() && alts.every(Boolean)) { all.push(alts.length === 1 ? alts[0] : { any: alts }); alts.forEach(a => a.seen && recall.add(a.seen)); }
    else if (part.trim()) { const c = cleanProse(part.trim()); if (c) prose.push(c); if (/[a-z]_[a-z]|[<>]=?\d/.test(part)) tally(unread.needs, part.trim()); }
  });
  return { all, setup: prose.join(', '), recall: [...recall] };
}
function effects(raw) {
  const out = [];
  raw.split(/,\s*/).forEach(t => {
    t = t.trim(); let m;
    if (!t || t === 'none') return;
    if ((m = t.match(/^(respect|heat|rel)\((\w+)\)\s*([+-]\d+)/))) return out.push({ rel: m[1] === 'rel' ? 'respect' : m[1], who: m[2], d: +m[3] });
    if ((m = t.match(/^([a-z_]+)\s*([+-]\d+)/)) && STAT[m[1]]) return out.push({ s: STAT[m[1]], d: +m[2] });
    if (/injury roll/.test(t)) return out.push({ injury: 1 });
    tally(unread.eff, t.replace(/[+-]\d+.*/, '').trim());
  });
  return out;
}
const cells = line => line.split('|').slice(1, -1).map(c => c.trim());

const rows = [];
for (const line of fs.readFileSync(SRC, 'utf8').split('\n')) {
  if (!/^\| [a-zL]\w* \|/.test(line)) continue;
  const [id, stage, need, choices, cons, flags, follows, rarity, tone] = cells(line);
  if (id === 'id' || /^(L\d|epi_|sec_)/.test(id)) continue;
  rows.push({ id, stage, need, choices, cons, flags, follows, rarity, tone });
}
const ids = new Set(rows.map(r => r.id));
const followTargets = r => {
  const out = new Set();
  r.follows.replace(/\([^)]*\)/g, '').split(/,\s*|\s+/).forEach(tok => {
    tok = tok.trim(); if (!tok) return;
    if (ids.has(tok)) out.add(tok);
    else if (/^a\d\d$/.test(tok) || /^a\d\d_\d$/.test(tok)) rows.filter(x => x.id.startsWith(tok + '_')).slice(0, 1).forEach(x => out.add(x.id));
  });
  out.delete(r.id); return [...out];
};
const chained = new Set(); rows.forEach(r => followTargets(r).forEach(t => chained.add(t)));

const byStage = {}; let skipped = 0;
for (const r of rows) {
  let st = stages(r.stage) || (/any/.test(r.stage) ? [1, 2, 3, 4, 5, 6] : null);
  if (!st) { skipped++; continue; }
  st = st.map(s => (s === 0 ? 1 : s)).filter(s => s <= 6);      // S0 rows that reach S1 play from S1
  if (!st.length || /^S0$/.test(r.stage)) { skipped++; continue; } // the school itself is Phase D
  const chs = r.choices.split(' / '), cs = r.cons.split(' / '), fl = r.flags.split(' / ');
  const n = needs(r.need);
  const ev = {
    id: r.id, st: [...new Set(st)], w: WEIGHT[r.rarity] || 5, rar: r.rarity, tone: r.tone,
    chain: chained.has(r.id) ? 1 : 0, need: n.all, setup: n.setup, recall: n.recall,
    opts: chs.map((t, i) => ({
      t: t.replace(/\s*\[[RK]\]\s*$/, ''), tag: (t.match(/\[([RK])\]/) || [])[1] || 'R',
      eff: effects(cs[i] || cs[cs.length - 1] || ''),
      flags: (fl[i] || fl[fl.length - 1] || 'none').split(/,\s*/).map(x => x.trim()).filter(x => FLAG.test(x)),
    })),
    next: followTargets(r),
  };
  (byStage[ev.st[0]] = byStage[ev.st[0]] || []).push(ev);
}

// a chain into a row that was skipped (the school, the epilogue) waits for Phase D
const built = new Set(Object.values(byStage).flat().map(e => e.id));
Object.values(byStage).flat().forEach(e => { e.next = e.next.filter(id => built.has(id)); });
const count = Object.values(byStage).reduce((s, a) => s + a.length, 0);
console.log(`${count} events compiled, ${skipped} skipped (the school, legend arcs, epilogues and secret endings are Phase D)`);
Object.keys(byStage).sort().forEach(k => console.log(`  s${k}.js  ${byStage[k].length}`));
const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v}x ${k}`).join(' | ');
console.log(`effects not read: ${top(unread.eff) || 'none'}`);
console.log(`conditions not read: ${top(unread.needs) || 'none'}`);
if (CHECK) process.exit(0);

fs.mkdirSync(OUT, { recursive: true });
for (const [k, list] of Object.entries(byStage)) {
  fs.writeFileSync(path.join(OUT, `s${k}.js`),
    `/* Generated by wrestling/build/events.mjs from docs/NARRATIVE-EVENTS.md. Do not edit by hand. */\n` +
    `(window.RTR_EVENTS=window.RTR_EVENTS||{q:[]}).q.push(${JSON.stringify(list)});\n`);
}
