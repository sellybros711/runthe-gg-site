/*
 * note.js - the room reads what you wrote with the ruling.
 *
 * THE NOTE USED TO BE A RECORD AND NOTHING ELSE. The paid tier writes its reasoning in a
 * box, the ledger keeps it, the desk quotes it back when the same argument returns, and the
 * screen said, honestly, that the room could not read it. This file is the room reading it.
 *
 * ---- WHAT READING MEANS ----
 *
 * The podium set the precedent and this follows it: WORDS MOVE THE ROOM AND NOTHING ELSE.
 * A note never touches the ledger, never moves revenue or health, never lights a fuse. What
 * it does is change how a group takes the ruling it rides along with, and only in one
 * direction: a group whose grievance you answered in writing is SOFTENED, never delighted.
 * Being told why hurts less than being ignored. It never flips a loss into a win, because
 * the presidents do not start liking a deposition on the strength of a well-written memo
 * about it.
 *
 * ---- HOW A GRIEVANCE IS FOUND ----
 *
 * The same arithmetic the room already runs, read backwards. blocs.js scores a ruling for
 * each group as a dot product of the group's weights and the ruling's push; the group's
 * grievance is whichever axis contributed the most negative part of that product. A note
 * answers a group when it names the group outright or speaks to that axis in the words a
 * person would actually use for it. The vocabulary is small and plain on purpose: this is
 * a keyword read, it is deterministic, and it should be legible enough that a player can
 * learn what the room listens for.
 *
 * ---- WHAT KEEPS IT FROM BEING A MAGIC WORD ----
 *
 * Three rules, each doing one job:
 *
 *   a note under 20 characters is not read. A note is a sentence, not a word
 *   a note that raises three or more concerns is DIFFUSE and answers nobody. A memo about
 *     everything is a memo about nothing, and it is also what pasting the whole vocabulary
 *     into the box looks like
 *   the soften is 30% of the anger, capped at 2.0 points. The room hears you out; it does
 *     not change its mind
 *
 * DETERMINISTIC AND PURE. Same words, same rows, same answer, so a term replays and the
 * forecast cannot disagree with the ruling.
 *
 * Headless and dependency-light. Browser: window.PS_CFB_NOTE. Node: require('./note.js').
 */
