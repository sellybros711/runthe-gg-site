#!/usr/bin/env node
// Dependency-free content validator for RunTheCase. Run: node tools/validate.mjs
// Checks referential integrity across career.json, characters.json, threads.json,
// badges.json, case_registry.json, and every case file under data/cases/.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function loadJson(relPath) {
  const full = join(DATA, relPath);
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    err(`Failed to read/parse ${relPath}: ${e.message}`);
    return null;
  }
}

const career = loadJson('career.json');
const characters = loadJson('characters.json');
const threads = loadJson('threads.json');
const badges = loadJson('badges.json');
const registry = loadJson('case_registry.json');

const characterIds = new Set((characters?.characters ?? []).map((c) => c.id));
const badgeIds = new Set((badges?.badges ?? []).map((b) => b.id));
const breadcrumbIds = new Set((threads?.breadcrumbs ?? []).map((b) => b.id));
const rankIds = new Set((career?.ranks ?? []).map((r) => r.id));

// --- career.json sanity ---
if (career) {
  const orders = (career.ranks ?? []).map((r) => r.order).sort((a, b) => a - b);
  orders.forEach((o, i) => {
    if (o !== i + 1) err(`career.json: rank orders must be contiguous starting at 1, got ${JSON.stringify(orders)}`);
  });
  const w = career.scoring ?? {};
  const sum = (w.suspect_weight ?? 0) + (w.evidence_weight ?? 0) + (w.motive_weight ?? 0);
  if (Math.abs(sum - 1) > 1e-9) err(`career.json: scoring weights must sum to 1, got ${sum}`);
}

// --- threads.json refs ---
if (threads) {
  if (threads.villain_id && !characterIds.has(threads.villain_id)) err(`threads.json: villain_id '${threads.villain_id}' not in characters.json`);
  if (threads.inside_man_id && !characterIds.has(threads.inside_man_id)) err(`threads.json: inside_man_id '${threads.inside_man_id}' not in characters.json`);
  for (const a of threads.antagonist_ids ?? []) {
    if (!characterIds.has(a)) err(`threads.json: antagonist_id '${a}' not in characters.json`);
  }
  for (const cb of threads.callbacks ?? []) {
    if (!registryHasCase(cb.from_case_id)) warn(`threads.json: callback '${cb.id}' references from_case_id '${cb.from_case_id}' not in case_registry.json`);
    if (!registryHasCase(cb.to_case_id)) warn(`threads.json: callback '${cb.id}' references to_case_id '${cb.to_case_id}' not in case_registry.json`);
  }
  for (const bc of threads.breadcrumbs ?? []) {
    if (!registryHasCase(bc.case_id)) warn(`threads.json: breadcrumb '${bc.id}' references case_id '${bc.case_id}' not in case_registry.json`);
  }
}

function registryHasCase(caseId) {
  return (registry?.cases ?? []).some((c) => c.case_id === caseId);
}

// --- case_registry.json <-> data/cases/*.json cross-check ---
const caseFiles = new Set();
try {
  for (const f of readdirSync(join(DATA, 'cases'))) {
    if (f.endsWith('.json')) caseFiles.add(f.replace(/\.json$/, ''));
  }
} catch (e) {
  err(`Could not read data/cases/: ${e.message}`);
}

