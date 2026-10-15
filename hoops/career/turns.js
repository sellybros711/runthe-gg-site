// ─── answering a card ───────────────────────────────────────────────────────

/* A GREEN RELEASE GOES IN. extra.green is the court saying the release landed
   in the gold core of a shot meter (or a dunk loaded to the edge of the help),
   which is a touch of exactly 1. That is a make, the way a green release is in
   the games people know: the one place the press decides the shot outright
   rather than nudging it. The draw is still made, so the stream does not move.
   Only the court sets it, only on a shot, and a touch of nought never does. */
let GREEN = null;
function touched(p, touch, L, k) {
  if (touch >= 1 && GREEN && (k == null ? GREEN.one : GREEN.ft && GREEN.ft[k])) return 1;
  return touch ? clamp(p + touch * (L && duelOn(L) ? TOUCH_DUEL : TOUCH), 0.05, 0.9) : p;
}
function choose(L, i, extra) {
  const card = L.pending[0];
  if (!card) return null;
  const opt = card.options[i];
  if (!opt) return null;
  const touch = extra && Number.isFinite(+extra.touch) ? clamp(+extra.touch, -1, 1) : 0;
  /* Two free throws are two presses. Without them, both shots take the one touch. */
  const touches = extra && Array.isArray(extra.touches) && extra.touches.length === 2 && extra.touches.every((t) => Number.isFinite(+t))
    ? extra.touches.map((t) => clamp(+t, -1, 1)) : null;
  const rng = rngAt(L, 'pick:' + card.key + ':' + i);
  TRADED = null;
  GREEN = extra && (extra.green === true || Array.isArray(extra.greens)) ? { one: extra.green === true && touch >= 1, ft: Array.isArray(extra.greens) ? extra.greens.map((g, j) => g === true && touches && touches[j] >= 1) : null } : null;
  const before = snapshot(L);
  let text = '', tone = '', beats = [], made = null, won = null, shots = null, contest = null;
  L.pending.shift();
  const road = card.id === 'presser' ? choosePresser(L, card, opt, rng) : chooseAm(L, card, i, opt, rng, beats, touch);
  if (road) { text = road.text; tone = road.tone; if (road.made != null) made = road.made; if (road.won != null) won = road.won; } else switch (card.id) {
    case 'combine': {
      if (card.ctx && card.ctx.story) { ({ text, tone } = chooseCombine(L, i, rng)); break; }
      const r = rng();
      if (i === 0) {
        const fit = (L.rt.ath + L.rt.sho) / 2;
        if (r < clamp(0.3 + (fit - 55) * 0.012, 0.15, 0.85)) { L.flags.stock = (L.flags.stock || 0) + 3; text = 'You test off the charts. By dinner your agent\'s phone won\'t stop.'; tone = 'good'; }
        else { L.flags.stock = (L.flags.stock || 0) - 2.5; text = 'Nothing jumps off the sheet. A few teams cool on you.'; tone = 'bad'; }
      } else if (i === 1) {
        if (r < clamp(0.35 + (L.rt.sho - 55) * 0.015, 0.1, 0.9)) { L.flags.stock = (L.flags.stock || 0) + 1.8; text = 'Forty-one of fifty. The scouts stop talking.'; tone = 'good'; }
        else { L.flags.stock = (L.flags.stock || 0) - 1; text = 'Cold day. It happens, and somebody writes it down.'; tone = 'bad'; }
      } else { text = 'You stay home. Your stock doesn\'t move.'; }
      L.pending.unshift(workoutCard(L));
      queueEvents(L, 'predraft', 1 + (rng() < 0.4 ? 1 : 0));
      break;
    }
    case 'workout': {
      const c = opt.club;
      const theirs = opt.slot;
      const proj = projectedPick(L);
      if (theirs < proj - 4) {
        if (rng() < 0.45) { L.flags.stock = (L.flags.stock || 0) + 2; L.flags.promise = { club: c, slot: theirs }; text = 'You blow them away. They promise to take you at ' + ordinal(theirs) + '.'; tone = 'gold'; }
        else { text = 'Good workout, but they\'ve got somebody else in mind at ' + ordinal(theirs) + '.'; }
      } else {
        L.flags.promise = { club: c, slot: theirs }; text = 'They love you. If you\'re still there, you\'re theirs.'; tone = 'good';
      }
      L.pending.unshift(agentCard(L));
      break;
    }
    case 'interview': { ({ text, tone } = chooseInterview(L, card, i, rng)); break; }
    case 'pworkout': { ({ text, tone } = choosePworkout(L, card, i, rng)); break; }
    case 'agent': {
      L.agent = opt.agent;
      text = say(L, '{agent}') + ' it is.';
      if (L.agent === 'cousin') bump(L, { morale: 8 });
      L.phase = 'draft';
      break;
    }
    case 'undrafted': {
      if (card.ctx && card.ctx.story) {
        if (!opt.club) {
          L.flags.overseas = (L.flags.overseas || 0) + 1;
          L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year };
          L.phase = 'drafted';
          text = 'A one-year deal in Europe. Real money, real minutes.';
          logIt(L, 'Signed overseas after going undrafted.', '');
          break;
        }
        /* The floor is 5%: a player too weak to be drafted almost never talks
           his way onto a roster from Summer League. At 10% the high school
           road reached the league 94.9% of the time over 3,000 careers, on
           the 95% ceiling, so CI's 1,000 flapped with any change to the
           seeds. At 5% it is 94.4 on CI's sample and 94.3 on 1,500 roads. */
        const pSL = clamp(0.04 + (ovrOf(L) - 58) * 0.033 + (L.m.fame - 20) * 0.003, 0.05, 0.85);
        if (rng() >= pSL) {
          L.flags.overseas = (L.flags.overseas || 0) + 1;
          L.contract = { years: 1, total: 1, salary: 0.6, kind: 'overseas', start: L.year };
          L.phase = 'drafted';
          text = 'Five games in Las Vegas. Good ones. The ' + nick(opt.club) + ' go another way. You sign overseas.';
          tone = 'bad';
          logIt(L, 'Cut after Summer League. Signed overseas.', 'bad');
          break;
        }
        remember(L, 'sl.made', true);
      }
      L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year };
      /* A two-way deal is mostly G League nights, until the club converts it. */
      if (card.ctx && card.ctx.story) L.contract.tw = 1;
      joinTeam(L, opt.club, false);
      L.draft = { pick: null, round: null, team: opt.club };
      text = L.contract.tw ? 'Two-way deal with the ' + E.teamName(opt.club) + '. Most nights you\'ll be in the G League. Prove you belong.'
        : 'Two-way deal with the ' + E.teamName(opt.club) + '. Prove it.'; tone = 'good';
      logIt(L, text, 'good');
      L.phase = 'drafted';
      openYear(L);
      break;
    }
    case 'training': {
      if (card.ctx && card.ctx.ks) { text = summerChoose(L, card.ctx.ks[i], rng); tone = 'good'; break; }
      const t = TRAIN[i];
      const young = L.age <= 24 ? 1 : L.age <= 28 ? 0.8 : 0.6;
      if (t) {
        const d = {};
        for (const k in t) d[k] = Math.round(t[k] * young * (0.7 + rng() * 0.6));
        bump(L, d);
        text = 'A good summer. It shows the first week of camp.'; tone = 'good';
      } else { bump(L, { health: 18 }); L.flags.restYears = (L.flags.restYears || 0) + 1; text = 'You actually rest. You feel twenty-two again.'; tone = 'good'; }
      break;
    }
    case 'injury': {
      const s = L.season, inj = s && s.injury;
      const g = card.ctx.g;
      if (inj) {
        if (card.ctx.major) remember(L, 'inj.major', L.age);
        if (card.ctx.major) {
          if (i === 0) { inj.until = inj.from + g; bump(L, { ath: -2, health: -8 }); text = 'The surgery goes well. Now comes the long part.'; }
          else if (i === 1) {
            if (rng() < 0.55) { inj.until = inj.from + Math.round(g * 0.6); bump(L, { health: -6 }); text = 'You\'re back early, and it holds.'; tone = 'good'; }
            else { inj.until = inj.from + Math.round(g * 1.3); bump(L, { ath: -4, health: -14, dur: -6 }); text = 'It doesn\'t hold. Now you need the surgery anyway.'; tone = 'bad'; }
          } else { bump(L, { cash: -Math.min(0.6, L.cash * 0.2) }); inj.until = inj.from + Math.round(g * 0.85); bump(L, { ath: -1 }); text = 'The specialist finds a better plan. You\'re back a little sooner.'; tone = 'good'; }
        } else if (i === 0) {
          if (rng() < 0.6) { inj.until = inj.from + Math.ceil(g / 2); bump(L, { trust: 4 }); text = 'Back in half the time. Your teammates notice.'; tone = 'good'; }
          else { inj.until = inj.from + g + 6; bump(L, { health: -8 }); text = 'You make it worse. Now you\'re out longer.'; tone = 'bad'; }
        } else { inj.until = inj.from + g; bump(L, { health: 6 }); text = varyRes(L, card, 'inj_rest', 'You give it time. It heals right.'); }
        inj.pendingDecision = false;
        const missed = inj.until - inj.from;
        logIt(L, 'Out ' + missed + ' games with a ' + inj.kind + '.', 'bad');
      }
      break;
    }
    case 'allstar': {
      if (i === 0) {
        if (rng() < clamp((L.rt.ath - 60) * 0.025, 0.05, 0.85)) { L.flags.dunk = (L.flags.dunk || 0) + 1; bump(L, { fame: 10 }); text = 'You jump over a car. The building loses it. Dunk champ.'; tone = 'gold'; }
        else { bump(L, { fame: 2 }); text = 'You miss your best dunk twice. The judges are kind.'; }
        contest = contestField(L, 'dunk', tone === 'gold');
      } else if (i === 1) {
        if (rng() < clamp((L.rt.sho - 65) * 0.025, 0.05, 0.85)) { L.flags.threes = (L.flags.threes || 0) + 1; bump(L, { fame: 8 }); text = 'You drain the whole money-ball rack. Three-point champ.'; tone = 'gold'; }
        else { bump(L, { fame: 2 }); text = 'Out in the first round. You laugh it off with the guys.'; }
        contest = contestField(L, 'three', tone === 'gold');
      } else { bump(L, { health: 6 }); text = 'You skip Saturday. Fresh legs for the second half.'; }
      logIt(L, text, tone);
      // the field is display, so a career from before it keeps its log as it was
      if (contest) logIt(L, contestLine(contest), tone);
      break;
    }
    case 'clutch': {
      const o = clutchOptions(L, card.ctx && card.ctx.look)[i];
      const cur = L.season.po.cur;
      made = rng() < touched(o.p, touch, L);
      cur.waiting = false;
      if (duelOn(L) && card.ctx && card.ctx.look) {
        const d = duelGame(L, seriesP(L, L.team, cur.opp, !!card.ctx.home), made, rng, card, i, beats, 'Game 7');
        won = d.won;
        cur.games.push(won ? 1 : 0);
        if (won) cur.w = 4; else cur.l = 4;
        if (made) { bump(L, { fame: 6 }); remember(L, 'g7.made', true); if (won) { L.flags.g7 = (L.flags.g7 || 0) + 1; clutchHit(L, beats); } }
        bump(L, { fame: won ? 4 : 0, morale: (won ? 8 : -8) + (made ? 3 : -3) });
        text = d.text; tone = made ? 'gold' : 'bad';
        logIt(L, 'Game 7 against the ' + nick(cur.opp) + ': ' + (made ? (won ? 'hit the winner.' : 'hit the shot. They answered.') : won ? 'missed it. ' + ((card.ctx && card.ctx.mate) || 'The bench') + ' saved it.' : 'missed the last shot.'), won ? 'gold' : 'bad');
        endSeries(L, beats);
        break;
      }
      cur.games.push(made ? 1 : 0);
      if (made) { cur.w = 4; L.flags.g7 = (L.flags.g7 || 0) + 1; clutchHit(L, beats); remember(L, 'g7.made', true); bump(L, { fame: 10, morale: 10 }); text = 'Good! Series over. You\'ll be watching that one for the rest of your life.'; tone = 'gold'; }
      else { cur.l = 4; bump(L, { morale: -10 }); text = 'No good. The whole building goes quiet.'; tone = 'bad'; }
      logIt(L, 'Game 7 against the ' + nick(cur.opp) + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
      endSeries(L, beats);
      break;
    }
    case 'moment': {
      const r = momentResolve(L, card, i, rng, touch, touches);
      text = r.text; tone = r.tone; made = r.made;
      if (r.won != null) won = r.won;
      if (r.shots) shots = r.shots;
      break;
    }
    case 'extension': {
      if (i === 0) {
        const yrs = card.ctx.years || 5;
        L.contract = { years: yrs + 1, total: yrs, salary: L.contract.salary, next: card.ctx.sal, kind: 'vet', start: L.year };
        text = 'Signed. ' + yrs + ' years, ' + money(card.ctx.sal) + ' a year.'; tone = 'gold';
        logIt(L, 'Signed an extension: ' + yrs + ' years, ' + money(card.ctx.sal) + ' a year.', 'gold');
        bump(L, { morale: 6, trust: 6 });
      } else { text = 'You bet on yourself. Next summer, the price goes up.'; bump(L, { fame: 2 }); }
      break;
    }
    case 'fa': {
      const f = card.ctx.offers[i];
      const old = L.team;
      L.contract = { years: f.years, total: f.years, salary: f.salary, kind: 'vet', start: L.year + 1 };
      if (f.club !== old) joinTeam(L, f.club, false);
      text = (f.club === old ? 'Re-signed with the ' : 'Signed with the ') + E.teamName(f.club) + '. ' + f.years + ' years, ' + money(f.salary) + ' a year.';
      tone = 'gold';
      if (f.club === old) logIt(L, text, 'gold');
      bump(L, { morale: 5 });
      break;
    }
    case 'after': {
      if (card.ctx && card.ctx.paths) {
        const path = card.ctx.paths[i];
        L.final = legacy(L);
        L.final.path = path;
        L.final.after = AFTER_PATHS.find((p) => p[0] === path)[1] + '.';
        text = 'New city, new chapter.'; tone = 'gold';
        if (!dealNamed(L, 'post', 'ep_' + path)) finishLife(L, '');
        break;
      }
      L.retired = true;
      L.phase = 'retired';
      L.final = legacy(L);
      L.final.after = chooseAfter(L, i, rng);
      text = L.final.after; tone = 'gold';
      logIt(L, text, 'gold');
      break;
    }
    case 'retire': {
      if (i === 1) { L.pending = []; retire(L, beats); text = 'You walk away.'; tone = 'gold'; }
      else { text = varyRes(L, card, 'retire_more', 'One more year. Let\'s go.'); bump(L, { morale: 3 }); }
      break;
    }
    case 'nooffer': {
      if (i === 0) { L.pending = []; retire(L, beats); text = 'You walk away.'; tone = 'gold'; }
      else {
        L.flags.overseas = (L.flags.overseas || 0) + 1;
        if (L.history.length && !recall(L, 'route.detour.left')) remember(L, 'route.detour.left', true);
        L.team = null;
        L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year + 1 };
        text = 'A year in Europe. Big minutes and a second chance.';
        logIt(L, 'Signed overseas for a year.', '');
      }
      break;
    }
    case 'goal': L.season.goal = card.ctx.ks[i]; L.season.goalWho = card.ctx.who || null; text = pick(rng, ['Locked in. April will tell.', 'You said it out loud. No taking it back.', 'It\'s written down. Now go get it.']); break;
    case 'deadline': text = chooseDeadline(L, card, i, rng); tone = L.team !== card.ctx.from ? 'gold' : ''; break;
    case 'coach_talk': text = chooseCoachTalk(L, card, i, rng); break;
    case 'coach_review': text = chooseCoachReview(L, i, rng); break;
    case 'nickname':
      if (i === 0) { L.nick = card.ctx.nm; logIt(L, 'They call you ' + L.nick + '.', 'gold'); feed(L, 'nick', L.name + ' has a name now: ' + L.nick + '.'); text = 'It sticks. By summer, kids at camp are calling you it.'; tone = 'gold'; }
      else { text = 'They mostly drop it.'; }
      break;
    case 'build_sig': case 'build_arch': case 'build_pos':
      text = chooseBuild(L, card, i) || ''; tone = 'good';
      break;
    default: {
      const ev = evById(card.id);
      if (!card.take) watchPick(L, card.id, i, beats);
      if (ev && card.take && ev.takes && ev.takes[card.take - 1]) {
        /* A take runs its own answers and carries its own reputation. */
        const o = ev.takes[card.take - 1].options[i];
        text = o.run(L, rng) || '';
        if (o.rep) moveRep(L, o.rep[0], o.rep[1]);
        if (o.watch) watchMark(L, o.watch, beats);
      } else if (ev) {
        const o = ev.options[i];
        const names = relNames(L, card.id, i);
        text = o.run(L, rng) || '';
        applyRel(L, names);
        const rp = (EVENTS[card.id] || TEAM_EV[card.id]) && EVENT_REP[card.id] && EVENT_REP[card.id][i];
        if (rp) moveRep(L, rp[0], rp[1]);
      }
    }
  }
  text = say(L, text);
  tradeBeat(L, beats, card.id === 'deadline' ? 'deadline' : card.id);
  headlines(L, beats);
  sayAll(L, beats);
  const after = snapshot(L);
  const res = { card, picked: i, label: opt.label, text, tone, diff: diffOf(before, after), beats };
  if (contest) res.contest = contest;
  if (made != null) res.made = made;
  if (won != null) res.won = won;
  if (shots) res.shots = shots;
  L.last = { title: card.title, label: opt.label, text, tone, diff: res.diff };
  return res;
}

