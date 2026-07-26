/* RunTheHouse, the post-game recap.
 *
 * Headless and dependency-free. Browser: window.RH_RECAP. Node: require.
 *
 * GDD §1 makes one promise above all the others:
 *
 *   "No vote is random. If someone flips on you, there is a traceable chain of
 *    trust decay, alliance pressure, or threat perception behind it. Post game,
 *    the player can inspect that chain. That is the replay hook."
 *
 * Everything else in this project exists to make that sentence true, and until
 * this file existed it was not. The simulation kept a complete record and
 * showed the player a results table. This turns the record into the chain.
 *
 * ── WHAT MAKES A REASON A REASON ───────────────────────────────────────────
 *
 * engine.evictScore now fills a `why` breakdown on every vote: the four
 * weighted terms and the volatility noise. The dominant term IS the reason, and
 * naming it is the difference between "they voted you out" and "they voted you
 * out because their alliance asked them to and they were never that close to
 * you anyway".
 *
 * The one that matters most is `noise`. When volatility dominates, the honest
 * sentence is that there was no good reason, and the recap says so. A model
 * that always produces a tidy motive is lying about itself.
 *
 * ── NOTHING HERE COMPUTES ──────────────────────────────────────────────────
 *
 * This file only reads. It never touches an RNG stream, never mutates state,
 * and never recalculates a decision, because a recap that re-derives its own
 * facts can disagree with what actually happened. Everything below comes out of
 * WeekLog, the events list and the final relationship matrices.
 */

'use strict';