const registryOrderByRank = new Map();
for (const entry of registry?.cases ?? []) {
  if (!rankIds.has(entry.rank_required)) err(`case_registry.json: '${entry.case_id}' has unknown rank_required '${entry.rank_required}'`);
  const list = registryOrderByRank.get(entry.rank_required) ?? [];
  list.push(entry.order_in_rank);
  registryOrderByRank.set(entry.rank_required, list);

  if (entry.status === 'authored') {
    if (!caseFiles.has(entry.case_id)) {
      err(`case_registry.json: '${entry.case_id}' marked authored but data/cases/${entry.case_id}.json does not exist`);
    }
  } else if (entry.status === 'planned') {
    if (caseFiles.has(entry.case_id)) {
      warn(`case_registry.json: '${entry.case_id}' marked planned but a case file already exists — mark it authored`);
    } else {
      warn(`case not yet authored: ${entry.case_id}`);
    }
  } else {
    err(`case_registry.json: '${entry.case_id}' has unknown status '${entry.status}'`);
  }
}
for (const [rank, orders] of registryOrderByRank) {
  const sorted = [...orders].sort((a, b) => a - b);
  sorted.forEach((o, i) => {
    if (o !== i + 1) err(`case_registry.json: order_in_rank for rank '${rank}' must be contiguous starting at 1, got ${JSON.stringify(sorted)}`);
  });
}
for (const cf of caseFiles) {
  if (!registryHasCase(cf)) err(`data/cases/${cf}.json exists but is not listed in case_registry.json`);
}

// --- per-case validation ---
const ID_PATTERN = /^(modern|noir|1700s|future)_[0-9]{2,3}_[a-z0-9_]+$/;