(function (root) {
  'use strict';

  var B = root.PS_CFB_BLOCS || (typeof require === 'function' ? require('./blocs.js') : null);

  var MIN_LEN = 20;
  var DIFFUSE_AT = 3;
  var SOFTEN_FRAC = 0.30;
  var SOFTEN_MAX = 2.0;
  /* Below this a group is not angry enough to need answering, and softening a shrug by a
     tenth of a point is a number on a screen with no meaning in it. */
  var ANGER_FLOOR = -0.5;

  /* ---- the vocabulary ----
     One force, its plain words. Deliberately disjoint between forces: "share" could be
     money or labour and so it is neither, because a word that matches two forces makes the
     diffuse rule fire on a note that raised one concern carefully. */
  var VOCAB = {
    money: ['money', 'revenue', 'pool', 'distribution', 'distributions', 'dollars', 'payout', 'payouts'],
    access: ['access', 'path', 'door', 'bid', 'bids', 'seat', 'entry', 'qualify', 'qualifies'],
    autonomy: ['decide', 'decides', 'decided', 'authority', 'control', 'governance', 'charter', 'bylaw', 'bylaws', 'jurisdiction'],
    cost: ['cost', 'costs', 'bill', 'bills', 'budget', 'budgets', 'expense', 'expenses', 'afford', 'pocket', 'price'],
    tradition: ['tradition', 'traditions', 'history', 'rivalry', 'rivalries', 'heritage', 'bowl', 'bowls'],
    inventory: ['schedule', 'schedules', 'window', 'windows', 'broadcast', 'kickoff', 'kickoffs', 'slate', 'inventory', 'television'],
    labour: ['player', 'players', 'owed', 'wage', 'wages', 'salary', 'salaries', 'union', 'contract', 'contracts', 'employment', 'employee', 'employees'],
    exposure: ['sue', 'sued', 'sues', 'lawsuit', 'lawsuits', 'court', 'courts', 'legal', 'liability', 'deposition', 'depositions'],
  };
  var FORCES = Object.keys(VOCAB);

  /* Naming a group is answering it directly, and it does not count toward the diffuse
     rule: "the fans keep the Rose Bowl" names one group and one concern, not three. */
  var GROUP_WORDS = {
    SEC: ['sec'],
    'Big Ten': ['big ten'],
    ACC: ['acc'],
    'Big 12': ['big 12', 'big twelve'],
    'Group of Five': ['group of five'],
    Networks: ['network', 'networks', 'broadcaster', 'broadcasters'],
    Players: ['player', 'players'],
    Presidents: ['president', 'presidents'],
    Fans: ['fan', 'fans'],
  };

  function has(text, word) {
    /* \b treats "big 12" fine (space is a non-word char) and keeps "acc" out of
       "according", which is the failure a bare indexOf ships. */
    return new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(text);
  }

  /* What the note is about: which forces it speaks to, which groups it names, and whether
     it is too short to read or too scattered to answer anybody. */
  function read(text) {
    var t = String(text || '').toLowerCase();
    var short = t.replace(/\s+/g, ' ').trim().length < MIN_LEN;
    var forces = FORCES.filter(function (f) {
      return VOCAB[f].some(function (w) { return has(t, w); });
    });
    var groups = Object.keys(GROUP_WORDS).filter(function (g) {
      return GROUP_WORDS[g].some(function (w) { return has(t, w); });
    });
    return { short: short, diffuse: forces.length >= DIFFUSE_AT, forces: forces, groups: groups };
  }

  /* The axis a group is angriest about in THIS ruling: the most negative term of the same
     dot product blocs.js scored them with. Null when nothing pushed them negative, which
     also means there is nothing for a note to answer. */
  function grievanceOf(blocId, edit) {
    var b = B && B.BY_ID ? B.BY_ID[blocId] : null;
    if (!b) return null;
    var fx = (edit && edit.effects) || {};
    var aimed = ((edit && edit.aimed) || {})[blocId] || {};
    var worst = null, low = 0;
    for (var axis in b.w) {
      var push = (fx[axis] || 0) + (aimed[axis] || 0);
      var c = b.w[axis] * push;
      if (c < low) { low = c; worst = axis; }
    }
    return worst;
  }

  /* The whole feature in one call. `rows` is blocs.react() on the same edit; what comes
     back is which angry groups the note answered and by how much each is softened. The
     caller re-runs react with the soften map, so the quote, the mood and the number all
     come from one place. */
  function temper(text, rows, edit) {
    var r = read(text);
    var out = { any: false, soften: {}, read: [], forces: r.forces, groups: r.groups,
      short: r.short, diffuse: r.diffuse };
    if (r.short || r.diffuse) return out;
    if (!r.forces.length && !r.groups.length) return out;
    (rows || []).forEach(function (row) {
      if (!(row.delta <= ANGER_FLOOR)) return;
      var named = r.groups.indexOf(row.id) >= 0;
      var axis = grievanceOf(row.id, edit);
      if (!named && !(axis && r.forces.indexOf(axis) >= 0)) return;
      var s = Math.round(Math.min(SOFTEN_MAX, Math.abs(row.delta) * SOFTEN_FRAC) * 10) / 10;
      if (s <= 0) return;
      out.soften[row.id] = s;
      out.read.push(row.id);
      out.any = true;
    });
    return out;
  }

  var api = { read: read, temper: temper, grievanceOf: grievanceOf,
    VOCAB: VOCAB, GROUP_WORDS: GROUP_WORDS, FORCES: FORCES,
    MIN_LEN: MIN_LEN, DIFFUSE_AT: DIFFUSE_AT, SOFTEN_FRAC: SOFTEN_FRAC,
    SOFTEN_MAX: SOFTEN_MAX, ANGER_FLOOR: ANGER_FLOOR };
  root.PS_CFB_NOTE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
