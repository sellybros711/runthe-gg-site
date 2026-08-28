/* WHERE THE BIG GAMES ARE PLAYED, AND WHOSE NAME IS ON THEM.
 *
 *   node cfb/build/test/commish/test_venues.mjs
 *
 * This module is a catalog, which is the kind of file that goes wrong quietly. A bowl
 * pointing at a stadium that is not in the list renders a brief about "its city". A venue
 * priced so that one city dominates every bid makes the item a formality. A sponsor with the
 * same name twice makes one of them unreachable. None of that throws.
 *
 * And the items built on it have a failure the rest of the docket does not: their options are
 * computed, so an option whose label comes back undefined is a button with nothing written on
 * it, and one whose edit comes back empty is a decision that does nothing.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(import.meta.dirname, '../../../..');
import { leagueTeams } from './league.mjs';
const L = require(ROOT + '/cfb/commish/ledger.js');
const D = require(ROOT + '/cfb/commish/docket.js');
const S = require(ROOT + '/cfb/commish/season.js');
const V = require(ROOT + '/cfb/commish/venues.js');
const SIT = require(ROOT + '/cfb/commish/situation.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = leagueTeams(ROOT);

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world = () => L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 3 });

console.log('\n=== the catalog holds together ===');
{
  const ids = V.VENUES.map((v) => v.id);
  ok('every host site has a unique id', new Set(ids).size === ids.length, ids.length + ' sites');
  const missing = V.VENUES.filter((v) => !v.name || !v.city || !v.state || !v.note);
  ok('  and a name, a city and a sentence about it', !missing.length,
    missing.map((v) => v.id).join(', ') || 'all of them');
  /* A BOWL POINTING AT A STADIUM NOBODY HAS renders "its city" in a brief and nothing fails. */
  const orphan = V.BOWLS.filter((b) => !V.venue(b.venue));
  ok('every bowl is played somewhere that exists', !orphan.length,
    orphan.map((b) => b.id + ' -> ' + b.venue).join(', ') || V.BOWLS.length + ' bowls');
  const sids = V.SPONSORS.map((s) => s.id);
  ok('  and every sponsor is its own offer', new Set(sids).size === sids.length,
    sids.length + ' sponsors');
  const noPitch = V.SPONSORS.filter((s) => !s.pitch || !s.name);
  ok('  with something to say for itself', !noPitch.length, noPitch.map((s) => s.id).join(', ') || 'all of them');

  /* THE LEDGER LISTS THE BOWLS THAT CAN BE SOLD, because applyEdit throws on a path the world
     does not have. The two lists cannot check each other and drifting apart makes a whole
     item unrulable, so they are checked here. */
  const w = world();
  const keyed = Object.keys(w.brand.bowls);
  const bad1 = keyed.filter((k) => !V.bowl(k));
  ok('every bowl the ledger can sell is a bowl', !bad1.length, bad1.join(', ') || keyed.join(', '));
  const majors = V.BOWLS.filter((b) => b.tier === 3).map((b) => b.id);
  const bad2 = majors.filter((m) => keyed.indexOf(m) < 0);
  ok('  and every major bowl can be sold', !bad2.length, bad2.join(', ') || majors.length + ' majors');
}

console.log('\n=== a note about a site does not name the wrong month ===');
{
  /* THE CATALOG'S NOTES ARE READ BY ITEMS IN TWO DIFFERENT SEASONS. Charlotte was "outdoors in
     December" and MetLife was "in January", which is true of the item that places the title
     game and false of the item that places WEEK ONE, the last Saturday in August, which reads
     the same field. A player picked a neutral site for the opener, was told it would be
     outdoors in December, and asked whether the season now started in December.

     `note` is the place and is true whenever the game is played. `cold` is the January
     sentence and only winter items ask for it. */
  const MONTH = /\b(January|February|March|April|May|June|July|August|September|October|November|December|winter|midwinter)\b/i;
  const leak = V.VENUES.filter((v) => MONTH.test(v.note));
  ok('no site describes itself by a month', !leak.length,
    leak.map((v) => v.city + ': ' + (v.note.match(MONTH) || [])[0]).join(', ')
      || V.VENUES.length + ' sites');
  /* AND THE WINTER SENTENCE STILL EXISTS, or splitting them would just have deleted the good
     line about a January in the Bronx. */
  const cold = V.VENUES.filter((v) => v.cold);
  ok('  and the ones that need a winter line have one', cold.length >= 3,
    cold.map((v) => v.city).join(', '));
  ok('  which only shows when asked for', cold.every((v) => {
    return V.siteNote(v, false) === v.note && V.siteNote(v, true).indexOf(v.cold) > 0;
  }));

  /* THE ITEM THAT CAUSED IT, CHECKED DIRECTLY. Week one is in August, so nothing it renders
     may name a month at all. */
  const w1 = D.BY_ID['kickoff-game'];
  const cw = w1.cast(world(), L, E.createSeededRNG(9));
  const bodies = (w1.options || []).map((o) => String(D.text(o.body, cw, w1)));
  const wrong = bodies.filter((b2) => MONTH.test(b2) && !/August/i.test(b2));
  ok('  so week one never mentions a month that is not August', !wrong.length,
    wrong.map((b2) => (b2.match(MONTH) || [])[0]).join(', ') || bodies.length + ' options');
}