// ─── the step machine ───────────────────────────────────────────────────────

/* Where the career is, in words, for the button that moves it. */
function nextLabel(L) {
  if (L.retired) return null;
  if (L.pending.length) return null;
  switch (L.phase) {
    case 'draft': return 'Draft night';
    case 'drafted': case 'pre': return 'Tip off the season';
    case 'early': return 'Play to the All-Star break';
    case 'mid': return 'Play the stretch run';
    case 'late': return L.season && L.season.po && !L.season.po.out ? 'Start the playoffs' : 'Go to the summer';
    case 'po': return L.season.po.out ? 'Go to the summer' : 'Play the ' + (L.season.po.round === -1 ? 'play-in' : ROUNDS[L.season.po.round]);
    case 'off': return 'Next season';
    case 'hs_pre': return 'Play your ' + GRADE[L.am.grade] + ' season';
    case 'hs_mid': return 'Play the second half';
    case 'hs_reg': return L.season && L.season.qual ? 'Play the state playoffs' : 'Go to the summer';
    case 'hs_po': return 'Keep playing';
    case 'hs_off': return L.am.grade < 12 ? 'Next season' : L.am.route === 'intl' || L.am.route === 'gl' ? 'Turn pro' : 'Go to college';
    case 'col_pre': return 'Tip off the season';
    case 'col_early': return 'Play the conference season';
    case 'col_mid': return 'Conference tournament';
    case 'col_late': return L.season && L.season.tourney ? 'Play the first weekend' : 'Go to the summer';
    case 'col_po': return L.season.tourney.upto <= 2 ? 'Play the second weekend' : 'Go to the Final Four';
    case 'col_off': return L.am.declared ? 'Go to the draft combine' : 'Next season';
    case 'pro_year': return (L.am.altHalf ? 'Finish the ' : 'Play the ') + ({ intl: 'season overseas', gl: 'G League season', juco: 'junior college season',
      prep: 'prep school season', gap: 'gap year', rec: 'rec league year' }[L.am.route] || 'season');
    default: return 'Continue';
  }
}

