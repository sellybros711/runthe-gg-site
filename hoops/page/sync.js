// ── saving ─────────────────────────────────────────────────────────────────

/* A run is a plain serializable object plus a seed, so storing it is just
   JSON. Wrapped because a private window throws on the accessor itself rather
   than returning empty, and a game that will not start because storage is off
   is a worse game than one that will not resume. */
var KEY = 'runthefloor_run_v1';

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) {}
  /* LOCAL FIRST AND NEVER AWAITED. This is called on every signing, every
     re-spin and every round of the bracket, so a version that waited on a
     round trip would put the network between a tap and the board redrawing.
     The upload rides behind, coalesced per slot. */
  cloudPushRun();
}

function restore(){
  var saved;
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (e) { return false; }
  if (!saved || saved.version !== 1) return false;

  run = saved;
  if (run.phase === R.PHASES.DRAFT || run.phase === R.PHASES.SEASON) return true;
  /* A RUN STOPPED IN THE MIDDLE OF ITS OWN BRACKET, which is the one state a
     player can sit in for as long as they leave the tab open, because the door
     waits for them. `po` carries the whole thing and holds no rng and no player
     objects, so it survives JSON; everything the results screen wants is
     recomputed from the roster when the bracket ends.
     A LIVE GAME IN PROGRESS IS NOT RESUMED, deliberately. Its sim is a board
     mid-possession, and reconstructing one from storage would be a second way
     to build a game. The bracket comes back to the door instead and offers the
     same game again, which costs the four minutes already watched and cannot
     get the state wrong. */
  if (run.phase === R.PHASES.PLAYOFFS && run.season) return true;
  /* A finished run replays from its own outcome rather than being re-simulated:
     the season is already in the run object, and re-running it would consume the
     RNG stream again and print a DIFFERENT season under the same record. */
  if (run.phase === R.PHASES.OVER && run.outcome && run.season) return true;
  run = null;
  return false;
}

/* Pick up the saved run on whatever screen it belongs to. */
function resumeRun(){
  if (!run) return;
  if (run.phase === R.PHASES.DRAFT) { show('s-draft'); renderDraft(); return; }
  if (run.phase === R.PHASES.SEASON) { toSeason(); return; }
  if (run.phase === R.PHASES.PLAYOFFS) { resumeBracket(); return; }
  if (run.phase === R.PHASES.OVER) { renderOver(run.outcome); show('s-over'); }
}

function abandonRun(){
  try { localStorage.removeItem(KEY); } catch (e) {}
  /* THE SHELF IS TOLD, AND IT IS A DELETE RATHER THAN A SMALLER WRITE. Progress
     decides a conflict, so writing an empty run over a stored one would be
     refused and the run would come back on the next boot. 103's own header
     says this: starting over deletes. */
  cloudDropRun();
  run = null;
  renderHome();
  show('s-home');
}

// ── the shelf ──────────────────────────────────────────────────────────────

/*
 * THE RUN, THE CAREER AND THE DAILY BELONG TO THE ACCOUNT. localStorage above
 * is still written first and synchronously, and still authoritative for speed:
 * nothing here sits between a tap and the screen responding. What changes is
 * that the browser copy is a cache of supabase/103_cloud_saves.sql rather than
 * the only copy of anything.
 *
 * WHAT IT IS ACTUALLY FOR is the cabinet. A run in progress is worth twenty
 * minutes and a career is worth however long somebody has been playing, and
 * every badge in badges.js is DERIVED from that career, so a second device or a
 * cleared jar is an empty cabinet with no error anywhere to explain it. That is
 * the failure this exists to stop, and it is silent by construction.
 *
 * EVERY CALL FAILS SOFT AND NOTHING HERE IS AWAITED. cloudsave.js answers null
 * for "no opinion", never for "you have no save", and a shelf that cannot be
 * reached must never be the reason a run goes. Signed out, blocked, offline or
 * missing a version: the game is exactly the game it was before any of this.
 *
 * The merge rules live in cloud.js beside the argument for them.
 */

function cloudReady(){
  return !!(CL && SV && typeof SV.signedIn === 'function' && SV.signedIn());
}

/* Queued per slot by the transport, so a draft signing five men in a minute
   sends the state as it stands when the wire is free rather than five writes
   racing each other to one row.

   A WRITE GOES OUT AS THE ACCOUNT THAT QUEUED IT OR NOT AT ALL. The transport
   builds a queued write when the wire frees and sends it with whatever token is
   signed in then, so on a slow connection a career queued by one reader could
   land on the shelf of whoever signed in after them. The write remembers who
   queued it and is dropped if that has changed (check-cloudsave 9b). */
function cloudPush(slot, build){
  if (!cloudReady()) return null;
  var who = (A.state && A.state().userId) || null;
  var guarded = function(){
    if (((A.state && A.state().userId) || null) !== who) return null;
    return build();
  };
  try { return SV.queue(CL.GAME, slot, guarded); } catch (e) { return null; }
}