console.log('\n=== an offer the brief names is an offer you can take ===');
{
  /* THE BUG THIS CATCHES. `playoff-naming` draws three sponsors, lists all three by name in
     the brief, and shipped with options for two of them and a refusal. A player read about an
     airline that wanted its name on the playoff and was never given the airline.

     The check is general rather than about that one item: for every item whose cast carries
     `offers`, the number of offers drawn has to equal the number of options that take one. An
     item that draws four and offers three fails here rather than on somebody's screen. */
  const withOffers = D.ITEMS.filter((it) => {
    if (!it.cast) return false;
    let c; try { c = it.cast({ membership: {} }, L, () => 0.42); } catch (e) { return false; }
    return !!(c && Array.isArray(c.offers));
  });
  ok('the docket has items that deal a list of offers', withOffers.length > 0,
    withOffers.map((it) => it.id).join(', '));

  const short = [];
  withOffers.forEach((it) => {
    const c = it.cast({ membership: {} }, L, () => 0.42);
    /* An option TAKES an offer if resolving it writes a sponsor id the cast drew. */
    const ids = c.offers.map((o) => o.id);
    let takers = 0;
    (it.options || []).forEach((o) => {
      let e; try { e = D.resolve(it, o.id, {}, c); } catch (x) { return; }
      const vals = Object.keys(e.set || {}).map((k) => String(e.set[k]));
      if (vals.some((v) => ids.indexOf(v) >= 0)) takers++;
    });
    if (takers !== c.offers.length) {
      short.push(it.id + ': ' + c.offers.length + ' offered, ' + takers + ' takeable');
    }
  });
  ok('  and every offer it names can actually be taken', !short.length,
    short.join(', ') || withOffers.length + ' items, every offer takeable');

  /* AND EVERY OFFER IS A BRAND RATHER THAN A CATEGORY, which is the difference between
     filling in a form and making a decision. The archetype survives as `kind` and still
     carries every number. */
  const noBrand = V.SPONSORS.filter((s) => !s.name || !s.kind || /^(a|an) /i.test(s.name));
  ok('  and every sponsor has a name of its own', !noBrand.length,
    noBrand.map((s) => s.id).join(', ') || V.SPONSORS.length + ' brands over ' + V.SPONSORS.length + ' archetypes');
}