function step(L) {
  if (L.retired) return { beats: [] };
  if (L.pending.length) return { beats: [], blocked: true };
  TRADED = null;
  const beats = [];
  L.steps++;
  switch (L.phase) {
    case 'combine':
      break;
    case 'draft':
      runDraft(L, beats);
      break;
    case 'drafted':
    case 'pre': {
      if (!L.team) {
        /* A year overseas: no NBA season. Straight to the summer. */
        overseasYear(L, beats);
        break;
      }
      if (!L.season) newSeason(L);
      const role = roleOf(L);
      L.season.role = role;
      beats.push({ kind: 'role', text: E.teamName(L.team) + ': ' + role.label + ', about ' + Math.round(role.min) + ' minutes a night.', tone: '' });
      playChunk(L, 'early', beats);
      queueMoment(L, 'early');
      beats.push(recordBeat(L, 'After 27'));
      roleReview(L, beats, 'early');
      rollInjury(L, 'mid', beats);
      L.phase = 'early';
      queueEvents(L, 'early', 1 + (rngAt(L, 'n:early')() < (0.35) ? 1 : 0));
      break;
    }
    case 'early':
      playChunk(L, 'mid', beats);
      queueMoment(L, 'mid');
      beats.push(recordBeat(L, 'At the break'));
      rollInjury(L, 'late', beats);
      allStarCheck(L, beats);
      midseasonFirings(L, beats);
      roleReview(L, beats, 'break');
      tradeDeadline(L, beats);
      L.season.race = mvpRace(L); debate(L);
      L.phase = 'mid';
      queueEvents(L, 'mid', 1 + (rngAt(L, 'n:mid')() < (0.3) ? 1 : 0));
      break;
    case 'mid': {
      playChunk(L, 'late', beats);
      queueMoment(L, 'late');
      const s = L.season;
      const st = standings(L);
      startPlayoffs(L, st);
      const aw = awards(L, st);
      leagueAwards(L, aw);
      for (const a of aw) {
        s.awards.push(a);
        beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold', award: a });
        logIt(L, AWARD_NAME[a] + '.', 'gold');
        bump(L, { fame: a === 'mvp' ? 12 : 4 });
      }
      if (aw.indexOf('mvp') >= 0) L.pending.push(presserCard(L, 'mvp'));
      if (s.allstar) s.awards.push('star');
      const seedTxt = s.seed <= 6 ? ordinal(s.seed) + ' in the ' + confOf(L.team) + '.'
        : s.seed <= 10 ? ordinal(s.seed) + ' in the ' + confOf(L.team) + '. Play-in.' : ordinal(s.seed) + ' in the ' + confOf(L.team) + '. No playoffs.';
      beats.unshift({ kind: 'record', text: 'Final record ' + s.w + '-' + s.l + '. ' + seedTxt, tone: s.seed <= 6 ? 'good' : s.seed <= 10 ? '' : 'bad' });
      logIt(L, s.w + '-' + s.l + '. ' + seedTxt, s.seed <= 6 ? 'good' : '');
      pay(L, beats);
      L.phase = 'late';
      queueEvents(L, 'late', 1);
      break;
    }
    case 'late':
      L.phase = 'po';
      if (L.season.po.out) return step(L);
      playRound(L, beats);
      break;
    case 'po': {
      const po = L.season.po;
      if (po.out) { closeSeason(L, beats); L.phase = 'off'; offseason(L, beats); break; }
      playRound(L, beats);
      break;
    }
    case 'off':
      newYear(L, beats);
      break;
    case 'hs_pre': hsRegular(L, beats); break;
    case 'hs_mid': hsSecondHalf(L, beats); break;
    case 'hs_reg': hsPlayoffs(L, beats); break;
    case 'hs_po': runTourney(L, beats); if (L.season.tourney.done) closeAm(L, beats); break;
    case 'hs_off': amNewYear(L, beats); break;
    case 'col_pre': colStart(L, beats); break;
    case 'col_early': colConf(L, beats); break;
    case 'col_mid': colMarch(L, beats); break;
    case 'col_late':
      if (L.season.tourney) colTourney(L, beats, 2);
      else closeAm(L, beats);
      break;
    case 'col_po': colTourney(L, beats, L.season.tourney.upto + 2); break;
    case 'col_off': amNewYear(L, beats); break;
    case 'pro_year': proYear(L, beats); break;
  }
  tradeBeat(L, beats);
  headlines(L, beats);
  sayAll(L, beats);
  return { beats };
}
function recordBeat(L, when) {
  const s = L.season, pg = perGame(s);
  return { kind: 'record', text: when + ': ' + s.w + '-' + s.l + '. You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: s.w >= s.l ? 'good' : '' };
}
function pay(L, beats) {
  const c = L.contract;
  if (!c) return;
  const sal = c.salary;
  const fame = L.m.fame;
  const endorse = round1((fame > 45 ? Math.pow(fame - 45, 1.6) * 0.035 : 0) * AGENTS[L.agent].endorse
    * (BIG_MARKET[L.team] ? 1.3 : 1) + (L.endorseBonus || 0));
  L.endorse = endorse;
  L.earned = round1(L.earned + sal + endorse);
  const habit = trait(L, 'spender') ? 0.05 : trait(L, 'saver') ? -0.03 : 0;
  L.cash = round1(L.cash + sal * (0.5 - AGENTS[L.agent].fee - habit) + endorse * 0.55 - Math.min(L.cash * (0.08 + habit), 3));
  if (L.season) L.season.salary = sal;
}
function closeSeason(L, beats) {
  const s = L.season;
  if (!s) return;
  const pg = perGame(s);
  const po = s.po || { path: 'Missed' };
  const path = po.champ ? 'Champion' : po.path || 'Missed';
  /* Olympic gold is won in the summer AFTER a season is filed, so the card
     writes it onto the season just closed. Waiting for the next close to
     add it compared the summer's year with the next season's and never
     matched, so no career ever recorded a medal. */
  const before = totals(L);
  L.history.push(Object.assign({ y: s.year, age: L.age, t: s.team, ovr: ovrOf(L), w: s.w, l: s.l, seed: s.seed || null,
    po: path, aw: s.awards.slice(), sal: s.salary || 0, role: s.role ? s.role.label : '' }, pg, ({ mvpBy: s.mvp || '' })));
  L.seasonsDone++;
  /* The final standings, with your club's real record in them, for the draft. */
  if (fo(L)) { delete fo(L).rec[s.year]; seasonWins(L, s.year); }
  /* A reputation is what you have done lately. It drifts back toward the
     middle every season, so a career of quotes is a persona and one quote
     from eight years ago is not. */
  const rp = repOf(L);
  rp.fans = Math.round(50 + (rp.fans - 50) * 0.8);
  rp.resp = Math.round(50 + (rp.resp - 50) * 0.8);
  milestones(L, before, beats);
  rivalSeason(L, beats);
  traitSeason(L, beats);
  badgeSeason(L, beats);
  goalSeason(L, beats);
  leagueChamp(L, beats);
  /* Fame settles toward what the season said. */
  const target = clamp(15 + (pg.pts - 8) * 2.2 + (s.allstar ? 12 : 0) + (po.champ ? 8 : 0), 5, 99);
  L.m.fame = clamp(Math.round(L.m.fame * 0.7 + target * 0.3 + (s.awards.length ? 3 : 0)), 0, 100);
  if (po.champ) bump(L, { morale: 10 });
  else if (s.w < s.l) bump(L, { morale: -6 });
  const bar = rotationBar(clubNet(L, L.team || s.team));
  L.m.trust = clamp(Math.round(L.m.trust * 0.7 + (55 + (effOvr(L) - bar) * 1.2) * 0.3), 0, 100);
}
function overseasYear(L, beats) {
  if (L.age >= 37) { retire(L, beats, 'Retired overseas at ' + L.age + '.'); return; }
  const rng = rngAt(L, 'overseas');
  const d = Math.round(1 + rng() * 2);
  L.flags.overseasYears = (L.flags.overseasYears || 0) + 1;
  /* A story career grows less overseas past twenty-five: Europe makes a man
     a pro, and a rec league player does not play his way to the league
     through it at twenty-nine. */
  const up = (L.age > 25) ? Math.max(0, d - 2) : d;
  for (const k of RATINGS) L.rt[k] = clamp(L.rt[k] + (L.age <= 28 ? up : -1), 25, 99);
  L.earned = round1(L.earned + 0.8);
  L.cash = round1(L.cash + 0.4);
  beats.push({ kind: 'overseas', text: 'A year in Europe. Twenty a night and a lot of pasta.', tone: '' });
  logIt(L, 'Played a season overseas.', '');
  L.season = null;
  L.contract = null;
  L.phase = 'off';
  /* A stashed pick comes back to the club that holds his rights. */
  if (L.flags.rights) {
    const c = L.flags.rights;
    L.flags.rights = null;
    L.contract = { years: 2, total: 2, salary: round1(capFor(L.year) * MIN_PCT * 1.3), kind: 'min', start: L.year + 1 };
    joinTeam(L, c, false);
    const t = 'The ' + E.teamName(c) + ' bring you over. Two years.';
    beats.push({ kind: 'sign', text: t, tone: 'gold' });
    logIt(L, t, 'gold');
    return;
  }
  /* Back on the market. A story career that has never played in the league
     needs to be good enough to be noticed from across an ocean. */
  const list = (!L.history.length && ovrOf(L) < 70) ? [] : offers(L);
  if (!list.length || L.age >= 34) {
    L.pending.push({
      id: 'nooffer', kind: 'event', key: 'nooffer2', eyebrow: 'Free agency', title: 'The NBA still is not calling.',
      text: 'Overall ' + ovT(L, ovrOf(L)) + '. One more year away, or call it?',
      options: [{ label: 'Retire', hint: 'It was a career.' }, { label: 'Another year overseas', hint: 'Keep the dream alive.' }],
    });
  } else L.pending.push(faCard(L, list, 'back'));
}
function newYear(L, beats) {
  if (L.flags.banned) { retire(L, beats, 'Banned for life at ' + L.age + '.'); return; }
  L.age++;
  L.year++;
  if (L.season) L.season = null;
  if (L.contract && L.contract.next && L.contract.years <= L.contract.total) {
    L.contract.salary = L.contract.next;
    delete L.contract.next;
  }
  if (L.contract && L.contract.years <= 0) L.contract = null;
  beats.push({ kind: 'year', text: 'The ' + (L.year - 1) + '-' + String(L.year).slice(2) + ' season. You are ' + L.age + '.', tone: '' });
  driftLeague(L, beats);
  L.phase = 'pre';
  openYear(L);
}
/* A summer with a club: the season is opened now, so whatever happens before
   it (the training card, a summer event, a camp injury) lands on it. */
function openYear(L) {
  if (!L.team) return;
  newSeason(L);
  L.pending.push(summerCard(L));
  goalCard(L);
  if (L.seasonsDone > 0) queueEvents(L, 'pre', rngAt(L, 'n:pre')() < 0.6 ? 1 : 0);
  rollInjury(L, 'early', []);
}

// ─── things you can do between cards ────────────────────────────────────────

/* The BitLife half: what you do with a season that is not a card. Each is open
   once a season, costs what it says, and answers in one sentence. The coach and
   the trade are about basketball; the rest is what the money is for. */
const inSeason = (L) => !!(L.season && L.team && ['drafted', 'pre', 'early', 'mid'].indexOf(L.phase) >= 0);
const ACTS = {
  coach: {
    name: 'Talk to {coach}', blurb: 'Your role, your minutes, your position.', cost: () => 0,
    when: (L) => inSeason(L),
    run(L, r) {
      L.pending.push(coachTalkCard(L)); return myCoach(L) + ' waves you in and shuts the door.';
    },
  },
  trade: {
    name: 'Request a trade', blurb: 'Ask out. It happens this summer.', cost: () => 0,
    when: (L) => !!(L.team && L.contract && L.contract.years >= 2 && !L.flags.tradeAsk && L.phase !== 'off'),
    run(L) { L.flags.tradeAsk = true; bump(L, { trust: -14, fame: 2 }); return '{agent}, your agent, makes the call. {gm} says the club will look at it.'; },
  },
  trainer: {
    name: 'Hire a personal trainer', blurb: 'Work ethic and durability.', cost: (L) => round1(0.25 + capFor(L.year) * 0.002),
    when: () => true,
    run(L) { bump(L, { eth: 5, dur: 2, health: 3 }); return '{trainer} has you up at six every day. You hate him. It works.'; },
  },
  vacation: {
    name: 'Take a real vacation', blurb: 'Health and morale.', cost: (L) => round1(0.15 + capFor(L.year) * 0.001),
    when: (L) => L.phase === 'off' || L.phase === 'pre' || L.phase === 'drafted',
    run(L) { bump(L, { health: 8, morale: 8 }); return 'A week with no phone. You come back lighter.'; },
  },
  party: {
    name: 'Throw a party', blurb: 'Morale. Risky.', cost: () => 0.15,
    when: () => true,
    run(L, r) {
      if (r() < 0.7) { bump(L, { morale: 8, trust: 2 }); return 'The whole team comes. Good night, good vibes.'; }
      bump(L, { morale: 4, fame: 4, trust: -6 }); return 'It ends up online. {gm} has questions.';
    },
  },
  house: {
    name: 'Buy your mom a house', blurb: 'For {mom}. Once. You have been waiting to do this.', cost: (L) => round1(1.2 + capFor(L.year) * 0.004),
    when: (L) => !L.flags.momHouse,
    run(L) { L.flags.momHouse = true; bump(L, { morale: 15, fame: 3 }); return '{mom} cries. You cry. Worth every dollar.'; },
  },
  foundation: {
    name: 'Start a foundation', blurb: 'Fame and morale. Costs real money.', cost: (L) => round1(1.5 + capFor(L.year) * 0.006),
    when: (L) => !L.flags.foundation,
    run(L) { L.flags.foundation = true; bump(L, { fame: 8, morale: 8 }); return 'Courts, scholarships, summer camps. Your name means something now.'; },
  },
};
function actsOpen(L) {
  if (L.retired || L.pending.length || isAm(L)) return [];
  const used = (L.flags.acts && L.flags.acts.y === L.year) ? L.flags.acts : {};
  return Object.keys(ACTS).map((id) => {
    const a = ACTS[id], cost = a.cost(L);
    return { id, name: say(L, a.name), blurb: say(L, a.blurb), cost, used: !!used[id], ok: a.when(L) && !used[id] && L.cash >= cost };
  }).filter((a) => ACTS[a.id].when(L));
}
function act(L, id) {
  const a = ACTS[id];
  if (!a) return null;
  const open = actsOpen(L).find((x) => x.id === id);
  if (!open || !open.ok) return null;
  if (!L.flags.acts || L.flags.acts.y !== L.year) L.flags.acts = { y: L.year };
  L.flags.acts[id] = 1;
  const before = snapshot(L);
  if (open.cost) L.cash = round1(L.cash - open.cost);
  if (open.cost >= 0.5) tw(L).spent = (tw(L).spent || 0) + 1;
  const text = say(L, a.run(L, rngAt(L, 'act:' + id)));
  const nm = say(L, a.name);
  sayAll(L);
  const res = { title: nm, label: nm, text, tone: '', diff: diffOf(before, snapshot(L)) };
  L.last = res;
  return res;
}