function cloudPushRun(){
  if (!cloudReady()) return null;
  return cloudPush(CL.SLOT_RUN, function(){
    if (!run) return null;
    return { payload: run, progress: CL.runProgress(run) };
  });
}

function cloudDropRun(){
  if (!cloudReady()) return null;
  return cloudPush(CL.SLOT_RUN, function(){ return { drop: true }; });
}

function cloudPushCareer(c){
  if (!cloudReady() || !c) return null;
  return cloudPush(CL.SLOT_CAREER, function(){
    return { payload: c, progress: CL.careerProgress(c) };
  });
}

function cloudPushDaily(s){
  if (!cloudReady() || !s) return null;
  return cloudPush(CL.SLOT_DAILY, function(){
    return { payload: s, progress: CL.dailyProgress(s) };
  });
}

/*
 * THE PULL, and the three slots are three different questions.
 *
 * A CAREER AND A DAILY ARE MERGED AND PUSHED BACK, always, because neither side
 * is behind the other: two devices hold runs the other has never seen. The
 * merge is monotone, so the answer is at least as good as both and the push
 * after it always lands.
 *
 * A RUN IS ADOPTED, AND ONLY ON THE FRONT PAGE. Replacing `run` under somebody
 * who is already drafting swaps the game out from under a decision they are
 * making, which is the rule the football pull runs on. The answer arrives after
 * boot has finished, so the test is what is on screen at that moment and not
 * what was on screen when the request went out.
 */
var cloudPulling = false;

/*
 * WHOSE COPY THE BROWSER IS HOLDING, which is the question that decides whether
 * a pull MERGES or REPLACES, and getting it wrong is a disclosure rather than a
 * lost save.
 *
 * Two accounts on one browser is the fifth way 103's own header lists for
 * losing a run, and merging is what turns it into the opposite problem: sign in
 * as somebody else and their cabinet quietly adopts the runs, the rings and the
 * streak of whoever used this browser last. Neither account's record is true
 * afterwards and nothing anywhere says so.
 *
 * So the browser records whose it is. Three cases, and the middle one is the
 * one worth keeping:
 *
 *   nobody's     a career played signed out. MERGED, which is claiming it, the
 *                same way a finished run is claimed on the way in.
 *   this account MERGED, which is the ordinary second device.
 *   somebody else REPLACED, with the account's own copy or with nothing. It is
 *                not this reader's record and it is safe on the shelf it
 *                belongs to.
 *
 * IT DOES NOT APPLY TO THE RUN, and that line is drawn deliberately. A draft in
 * progress is not a record of anybody's: it makes no claim about who did what,
 * it is on no board, and nothing is derived from it. Signing in part way
 * through one means that draft is now yours on this account, which is exactly
 * the rule the leaderboard already runs on when it claims a finished run on the
 * way in. Clearing somebody's half-finished draft because they changed accounts
 * would be this file destroying a run rather than keeping one.
 *
 * It is a per-browser fact and never leaves the device, so it lives here rather
 * than in the payload.
 */
var OWNERKEY = 'rtf.owner.v1';

function cloudOwner(){
  try { return localStorage.getItem(OWNERKEY) || null; } catch (e) { return null; }
}
function cloudSetOwner(id){
  try {
    if (id) localStorage.setItem(OWNERKEY, id); else localStorage.removeItem(OWNERKEY);
  } catch (e) {}
}

function cloudPull(){
  if (!cloudReady() || cloudPulling) return null;
  var who = (A.state && A.state().userId) || null;
  /* MINE UNLESS THE BROWSER SAYS IT BELONGS TO SOMEBODY ELSE. An unknown owner
     is treated as mine deliberately: it is either a first sign in or a browser
     from before this existed, and refusing to claim those would throw away the
     careers this whole feature is for. */
  var mine = !who || !cloudOwner() || cloudOwner() === who;
  cloudPulling = true;
  return SV.all(CL.GAME).then(function(rows){
    cloudPulling = false;
    if (!rows) return;           /* no opinion. The local copy stands. */
    var by = {}, i;
    for (i = 0; i < rows.length; i++) if (rows[i].slot) by[rows[i].slot] = rows[i];
    /* THE OWNER IS WRITTEN BEFORE ANYTHING IS ADOPTED, so a merge interrupted
       half way cannot leave this browser claiming to hold the previous
       account's record while it actually holds a mixture. */
    cloudSetOwner(who);
    cloudAdoptCareer(by[CL.SLOT_CAREER], mine);
    cloudAdoptDaily(by[CL.SLOT_DAILY], mine);
    cloudAdoptRun(by[CL.SLOT_RUN]);
    /* And every mode's record, which modes-ui.js keeps and so adopts. */
    if (window.RTF_MODES_UI && window.RTF_MODES_UI.cloudAdopt) {
      try { window.RTF_MODES_UI.cloudAdopt(by, mine); } catch (e) {}
    }
    /* THE WALLET SETTLES AFTER EVERYTHING ELSE IS ADOPTED: the welcome, and
       the badge baseline, which has to see every badge the account already
       holds or it would pay for one another device earned before launch. */
    if (window.RTF_EARN && who) { try { window.RTF_EARN.settle(loadCareer() || blankCareer()); } catch (e) {} }
  }, function(){ cloudPulling = false; });
}