console.log('\n=== every bowl knows what its own name is for ===');
{
  /* THE ITEM ABOUT A BOWL MOVING READS THIS AND NOTHING ELSE. It used to assume the name was
     the city, so it argued "a bowl named after a place is named after the place" about the
     PINSTRIPE Bowl, which is named after a baseball uniform and plays in that club's park. A
     bowl with no `named` block would put that sentence straight back on the screen, so the
     block is required rather than optional. */
  const KINDS = ['club', 'city', 'local', 'free'];
  const noName = V.BOWLS.filter((b) => !b.named || !b.named.of || !b.named.gone);
  ok('every bowl says what it is named after and what moving costs the name', !noName.length,
    noName.map((b) => b.id).join(', ') || V.BOWLS.length + ' bowls');
  const badKind = V.BOWLS.filter((b) => b.named && KINDS.indexOf(b.named.kind) < 0);
  ok('  under one of the four kinds', !badKind.length,
    badKind.map((b) => b.id + ' -> ' + b.named.kind).join(', ') || KINDS.join(', '));
  /* `bind` SCALES WHAT MOVING COSTS, so a value outside the range silently prices a ruling at
     something the rest of the docket has no scale for. */
  const badBind = V.BOWLS.filter((b) => b.named
    && !(typeof b.named.bind === 'number' && b.named.bind >= 0 && b.named.bind <= 1));
  ok('  with a bind between 0 and 1', !badBind.length,
    badBind.map((b) => b.id).join(', ') || 'all of them');
  /* ALL FOUR KINDS IN PLAY. Three of them collapsing to one wording is the same item four
     times, which is the thing this whole block exists to stop. */
  const seen = {};
  V.BOWLS.forEach((b) => { if (b.named) seen[b.named.kind] = (seen[b.named.kind] || 0) + 1; });
  ok('  and all four kinds turn up in the catalog', KINDS.every((k) => seen[k] > 0),
    KINDS.map((k) => k + ' ' + (seen[k] || 0)).join(', '));

  /* A HOME IS NOT A BID. Four of these buildings are somebody's home ground and belong to no
     shortlist: a fifteen thousand seat ground in Nassau turning up as a playoff site is the
     failure this flag exists to prevent. */
  const homes = V.VENUES.filter((v) => v.host === false).map((v) => v.id);
  ok('the homes are excluded from a shortlist', homes.length > 0
    && [0.1, 0.3, 0.5, 0.7, 0.9].every((seed) => {
      let i = 0;
      const rng = () => [0.1, 0.44, 0.77, 0.2, 0.61, 0.05, 0.9, 0.35][(i++) % 8] * seed / 0.5 % 1;
      return V.shortlist(rng, 6, {}).every((v) => homes.indexOf(v.id) < 0);
    }), homes.join(', '));
  ok('  but can still be asked for by name', homes.every((id) => !!V.venue(id)));
}

console.log('\n=== a bid is a decision rather than a formality ===');
{
  /* IF ONE CITY WINS ON EVERY AXIS the item is a button that says "pick the good one". */
  const scored = V.VENUES.map((v) => {
    const e = V.effectsOf(v, 1);
    return { id: v.id, money: e.money || 0, tradition: e.tradition || 0,
      access: e.access || 0, inventory: e.inventory || 0, exposure: e.exposure || 0 };
  });
  const best = (k) => scored.slice().sort((a, b) => b[k] - a[k])[0].id;
  const winners = new Set(['money', 'tradition', 'access', 'inventory', 'exposure'].map(best));
  ok('no single city is the best answer to everything', winners.size >= 3,
    [...winners].join(', ') + ' each win something');
  /* AND THE MONEY AND THE HISTORY PULL AGAINST EACH OTHER, or there is no trade to make. */
  const rich = scored.slice().sort((a, b) => b.money - a.money)[0];
  const old = scored.slice().sort((a, b) => b.tradition - a.tradition)[0];
  ok('  the biggest check is not the most history', rich.id !== old.id,
    rich.id + ' pays most, ' + old.id + ' has most history');
  /* A ROOF IS WORTH SOMETHING, or the weather is a detail rather than a decision. */
  const domes = V.VENUES.filter((v) => v.dome), open = V.VENUES.filter((v) => !v.dome);
  const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  ok('  and a roof is worth something', mean(domes.map((v) => v.risk)) < mean(open.map((v) => v.risk)) / 2,
    'dome risk ' + mean(domes.map((v) => v.risk)).toFixed(3)
    + ' vs open ' + mean(open.map((v) => v.risk)).toFixed(3));
}

console.log('\n=== the venue really changes what the final draws ===');
{
  /* THE CLAIM: the one game this office places is worth more in some places than others. */
  const at = (id) => {
    let t = 0;
    for (let s = 0; s < 6; s++) {
      const w = world();
      w.venues.title = id;
      const sim = S.play(w, teams, E.createSeededRNG(500 + s),
        { through: S.WEEKS, titles: true, bracket: true });
      const last = sim.bracket.rounds[sim.bracket.rounds.length - 1][0];
      t += last.viewers;
    }
    return t / 6;
  };
  const vegas = at('lv'), dublin = at('dub'), none = at(null);
  ok('the final is worth more in one city than another', vegas > dublin * 1.15,
    vegas.toFixed(1) + 'M in Las Vegas vs ' + dublin.toFixed(1) + 'M in Dublin');
  ok('  and placing it at all is a decision against not placing it',
    Math.abs(vegas - none) > 0.5 && Math.abs(dublin - none) > 0.5,
    none.toFixed(1) + 'M with nowhere decided');
  /* AND ONLY THE FINAL. The earlier rounds are on campus or wherever the bracket put them,
     which is playoff.sites and a different argument entirely. */
  const firstRound = (id) => {
    const w = world();
    w.venues.title = id;
    const sim = S.play(w, teams, E.createSeededRNG(500),
      { through: S.WEEKS, titles: true, bracket: true });
    return sim.bracket.rounds[0].reduce((t, g) => t + g.viewers, 0);
  };
  ok('  and it does not move the first round', firstRound('lv') === firstRound('dub'),
    firstRound('lv').toFixed(1) + 'M either way');
}

