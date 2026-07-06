/* RunTheCase engine — vanilla JS, no build step, no dependencies.
   Implements the data contract in data/schema/*.json and the state machine
   in ENGINE-SPEC.md. Loaded as a plain <script> (see index.html); everything
   lives under the global RunTheCase namespace. */
(function (global) {
  'use strict';

  var DATA_BASE = 'data/';
  var SAVE_KEY = 'rtc_save_v1';
  var SAVE_VERSION = 1;
  var TRUST_QUIT_MAX = 19;
  var TRUST_STRAINED_MAX = 49;

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  // ---------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------

  function fetchJson(relPath) {
    return fetch(DATA_BASE + relPath, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('Failed to load ' + relPath + ' (' + res.status + ')');
      return res.json();
    });
  }

  function loadAll() {
    return Promise.all([
      fetchJson('career.json'),
      fetchJson('characters.json'),
      fetchJson('threads.json'),
      fetchJson('badges.json'),
      fetchJson('case_registry.json')
    ]).then(function (results) {
      return {
        career: results[0],
        characters: results[1],
        threads: results[2],
        badges: results[3],
        registry: results[4]
      };
    });
  }

  function loadCase(caseId, registry) {
    var entry = (registry.cases || []).find(function (c) { return c.case_id === caseId; });
    if (!entry) return Promise.reject(new Error('Unknown case_id ' + caseId));
    if (entry.status !== 'authored') return Promise.reject(new Error('Case ' + caseId + ' is not authored yet'));
    return fetchJson(entry.file || ('cases/' + caseId + '.json'));
  }

  function findCharacter(characters, id) {
    return (characters.characters || []).find(function (c) { return c.id === id; }) || null;
  }

  function rankByOrder(career, order) {
    return (career.ranks || []).find(function (r) { return r.order === order; }) || null;
  }

  function rankInfo(career, rankId) {
    return (career.ranks || []).find(function (r) { return r.id === rankId; }) || null;
  }

  function reputationTier(career, reputation) {
    var tiers = (career.reputation && career.reputation.tiers) || [];
    var sorted = tiers.slice().sort(function (a, b) { return a.min - b.min; });
    var current = sorted[0] || null;
    for (var i = 0; i < sorted.length; i++) {
      if (reputation >= sorted[i].min) current = sorted[i];
    }
    return current;
  }

  // ---------------------------------------------------------------------
  // Save state
  // ---------------------------------------------------------------------

  function defaultSave(career, characters) {
    var firstRank = rankByOrder(career, 1);
    var relationships = {};
    (characters.characters || []).forEach(function (c) {
      if (c.relationship_defaults) {
        relationships[c.id] = {
          trust: c.relationship_defaults.trust,
          status: c.relationship_defaults.status
        };
      }
    });
    return {
      version: SAVE_VERSION,
      detective: {
        rank: firstRank ? firstRank.id : 'cadet',
        reputation: career.reputation ? career.reputation.start : 50,
        employment: 'active'
      },
      career_stats: {
        wrongful_accusations: 0,
        cases_given_up: 0,
        clues_found_total: 0,
        clues_possible_total: 0
      },
      casebook: {},
      relationships: relationships,
      flags: {},
      badges_earned: [],
      world: { npc_spawns: [], wronged_suspects: [] }
    };
  }

  function loadSave(career, characters) {
    var raw = null;
    try { raw = global.localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return defaultSave(career, characters);
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_VERSION) return defaultSave(career, characters);
      return parsed;
    } catch (e) {
      return defaultSave(career, characters);
    }
  }

  function persistSave(save) {
    try { global.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable — play continues, just unsaved */ }
  }

  function resetSave() {
    try { global.localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
  }

  function ensureCasebookEntry(save, caseId) {
    if (!save.casebook[caseId]) {
      save.casebook[caseId] = {
        status: 'unopened',
        correct: false,
        shaky: false,
        evidence_logged: [],
        specialists_called: [],
        clues_found: 0,
        hotspots_unlocked: [],
        dialogue_unlocked: [],
        board_connections_made: [],
        phase: 'briefing'
      };
    }
    return save.casebook[caseId];
  }

  // ---------------------------------------------------------------------
  // Open-world case availability (free case selection, ENGINE-SPEC §1
  // normally serves cases strictly in order_in_rank order per rank; this
  // build instead unlocks every authored case at-or-below the player's
  // current rank so any of them can be played, replayed, or left for later)
  // ---------------------------------------------------------------------

  function getCaseBoard(save, registry, career) {
    var currentRank = rankInfo(career, save.detective.rank);
    var currentOrder = currentRank ? currentRank.order : 1;
    return (registry.cases || []).map(function (entry) {
      var rank = rankInfo(career, entry.rank_required);
      var rankUnlocked = rank ? rank.order <= currentOrder : false;
      var cb = save.casebook[entry.case_id];
      return {
        case_id: entry.case_id,
        title: entry.title,
        teaser: entry.teaser,
        rank_required: entry.rank_required,
        order_in_rank: entry.order_in_rank,
        authored: entry.status === 'authored',
        rank_unlocked: rankUnlocked,
        playable: entry.status === 'authored' && rankUnlocked,
        status: cb ? cb.status : 'unopened'
      };
    });
  }

  // ---------------------------------------------------------------------
  // Investigation phase
  // ---------------------------------------------------------------------

  function isHotspotGated(hotspot, cb) {
    if (!hotspot.requires_specialist) return false;
    return (cb.specialists_called || []).indexOf(hotspot.requires_specialist) === -1;
  }

  function callSpecialist(save, caseData, specialist) {
    var cb = ensureCasebookEntry(save, caseData.case_id);
    if (cb.specialists_called.indexOf(specialist) === -1) cb.specialists_called.push(specialist);
    return cb;
  }

  function logEvidence(save, caseData, evidenceId) {
    var cb = ensureCasebookEntry(save, caseData.case_id);
    if (cb.evidence_logged.indexOf(evidenceId) !== -1) return cb;
    var evidence = (caseData.evidence || []).find(function (e) { return e.id === evidenceId; });
    if (!evidence) return cb;
    cb.evidence_logged.push(evidenceId);
    if (evidence.is_clue) cb.clues_found += 1;
    (evidence.unlocks_dialogue || []).forEach(function (d) {
      if (cb.dialogue_unlocked.indexOf(d) === -1) cb.dialogue_unlocked.push(d);
    });
    if (evidence.thread_tag) save.flags['seen_' + evidence.thread_tag] = true;
    return cb;
  }

  function applyBoardConnection(save, caseData, connectionId) {
    var cb = ensureCasebookEntry(save, caseData.case_id);
    if (cb.board_connections_made.indexOf(connectionId) !== -1) return cb;
    var conn = (caseData.board_connections || []).find(function (c) { return c.id === connectionId; });
    if (!conn) return cb;
    cb.board_connections_made.push(connectionId);
    (conn.unlocks_dialogue || []).forEach(function (d) {
      if (cb.dialogue_unlocked.indexOf(d) === -1) cb.dialogue_unlocked.push(d);
    });
    (conn.unlocks_hotspots || []).forEach(function (h) {
      if (cb.hotspots_unlocked.indexOf(h) === -1) cb.hotspots_unlocked.push(h);
    });
    return cb;
  }

  function isHotspotVisible(caseData, hotspot, cb) {
    // A hotspot is visible from the start unless something explicitly unlocked it later.
    var everUnlocked = (caseData.location_hotspots || []).some(function (h) {
      return h.id === hotspot.id;
    });
    if (!everUnlocked) return false;
    var isGatedByConnection = (caseData.board_connections || []).some(function (c) {
      return (c.unlocks_hotspots || []).indexOf(hotspot.id) !== -1;
    });
    if (!isGatedByConnection) return true;
    return cb.hotspots_unlocked.indexOf(hotspot.id) !== -1;
  }

  function isDialogueNodeUnlocked(cb, nodeId) {
    return cb.dialogue_unlocked.indexOf(nodeId) !== -1;
  }

  function getDialogueNode(caseData, treeId, nodeId) {
    var tree = (caseData.dialogue_trees || []).find(function (t) { return t.id === treeId; });
    if (!tree) return null;
    return (tree.nodes || []).find(function (n) { return n.id === nodeId; }) || null;
  }

  function isNodeEnterable(node, cb) {
    if (!node.locked_until_evidence) return true;
    return cb.evidence_logged.indexOf(node.locked_until_evidence) !== -1;
  }

  // ---------------------------------------------------------------------
  // Scoring (ENGINE-SPEC §3)
  // ---------------------------------------------------------------------

  function computeScore(career, caseData, accusation) {
    var solution = caseData.solution;
    var correctSuspect = accusation.suspect_id === solution.correct_suspect;
    var requiredEvidence = solution.required_evidence || [];
    var correctEvidence = requiredEvidence.every(function (eid) {
      return (accusation.cited_evidence || []).indexOf(eid) !== -1;
    });
    var correctMotive = accusation.motive_choice === solution.correct_motive;
    var w = career.scoring;
    var caseScore = w.suspect_weight * (correctSuspect ? 1 : 0) +
      w.evidence_weight * (correctEvidence ? 1 : 0) +
      w.motive_weight * (correctMotive ? 1 : 0);
    var outcome;
    if (!correctSuspect) outcome = 'wrongful';
    else if (!correctEvidence) outcome = 'shaky';
    else outcome = 'solved';
    return {
      correct_suspect: correctSuspect,
      correct_evidence: correctEvidence,
      correct_motive: correctMotive,
      case_score: caseScore,
      outcome: outcome
    };
  }

  // ---------------------------------------------------------------------
  // Consequences (ENGINE-SPEC §4)
  // ---------------------------------------------------------------------

  function applyWrongfulAccusation(save, career, caseData) {
    save.career_stats.wrongful_accusations += 1;
    var count = save.career_stats.wrongful_accusations;
    var curve = career.firing.wrongful_accusation_curve;
    var entry = curve[Math.min(count, curve.length) - 1];
    save.detective.reputation = clamp(save.detective.reputation + entry.reputation_delta, career.reputation.min, career.reputation.max);

    var hooks = caseData.consequence_hooks || {};
    (hooks.recurring_npc_spawns || []).forEach(function (npc) {
      if (save.world.npc_spawns.indexOf(npc) === -1) save.world.npc_spawns.push(npc);
    });
    (hooks.wrongful_accusation_targets || []).forEach(function (target) {
      if (save.world.wronged_suspects.indexOf(target) === -1) save.world.wronged_suspects.push(target);
    });

    // Every wrongful accusation in this build is treated as a partner override —
    // the case data doesn't yet model an explicit "partner advises against this" UI step.
    if (caseData.partner_id && typeof hooks.partner_override_trust_delta === 'number' && save.relationships[caseData.partner_id]) {
      var rel = save.relationships[caseData.partner_id];
      rel.trust = clamp(rel.trust + hooks.partner_override_trust_delta, 0, 100);
      if (rel.trust <= TRUST_QUIT_MAX) rel.status = 'quit';
      else if (rel.trust <= TRUST_STRAINED_MAX) rel.status = 'strained';
      else rel.status = 'active';
    }

    return entry;
  }

  // ---------------------------------------------------------------------
  // Career: promotion + firing (ENGINE-SPEC §6)
  // ---------------------------------------------------------------------

  function checkFiring(save, career) {
    if (save.detective.reputation > career.firing.reputation_floor) return false;
    var count = save.career_stats.wrongful_accusations;
    if (count < 1) return false;
    var curve = career.firing.wrongful_accusation_curve;
    var entry = curve[Math.min(count, curve.length) - 1];
    if (entry.fireable) {
      save.detective.employment = 'fired';
      return true;
    }
    return false;
  }

  function checkPromotion(save, career, registry) {
    var currentRank = rankInfo(career, save.detective.rank);
    if (!currentRank || !currentRank.promotion_gate) return false;
    // Only authored cases count toward closure in this build — the other
    // 42 slots per rank are locked placeholders with no content to attempt yet.
    var rankCases = (registry.cases || []).filter(function (c) {
      return c.rank_required === currentRank.id && c.status === 'authored';
    });
    if (rankCases.length === 0) return false;
    var attempted = 0, closed = 0, solvedOnly = 0, correct = 0;
    rankCases.forEach(function (c) {
      var cb = save.casebook[c.case_id];
      if (!cb || cb.status === 'unopened' || cb.status === 'in_progress') return;
      attempted += 1;
      if (cb.status === 'solved') {
        closed += 1;
        solvedOnly += 1;
        if (cb.correct) correct += 1;
      } else if (cb.status === 'given_up') {
        closed += 1;
      }
    });
    if (attempted < rankCases.length) return false;
    var closureRate = attempted > 0 ? closed / attempted : 0;
    var accuracy = solvedOnly > 0 ? correct / solvedOnly : 0;
    var gate = currentRank.promotion_gate;
    if (gate.min_closure_rate && closureRate < gate.min_closure_rate) return false;
    if (gate.min_accuracy && accuracy < gate.min_accuracy) return false;
    if (gate.min_reputation_tier) {
      var tier = reputationTier(career, save.detective.reputation);
      var tierOrder = (career.reputation.tiers || []).map(function (t) { return t.id; });
      if (!tier || tierOrder.indexOf(tier.id) < tierOrder.indexOf(gate.min_reputation_tier)) return false;
    }
    if (gate.story_gate_case) {
      var gateCb = save.casebook[gate.story_gate_case];
      if (!gateCb || !gateCb.correct) return false;
    }
    var nextRank = rankByOrder(career, currentRank.order + 1);
    if (!nextRank) return false;
    save.detective.rank = nextRank.id;
    return true;
  }

  // ---------------------------------------------------------------------
  // Badges (lightweight subset of §-worthy achievements, spoiler-safe)
  // ---------------------------------------------------------------------

  function awardBadges(save, badgesData, context) {
    var awarded = [];
    function award(id) {
      if (save.badges_earned.indexOf(id) === -1) {
        save.badges_earned.push(id);
        awarded.push(id);
      }
    }
    var solvedCount = Object.keys(save.casebook).filter(function (k) { return save.casebook[k].status === 'solved'; }).length;
    if (context.outcome === 'solved' && solvedCount === 1) award('badge_first_collar');
    if (context.outcome === 'solved' && context.score.correct_suspect && context.score.correct_evidence && context.score.correct_motive) award('badge_airtight_1');
    if (context.cb.clues_found > 0 && context.cb.clues_found === context.caseData.clue_total) award('badge_clean_sweep');
    var breadcrumbsSeen = Object.keys(save.flags).filter(function (f) { return f.indexOf('seen_bc_') === 0 && save.flags[f]; }).length;
    if (breadcrumbsSeen >= 1) award('badge_network_1');
    if (breadcrumbsSeen >= 5) award('badge_network_2');
    if (breadcrumbsSeen >= 15) award('badge_network_3');
    if (context.caseData.partner_id) {
      var rel = save.relationships[context.caseData.partner_id];
      if (rel && rel.trust >= 100) award('badge_partner_ironclad');
      if (rel && rel.status === 'quit' && context.outcome !== 'wrongful') award('badge_lone_wolf');
    }
    return awarded;
  }

  // ---------------------------------------------------------------------
  // RESOLUTION (ENGINE-SPEC §3-6)
  // ---------------------------------------------------------------------

  function resolveCase(state, accusation) {
    var save = state.save, career = state.career, registry = state.registry, badgesData = state.badges, caseData = state.caseData;
    var cb = ensureCasebookEntry(save, caseData.case_id);
    var score = computeScore(career, caseData, accusation);
    var consequence = null;

    if (score.outcome === 'wrongful') {
      consequence = applyWrongfulAccusation(save, career, caseData);
      cb.status = 'in_progress'; // case remains open; player may revise
    } else {
      cb.status = 'solved';
      cb.correct = true;
      cb.shaky = score.outcome === 'shaky';
      save.career_stats.clues_found_total += cb.clues_found;
      save.career_stats.clues_possible_total += caseData.clue_total;
    }
    cb.phase = 'resolution';

    var fired = checkFiring(save, career);
    var promoted = !fired && score.outcome !== 'wrongful' ? checkPromotion(save, career, registry) : false;
    var badgesAwarded = score.outcome !== 'wrongful' ? awardBadges(save, badgesData, { outcome: score.outcome, score: score, cb: cb, caseData: caseData }) : [];

    if (score.outcome !== 'wrongful' && caseData.rewards) {
      (caseData.rewards.badges || []).forEach(function (b) {
        if (save.badges_earned.indexOf(b) === -1) { save.badges_earned.push(b); badgesAwarded.push(b); }
      });
    }

    persistSave(save);
    return { score: score, consequence: consequence, fired: fired, promoted: promoted, badgesAwarded: badgesAwarded };
  }

  function giveUpCase(state) {
    var save = state.save, caseData = state.caseData;
    var cb = ensureCasebookEntry(save, caseData.case_id);
    var pct = caseData.clue_total > 0 ? cb.clues_found / caseData.clue_total : 1;
    var gu = caseData.give_up || { allowed: true, min_investigation_pct: 0.3 };
    if (!gu.allowed || pct < gu.min_investigation_pct) {
      return { ok: false, reason: 'Not enough of the case investigated yet (' + Math.round(pct * 100) + '% found, need ' + Math.round(gu.min_investigation_pct * 100) + '%).' };
    }
    cb.status = 'given_up';
    cb.phase = 'resolution';
    save.career_stats.cases_given_up += 1;
    persistSave(save);
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  global.RunTheCase = {
    loadAll: loadAll,
    loadCase: loadCase,
    findCharacter: findCharacter,
    rankInfo: rankInfo,
    reputationTier: reputationTier,
    Save: {
      KEY: SAVE_KEY,
      createDefault: defaultSave,
      load: loadSave,
      persist: persistSave,
      reset: resetSave,
      ensureCasebookEntry: ensureCasebookEntry
    },
    getCaseBoard: getCaseBoard,
    isHotspotGated: isHotspotGated,
    isHotspotVisible: isHotspotVisible,
    callSpecialist: callSpecialist,
    logEvidence: logEvidence,
    applyBoardConnection: applyBoardConnection,
    isDialogueNodeUnlocked: isDialogueNodeUnlocked,
    getDialogueNode: getDialogueNode,
    isNodeEnterable: isNodeEnterable,
    computeScore: computeScore,
    resolveCase: resolveCase,
    giveUpCase: giveUpCase,
    checkPromotion: checkPromotion,
    checkFiring: checkFiring
  };
})(window);