/* WRAPPED IN AN IIFE. See the note in rng.js. */
(function () {

const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;
const PW = (typeof require !== 'undefined') ? require('./powers.js') : window.RH_POWERS;

// ─── why one person voted the way they did ───────────────────────────────────

/*
 * Ordered by which term dominated. `noise` sits in the list on purpose: a
 * Wildcard acting against their own maths is a real explanation and pretending
 * otherwise would make every recap read as tidier than the simulation is.
 */
const REASONS = {
  trust:    { them: 'liked the other one more',        you: 'liked the other one more than you' },
  threat:   { them: 'read them as the dangerous one',  you: 'read you as the dangerous one' },
  pressure: { them: 'was told to by an alliance',      you: 'was told to by an alliance' },
  panel:    { them: 'could not beat them at the end',  you: 'did not think they could beat you' },
  noise:    { them: 'had no good reason at all',       you: 'had no good reason at all' },
  /* Not a term in evictScore. It is the second pass: a voter who privately
     wanted the other one and went where the house was going anyway. Without it
     the recap invented a private reason for a vote that did not have one. */
  house:    { them: 'went where the house was going',  you: 'went where the house was going' },
};

/*
 * Which consideration SEPARATED the two nominees. engine.resolveEviction stores
 * the delta rather than the absolute breakdown for exactly this: read
 * absolutely, the trust term is nearly always the biggest number because it
 * carries the heaviest weight, and every line of the recap came out identical.
 */
function dominant(why) {
  if (!why) return null;
  /* Coalescence outranks everything, because it is the only case where the
     voter's own maths pointed the other way and lost. */
  if (why.followedHouse) return 'house';
  /* Volatility is only the reason when it actually reversed the decision. See
     the note in engine.resolveEviction. */
  if (why.flipped) return 'noise';
  const terms = [
    ['trust', Math.abs(why.trust || 0)],
    ['threat', Math.abs(why.threat || 0)],
    ['pressure', Math.abs(why.pressure || 0)],
    ['panel', Math.abs(why.panel || 0)],
  ];
  terms.sort((a, b) => b[1] - a[1]);
  return terms[0][0];
}

/** One sentence for one vote, from the voter's point of view. */
function whyVote(state, vote) {
  const voter = state.cast[vote.voter], target = state.cast[vote.target];
  const atYou = vote.target === state.human;
  const byYou = vote.voter === state.human;
  const key = dominant(vote.why);
  const broke = vote.promisedTarget != null && vote.promisedTarget !== vote.target;
  const reason = REASONS[key] ? (atYou ? REASONS[key].you : REASONS[key].them) : 'made their own maths work';

  /* Second person when it was you doing the voting. Without this the recap
     narrated the player's own ballots in the third person: "You voted out
     Tamsin. They read them as the dangerous one." */
  const who = byYou ? 'You' : voter.first;
  const did = byYou ? 'You' : 'They';
  /* "Andrea voted out yourself" was the first draft of this line. */
  const object = atYou ? 'you out' : `out ${target.first}`;
  let line = `${who} voted ${object}. ${did} ${reason}.`;
  if (broke) line += ` ${did} had said ${byYou ? 'you were' : 'they were'} voting ${state.cast[vote.promisedTarget].first}.`;
  if (vote.why && vote.why.allied) {
    line += (atYou || byYou) ? ' You were supposed to be working together.'
      : ' They were in an alliance with them.';
  }
  /* A vote that was nearly the other way is worth saying so. */
  if (vote.why && vote.why.margin != null && Math.abs(vote.why.margin) < 4) {
    line += ' It was close.';
  }
  return { text: line, key, broke, voter: vote.voter, target: vote.target };
}

// ─── the week ────────────────────────────────────────────────────────────────

function weekRecap(state, w) {
  const nm = (id) => (id == null ? null : state.cast[id].first);
  const full = (id) => (id == null ? null : state.cast[id].name);

  if (w.final3) {
    return {
      week: w.week, final3: true,
      headline: `${nm(w.winner)} won the last competition and took ${nm(w.kept)}.`,
      beats: [`${full(w.evicted)} was cut at Final 3.`],
      votes: [], powers: [], blame: [],
    };
  }

  const beats = [];
  beats.push(`${nm(w.captain)} took the Captaincy.`);
  if (w.rations && w.rations.length) {
    beats.push(`Rations went to ${w.rations.map(nm).join(', ')}.`);
  }
  /* The two the Captain NAMED, not the post-ceremony block. */
  beats.push(`${nm(w.captain)} named ${(w.nominees || w.atRisk).map(nm).join(' and ')} At Risk.`);
  if (w.nomMode === 'pawn' && w.hohPawn != null) {
    beats.push(`${nm(w.hohPawn)} was the pawn. ${nm(w.hohTarget)} was the point of the week.`);
  } else if (w.nomMode === 'backdoor' && w.hohTarget != null) {
    beats.push(w.backdoorLanded
      ? `Neither of those names was the target. ${nm(w.hohTarget)} was.`
      : `${nm(w.captain)} was setting up ${nm(w.hohTarget)} and never got the seat open.`);
  }
  if (w.vetoHolder != null) {
    beats.push(w.vetoUsed
      ? `${nm(w.vetoHolder)} used the Veto`
        + `${w.savedId === w.vetoHolder ? ' on themselves' : (w.savedId != null ? ` on ${nm(w.savedId)}` : '')}`
        + `${w.replacement != null ? `, and ${nm(w.replacement)} went up instead` : ''}.`
      : `${nm(w.vetoHolder)} held the Veto and left the names alone.`);
  }
  /* The line the format is actually about: the Captain had a plan, the house
     had a majority, and one of them was wrong. */
  if (w.hohTarget != null && w.atRisk.indexOf(w.hohTarget) !== -1 && w.evicted !== w.hohTarget) {
    beats.push(`${nm(w.captain)} wanted ${nm(w.hohTarget)} gone. The house went the other way.`);
  }

  const powers = (state.events || [])
    .filter((e) => e.kind === 'power_played' && e.week === w.week)
    .map((e) => {
      const d = PW.POWERS[e.kind === 'power_played' ? e.kind : ''] || PW.POWERS[e.kind];
      const def = PW.POWERS[e.kind] || null;
      const name = (PW.POWERS[e.kind] && PW.POWERS[e.kind].name) || e.kind;
      if (e.kind === 'diamond') {
        return `${nm(e.holder)} played the Diamond Veto: ${nm(e.save)} came off, ${nm(e.replace)} went up, and the Captain had no say.`;
      }
      if (e.kind === 'veto_pick') return `${nm(e.holder)} used Veto Player Selection on ${nm(e.pick)}.`;
      if (e.kind === 'safety') return `${nm(e.holder)} played a Week of Safety.`;
      if (e.kind === 'extra_vote') return `${nm(e.holder)} cast two votes. ${e.why ? `They ${e.why}.` : ''}`.trim();
      if (e.kind === 'back_to_back') return `${nm(e.holder)} played the Captain Comp they were barred from.`;
      return `${nm(e.holder)} played ${name}.`;
    });

  const votes = (w.votes || []).map((v) => whyVote(state, v));
  const broken = votes.filter((v) => v.broke);

  const blame = (w.blame || []).map((b) => ({
    text: `${nm(b.accuser)} decided it was ${nm(b.blamed)}.`,
    correct: b.correct,
    accuser: b.accuser, blamed: b.blamed,
  }));

  const counts = Object.keys(w.tally || {}).map((k) => `${nm(Number(k))} ${w.tally[k]}`).join(', ');
  let headline = `${full(w.evicted)} was evicted, ${counts}.`;
  if (w.soleVote != null) headline += ` ${nm(w.soleVote)} cast the only vote.`;
  else if (w.tieBreak != null) headline += ` ${nm(w.tieBreak)} broke the tie.`;

  return {
    week: w.week, leg: w.leg || 1,
    headline, beats, powers, votes, blame,
    broken: broken.length,
    evicted: w.evicted,
    captain: w.captain,
  };
}

// ─── what you got wrong ──────────────────────────────────────────────────────

/**
 * Belief against truth, for every person who was ever in the house with you.
 *
 * `gap` is signed on purpose. Being wrong in the flattering direction, thinking
 * somebody was closer to you than they were, is a different mistake from being
 * wrong the other way, and it is the one that gets people evicted.
 */
function reads(state) {
  const me = state.human;
  return state.cast.filter((p) => p.id !== me).map((p) => {
    const believed = state.rel.belief[me][p.id].v;
    const truth = state.rel.trust[p.id][me];
    return {
      id: p.id, name: p.name, archetype: p.archetype, place: p.place,
      believed: E.band(believed), truth: E.band(truth),
      wrong: E.band(believed).label !== E.band(truth).label,
      flattered: believed > truth + 12,
      gap: believed - truth,
      lastSpoke: state.rel.belief[me][p.id].week,
      suspicion: state.rel.suspicion[p.id][me],
    };
  });
}

// ─── the chain that ended your run ───────────────────────────────────────────

/**
 * The single most important screen in the recap: why YOU went home, or how you
 * survived the vote that nearly got you.
 *
 * Walks back from the player's exit and assembles the causes in order. This is
 * what §1 means by inspecting the chain, and it is the one place a player finds
 * out that the person they trusted most had been lying since week four.
 */
function yourChain(state) {
  const me = state.human;
  const chain = [];
  const mine = state.cast[me];

  const exit = state.weeks.filter((w) => w.evicted === me)[0];

  if (!exit) {
    /* You made the end. The chain is the Panel instead. */
    const res = state.result;
    if (!res) return chain;
    const won = res.winner === me;
    chain.push({ kind: 'result', text: won
      ? 'You won. Seven people who you put through this decided you deserved it.'
      : 'You lost the Panel vote.' });
    for (const d of (res.detail || [])) {
      const j = state.cast[d.juror];
      chain.push({ kind: 'juror',
        text: `${j.name} voted for ${state.cast[d.voted].first}.`,
        detail: `They left in week ${j.evictedWeek}, bitterness ${Math.round(j.bitterness)} out of 100`
          + `${(mine.namedBy || []).length && j.namedBy && j.namedBy.indexOf(me) !== -1 ? ', and you had put them At Risk' : ''}.`,
        good: d.voted === me });
    }
    return chain;
  }

  chain.push({ kind: 'exit', text: `You were evicted in week ${exit.week}, finishing ${mine.place} of ${state.cast.length}.` });

  if (exit.tally) {
    const counts = Object.keys(exit.tally).map((k) => `${state.cast[Number(k)].first} ${exit.tally[k]}`).join(', ');
    chain.push({ kind: 'tally', text: `The vote was ${counts}.` });
  }

  const against = (exit.votes || []).filter((v) => v.target === me);
  for (const v of against) {
    const w = whyVote(state, v);
    chain.push({ kind: 'vote', text: w.text, key: w.key, broke: w.broke, who: v.voter });
  }

  /* The nomination that put you there, and who did it. */
  if (exit.captain != null) {
    chain.push({ kind: 'named',
      text: `${state.cast[exit.captain].name} put you up. By then you read ${E.band(state.rel.trust[exit.captain][me]).label.toLowerCase()} to them.` });
  }

  /* Anybody who was lying to your face on the way out. A player who thought
     they were Solid with somebody who wanted them gone should find out. */
  const liars = reads(state).filter((r) => r.flattered && r.gap > 25)
    .sort((a, b) => b.gap - a.gap).slice(0, 3);
  for (const l of liars) {
    chain.push({ kind: 'lie',
      text: `You had ${l.name} down as ${l.believed.label.toLowerCase()}. They were ${l.truth.label.toLowerCase()}.` });
  }

  return chain;
}

// ─── alliances over the run ──────────────────────────────────────────────────

function allianceHistory(state) {
  return state.alliances.map((a) => ({
    id: a.id,
    members: a.members.map((m) => state.cast[m].first),
    formed: a.formedWeek,
    died: a.alive ? null : (a.diedWeek || null),
    alive: a.alive,
    strength: Math.round(a.strength),
    hadYou: a.members.indexOf(state.human) !== -1,
    youKnew: a.known && a.known[state.human] != null,
  }));
}

// ─── the whole thing ─────────────────────────────────────────────────────────

function build(state) {
  return {
    seed: state.seed,
    weeks: state.weeks.map((w) => weekRecap(state, w)),
    reads: reads(state),
    chain: yourChain(state),
    alliances: allianceHistory(state),
    powers: (state.powers || []).map((p) => ({
      kind: p.kind,
      name: (PW.POWERS[p.kind] || {}).name || p.kind,
      holder: state.cast[p.holder].name,
      wasYou: p.holder === state.human,
      week: p.awardedWeek,
      used: p.used, usedWeek: p.usedWeek,
      victim: p.victim != null ? state.cast[p.victim].name : null,
      victimWasYou: p.victim === state.human,
    })),
    stats: {
      place: state.cast[state.human].place,
      compWins: state.cast[state.human].compWins.length,
      captaincies: state.cast[state.human].weeksAsCaptain,
      timesAtRisk: state.cast[state.human].timesAtRisk,
      thrown: state.cast[state.human].compsThrown.length,
      misread: reads(state).filter((r) => r.wrong).length,
      flattered: reads(state).filter((r) => r.flattered).length,
    },
  };
}

const api = { build, weekRecap, whyVote, dominant, reads, yourChain, allianceHistory, REASONS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_RECAP = api;

})();