/* THE PUSH IS SKIPPED WHEN THE MERGE CHANGED NOTHING, which is the common case
   for somebody playing on one device: the shelf already holds exactly this. A
   missing row compares unequal and is therefore always written, which is how a
   career that has never been uploaded gets there. */
function cloudSettle(slot, merged, stored, progress){
  var had = stored && stored.payload ? JSON.stringify(stored.payload) : null;
  if (had === JSON.stringify(merged)) return false;
  cloudPush(slot, function(){ return { payload: merged, progress: progress }; });
  return true;
}

/* WHAT THE BROWSER SHOULD NOW HOLD, and the local write is the same shape for
   both records: write it if it changed, clear the key if there is nothing left,
   and repaint whatever was on screen while the answer was out. */
function cloudWriteLocal(key, value, before){
  var now = value == null ? null : JSON.stringify(value);
  if (now === before) return false;
  try {
    if (now === null) localStorage.removeItem(key); else localStorage.setItem(key, now);
  } catch (e) {}
  /* The front page reads both records, the cabinet reads the career, and a
     merge landing under an empty shelf has to redraw it or the only way to see
     a cabinet that has just arrived is to reload. */
  arenaChanged();
  renderHome();
  if ($('sheet').classList.contains('open')) renderCareer();
  return true;
}

function cloudAdoptCareer(rowIn, claim){
  var before = null;
  try { before = localStorage.getItem(PKEY); } catch (e) {}
  var theirs = rowIn && rowIn.payload ? rowIn.payload : null;
  /* NOT MINE: the account's own copy stands alone, and no copy at all means an
     empty cabinet rather than the previous reader's. Nothing is pushed on this
     path, because what is on the shelf IS the answer. */
  if (!claim) { cloudWriteLocal(PKEY, theirs, before); return; }
  var mine = loadCareer();
  if (!mine && !theirs) return;
  var merged = CL.mergeCareer(mine || blankCareer(), theirs || {});
  cloudWriteLocal(PKEY, merged, before);
  cloudSettle(CL.SLOT_CAREER, merged, rowIn, CL.careerProgress(merged));
}

function cloudAdoptDaily(rowIn, claim){
  var before = null;
  try { before = localStorage.getItem(DAILYKEY); } catch (e) {}
  var theirs = rowIn && rowIn.payload ? rowIn.payload : null;
  if (!claim) { cloudWriteLocal(DAILYKEY, theirs, before); return; }
  var mine = dailyState();
  if (!mine && !theirs) return;
  var merged = CL.mergeDaily(mine || {}, theirs || {});
  if (!merged) return;
  cloudWriteLocal(DAILYKEY, merged, before);
  cloudSettle(CL.SLOT_DAILY, merged, rowIn, CL.dailyProgress(merged));
}

/* THE SHELF, PUBLISHED, AND NOTHING ON THIS PAGE READS IT.
 *
 * It is here so hoops/check-cloudsave.mjs can ask for a pull at the moment it
 * has arranged, rather than waiting for one: the pull is fired by a change of
 * account, which needs a live supabase client, and a save test has no business
 * loading one. Same argument as window.RTF_LIVE above.
 *
 * The two pushes are exported for the same reason and no other. Filing a real
 * career means playing 82 games and a bracket through the page for every row,
 * which is minutes per assertion, and what is under test here is the SYNC. The
 * merge itself is swept over the real badge catalog in node.
 *
 * NOTHING ELSE GOES ON THIS OBJECT. Starting a run, abandoning one and opening
 * the cabinet are all buttons, and a guard that presses the button is testing
 * the thing a player does. */
window.RTF_SYNC = {
  pull: function(){ return cloudPull(); },
  pushCareer: function(c){ return cloudPushCareer(c); },
  pushDaily: function(s){ return cloudPushDaily(s); },
};

function cloudAdoptRun(rowIn){
  var theirs = rowIn && rowIn.payload ? rowIn.payload : null;
  var here = run ? CL.runProgress(run) : -1;
  if (!theirs || theirs.version !== 1) {
    /* Nothing stored, or something this page cannot open. Either way the local
       run is the only one there is, so it goes up. */
    if (run) cloudPushRun();
    return;
  }
  if (CL.runProgress(theirs) <= here) { if (run) cloudPushRun(); return; }
  /* FURTHER ALONG THAN THIS DEVICE, so adopt it. Never mid-game: `restore` is
     what decides which screen a run belongs on, and it is only honest to call
     it while nobody is looking at a screen of their own. */
  if (!$('s-home').classList.contains('active')) return;
  try { localStorage.setItem(KEY, JSON.stringify(theirs)); } catch (e) {}
  restore();
  renderHome();
}
