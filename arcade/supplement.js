/* Hand-curated supplement to the arcade corpus.
 *
 * Bridges the gap between entities.js (curated top-tier stars) and former.js
 * (auto-scraped modern players): recognizable role players and cultural
 * figures that a common fan will nod at ("oh yeah, that guy") but that no
 * automated source ranks highly enough to promote.
 *
 * Loaded like former.js - before data.js merges it into GRID_ENTITIES.
 * data.js dedupes on (name+sport) and backfills enrichment fields; a name
 * that lands in both the curated corpus AND here is enriched, not duplicated.
 *
 * Field shape mirrors the runtime entity: name, sport, f (fame 1-5), t
 * (teams), j (jerseys), pos (position), decade (array of decade starts),
 * col (college), ns (notable seasons count, used by recognizability gates),
 * hp (1 = high draft pick, gates NFL non-star inclusion). Star overlay
 * (stars.js) can bump any of these to `.star=true` for warmup priority.
 */
(function (root) {
  'use strict';
  root.RTG_SUPPLEMENT = {
    version: 'barometer-2026-08',
    players: [
      /* ============================================================ NBA */
      { id:'sup_nba_earl-boykins',    name:'Earl Boykins',      sport:'NBA', f:4, t:['New Jersey Nets','Orlando Magic','Los Angeles Clippers','Golden State Warriors','Denver Nuggets','Milwaukee Bucks','Charlotte Bobcats','Washington Wizards','Houston Rockets'], j:[11], pos:'Point Guard', decade:[1990,2000,2010], col:'Eastern Michigan', ns:12, hp:0 },
      { id:'sup_nba_ron-baker',       name:'Ron Baker',         sport:'NBA', f:3, t:['New York Knicks','Washington Wizards'], j:[31], pos:'Guard', decade:[2010], col:'Wichita State', ns:3, hp:0 },
      { id:'sup_nba_marshon-brooks',  name:'MarShon Brooks',    sport:'NBA', f:4, t:['New Jersey Nets','Brooklyn Nets','Boston Celtics','Golden State Warriors','Los Angeles Lakers','Memphis Grizzlies'], j:[9,2], pos:'Shooting Guard', decade:[2010], col:'Providence', ns:5, hp:0 },
      { id:'sup_nba_hakim-warrick',   name:'Hakim Warrick',     sport:'NBA', f:4, t:['Memphis Grizzlies','Milwaukee Bucks','Chicago Bulls','Phoenix Suns','New Orleans Hornets','Charlotte Bobcats'], j:[21], pos:'Power Forward', decade:[2000,2010], col:'Syracuse', ns:8, hp:1 },
      { id:'sup_nba_pat-garrity',     name:'Pat Garrity',       sport:'NBA', f:4, t:['Phoenix Suns','Orlando Magic'], j:[42], pos:'Power Forward', decade:[1990,2000], col:'Notre Dame', ns:10, hp:1 },
      { id:'sup_nba_steve-novak',     name:'Steve Novak',       sport:'NBA', f:4, t:['Houston Rockets','Los Angeles Clippers','San Antonio Spurs','Dallas Mavericks','New York Knicks','Toronto Raptors','Utah Jazz','Oklahoma City Thunder','Milwaukee Bucks'], j:[16,20], pos:'Small Forward', decade:[2000,2010], col:'Marquette', ns:10, hp:0 },
      { id:'sup_nba_kris-humphries',  name:'Kris Humphries',    sport:'NBA', f:4, t:['Utah Jazz','Toronto Raptors','Dallas Mavericks','New Jersey Nets','Brooklyn Nets','Boston Celtics','Washington Wizards','Phoenix Suns','Atlanta Hawks'], j:[43,44], pos:'Power Forward', decade:[2000,2010], col:'Minnesota', ns:12, hp:1 },
      { id:'sup_nba_sebastian-telfair', name:'Sebastian Telfair', sport:'NBA', f:4, t:['Portland Trail Blazers','Boston Celtics','Minnesota Timberwolves','Los Angeles Clippers','Phoenix Suns','Cleveland Cavaliers','Toronto Raptors','Oklahoma City Thunder'], j:[31,3], pos:'Point Guard', decade:[2000,2010], col:'', ns:10, hp:1 },
      { id:'sup_nba_shabazz-napier',  name:'Shabazz Napier',    sport:'NBA', f:4, t:['Miami Heat','Orlando Magic','Portland Trail Blazers','Brooklyn Nets','Minnesota Timberwolves','Washington Wizards'], j:[13,2], pos:'Point Guard', decade:[2010,2020], col:'Connecticut', ns:6, hp:1 },
      { id:'sup_nba_norris-cole',     name:'Norris Cole',       sport:'NBA', f:4, t:['Miami Heat','New Orleans Pelicans','Oklahoma City Thunder'], j:[30], pos:'Point Guard', decade:[2010], col:'Cleveland State', ns:5, hp:0 },
      { id:'sup_nba_nate-robinson',   name:'Nate Robinson',     sport:'NBA', f:4, t:['New York Knicks','Boston Celtics','Oklahoma City Thunder','Golden State Warriors','Chicago Bulls','Denver Nuggets','Los Angeles Clippers','New Orleans Pelicans'], j:[4,2], pos:'Point Guard', decade:[2000,2010], col:'Washington', ns:11, hp:0 },
      { id:'sup_nba_nazr-mohammed',   name:'Nazr Mohammed',     sport:'NBA', f:4, t:['Philadelphia 76ers','Atlanta Hawks','New York Knicks','San Antonio Spurs','Detroit Pistons','Charlotte Bobcats','Oklahoma City Thunder','Chicago Bulls'], j:[13,20], pos:'Center', decade:[1990,2000,2010], col:'Kentucky', ns:14, hp:1 },
      { id:'sup_nba_darrell-armstrong-supp', name:'Darrell Armstrong', sport:'NBA', f:4, t:['Orlando Magic','New Orleans Hornets','Dallas Mavericks','Indiana Pacers','New Jersey Nets'], j:[10], pos:'Point Guard', decade:[1990,2000], col:'Fayetteville State', ns:11, hp:0 },
      { id:'sup_nba_damon-jones',     name:'Damon Jones',       sport:'NBA', f:3, t:['Boston Celtics','Golden State Warriors','New Jersey Nets','Dallas Mavericks','Detroit Pistons','Sacramento Kings','Milwaukee Bucks','Vancouver Grizzlies','Miami Heat','Cleveland Cavaliers'], j:[6,55], pos:'Point Guard', decade:[1990,2000], col:'Houston', ns:12, hp:0 },
      { id:'sup_nba_daniel-gibson',   name:'Daniel Gibson',     sport:'NBA', f:3, t:['Cleveland Cavaliers'], j:[1], pos:'Shooting Guard', decade:[2000,2010], col:'Texas', ns:7, hp:0 },
      { id:'sup_nba_drew-gooden-supp', name:'Drew Gooden',      sport:'NBA', f:4, t:['Orlando Magic','Cleveland Cavaliers','Chicago Bulls','Sacramento Kings','San Antonio Spurs','Dallas Mavericks','Los Angeles Clippers','Milwaukee Bucks','Washington Wizards'], j:[90,0,8], pos:'Power Forward', decade:[2000,2010], col:'Kansas', ns:11, hp:1 },
      { id:'sup_nba_ricky-davis',     name:'Ricky Davis',       sport:'NBA', f:4, t:['Charlotte Hornets','Miami Heat','Cleveland Cavaliers','Boston Celtics','Minnesota Timberwolves','Los Angeles Clippers'], j:[31,44], pos:'Shooting Guard', decade:[1990,2000], col:'Iowa', ns:10, hp:0 },
      { id:'sup_nba_devin-harris-supp', name:'Devin Harris',    sport:'NBA', f:4, t:['Dallas Mavericks','New Jersey Nets','Utah Jazz','Atlanta Hawks','Denver Nuggets'], j:[5,34], pos:'Point Guard', decade:[2000,2010], col:'Wisconsin', ns:12, hp:1 },
      { id:'sup_nba_mike-miller-supp', name:'Mike Miller',      sport:'NBA', f:4, t:['Orlando Magic','Memphis Grizzlies','Minnesota Timberwolves','Washington Wizards','Miami Heat','Cleveland Cavaliers','Denver Nuggets'], j:[13], pos:'Small Forward', decade:[2000,2010], col:'Florida', ns:14, hp:1 },
      { id:'sup_nba_rafer-alston-supp', name:'Rafer Alston',    sport:'NBA', f:4, t:['Milwaukee Bucks','Toronto Raptors','Miami Heat','Houston Rockets','Orlando Magic','New Jersey Nets'], j:[12,11], pos:'Point Guard', decade:[1990,2000], col:'Fresno State', ns:11, hp:0 },
      { id:'sup_nba_raymond-felton-supp', name:'Raymond Felton', sport:'NBA', f:4, t:['Charlotte Bobcats','New York Knicks','Denver Nuggets','Portland Trail Blazers','Dallas Mavericks','Los Angeles Clippers','Oklahoma City Thunder'], j:[20], pos:'Point Guard', decade:[2000,2010], col:'North Carolina', ns:13, hp:1 },

      /* ============================================================ NFL */
      { id:'sup_nfl_tim-tebow',       name:'Tim Tebow',         sport:'NFL', f:5, t:['Denver Broncos','New York Jets','New England Patriots','Philadelphia Eagles'], j:[15], pos:'Quarterback', decade:[2010], col:'Florida', ns:3, hp:1 },
      { id:'sup_nfl_johnny-manziel',  name:'Johnny Manziel',    sport:'NFL', f:4, t:['Cleveland Browns'], j:[2], pos:'Quarterback', decade:[2010], col:'Texas A&M', ns:2, hp:1 },
      { id:'sup_nfl_david-tyree',     name:'David Tyree',       sport:'NFL', f:4, t:['New York Giants','Baltimore Ravens'], j:[85], pos:'Wide Receiver', decade:[2000,2010], col:'Syracuse', ns:7, hp:0 },
      { id:'sup_nfl_joseph-addai',    name:'Joseph Addai',      sport:'NFL', f:4, t:['Indianapolis Colts','New England Patriots'], j:[29], pos:'Running Back', decade:[2000,2010], col:'LSU', ns:6, hp:1 },
      { id:'sup_nfl_charcandrick-west', name:'Charcandrick West', sport:'NFL', f:3, t:['Kansas City Chiefs'], j:[35], pos:'Running Back', decade:[2010], col:'Abilene Christian', ns:5, hp:0 },
      { id:'sup_nfl_spencer-ware',    name:'Spencer Ware',      sport:'NFL', f:3, t:['Seattle Seahawks','Kansas City Chiefs','Indianapolis Colts'], j:[32,20], pos:'Running Back', decade:[2010], col:'LSU', ns:6, hp:0 },
      { id:'sup_nfl_bishop-sankey',   name:'Bishop Sankey',     sport:'NFL', f:3, t:['Tennessee Titans','Minnesota Vikings'], j:[20], pos:'Running Back', decade:[2010], col:'Washington', ns:3, hp:1 },
      { id:'sup_nfl_bert-emanuel',    name:'Bert Emanuel',      sport:'NFL', f:3, t:['Atlanta Falcons','Tampa Bay Buccaneers','New England Patriots','Miami Dolphins','Detroit Lions'], j:[81,89], pos:'Wide Receiver', decade:[1990,2000], col:'Rice', ns:8, hp:0 },
      { id:'sup_nfl_arrelious-benn',  name:'Arrelious Benn',    sport:'NFL', f:3, t:['Tampa Bay Buccaneers','Philadelphia Eagles','Jacksonville Jaguars'], j:[17], pos:'Wide Receiver', decade:[2010], col:'Illinois', ns:5, hp:0 },
      { id:'sup_nfl_greg-camarillo',  name:'Greg Camarillo',    sport:'NFL', f:3, t:['San Diego Chargers','Miami Dolphins','Minnesota Vikings','New Orleans Saints'], j:[83], pos:'Wide Receiver', decade:[2000,2010], col:'Stanford', ns:6, hp:0 },
      { id:'sup_nfl_ben-coates',      name:'Ben Coates',        sport:'NFL', f:4, t:['New England Patriots','Baltimore Ravens'], j:[87], pos:'Tight End', decade:[1990,2000], col:'Livingstone', ns:10, hp:0 },
      { id:'sup_nfl_tyler-thigpen',   name:'Tyler Thigpen',     sport:'NFL', f:3, t:['Minnesota Vikings','Kansas City Chiefs','Miami Dolphins','Buffalo Bills'], j:[14,4], pos:'Quarterback', decade:[2000,2010], col:'Coastal Carolina', ns:6, hp:0 },
      { id:'sup_nfl_ej-manuel',       name:'E.J. Manuel',       sport:'NFL', f:3, t:['Buffalo Bills','Oakland Raiders'], j:[3], pos:'Quarterback', decade:[2010], col:'Florida State', ns:5, hp:1 },
      { id:'sup_nfl_chris-weinke',    name:'Chris Weinke',      sport:'NFL', f:3, t:['Carolina Panthers','San Francisco 49ers'], j:[16], pos:'Quarterback', decade:[2000], col:'Florida State', ns:7, hp:0 },
      { id:'sup_nfl_chris-leak',      name:'Chris Leak',        sport:'NFL', f:3, t:['Chicago Bears','Montreal Alouettes'], j:[8], pos:'Quarterback', decade:[2000], col:'Florida', ns:2, hp:0 },
      { id:'sup_nfl_ken-dorsey',      name:'Ken Dorsey',        sport:'NFL', f:3, t:['San Francisco 49ers','Cleveland Browns'], j:[7], pos:'Quarterback', decade:[2000], col:'Miami', ns:5, hp:0 },
      { id:'sup_nfl_marcus-vick',     name:'Marcus Vick',       sport:'NFL', f:3, t:['Miami Dolphins'], j:[6], pos:'Quarterback', decade:[2000], col:'Virginia Tech', ns:1, hp:0 },
      { id:'sup_nfl_major-wright',    name:'Major Wright',      sport:'NFL', f:3, t:['Chicago Bears','Tampa Bay Buccaneers'], j:[21], pos:'Safety', decade:[2010], col:'Florida', ns:6, hp:0 },
      { id:'sup_nfl_phillip-lindsay', name:'Phillip Lindsay',   sport:'NFL', f:4, t:['Denver Broncos','Houston Texans','Miami Dolphins','Indianapolis Colts'], j:[30], pos:'Running Back', decade:[2010,2020], col:'Colorado', ns:5, hp:0 },
      { id:'sup_nfl_steve-slaton',    name:'Steve Slaton',      sport:'NFL', f:3, t:['Houston Texans','Miami Dolphins'], j:[20], pos:'Running Back', decade:[2000,2010], col:'West Virginia', ns:5, hp:0 },
      { id:'sup_nfl_jeff-demps',      name:'Jeff Demps',        sport:'NFL', f:2, t:['New England Patriots','Tampa Bay Buccaneers'], j:[35], pos:'Running Back', decade:[2010], col:'Florida', ns:2, hp:0 },
      { id:'sup_nfl_joique-bell',     name:'Joique Bell',       sport:'NFL', f:3, t:['Philadelphia Eagles','Indianapolis Colts','New Orleans Saints','Detroit Lions'], j:[35], pos:'Running Back', decade:[2010], col:'Wayne State', ns:5, hp:0 },
      { id:'sup_nfl_cj-anderson-supp', name:'C.J. Anderson',    sport:'NFL', f:4, t:['Denver Broncos','Carolina Panthers','Los Angeles Rams','Detroit Lions'], j:[22], pos:'Running Back', decade:[2010], col:'California', ns:6, hp:0 },
      { id:'sup_nfl_javorskie-lane',  name:'Javorskie Lane',    sport:'NFL', f:2, t:['Miami Dolphins','Baltimore Ravens'], j:[43], pos:'Fullback', decade:[2010], col:'Texas A&M', ns:3, hp:0 },
      { id:'sup_nfl_cleo-lemon-supp', name:'Cleo Lemon',        sport:'NFL', f:3, t:['San Diego Chargers','Miami Dolphins','Jacksonville Jaguars'], j:[16], pos:'Quarterback', decade:[2000,2010], col:'Arkansas State', ns:5, hp:0 },
      { id:'sup_nfl_charlie-ward-supp', name:'Charlie Ward',    sport:'NBA', f:3, t:['New York Knicks','San Antonio Spurs','Houston Rockets'], j:[21], pos:'Point Guard', decade:[1990,2000], col:'Florida State', ns:9, hp:1 },
      { id:'sup_nfl_ricky-davis-supp', name:'Ricky Davis',      sport:'NFL', f:3, t:['Dallas Cowboys'], j:[26], pos:'Running Back', decade:[1970,1980], col:'Alabama', ns:5, hp:0 },

      /* ============================================================ MLB */
      { id:'sup_mlb_cody-ross',       name:'Cody Ross',         sport:'MLB', f:4, t:['Detroit Tigers','Los Angeles Dodgers','Cincinnati Reds','Florida Marlins','San Francisco Giants','Boston Red Sox','Arizona Diamondbacks','Oakland Athletics'], j:[7,15,13], pos:'Outfielder', decade:[2000,2010], col:'', ns:11, hp:0 },
      { id:'sup_mlb_grady-sizemore',  name:'Grady Sizemore',    sport:'MLB', f:4, t:['Cleveland Indians','Boston Red Sox','Philadelphia Phillies','Tampa Bay Rays'], j:[24], pos:'Outfielder', decade:[2000,2010], col:'', ns:10, hp:0 },
      { id:'sup_mlb_matt-garza',      name:'Matt Garza',        sport:'MLB', f:4, t:['Minnesota Twins','Tampa Bay Rays','Chicago Cubs','Texas Rangers','Milwaukee Brewers'], j:[22,17], pos:'Pitcher', decade:[2000,2010], col:'Fresno State', ns:12, hp:0 },
      { id:'sup_mlb_daisuke-matsuzaka', name:'Daisuke Matsuzaka', sport:'MLB', f:4, t:['Boston Red Sox','New York Mets'], j:[18], pos:'Pitcher', decade:[2000,2010], col:'', ns:8, hp:0 },
      { id:'sup_mlb_orlando-hernandez', name:'Orlando Hernandez', sport:'MLB', f:4, t:['New York Yankees','Chicago White Sox','Arizona Diamondbacks','New York Mets'], j:[26], pos:'Pitcher', decade:[1990,2000], col:'', ns:10, hp:0 },
      { id:'sup_mlb_bartolo-colon-supp', name:'Bartolo Colon',  sport:'MLB', f:5, t:['Cleveland Indians','Montreal Expos','Chicago White Sox','Los Angeles Angels','Boston Red Sox','New York Yankees','Oakland Athletics','New York Mets','Atlanta Braves','Minnesota Twins','Texas Rangers'], j:[40,51], pos:'Pitcher', decade:[1990,2000,2010], col:'', ns:16, hp:0 },
      { id:'sup_mlb_cliff-floyd',     name:'Cliff Floyd',       sport:'MLB', f:4, t:['Montreal Expos','Florida Marlins','Boston Red Sox','New York Mets','Chicago Cubs','Tampa Bay Rays','San Diego Padres'], j:[30], pos:'Outfielder', decade:[1990,2000], col:'', ns:12, hp:0 },
      { id:'sup_mlb_bill-mueller',    name:'Bill Mueller',      sport:'MLB', f:3, t:['San Francisco Giants','Chicago Cubs','Boston Red Sox','Los Angeles Dodgers'], j:[11], pos:'Third Baseman', decade:[1990,2000], col:'Southwest Missouri State', ns:10, hp:0 },
      { id:'sup_mlb_keith-foulke',    name:'Keith Foulke',      sport:'MLB', f:4, t:['San Francisco Giants','Chicago White Sox','Oakland Athletics','Boston Red Sox'], j:[29], pos:'Pitcher', decade:[1990,2000], col:'Lewis-Clark State', ns:9, hp:0 },
      { id:'sup_mlb_mark-bellhorn',   name:'Mark Bellhorn',     sport:'MLB', f:3, t:['Oakland Athletics','Chicago Cubs','Colorado Rockies','Boston Red Sox','New York Yankees','San Diego Padres','Cincinnati Reds'], j:[10,3], pos:'Second Baseman', decade:[1990,2000], col:'Auburn', ns:9, hp:0 },
      { id:'sup_mlb_rey-ordonez',     name:'Rey Ordonez',       sport:'MLB', f:4, t:['New York Mets','Tampa Bay Devil Rays','Chicago Cubs'], j:[10], pos:'Shortstop', decade:[1990,2000], col:'', ns:9, hp:0 },
      { id:'sup_mlb_benny-agbayani',  name:'Benny Agbayani',    sport:'MLB', f:3, t:['New York Mets','Colorado Rockies','Boston Red Sox'], j:[50], pos:'Outfielder', decade:[1990,2000], col:'Hawaii Pacific', ns:5, hp:0 },
      { id:'sup_mlb_antonio-alfonseca', name:'Antonio Alfonseca', sport:'MLB', f:3, t:['Florida Marlins','Chicago Cubs','Atlanta Braves','Texas Rangers','Philadelphia Phillies','New York Mets'], j:[57], pos:'Pitcher', decade:[1990,2000], col:'', ns:10, hp:0 },
      { id:'sup_mlb_armando-benitez', name:'Armando Benitez',   sport:'MLB', f:4, t:['Baltimore Orioles','New York Mets','New York Yankees','Seattle Mariners','Florida Marlins','San Francisco Giants','Toronto Blue Jays','Milwaukee Brewers','Houston Astros'], j:[49], pos:'Pitcher', decade:[1990,2000], col:'', ns:13, hp:0 },
      { id:'sup_mlb_alfredo-amezaga', name:'Alfredo Amezaga',   sport:'MLB', f:3, t:['Los Angeles Angels','Colorado Rockies','Pittsburgh Pirates','Florida Marlins'], j:[9,17], pos:'Second Baseman', decade:[2000,2010], col:'Texas Tech', ns:8, hp:0 },
      { id:'sup_mlb_ryan-freel',      name:'Ryan Freel',        sport:'MLB', f:3, t:['Toronto Blue Jays','Tampa Bay Devil Rays','Cincinnati Reds','Baltimore Orioles','Chicago Cubs','Kansas City Royals'], j:[6], pos:'Outfielder', decade:[2000], col:'Tallahassee CC', ns:7, hp:0 },
      { id:'sup_mlb_lenny-harris',    name:'Lenny Harris',      sport:'MLB', f:3, t:['Cincinnati Reds','Los Angeles Dodgers','New York Mets','Colorado Rockies','Milwaukee Brewers','Arizona Diamondbacks','Chicago Cubs','Florida Marlins'], j:[3], pos:'Second Baseman', decade:[1980,1990,2000], col:'', ns:14, hp:0 },
      { id:'sup_mlb_eric-thames',     name:'Eric Thames',       sport:'MLB', f:3, t:['Toronto Blue Jays','Seattle Mariners','Milwaukee Brewers','Washington Nationals'], j:[7], pos:'Outfielder', decade:[2010,2020], col:'Pepperdine', ns:6, hp:0 },
      { id:'sup_mlb_john-jaso',       name:'John Jaso',         sport:'MLB', f:3, t:['Tampa Bay Rays','Seattle Mariners','Oakland Athletics','Pittsburgh Pirates'], j:[28,5], pos:'Catcher', decade:[2000,2010], col:'Southwestern Oregon CC', ns:8, hp:0 },
      { id:'sup_mlb_julio-lugo',      name:'Julio Lugo',        sport:'MLB', f:3, t:['Houston Astros','Tampa Bay Devil Rays','Los Angeles Dodgers','Boston Red Sox','St. Louis Cardinals','Baltimore Orioles','Atlanta Braves'], j:[23,10], pos:'Shortstop', decade:[2000,2010], col:'Connors State', ns:11, hp:0 },
      { id:'sup_mlb_jorge-cantu',     name:'Jorge Cantu',       sport:'MLB', f:3, t:['Tampa Bay Devil Rays','Cincinnati Reds','Florida Marlins','Texas Rangers','San Diego Padres'], j:[3,12], pos:'Third Baseman', decade:[2000,2010], col:'', ns:8, hp:0 },
      { id:'sup_mlb_hee-seop-choi',   name:'Hee-Seop Choi',     sport:'MLB', f:3, t:['Chicago Cubs','Florida Marlins','Los Angeles Dodgers'], j:[59,15], pos:'First Baseman', decade:[2000], col:'', ns:4, hp:0 },
      { id:'sup_mlb_kazuo-matsui',    name:'Kazuo Matsui',      sport:'MLB', f:3, t:['New York Mets','Colorado Rockies','Houston Astros'], j:[7,25], pos:'Second Baseman', decade:[2000,2010], col:'', ns:5, hp:0 },
      { id:'sup_mlb_wily-mo-pena',    name:'Wily Mo Pena',      sport:'MLB', f:3, t:['Cincinnati Reds','Boston Red Sox','Washington Nationals','Arizona Diamondbacks','Seattle Mariners'], j:[26,22], pos:'Outfielder', decade:[2000,2010], col:'', ns:6, hp:0 },
      { id:'sup_mlb_dan-vogelbach',   name:'Dan Vogelbach',     sport:'MLB', f:3, t:['Seattle Mariners','Toronto Blue Jays','Milwaukee Brewers','Pittsburgh Pirates','New York Mets'], j:[20,32], pos:'Designated Hitter', decade:[2010,2020], col:'', ns:6, hp:0 },
      { id:'sup_mlb_pokey-reese-supp', name:'Pokey Reese',      sport:'MLB', f:3, t:['Cincinnati Reds','Pittsburgh Pirates','Boston Red Sox'], j:[3,4], pos:'Second Baseman', decade:[1990,2000], col:'', ns:7, hp:1 }
    ]
  };
})(typeof self !== 'undefined' ? self : this);