for (const cf of caseFiles) {
  const c = loadJson(`cases/${cf}.json`);
  if (!c) continue;
  const label = `cases/${cf}.json`;

  if (c.case_id !== cf) err(`${label}: case_id '${c.case_id}' does not match filename`);
  if (!ID_PATTERN.test(c.case_id)) err(`${label}: case_id '${c.case_id}' fails naming pattern`);
  if (!['career', 'quick'].includes(c.mode)) err(`${label}: invalid mode '${c.mode}'`);
  if (c.mode === 'career' && !rankIds.has(c.rank_required)) err(`${label}: rank_required '${c.rank_required}' not a known rank`);

  const regEntry = (registry?.cases ?? []).find((e) => e.case_id === c.case_id);
  if (regEntry) {
    if (regEntry.rank_required !== c.rank_required) err(`${label}: rank_required '${c.rank_required}' does not match registry '${regEntry.rank_required}'`);
    if (regEntry.order_in_rank !== c.order_in_rank) err(`${label}: order_in_rank ${c.order_in_rank} does not match registry ${regEntry.order_in_rank}`);
    if (regEntry.title !== c.title) warn(`${label}: title '${c.title}' differs from registry title '${regEntry.title}'`);
  }

  if (c.partner_id && !characterIds.has(c.partner_id)) err(`${label}: partner_id '${c.partner_id}' not in characters.json`);

  const evidenceIds = new Set((c.evidence ?? []).map((e) => e.id));
  const clueCount = (c.evidence ?? []).filter((e) => e.is_clue).length;
  if (c.clue_total !== clueCount) err(`${label}: clue_total ${c.clue_total} !== actual is_clue count ${clueCount}`);

  for (const e of c.evidence ?? []) {
    if (e.thread_tag && !breadcrumbIds.has(e.thread_tag)) err(`${label}: evidence '${e.id}' thread_tag '${e.thread_tag}' not in threads.json`);
  }

  const hotspotEvidence = new Set();
  for (const h of c.location_hotspots ?? []) {
    for (const eid of h.evidence_ids ?? []) {
      hotspotEvidence.add(eid);
      if (!evidenceIds.has(eid)) err(`${label}: hotspot '${h.id}' references unknown evidence '${eid}'`);
    }
  }
  for (const eid of evidenceIds) {
    if (!hotspotEvidence.has(eid)) warn(`${label}: evidence '${eid}' is not reachable from any hotspot`);
  }

  const suspectIds = new Set((c.suspects ?? []).map((s) => s.id));
  for (const s of c.suspects ?? []) {
    if (s.character_id && !characterIds.has(s.character_id)) err(`${label}: suspect '${s.id}' character_id '${s.character_id}' not in characters.json`);
  }

  const boardNodeIds = new Set([...evidenceIds, ...suspectIds]);
  for (const bc of c.board_connections ?? []) {
    if (!boardNodeIds.has(bc.from)) err(`${label}: board_connection '${bc.id}' has unknown 'from' id '${bc.from}'`);
    if (!boardNodeIds.has(bc.to)) err(`${label}: board_connection '${bc.id}' has unknown 'to' id '${bc.to}'`);
    if (bc.reveals_suspect && !suspectIds.has(bc.reveals_suspect)) err(`${label}: board_connection '${bc.id}' reveals_suspect '${bc.reveals_suspect}' not a known suspect`);
  }

  const treesById = new Map((c.dialogue_trees ?? []).map((t) => [t.id, t]));
  for (const s of c.suspects ?? []) {
    if (s.dialogue_tree_id && !treesById.has(s.dialogue_tree_id)) err(`${label}: suspect '${s.id}' dialogue_tree_id '${s.dialogue_tree_id}' not found in dialogue_trees`);
  }
  for (const t of c.dialogue_trees ?? []) {
    const nodesById = new Map((t.nodes ?? []).map((n) => [n.id, n]));
    if (!nodesById.has(t.root_node)) err(`${label}: dialogue_tree '${t.id}' root_node '${t.root_node}' not found among its nodes`);
    for (const n of t.nodes ?? []) {
      if (n.locked_until_evidence && !evidenceIds.has(n.locked_until_evidence)) err(`${label}: dialogue node '${n.id}' locked_until_evidence '${n.locked_until_evidence}' not known evidence`);
      for (const opt of n.options ?? []) {
        if (opt.goto !== 'END' && !nodesById.has(opt.goto)) err(`${label}: dialogue node '${n.id}' option goes to unknown node '${opt.goto}'`);
        if (opt.present_evidence_id && !evidenceIds.has(opt.present_evidence_id)) err(`${label}: dialogue node '${n.id}' option presents unknown evidence '${opt.present_evidence_id}'`);
      }
    }
    const reachable = new Set();
    const stack = [t.root_node];
    while (stack.length) {
      const cur = stack.pop();
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      const node = nodesById.get(cur);
      for (const opt of node?.options ?? []) {
        if (opt.goto !== 'END') stack.push(opt.goto);
      }
    }
    for (const n of t.nodes ?? []) {
      if (!reachable.has(n.id)) warn(`${label}: dialogue node '${n.id}' in tree '${t.id}' is unreachable from root`);
    }
  }

  if (!suspectIds.has(c.solution?.correct_suspect)) {
    err(`${label}: solution.correct_suspect '${c.solution?.correct_suspect}' is not a known suspect`);
  } else {
    const guilty = (c.suspects ?? []).find((s) => s.id === c.solution.correct_suspect);
    if (guilty && guilty.is_guilty !== true) err(`${label}: solution.correct_suspect '${guilty.id}' has is_guilty !== true`);
  }
  const guiltyCount = (c.suspects ?? []).filter((s) => s.is_guilty).length;
  if (guiltyCount !== 1) warn(`${label}: expected exactly 1 is_guilty suspect, found ${guiltyCount}`);
  for (const eid of c.solution?.required_evidence ?? []) {
    if (!evidenceIds.has(eid)) err(`${label}: solution.required_evidence references unknown evidence '${eid}'`);
  }

  for (const t of c.consequence_hooks?.wrongful_accusation_targets ?? []) {
    if (!suspectIds.has(t)) err(`${label}: consequence_hooks.wrongful_accusation_targets references unknown suspect '${t}'`);
  }
  for (const npc of c.consequence_hooks?.recurring_npc_spawns ?? []) {
    if (!characterIds.has(npc)) err(`${label}: consequence_hooks.recurring_npc_spawns references unknown character '${npc}'`);
  }

  for (const b of c.rewards?.badges ?? []) {
    if (!badgeIds.has(b)) err(`${label}: rewards.badges references unknown badge '${b}'`);
  }

  for (const tag of c.thread_tags ?? []) {
    if (!breadcrumbIds.has(tag)) err(`${label}: thread_tags references unknown breadcrumb '${tag}'`);
  }
}

// --- report ---
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length > 0 ? 1 : 0);
