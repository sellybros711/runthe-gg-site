/* =============================================================================
 * RunThe.GG / Arcade — curated clue bank (window.RTG_CLUES)
 *
 * WHY THIS EXISTS
 * Every clue in the arcade used to be assembled from structured fields —
 * team, award, decade, position — which produces mechanically correct and
 * completely forgettable lines: "Saints Pro Bowler Mark ___", "NFL Pro Bowler
 * Jack ___". Eight of those in one crossword read as eight copies of the same
 * clue. (The one template that could have been interesting, the `ml` milestone
 * field, was never populated anywhere in the codebase — dead since it shipped.)
 *
 * A good sports clue points at a MOMENT, not a row in a database. You cannot
 * derive "his one-handed catch against Dallas in 2014" from a team list. So
 * these are written by hand, one player at a time.
 *
 * SHAPE
 *   { n:'Odell Beckham Jr.', s:'NFL', c:[ {x:'whose ...', g:1}, ... ] }
 *
 *   n  full name, spelled exactly as the corpus spells it (validated — see
 *      scripts/check-cluebank.mjs, which fails on any name the corpus lacks)
 *   s  sport key: NBA | NFL | MLB
 *   c  clues, best first
 *   x  the clue itself, written as a PREDICATE PHRASE that must begin with
 *      "whose " or "who " so one line can serve two games:
 *        crossword -> "Odell ___, whose one-handed catch against Dallas ..."
 *        guess     -> "This player's one-handed catch against Dallas ..."
 *   g  1 when the clue is also safe for Guess the Player, i.e. it names none
 *      of that player's own teams, his position, or his jersey number —
 *      earning those is what the Guess board is for. An opponent is fine
 *      ("against Dallas"), which is why so many moment clues qualify.
 *
 * RULES FOR WRITING ONE
 *   - Never contain the player's surname; the crossword answer IS the surname.
 *     check-cluebank.mjs rejects any clue that leaks it.
 *   - Prefer the thing a fan would say out loud at a bar over the thing a
 *     reference page would list. "Waved goodbye from 37 feet" beats "5x
 *     All-NBA".
 *   - Only write what you are certain of. A wrong clue is worse than a dull
 *     one, and there is always the generated fallback.
 * ========================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.RTG_CLUES = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var P = [

    /* ======================================================= NBA — moments */
    { n:'Michael Jordan', s:'NBA', c:[
      { x:'who dropped 38 in the 1997 Finals while too sick to stand up straight between plays', g:1 },
      { x:'whose last shot as a Bull, a jumper over Bryon Russell in Utah, won a sixth title', g:1 },
      { x:'who went six for six in the Finals and took the MVP every time', g:1 }]},
    { n:'LeBron James', s:'NBA', c:[
      { x:'whose chase-down block in Game 7 of 2016 ended a 52-year title drought for a city', g:1 },
      { x:'who announced a move to Miami on a live TV special the whole sport still resents', g:1 },
      { x:'who became the first player to reach 40,000 career points', g:1 }]},
    { n:'Kobe Bryant', s:'NBA', c:[
      { x:'who scored 81 against Toronto in 2006, second only to Wilt', g:1 },
      { x:'who said goodbye with 60 points in the last game he ever played', g:1 }]},
    { n:'Ray Allen', s:'NBA', c:[
      { x:'whose corner three with 5.2 seconds left in Game 6 saved the 2013 Finals', g:1 }]},
    { n:'Kawhi Leonard', s:'NBA', c:[
      { x:'whose shot bounced on the rim four times before dropping to end a 2019 Game 7', g:1 }]},
    { n:'Damian Lillard', s:'NBA', c:[
      { x:'who waved goodbye from 37 feet after ending Oklahoma City’s 2019 season', g:1 }]},
    { n:'Stephen Curry', s:'NBA', c:[
      { x:'who won the first unanimous MVP in league history', g:1 },
      { x:'who broke the career three-point record at Madison Square Garden', g:1 }]},
    { n:'Klay Thompson', s:'NBA', c:[
      { x:'who once scored 37 points in a single quarter, all of it inside 12 minutes', g:1 }]},
    { n:'Kyrie Irving', s:'NBA', c:[
      { x:'whose step-back three over Curry with 53 seconds left decided Game 7 in 2016', g:1 }]},
    { n:'Reggie Miller', s:'NBA', c:[
      { x:'who scored 8 points in 9 seconds to silence Spike Lee and the Garden', g:1 }]},
    { n:'Vince Carter', s:'NBA', c:[
      { x:'who jumped clean over a 7-foot-2 French center at the 2000 Olympics', g:1 },
      { x:'who played 22 seasons, more than anyone in league history', g:1 }]},
    { n:'Allen Iverson', s:'NBA', c:[
      { x:'who stepped over Tyronn Lue after a Finals dagger in 2001', g:1 },
      { x:'whose rant about a certain non-game activity became the most quoted press conference ever', g:1 }]},
    { n:'Tracy McGrady', s:'NBA', c:[
      { x:'who scored 13 points in 33 seconds to steal a game from San Antonio', g:1 }]},
    { n:'Dirk Nowitzki', s:'NBA', c:[
      { x:'whose one-legged fadeaway was unguardable and beat the Heat superteam in 2011', g:1 }]},
    { n:'Robert Horry', s:'NBA', c:[
      { x:'who won seven rings with three franchises on the strength of shots nobody else wanted', g:1 }]},
    { n:'Derek Fisher', s:'NBA', c:[
      { x:'who caught, turned and buried a jumper with 0.4 seconds on the clock', g:1 }]},
    { n:'Magic Johnson', s:'NBA', c:[
      { x:'who started at center as a rookie in a Finals clincher and put up 42', g:1 }]},
    { n:'Larry Bird', s:'NBA', c:[
      { x:'who once told the field what he’d win the three-point contest by, then did', g:1 }]},
    { n:'Wilt Chamberlain', s:'NBA', c:[
      { x:'who scored 100 in a single game in 1962, in a gym with no video of it', g:1 }]},
    { n:'Bill Russell', s:'NBA', c:[
      { x:'who won 11 championships in 13 seasons, more than any athlete in American team sport', g:1 }]},
    { n:'Kareem Abdul-Jabbar', s:'NBA', c:[
      { x:'whose skyhook held the all-time scoring record for 39 years', g:1 }]},
    { n:'Shaquille O’Neal', s:'NBA', c:[
      { x:'who tore down two backboards in one season and forced a redesign of the stanchion', g:1 }]},
    { n:'Tim Duncan', s:'NBA', c:[
      { x:'whose nickname was literally The Big Fundamental, and who never raised his voice', g:1 }]},
    { n:'Nate Robinson', s:'NBA', c:[
      { x:'who won three dunk contests standing 5-foot-9', g:1 }]},
    { n:'Steve Nash', s:'NBA', c:[
      { x:'who won back-to-back MVPs running an offense nicknamed for how few seconds it needed', g:1 }]},
    { n:'Manu Ginobili', s:'NBA', c:[
      { x:'who once swatted a bat out of the air mid-game with his bare hand', g:1 }]},
    { n:'Rajon Rondo', s:'NBA', c:[
      { x:'who played a 2011 playoff game with an elbow bent the wrong way and kept passing', g:1 }]},
    { n:'Tyler Herro', s:'NBA', c:[
      { x:'who hung 37 off the bench in a conference finals game as a rookie', g:1 }]},
    { n:'Dwyane Wade', s:'NBA', c:[
      { x:'who threw an alley-oop off the backboard to himself, then called it a night', g:1 }]},
    { n:'Chris Paul', s:'NBA', c:[
      { x:'who is the all-time steals leader and has never won a title', g:1 }]},
    { n:'Russell Westbrook', s:'NBA', c:[
      { x:'who averaged a triple-double for a full season, the first since Oscar', g:1 }]},
    { n:'James Harden', s:'NBA', c:[
      { x:'whose step-back was so effective the league had to clarify the travel rule', g:1 }]},
    { n:'Giannis Antetokounmpo', s:'NBA', c:[
      { x:'who closed out a Finals with 50 points and hit 17 of 19 free throws that night', g:1 }]},
    { n:'Nikola Jokic', s:'NBA', c:[
      { x:'who was taken during a Taco Bell commercial in the second round and became an MVP', g:1 }]},
    { n:'Joel Embiid', s:'NBA', c:[
      { x:'who trusted a process long enough to outlast the executive who named it', g:1 }]},
    { n:'Luka Doncic', s:'NBA', c:[
      { x:'who won a EuroLeague title and its MVP before he was old enough to be drafted', g:1 }]},
    { n:'Jimmy Butler', s:'NBA', c:[
      { x:'who was homeless in high school and turned a play-in seed into a Finals run', g:1 }]},
    { n:'Paul Pierce', s:'NBA', c:[
      { x:'who was stabbed 11 times before a season and did not miss a single game that year', g:1 }]},
    { n:'Kevin Garnett', s:'NBA', c:[
      { x:'who screamed that anything is possible into a courtside camera after finally winning', g:1 }]},
    { n:'Ben Wallace', s:'NBA', c:[
      { x:'who went undrafted and became Defensive Player of the Year four times', g:1 }]},
    { n:'Dennis Rodman', s:'NBA', c:[
      { x:'who led the league in rebounding seven straight years and changed hair color weekly', g:1 }]},
    { n:'Charles Barkley', s:'NBA', c:[
      { x:'who won an MVP at 6-foot-6 playing power forward, then never stopped talking', g:1 }]},
    { n:'Scottie Pippen', s:'NBA', c:[
      { x:'who was traded on draft night for a center and became half of a six-title core', g:1 }]},
    { n:'Hakeem Olajuwon', s:'NBA', c:[
      { x:'whose footwork in the post was named after a nightclub dance', g:1 }]},
    { n:'Patrick Ewing', s:'NBA', c:[
      { x:'who reached a Finals the one year Jordan was off playing minor-league baseball', g:1 }]},
    { n:'David Robinson', s:'NBA', c:[
      { x:'who served in the Navy before his rookie year and was nicknamed for it', g:1 }]},
    { n:'Karl Malone', s:'NBA', c:[
      { x:'who is second all-time in scoring and never won a ring', g:1 }]},
    { n:'John Stockton', s:'NBA', c:[
      { x:'who holds the all-time assists record by a margin no one will ever close', g:1 }]},
    { n:'Isiah Thomas', s:'NBA', c:[
      { x:'who scored 25 in a quarter of a Finals game on an ankle he could barely stand on', g:1 }]},
    { n:'Carmelo Anthony', s:'NBA', c:[
      { x:'who won a national title as a freshman and became the USA program’s leading scorer', g:1 }]},
    { n:'Metta World Peace', s:'NBA', c:[
      { x:'who changed his legal name twice and thanked his psychiatrist on live TV after a title', g:1 }]},
    { n:'Kevin Durant', s:'NBA', c:[
      { x:'whose MVP speech ended with four words about his mother that everybody remembers', g:1 }]},
    { n:'Draymond Green', s:'NBA', c:[
      { x:'who was Defensive Player of the Year without ever being the tallest man on the floor', g:1 }]},

    /* ======================================================= NFL — moments */
    { n:'Odell Beckham Jr.', s:'NFL', c:[
      { x:'whose one-handed grab against Dallas in 2014 is still the catch every highlight means', g:1 }]},
    { n:'David Tyree', s:'NFL', c:[
      { x:'who pinned a Super Bowl-saving catch against his own helmet and barely played again', g:1 }]},
    { n:'Malcolm Butler', s:'NFL', c:[
      { x:'who was an undrafted rookie when he jumped a slant at the goal line to end a Super Bowl', g:1 }]},
    { n:'Tom Brady', s:'NFL', c:[
      { x:'who was the 199th pick and came back from 28-3', g:1 },
      { x:'who won more Super Bowls than any single franchise has', g:1 }]},
    { n:'Marshawn Lynch', s:'NFL', c:[
      { x:'whose 67-yard playoff run in Seattle registered on a seismograph', g:1 },
      { x:'who answered every media question with the same sentence about fines', g:1 }]},
    { n:'Adam Vinatieri', s:'NFL', c:[
      { x:'who kicked through a blizzard to force overtime, then won two Super Bowls at the gun', g:1 }]},
    { n:'Devin Hester', s:'NFL', c:[
      { x:'who returned the opening kickoff of a Super Bowl and made the Hall of Fame as a returner', g:1 }]},
    { n:'Randy Moss', s:'NFL', c:[
      { x:'who caught 23 touchdowns in 2007 and once explained he pays cash', g:1 }]},
    { n:'Barry Sanders', s:'NFL', c:[
      { x:'who walked away at 30, a season and a half from the all-time rushing record', g:1 }]},
    { n:'Jerry Rice', s:'NFL', c:[
      { x:'who holds the receiving records by such a distance that second place is not close', g:1 }]},
    { n:'Joe Montana', s:'NFL', c:[
      { x:'who threw the back-of-the-end-zone ball known simply as The Catch', g:1 }]},
    { n:'Santonio Holmes', s:'NFL', c:[
      { x:'who got two toes down in the corner of the end zone to win a Super Bowl', g:1 }]},
    { n:'James Harrison', s:'NFL', c:[
      { x:'who ran an interception back 100 yards on the last play of a Super Bowl half', g:1 }]},
    { n:'Julian Edelman', s:'NFL', c:[
      { x:'who caught a ball off a defender’s shoe an inch from the turf during a 28-3 comeback', g:1 }]},
    { n:'Michael Vick', s:'NFL', c:[
      { x:'who ran for 1,039 yards in a season as a quarterback and served federal prison time', g:1 }]},
    { n:'Deion Sanders', s:'NFL', c:[
      { x:'who played in a World Series and a Super Bowl and nicknamed himself Prime Time', g:1 }]},
    { n:'Lawrence Taylor', s:'NFL', c:[
      { x:'who won a league MVP as a defender, which has happened almost never', g:1 }]},
    { n:'Justin Tucker', s:'NFL', c:[
      { x:'who won a game off the crossbar from 66 yards, the longest ever made', g:1 }]},

    /* Specialists. A kicker or punter reaches the crossword only through this
       bank (see playableRole in crossword/gen.js), because "Vikings punter of
       the 2010s" is not a clue anybody can answer. What a fan remembers is the
       kick, so every line below is one. */
    { n:'Morten Andersen', s:'NFL', c:[
      { x:'who kicked for 25 seasons across four decades and retired as the highest scorer in league history', g:0 },
      { x:'whose overtime kick in the 1998 conference title game sent Atlanta to its first Super Bowl', g:0 }]},
    { n:'Ray Guy', s:'NFL', c:[
      { x:'who was drafted in the first round to punt, which had never happened before and has not happened since', g:0 }]},
    { n:'Gary Anderson', s:'NFL', c:[
      { x:'who did not miss a single kick all of the 1998 season, then missed one in the conference title game', g:0 }]},
    { n:'Blair Walsh', s:'NFL', c:[
      { x:'whose 27-yard chip shot went wide left in below-zero cold and ended a playoff run', g:0 }]},
    { n:'Pat McAfee', s:'NFL', c:[
      { x:'who recovered his own onside kick in a playoff game and now hosts a show louder than he punted', g:0 }]},
    { n:'Peyton Manning', s:'NFL', c:[
      { x:'who threw 55 touchdowns in one season and yelled a farm animal’s name at the line', g:1 }]},
    { n:'Brett Favre', s:'NFL', c:[
      { x:'who started 297 straight games and threw for 399 yards the day after his father died', g:1 }]},
    { n:'Aaron Rodgers', s:'NFL', c:[
      { x:'who sat four years behind a legend after sliding to 24th on draft night', g:1 }]},
    { n:'Patrick Mahomes', s:'NFL', c:[
      { x:'who has thrown no-look passes and left-handed passes in actual playoff games', g:1 }]},
    { n:'Emmitt Smith', s:'NFL', c:[
      { x:'who is the all-time rushing leader and once played a half with a separated shoulder', g:1 }]},
    { n:'Ray Lewis', s:'NFL', c:[
      { x:'whose pregame dance had its own name and lasted longer than some drives', g:1 }]},
    { n:'J.J. Watt', s:'NFL', c:[
      { x:'who won Defensive Player of the Year three times and raised $41 million after a hurricane', g:1 }]},
    { n:'Aaron Donald', s:'NFL', c:[
      { x:'who ended a Super Bowl by collapsing the pocket on fourth down and walking off for good', g:1 }]},
    { n:'Von Miller', s:'NFL', c:[
      { x:'who stripped the quarterback twice in a Super Bowl and won its MVP as a pass rusher', g:1 }]},
    { n:'Travis Kelce', s:'NFL', c:[
      { x:'who has a brother he beat in a Super Bowl and a podcast they host together', g:1 }]},
    { n:'Tyreek Hill', s:'NFL', c:[
      { x:'whose nickname is a bug, earned by running a sub-4.3 forty', g:1 }]},
    { n:'Jerome Bettis', s:'NFL', c:[
      { x:'who retired on the field after winning a Super Bowl in his hometown', g:1 }]},
    { n:'Ndamukong Suh', s:'NFL', c:[
      { x:'who was suspended for stomping an opponent on Thanksgiving and later won a ring in Tampa', g:1 }]},
    { n:'Khalil Mack', s:'NFL', c:[
      { x:'who was named first-team All-Pro on both sides of the line of scrimmage in one season', g:1 }]},
    { n:'Doug Flutie', s:'NFL', c:[
      { x:'whose college Hail Mary is still the most replayed pass in the sport', g:1 }]},
    { n:'Terrell Owens', s:'NFL', c:[
      { x:'who celebrated on a midfield star, with popcorn, and with a Sharpie', g:1 }]},
    { n:'Reggie Bush', s:'NFL', c:[
      { x:'who returned a Heisman and then got it back 14 years later', g:1 }]},
    { n:'Antonio Brown', s:'NFL', c:[
      { x:'who walked off the field shirtless mid-game and never played again', g:1 }]},
    { n:'Rob Gronkowski', s:'NFL', c:[
      { x:'who spiked footballs hard enough to hurt himself and retired twice', g:1 }]},

    /* ======================================================= MLB — moments */
    { n:'Kirk Gibson', s:'MLB', c:[
      { x:'who limped out on two bad legs and hit a walk-off to open the 1988 World Series', g:1 }]},
    { n:'Joe Carter', s:'MLB', c:[
      { x:'who ended a World Series with a swing and then ran the bases like a man on fire', g:1 }]},
    { n:'David Freese', s:'MLB', c:[
      { x:'who tied Game 6 with two outs in the ninth and won it in the eleventh', g:1 }]},
    { n:'Derek Jeter', s:'MLB', c:[
      { x:'who came out of nowhere to flip a relay home in the 2001 playoffs', g:1 },
      { x:'who was nicknamed for the month of November after a midnight home run', g:1 }]},
    { n:'Mariano Rivera', s:'MLB', c:[
      { x:'who threw one pitch, everyone knew it was coming, and he is the first unanimous Hall of Famer', g:1 }]},
    { n:'Cal Ripken Jr.', s:'MLB', c:[
      { x:'who played 2,632 games in a row and took a lap when the streak broke the record', g:1 }]},
    { n:'Nolan Ryan', s:'MLB', c:[
      { x:'who threw seven no-hitters and put a charging 26-year-old in a headlock at 46', g:1 }]},
    { n:'Randy Johnson', s:'MLB', c:[
      { x:'whose fastball hit a bird mid-flight during a spring training game', g:1 }]},
    { n:'Ichiro Suzuki', s:'MLB', c:[
      { x:'who collected 262 hits in a season and more than 4,000 across two countries', g:1 }]},
    { n:'David Ortiz', s:'MLB', c:[
      { x:'who walked off consecutive nights to start the greatest comeback in postseason history', g:1 }]},
    { n:'Curt Schilling', s:'MLB', c:[
      { x:'who pitched a playoff game with blood coming through his sock', g:1 }]},
    { n:'Kerry Wood', s:'MLB', c:[
      { x:'who struck out 20 in his fifth big-league start', g:1 }]},
    { n:'Madison Bumgarner', s:'MLB', c:[
      { x:'who came out of the bullpen on two days’ rest to throw five shutout innings in a Game 7', g:1 }]},
    { n:'Bartolo Colon', s:'MLB', c:[
      { x:'who hit his first career home run at 42 and lost his helmet rounding first', g:1 }]},
    { n:'Jose Bautista', s:'MLB', c:[
      { x:'whose bat flip in a 2015 deciding game started a brawl a year later', g:1 }]},
    { n:'Barry Bonds', s:'MLB', c:[
      { x:'who hit 73 in a season and was walked intentionally with the bases loaded', g:1 }]},
    { n:'Mark McGwire', s:'MLB', c:[
      { x:'who traded homers all summer in 1998 with a rival and finished at 70', g:1 }]},
    { n:'Sammy Sosa', s:'MLB', c:[
      { x:'who hit 60 in three different seasons and was caught with a corked bat', g:1 }]},
    { n:'Ken Griffey Jr.', s:'MLB', c:[
      { x:'who wore his cap backwards in batting practice and scored from first to win a 1995 series', g:1 }]},
    { n:'Pedro Martinez', s:'MLB', c:[
      { x:'who had an ERA under 2.00 in the middle of the steroid era', g:1 }]},
    { n:'Albert Pujols', s:'MLB', c:[
      { x:'who was drafted in the 13th round and finished with 700 home runs', g:1 }]},
    { n:'Shohei Ohtani', s:'MLB', c:[
      { x:'who became the first man to steal 50 bases and hit 50 home runs in a season', g:1 }]},
    { n:'Aaron Judge', s:'MLB', c:[
      { x:'who hit 62 to pass a record that had stood in his league since 1961', g:1 }]},
    { n:'Mike Trout', s:'MLB', c:[
      { x:'who won three MVPs before his 30th birthday and has one playoff series to show for it', g:1 }]},
    { n:'Clayton Kershaw', s:'MLB', c:[
      { x:'whose curveball has its own nickname and who won an ERA title five times', g:1 }]},
    { n:'Rickey Henderson', s:'MLB', c:[
      { x:'who stole 1,406 bases and referred to himself in the third person doing it', g:1 }]},
    { n:'Hank Aaron', s:'MLB', c:[
      { x:'who broke the home run record in 1974 under a mountain of hate mail', g:1 }]},
    { n:'Willie Mays', s:'MLB', c:[
      { x:'whose over-the-shoulder running grab in the 1954 World Series is called simply The Catch', g:1 }]},
    { n:'Jackie Robinson', s:'MLB', c:[
      { x:'whose number is retired by every team in the sport', g:1 }]},
    { n:'Babe Ruth', s:'MLB', c:[
      { x:'who out-homered entire teams and was sold to fund a Broadway show', g:1 }]},
    { n:'Ted Williams', s:'MLB', c:[
      { x:'who was the last man to hit .400 and then flew combat missions in two wars', g:1 }]},
    { n:'Roger Clemens', s:'MLB', c:[
      { x:'who won seven Cy Youngs and threw a shard of broken bat at a baserunner in a World Series', g:1 }]},
    { n:'Greg Maddux', s:'MLB', c:[
      { x:'who won four straight Cy Youngs throwing almost nothing over 88 miles an hour', g:1 }]},
    { n:'Chipper Jones', s:'MLB', c:[
      { x:'who hit so well in one opposing park that a Mets fan named his daughter after him', g:1 }]},
    { n:'Vladimir Guerrero', s:'MLB', c:[
      { x:'who swung at pitches that bounced, and hit them, and never wore batting gloves', g:1 }]},

    /* ================================================ NBA — second tranche */
    { n:'Chris Bosh', s:'NBA', c:[
      { x:'who grabbed the rebound that set up the most famous corner three in Finals history', g:1 },
      { x:'whose career was ended by blood clots while he was still an All-Star', g:1 }]},
    { n:'Dikembe Mutombo', s:'NBA', c:[
      { x:'whose finger wag after a block got its own rule from the officials', g:1 }]},
    { n:'Chris Webber', s:'NBA', c:[
      { x:'who called a timeout his team did not have with the national title on the line', g:1 }]},
    { n:'Jerry West', s:'NBA', c:[
      { x:'whose silhouette has been the league logo for over 50 years', g:1 }]},
    { n:'Devin Booker', s:'NBA', c:[
      { x:'who scored 70 in Boston at 20 years old and still lost the game', g:1 }]},
    { n:'Donovan Mitchell', s:'NBA', c:[
      { x:'who put up 71 in a comeback from 21 down in 2023', g:1 }]},
    { n:'Andre Iguodala', s:'NBA', c:[
      { x:'who came off the bench all season and then won Finals MVP', g:1 }]},
    { n:'Yao Ming', s:'NBA', c:[
      { x:'who was the first international player taken first overall without playing US college ball', g:1 }]},
    { n:'Gilbert Arenas', s:'NBA', c:[
      { x:'who called himself Agent Zero and lost a season to a locker-room stunt with firearms', g:1 }]},
    { n:'Latrell Sprewell', s:'NBA', c:[
      { x:'who turned down $21 million saying he had a family to feed, and never played again', g:1 }]},
    { n:'Shawn Kemp', s:'NBA', c:[
      { x:'who was called the Reign Man and went straight to the pros without playing a college game', g:1 }]},
    { n:'Gary Payton', s:'NBA', c:[
      { x:'who is the only point guard ever named Defensive Player of the Year', g:1 }]},
    { n:'Jason Kidd', s:'NBA', c:[
      { x:'who is second all-time in assists and took two different franchises to the Finals', g:1 }]},
    { n:'Alonzo Mourning', s:'NBA', c:[
      { x:'who had a kidney transplant and came back to win a ring three years later', g:1 }]},
    { n:'Anthony Davis', s:'NBA', c:[
      { x:'whose one eyebrow was trademarked before he had played a pro game', g:1 }]},
    { n:'Jayson Tatum', s:'NBA', c:[
      { x:'who dunked on LeBron as a rookie in a conference finals and then stared him down', g:1 }]},
    { n:'Zion Williamson', s:'NBA', c:[
      { x:'whose shoe exploded on national television and moved a company’s stock price', g:1 }]},
    { n:'Trae Young', s:'NBA', c:[
      { x:'who silenced the Garden as a visitor and tipped an imaginary cap to the crowd', g:1 }]},
    { n:'Zach Randolph', s:'NBA', c:[
      { x:'whose bruising post play gave a Memphis era its grit-and-grind nickname', g:1 }]},
    { n:'Amar’e Stoudemire', s:'NBA', c:[
      { x:'who went from high school to the pros and was Rookie of the Year at 20', g:1 }]},
    { n:'Dominique Wilkins', s:'NBA', c:[
      { x:'who was called the Human Highlight Film and lost a legendary 1988 duel despite 47 points', g:1 }]},
    { n:'Pete Maravich', s:'NBA', c:[
      { x:'who averaged 44 a game in college with no three-point line to help him', g:1 }]},
    { n:'Moses Malone', s:'NBA', c:[
      { x:'who predicted a playoff sweep in three words and very nearly delivered it', g:1 }]},
    { n:'Julius Erving', s:'NBA', c:[
      { x:'whose baseline scoop around the backboard in the 1980 Finals still gets replayed', g:1 }]},

    /* ================================================ NFL — second tranche */
    { n:'Darrelle Revis', s:'NFL', c:[
      { x:'whose coverage was so total that the patch of field he worked got called an island', g:1 }]},
    { n:'Stefon Diggs', s:'NFL', c:[
      { x:'who caught a walk-off touchdown on the last play of a playoff game with no time left', g:1 }]},
    { n:'Franco Harris', s:'NFL', c:[
      { x:'who scooped a deflection off his shoetops for the play called Immaculate', g:1 }]},
    { n:'Dan Marino', s:'NFL', c:[
      { x:'who faked a spike and threw the winning touchdown instead', g:1 }]},
    { n:'John Elway', s:'NFL', c:[
      { x:'who spun helicopter-style through three defenders for a first down in a Super Bowl', g:1 }]},
    { n:'Kurt Warner', s:'NFL', c:[
      { x:'who was stocking grocery shelves five years before winning a Super Bowl MVP', g:1 }]},
    { n:'Richard Sherman', s:'NFL', c:[
      { x:'who tipped away a title-winning pass and then delivered the loudest interview in league history', g:1 }]},
    { n:'Adrian Peterson', s:'NFL', c:[
      { x:'who ran for 2,097 yards nine short of the record, a year after tearing up his knee', g:1 }]},
    { n:'Eric Dickerson', s:'NFL', c:[
      { x:'who ran for 2,105 yards in 1984 wearing rec-specs, and nobody has passed it since', g:1 }]},
    { n:'Chris Johnson', s:'NFL', c:[
      { x:'who ran for 2,006 yards in 2009 and took a nickname from the decimal in his forty time', g:1 }]},
    { n:'Calvin Johnson', s:'NFL', c:[
      { x:'who put up 1,964 receiving yards in 2012 and walked away at 30 anyway', g:1 }]},
    { n:'LaDainian Tomlinson', s:'NFL', c:[
      { x:'who scored 31 touchdowns in 2006, the most anyone has managed in a season', g:1 }]},
    { n:'Michael Strahan', s:'NFL', c:[
      { x:'who set the single-season sack record on a play the quarterback appeared to lie down for', g:1 }]},
    { n:'Tim Tebow', s:'NFL', c:[
      { x:'who ended a playoff game on the first snap of overtime with an 80-yard throw', g:1 }]},
    { n:'Walter Payton', s:'NFL', c:[
      { x:'who was nicknamed Sweetness and did not get the ball on the goal line in his only Super Bowl', g:1 }]},
    { n:'Jim Brown', s:'NFL', c:[
      { x:'who retired at 29 as the leading rusher alive, to go make films', g:1 }]},
    { n:'Reggie White', s:'NFL', c:[
      { x:'who was an ordained minister nicknamed for it and left for Green Bay to win a title', g:1 }]},
    { n:'Charles Woodson', s:'NFL', c:[
      { x:'who is the only primarily defensive player to win the Heisman Trophy', g:1 }]},
    { n:'Ed Reed', s:'NFL', c:[
      { x:'who returned interceptions 106 and 107 yards, the two longest ever', g:1 }]},
    { n:'Larry Fitzgerald', s:'NFL', c:[
      { x:'who was a ball boy in the stadium where he later became a Hall of Fame receiver', g:1 }]},
    { n:'Tony Gonzalez', s:'NFL', c:[
      { x:'who dunked over the goalpost after touchdowns until the league banned it', g:1 }]},
    { n:'Cris Carter', s:'NFL', c:[
      { x:'who was cut for substance issues and told simply: all he does is catch touchdowns', g:1 }]},
    { n:'Michael Irvin', s:'NFL', c:[
      { x:'who called himself the Playmaker and won three rings in the 1990s', g:1 }]},
    { n:'Marshall Faulk', s:'NFL', c:[
      { x:'who had 2,429 yards from scrimmage in a season for an offense nicknamed for a pinball machine', g:1 }]},
    { n:'Terrell Davis', s:'NFL', c:[
      { x:'who ran for 2,000 yards and later won a Super Bowl MVP despite a migraine blinding him mid-game', g:1 }]},
    { n:'Ryan Leaf', s:'NFL', c:[
      { x:'who went second overall right after a certain Tennessee quarterback and became the cautionary tale', g:1 }]},
    { n:'Warren Sapp', s:'NFL', c:[
      { x:'who slid to 12th over draft-day rumors and made the Hall of Fame anyway', g:1 }]},
    { n:'Brian Urlacher', s:'NFL', c:[
      { x:'who played safety in college and became a Hall of Fame middle linebacker', g:1 }]},
    { n:'Troy Polamalu', s:'NFL', c:[
      { x:'whose hair was insured for a million dollars and who timed the snap better than anyone', g:1 }]},

    /* ================================================ MLB — second tranche */
    { n:'Hideo Nomo', s:'MLB', c:[
      { x:'whose corkscrew delivery earned the nickname Tornado and opened the door for a generation', g:1 }]},
    { n:'Roy Halladay', s:'MLB', c:[
      { x:'who threw a perfect game and a postseason no-hitter in the same year', g:1 }]},
    { n:'Felix Hernandez', s:'MLB', c:[
      { x:'who was called King before he threw a perfect game in 2012', g:1 }]},
    { n:'Mark Buehrle', s:'MLB', c:[
      { x:'who worked so fast hitters complained, and threw a perfect game in 2009', g:1 }]},
    { n:'David Cone', s:'MLB', c:[
      { x:'who threw a perfect game on the day Don Larsen and Yogi Berra were at the park', g:1 }]},
    { n:'Max Scherzer', s:'MLB', c:[
      { x:'who has two different colored eyes and once struck out 20 in a game', g:1 }]},
    { n:'Justin Verlander', s:'MLB', c:[
      { x:'who won an MVP as a pitcher and threw three no-hitters', g:1 }]},
    { n:'Tim Lincecum', s:'MLB', c:[
      { x:'who was a 5-foot-11 righty called The Freak and won back-to-back Cy Youngs', g:1 }]},
    { n:'Trevor Hoffman', s:'MLB', c:[
      { x:'whose entrance music was a bell tolling and who was first to 600 saves', g:1 }]},
    { n:'Aroldis Chapman', s:'MLB', c:[
      { x:'who threw the fastest pitch ever recorded, at 105 miles an hour', g:1 }]},
    { n:'Miguel Cabrera', s:'MLB', c:[
      { x:'who won the first Triple Crown in 45 years, in 2012', g:1 }]},
    { n:'Adrian Beltre', s:'MLB', c:[
      { x:'who hated having his head touched and hit home runs from one knee', g:1 }]},
    { n:'Mike Piazza', s:'MLB', c:[
      { x:'whose home run reopened New York baseball after 9/11, and who was a 62nd-round pick', g:1 }]},
    { n:'Jose Altuve', s:'MLB', c:[
      { x:'who is listed at 5-foot-6 and won an MVP', g:1 }]},
    { n:'Ronald Acuna Jr.', s:'MLB', c:[
      { x:'who went 40 home runs and 70 stolen bases in a season nobody had ever managed', g:1 }]},
    { n:'Juan Soto', s:'MLB', c:[
      { x:'whose crouching shuffle at pitches he takes is imitated in every little league park', g:1 }]},
    { n:'Freddie Freeman', s:'MLB', c:[
      { x:'who hit a walk-off grand slam to open the 2024 World Series on a bad ankle', g:1 }]},
    { n:'Buster Posey', s:'MLB', c:[
      { x:'whose broken leg in a home-plate collision got the rule changed', g:1 }]},
    { n:'Evan Longoria', s:'MLB', c:[
      { x:'who homered in the 162nd game to finish the wildest night of the 2011 season', g:1 }]},
    { n:'CC Sabathia', s:'MLB', c:[
      { x:'who pitched on short rest down the stretch in 2008 to drag a team into October', g:1 }]},
    { n:'Manny Ramirez', s:'MLB', c:[
      { x:'whose lapses were so routine they got their own two-word excuse', g:1 }]},
    { n:'Jim Thome', s:'MLB', c:[
      { x:'who hit 612 home runs and pointed his bat at the pitcher before every one', g:1 }]},
    { n:'Nelson Cruz', s:'MLB', c:[
      { x:'who hit 40 home runs in a season at age 38', g:1 }]},
    { n:'Giancarlo Stanton', s:'MLB', c:[
      { x:'who hits the ball harder than anyone measured and once hit 59 in a season', g:1 }]},
    { n:'Chris Sale', s:'MLB', c:[
      { x:'who was a whip-armed lefty and took scissors to his own team’s throwback uniforms', g:1 }]}
  ];

  /* ---- index + lookup ------------------------------------------------------ */
  function fold(s) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    // strip the punctuation that drifts between sources: Jr./Sr./III, periods,
    // curly vs straight apostrophes, hyphens.
    return s.toLowerCase()
      .replace(/[‘’']/g, '')
      .replace(/[.\-]/g, ' ')
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function key(sport, name) { return String(sport || '').toUpperCase() + '|' + fold(name); }

  var IDX = {}, TOTAL = 0;
  for (var i = 0; i < P.length; i++) {
    IDX[key(P[i].s, P[i].n)] = P[i];
    TOTAL += P[i].c.length;
  }

  /* All curated clues for a player, best first, or [] when unwritten. */
  function get(sport, name) {
    var rec = IDX[key(sport, name)];
    return rec ? rec.c : [];
  }
  function has(sport, name) { return !!IDX[key(sport, name)]; }

  /* Crossword form: the predicate reads straight off the given name.
   *   "Odell ___, whose one-handed grab against Dallas ..."               */
  function forCrossword(sport, name, given, pick) {
    var c = get(sport, name);
    if (!c.length || !given) return null;
    var one = c[pick == null ? 0 : (pick % c.length)];
    return given + ' ___, ' + one.x;
  }

  /* Guess form: no name at all, and only clues tagged safe — a clue naming
   * the player's own team or position would hand over a board column.       */
  function forGuess(sport, name) {
    var c = get(sport, name), out = [];
    for (var j = 0; j < c.length; j++) {
      if (!c[j].g) continue;
      out.push(c[j].x
        .replace(/^whose /, 'This player’s ')
        .replace(/^who /, 'This player ') + '.');
    }
    return out;
  }

  return {
    get: get, has: has, key: key, fold: fold,
    forCrossword: forCrossword, forGuess: forGuess,
    players: P.length, clues: TOTAL
  };
});