console.log('\n=== an item whose options are cities still works ===');
{
  const w = world();
  const rng = E.createSeededRNG(21);
  const venueItems = D.ITEMS.filter((it) => {
    const c = (function () { try { return D.castOf(it, w, L, E.createSeededRNG(5), D.NOSIT); } catch (e) { return null; } })();
    return c && (c.bids || c.offers || c.alt);
  });
  ok('the docket has items that offer real places or offers', venueItems.length >= 5,
    venueItems.map((i) => i.id).join(', '));

  /* EVERY OPTION HAS SOMETHING WRITTEN ON IT AND DOES SOMETHING. A computed label that comes
     back undefined is a button with nothing on it; a computed edit that comes back empty is a
     decision that changes nothing, which is the exact failure the ledger's path guard exists
     to prevent and which an empty object walks straight past. */
  const blank = [], inert = [], badPath = [];
  venueItems.forEach((it) => {
    for (let k = 0; k < 8; k++) {
      const c = D.castOf(it, w, L, E.createSeededRNG(40 + k), D.NOSIT);
      it.options.forEach((o) => {
        const lab = D.text(o.label, c, it);
        const body = D.text(o.body, c, it);
        if (!lab || /undefined|NaN/.test(String(lab) + String(body))) blank.push(it.id + ':' + o.id);
        let e;
        try { e = D.resolve(it, o.id, {}, c); } catch (err) { badPath.push(it.id + ':' + o.id + ' ' + err.message); return; }
        const moves = Object.keys(e.effects || {}).length || Object.keys(e.set || {}).length;
        if (!moves) inert.push(it.id + ':' + o.id);
        try { L.applyEdit(w, e); } catch (err) { badPath.push(it.id + ':' + o.id + ' ' + err.message); }
      });
    }
  });
  ok('  every option has something written on it', !blank.length,
    [...new Set(blank)].slice(0, 4).join(', ') || 'all of them');
  ok('  and every one of them changes something', !inert.length,
    [...new Set(inert)].slice(0, 4).join(', ') || 'all of them');
  ok('  and every path they write is a path the world has', !badPath.length,
    [...new Set(badPath)].slice(0, 3).join('; ') || 'all of them');

  /* THE RECORD OF THE RULING READS AS ENGLISH. A computed label is a proper noun and keeps
     its case; a written one is a sentence fragment and folds in lowercase. */
  const site = D.BY_ID['title-site'];
  const c = D.castOf(site, w, L, E.createSeededRNG(9), D.NOSIT);
  const rec = D.resolve(site, 'bid-a', {}, c).label;
  ok('  and the ledger records a place with its capitals on', /, [A-Z]/.test(rec), rec);
}

console.log('\n=== the situation knows where things are ===');
{
  const w = world();
  w.venues.title = 'nola';
  w.brand.playoff = 'crypto';
  w.brand.bowls.rose = 'pickup';
  const s = SIT.build(w, L, {});
  ok('it resolves the host site rather than passing an id along',
    !!s.titleVenue && s.titleVenue.city === 'New Orleans', s.titleVenue && s.titleVenue.city);
  ok('  and counts what has been sold', s.soldCount === 2, s.sold.join(', '));
  const empty = SIT.build(world(), L, {});
  ok('  with nothing sold and nowhere chosen reading as nothing rather than as broken',
    empty.titleVenue === null && empty.soldCount === 0 && Array.isArray(empty.openers));
  const missing = Object.keys(D.NOSIT).filter((k) => !(k in s));
  ok('  and every venue field the docket may read exists', !missing.length,
    missing.join(', ') || 'complete');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
