/* Recognizable-player overlay for the arcade games.
 *
 * The auto-scraped corpus (former.js + entities.js) can tell us who existed
 * and how long their career lasted, but it can't reliably tell us who a
 * casual sports fan would RECOGNIZE. That mismatch was the source of the
 * "too many random guys nobody has heard of" complaint - a 12-year NFL long
 * snapper has the same ns/hp signature as a 12-year Pro Bowl WR.
 *
 * This file is a hand-curated whitelist across NBA / NFL / MLB, split into
 * two tiers:
 *   ICONS  - all-time greats. Any era. These are the names that belong in
 *            the pool even when their careers ended pre-1990 (Ruth, Kareem,
 *            Bird, Jerry Rice, Barry Sanders, Griffey…).
 *   STARS  - modern-era (roughly 1990+) All-Star / Pro Bowl caliber players
 *            plus current stars whose games any active fan would recognize.
 *
 * data.js walks the merged corpus, and for any entity whose name appears
 * here (matched by "sport|name"), sets `e.star = true` and bumps its fame
 * to at least 4 (5 for ICONS). Game gates trust `.star` as the primary
 * recognizability signal - no auto-detected credentials needed to shine
 * through.
 *
 * Adding a name here is the fastest way to say "this player should be in
 * the pool" without touching game logic. The awards-scraping pipeline in
 * scripts/fetch-awards.mjs will eventually enrich the corpus with real
 * award data; until then this is the source of truth.
 */
(function(root){
  'use strict';

  /* ============================================================
   * NBA - all-time icons (any era) + modern stars (~1990–present)
   * ============================================================ */
  var NBA_ICONS = [
    'Kareem Abdul-Jabbar','Wilt Chamberlain','Bill Russell','Larry Bird','Magic Johnson','Michael Jordan',
    'Oscar Robertson','Jerry West','Elgin Baylor','Bob Cousy','Julius Erving','Rick Barry','George Gervin',
    'Moses Malone','Isiah Thomas','Bob Pettit','George Mikan','John Havlicek','Willis Reed','Elvin Hayes',
    'Pete Maravich','Nate Thurmond','Wes Unseld','Bob McAdoo','Dominique Wilkins','Kevin McHale',
    'Dennis Rodman','Robert Parish','James Worthy','Alex English','Bernard King','Sidney Moncrief',
    'Adrian Dantley','Walt Frazier','Dave Cowens','Nate Archibald','Dolph Schayes','Hal Greer','Sam Jones',
    'Tom Heinsohn','Bill Sharman','Bob Lanier','Jerry Lucas','Earl Monroe','Dave Bing','Rick Barry',
    'Chet Walker','Kevin Johnson','Reggie Miller','Charles Barkley','Karl Malone','John Stockton',
    'Hakeem Olajuwon','David Robinson','Patrick Ewing','Shaquille O\'Neal','Tim Duncan','Kevin Garnett',
    'Allen Iverson','Kobe Bryant','Steve Nash','Dirk Nowitzki','Jason Kidd','Grant Hill','Ray Allen',
    'Paul Pierce','LeBron James','Dwyane Wade','Chris Paul','Dwight Howard','Carmelo Anthony',
    'Manu Ginobili','Tony Parker','Kevin Durant','Russell Westbrook','James Harden','Stephen Curry',
    'Klay Thompson','Draymond Green','Kawhi Leonard','Paul George','Damian Lillard','Anthony Davis',
    'Nikola Jokic','Giannis Antetokounmpo','Joel Embiid','Jayson Tatum','Luka Doncic','Jimmy Butler',
    'Kyrie Irving','Devin Booker','Trae Young','Ja Morant','Zion Williamson','Anthony Edwards',
    'Victor Wembanyama'
  ];
  var NBA_STARS = [
    // 80s-90s standouts
    'Alonzo Mourning','Chris Webber','Mitch Richmond','Shawn Kemp','Gary Payton','Vin Baker',
    'Latrell Sprewell','Tim Hardaway','Larry Johnson','Anfernee Hardaway','Glen Rice','Detlef Schrempf',
    'Rod Strickland','Terry Porter','Mookie Blaylock','Nick Anderson','Horace Grant','Scottie Pippen',
    'Vlade Divac','Arvydas Sabonis','Toni Kukoc','Drazen Petrovic','Sarunas Marciulionis','Manute Bol',
    'Kenny Anderson','Kevin Johnson','Jason Terry','Antonio McDyess','Antoine Walker','Jamal Mashburn',
    'Rex Chapman','Dan Majerle','Jeff Hornacek','Cedric Ceballos','Loy Vaught','Christian Laettner',
    'Isaiah Rider','Steve Smith','Sam Cassell','Bryant Reeves','Dikembe Mutombo','Sean Elliott',
    'Terrell Brandon','Voshon Lenard','Anthony Mason','John Starks','Charles Oakley',
    // 2000s standouts
    'Vince Carter','Tracy McGrady','Baron Davis','Elton Brand','Peja Stojakovic','Chris Webber',
    'Rasheed Wallace','Ben Wallace','Chauncey Billups','Richard Hamilton','Tayshaun Prince',
    'Andrei Kirilenko','Pau Gasol','Marc Gasol','Zach Randolph','Amar\'e Stoudemire','Steve Francis',
    'Michael Redd','Gilbert Arenas','Jamaal Magloire','Antawn Jamison','Corey Maggette','Josh Howard',
    'Jason Richardson','Jermaine O\'Neal','Rasheed Wallace','Rashard Lewis','Danny Granger',
    'Andre Miller','Andre Iguodala','Mike Bibby','Brad Miller','Andrew Bogut','Emeka Okafor',
    'Chris Bosh','Al Jefferson','David Lee','Kevin Martin','Monta Ellis','Deron Williams','Joe Johnson',
    'Josh Smith','Al Horford','Joakim Noah','Derrick Rose','Kevin Love','Roy Hibbert','Serge Ibaka',
    'Marcin Gortat','Nene','Andris Biedrins','Tyson Chandler','LaMarcus Aldridge','Nicolas Batum',
    // 2010s standouts
    'Rudy Gay','Danilo Gallinari','Wesley Matthews','Jrue Holiday','Ricky Rubio','John Wall',
    'Bradley Beal','Kyle Lowry','DeMar DeRozan','Andrew Wiggins','Zach LaVine','Jordan Clarkson',
    'DeMarcus Cousins','Isaiah Thomas','Nikola Vucevic','Andre Drummond','Hassan Whiteside',
    'DeAndre Jordan','JJ Redick','Wesley Matthews','Wesley Matthews','Marcus Smart','Jaylen Brown',
    'Al Horford','Gordon Hayward','Otto Porter','Bojan Bogdanovic','Bogdan Bogdanovic','Bogdan Bogdanovic',
    'Kemba Walker','Blake Griffin','Ben Simmons','Karl-Anthony Towns','Andrew Wiggins','Jamal Murray',
    'Aaron Gordon','Michael Porter Jr.','Bam Adebayo','Tyler Herro','Duncan Robinson','De\'Aaron Fox',
    'Domantas Sabonis','Buddy Hield','Malcolm Brogdon','Julius Randle','Terry Rozier','LaMelo Ball',
    'Miles Bridges','Coby White','Nikola Vucevic','Zach LaVine','Cade Cunningham','Franz Wagner',
    'Jalen Green','Alperen Sengun','Josh Giddey','Chet Holmgren','Paolo Banchero','Jalen Brunson',
    'Julius Randle','Mikal Bridges','Cam Thomas','Immanuel Quickley','RJ Barrett','Deandre Ayton',
    'Jaren Jackson Jr.','Desmond Bane','Tyus Jones','Dillon Brooks','Brandon Ingram','CJ McCollum',
    'Zion Williamson','Jonas Valanciunas','Herbert Jones','Rui Hachimura','Jordan Poole',
    'Andrew Wiggins','Kevon Looney','Gary Payton II','Jonathan Kuminga','Moses Moody',
    'Tobias Harris','Tyrese Maxey','James Harden','Kelly Oubre Jr.','Nicolas Batum','Nic Claxton',
    'Cam Thomas','Ben Simmons','Dennis Schroder','Cameron Johnson','Grayson Allen','Bobby Portis',
    'Khris Middleton','Brook Lopez','Jrue Holiday','Damian Lillard','Anthony Edwards','Rudy Gobert',
    'Karl-Anthony Towns','Mike Conley','Naz Reid','Jaden McDaniels','Devin Vassell','Keldon Johnson',
    'Chris Duarte','Buddy Hield','TJ McConnell','Bennedict Mathurin','Aaron Nesmith','Andrew Nembhard',
    'De\'Aaron Fox','Domantas Sabonis','Kevin Huerter','Malik Monk','Keegan Murray','Kevin Porter Jr.',
    'Devin Booker','Kevin Durant','Bradley Beal','Grayson Allen','Jusuf Nurkic','Anfernee Simons',
    'Deandre Ayton','Scoot Henderson','Toumani Camara','Shai Gilgeous-Alexander','Josh Giddey',
    'Chet Holmgren','Jalen Williams','Isaiah Joe','Luguentz Dort','Tre Mann','Aaron Wiggins','Cason Wallace',
    // Barometer bumps - recognizable role players / cult heroes friends flagged
    'Nate Robinson','Steve Novak','Kris Humphries','Sebastian Telfair','Hakim Warrick','Norris Cole',
    'Earl Boykins','Pat Garrity','Rafer Alston','Nazr Mohammed','Darrell Armstrong','Mike Miller',
    'Raymond Felton','Devin Harris','Drew Gooden','Ricky Davis','Darren Collison','Damon Jones',
    'Shabazz Napier','Marshon Brooks'
  ];

  /* ============================================================
   * NFL - all-time icons + modern stars
   * ============================================================ */
  var NFL_ICONS = [
    // QB icons
    'Tom Brady','Joe Montana','Peyton Manning','Dan Marino','John Elway','Brett Favre','Steve Young',
    'Johnny Unitas','Roger Staubach','Terry Bradshaw','Aaron Rodgers','Fran Tarkenton','Bart Starr',
    'Jim Kelly','Warren Moon','Troy Aikman','Kurt Warner','Drew Brees','Ben Roethlisberger',
    'Sammy Baugh','Sid Luckman','Otto Graham','Y.A. Tittle','Bob Griese','Ken Stabler','Dan Fouts',
    'Boomer Esiason','Randall Cunningham','Steve McNair','Donovan McNabb','Michael Vick','Philip Rivers',
    'Eli Manning','Patrick Mahomes','Josh Allen','Joe Burrow','Justin Herbert','Lamar Jackson','Jalen Hurts',
    // RB icons
    'Jim Brown','Walter Payton','Barry Sanders','Emmitt Smith','Eric Dickerson','LaDainian Tomlinson',
    'Marshall Faulk','Adrian Peterson','O.J. Simpson','Earl Campbell','Franco Harris','Tony Dorsett',
    'Marcus Allen','Curtis Martin','Jerome Bettis','Thurman Thomas','Roger Craig','Gale Sayers',
    'Herschel Walker','Terrell Davis','Priest Holmes','Shaun Alexander','Edgerrin James','Fred Taylor',
    'Steven Jackson','Frank Gore','LeSean McCoy','Marshawn Lynch','Le\'Veon Bell','David Johnson',
    'Ezekiel Elliott','Todd Gurley','Alvin Kamara','Derrick Henry','Christian McCaffrey','Nick Chubb',
    'Dalvin Cook','Jonathan Taylor','Saquon Barkley','Bijan Robinson','Jahmyr Gibbs','Josh Jacobs',
    'Aaron Jones','Austin Ekeler','Joe Mixon','Kenneth Walker III','Breece Hall',
    // WR icons
    'Jerry Rice','Randy Moss','Terrell Owens','Marvin Harrison','Larry Fitzgerald','Steve Largent',
    'Cris Carter','Isaac Bruce','Torry Holt','Reggie Wayne','Andre Reed','Andre Johnson',
    'Michael Irvin','Anquan Boldin','Hines Ward','Chad Ochocinco','Chad Johnson','Steve Smith Sr.',
    'Antonio Brown','Julio Jones','Calvin Johnson','A.J. Green','DeAndre Hopkins','Odell Beckham Jr.',
    'Julian Edelman','Amari Cooper','Michael Thomas','Davante Adams','Tyreek Hill','Stefon Diggs',
    'Cooper Kupp','Justin Jefferson','Ja\'Marr Chase','CeeDee Lamb','A.J. Brown','Mike Evans',
    'Chris Godwin','Keenan Allen','DK Metcalf','Terry McLaurin','Garrett Wilson','Amon-Ra St. Brown',
    'Puka Nacua','Deebo Samuel','Brandon Aiyuk','Marvin Harrison Jr.','Malik Nabers','Rome Odunze',
    'Drake London','DeVonta Smith','Nico Collins','Diontae Johnson','Jaylen Waddle','Christian Kirk',
    // TE icons
    'Rob Gronkowski','Tony Gonzalez','Antonio Gates','Shannon Sharpe','Kellen Winslow','Ozzie Newsome',
    'Mike Ditka','Jason Witten','Greg Olsen','Jimmy Graham','Travis Kelce','George Kittle','Mark Andrews',
    'Zach Ertz','T.J. Hockenson','Darren Waller','Sam LaPorta','Trey McBride','Pat Freiermuth',
    'David Njoku','Dallas Goedert','Evan Engram','Kyle Pitts',
    // Defense icons
    'Lawrence Taylor','Reggie White','Bruce Smith','Michael Strahan','Deacon Jones','Deion Sanders',
    'Ronnie Lott','Ed Reed','Rod Woodson','Charles Woodson','Champ Bailey','Darrelle Revis',
    'Richard Sherman','Patrick Peterson','Troy Polamalu','Brian Dawkins','Kam Chancellor','Earl Thomas',
    'Ray Lewis','Brian Urlacher','Junior Seau','Derrick Brooks','Willie McGinest','Tedy Bruschi',
    'Zach Thomas','Patrick Willis','Luke Kuechly','Bobby Wagner','Fred Warner','Roquan Smith',
    'Julius Peppers','DeMarcus Ware','Jared Allen','Von Miller','Khalil Mack','J.J. Watt','Aaron Donald',
    'Myles Garrett','T.J. Watt','Nick Bosa','Joey Bosa','Micah Parsons','Chase Young','Danielle Hunter',
    'Trey Hendrickson','Maxx Crosby','Kayvon Thibodeaux','Will Anderson Jr.',
    'Cameron Jordan','Bradley Chubb','Jalen Ramsey','Sauce Gardner','Pat Surtain II','Devon Witherspoon',
    'Marlon Humphrey','Xavien Howard','Denzel Ward','Marshon Lattimore','Byron Jones','Justin Simmons',
    'Kevin Byard','Minkah Fitzpatrick','Derwin James','Jessie Bates III','Tyrann Mathieu','Jamal Adams',
    // OL icons
    'Larry Allen','Anthony Munoz','Bruce Matthews','Walter Jones','Jonathan Ogden','Alan Faneca',
    'Willie Roaf','Randall McDaniel','Orlando Pace','Joe Thomas','Trent Williams','Zack Martin',
    'David Bakhtiari','Quenton Nelson','Tyron Smith','Duane Brown','Rodney Hudson','Jason Kelce',
    'Frank Ragnow','Creed Humphrey','Penei Sewell','Lane Johnson','Ronnie Stanley','Andrew Whitworth',
    'Andrew Norwell','Marshal Yanda','Joel Bitonio','Corey Linsley','Ryan Kelly',
    // Kickers / specialists / coaches worth knowing
    'Adam Vinatieri','Justin Tucker','Sebastian Janikowski','Morten Andersen','Jason Sanders',
    'Harrison Butker','Bill Belichick','Andy Reid','Sean McVay','Sean Payton','Mike Tomlin',
    'John Harbaugh','Kyle Shanahan','Nick Sirianni','Dan Campbell','Zac Taylor','Kyle Shanahan',
    'Doug Pederson','Bruce Arians','Pete Carroll','Sean McDermott','Mike McCarthy','Ron Rivera'
  ];
  var NFL_STARS = [
    // notable modern starters not in the icons tier
    'Alex Smith','Dak Prescott','Matthew Stafford','Kirk Cousins','Ryan Tannehill','Baker Mayfield',
    'Geno Smith','Derek Carr','Deshaun Watson','Jared Goff','Jimmy Garoppolo','Jacoby Brissett',
    'Andy Dalton','Case Keenum','Sam Darnold','Daniel Jones','Bryce Young','C.J. Stroud','Anthony Richardson',
    'Trey Lance','Zach Wilson','Justin Fields','Kenny Pickett','Sam Howell','Desmond Ridder','Aidan O\'Connell',
    // RBs
    'Chris Carson','James Conner','Kareem Hunt','Melvin Gordon','Devonta Freeman','Jamaal Charles',
    'Jamaal Williams','Aaron Jones','Rhamondre Stevenson','James Cook III','Rachaad White','Isiah Pacheco',
    'De\'Von Achane','Zach Charbonnet','Jaylen Warren','Zamir White','Zack Moss','Tyjae Spears',
    // WRs
    'Emmanuel Sanders','Golden Tate','Jarvis Landry','Jordy Nelson','Kelvin Benjamin','Alshon Jeffery',
    'Larry Fitzgerald','Robert Woods','Cole Beasley','Tyler Boyd','Curtis Samuel','Van Jefferson',
    'Christian Kirk','Adam Thielen','Michael Gallup','Chris Godwin','Mike Williams','Allen Robinson',
    'Kenny Golladay','Antonio Gibson','Rondale Moore','Chase Claypool','Elijah Moore','Skyy Moore',
    'Jahan Dotson','George Pickens','Christian Watson','Jameson Williams','John Metchie III',
    'Zay Flowers','Jaxon Smith-Njigba','Jayden Reed','Josh Downs','Jordan Addison','Xavier Worthy',
    'Brian Thomas Jr.','Ladd McConkey','Keon Coleman','Ricky Pearsall',
    // Defense - modern
    'Trey Wingo','Za\'Darius Smith','Cameron Heyward','Chris Jones','DeForest Buckner','Fletcher Cox',
    'Aaron Donald','Grady Jarrett','Vita Vea','Ndamukong Suh','Geno Atkins','Kenny Clark',
    'Dexter Lawrence','Jeffery Simmons','Quinnen Williams','Sebastian Joseph-Day','Leonard Williams',
    'Frank Clark','Bud Dupree','Za\'Darius Smith','Preston Smith','Rashan Gary','Justin Houston',
    'Emmanuel Ogbah','Charles Harris','Yannick Ngakoue','Anthony Barr','C.J. Mosley','Deion Jones',
    'Lavonte David','Blake Martinez','Cory Littleton','Jaylon Smith','Leighton Vander Esch','Kwon Alexander',
    'Alvin Kamara','Marlon Humphrey','Marcus Peters','Casey Hayward','Byron Murphy','James Bradberry',
    'Stephon Gilmore','Xavien Howard','Kendall Fuller','Josh Norman','A.J. Bouye','Chris Harris Jr.',
    'Ronnie Harrison','Landon Collins','Harrison Smith','Micah Hyde','Jordan Poyer','Justin Reid',
    'Marcus Williams','Budda Baker','Kevin Byard','Antoine Winfield Jr.','Jevon Holland','Kyle Hamilton',
    'Talanoa Hufanga','Jordan Battle','Jamaree Salyer',
    // Barometer bumps - recognizable role players / cult heroes friends flagged
    'Wes Welker','Trent Dilfer','Reggie Bush','Matt Leinart','Tim Tebow','Johnny Manziel','David Tyree',
    'Joseph Addai','Ed McCaffrey','Kordell Stewart','Mark Brunell','Chad Pennington','Brian Griese',
    'Brad Johnson','Joey Harrington','David Carr','Drew Bledsoe','Peter Warrick','Ben Coates',
    'Simeon Rice','Albert Haynesworth','John Henderson','Aqib Talib','Antrel Rolle','Roddy White',
    'Duce Staley','Sam Madison','Quentin Jammer','Matt Light','Sage Rosenfels','Pat McAfee',
    'Alfred Morris','Doug Martin','Latavius Murray','C.J. Anderson','Terrelle Pryor','Chad Henne',
    'Percy Harvin','Phillip Lindsay','Phillip Dorsett'
  ];

  /* ============================================================
   * MLB - all-time icons + modern stars
   * ============================================================ */
  var MLB_ICONS = [
    // Position-player icons
    'Babe Ruth','Willie Mays','Hank Aaron','Ted Williams','Stan Musial','Ty Cobb','Lou Gehrig',
    'Joe DiMaggio','Honus Wagner','Tris Speaker','Jimmie Foxx','Mickey Mantle','Yogi Berra','Pete Rose',
    'Johnny Bench','Carl Yastrzemski','Reggie Jackson','Rod Carew','George Brett','Mike Schmidt',
    'Cal Ripken Jr.','Ken Griffey Jr.','Derek Jeter','Alex Rodriguez','Albert Pujols','Mike Trout',
    'Aaron Judge','Shohei Ohtani','Barry Bonds','Sammy Sosa','Mark McGwire','Frank Thomas','Chipper Jones',
    'Manny Ramirez','Ivan Rodriguez','Mike Piazza','Willie McCovey','Willie Stargell','Jim Rice',
    'Dave Winfield','Andre Dawson','Kirby Puckett','Paul Molitor','Ozzie Smith','Ryne Sandberg',
    'Wade Boggs','Rickey Henderson','Barry Larkin','Roberto Alomar','Craig Biggio','Jeff Bagwell',
    'Vladimir Guerrero','Miguel Cabrera','David Ortiz','Ichiro Suzuki','Robinson Cano','Adrian Beltre',
    // Pitcher icons
    'Nolan Ryan','Greg Maddux','Roger Clemens','Randy Johnson','Pedro Martinez','Tom Glavine',
    'John Smoltz','Mariano Rivera','Sandy Koufax','Bob Gibson','Steve Carlton','Tom Seaver',
    'Warren Spahn','Cy Young','Walter Johnson','Christy Mathewson','Whitey Ford','Jim Palmer',
    'Curt Schilling','Roy Halladay','Cliff Lee','Justin Verlander','Clayton Kershaw','Max Scherzer',
    'Gerrit Cole','Jacob deGrom','Chris Sale','Zack Greinke','Cole Hamels','CC Sabathia','Matt Cain',
    'Madison Bumgarner','Corey Kluber','David Price','Felix Hernandez','Johan Santana','Trevor Hoffman',
    'Billy Wagner','Rollie Fingers','Dennis Eckersley','Bruce Sutter','Goose Gossage','Lee Smith',
    'Bob Feller','Jim Kaat','Fergie Jenkins','Phil Niekro','Gaylord Perry','Don Sutton','Bert Blyleven',
    'Juan Marichal','Gaylord Perry','Catfish Hunter','Dennis Martinez','Jack Morris'
  ];
  var MLB_STARS = [
    // Modern position players (2010+ starters + late-2000s standouts)
    'Mookie Betts','Freddie Freeman','Manny Machado','Bryce Harper','Juan Soto','Ronald Acuna Jr.',
    'Fernando Tatis Jr.','Vladimir Guerrero Jr.','Bo Bichette','Wander Franco','Julio Rodriguez',
    'Corey Seager','Trea Turner','Xander Bogaerts','Francisco Lindor','Carlos Correa','Trevor Story',
    'Andrelton Simmons','Nolan Arenado','Paul Goldschmidt','Kris Bryant','Anthony Rizzo','Josh Donaldson',
    'Jose Bautista','Jose Altuve','Ozzie Albies','Marcus Semien','Willy Adames','Dansby Swanson',
    'Elly De La Cruz','Anthony Volpe','Gunnar Henderson','Wyatt Langford','Jackson Chourio',
    'Jackson Merrill','Jackson Holliday','Salvador Perez','Yadier Molina','Buster Posey','J.T. Realmuto',
    'Willson Contreras','Adley Rutschman','Sean Murphy','Cal Raleigh','William Contreras','Cody Bellinger',
    'Christian Yelich','Kyle Tucker','Yordan Alvarez','Marcell Ozuna','Nick Castellanos','Rafael Devers',
    'Alex Bregman','George Springer','Trea Turner','Kyle Schwarber','Pete Alonso','Matt Olson',
    'Corey Seager','Andrew Benintendi','Yasmani Grandal','Jason Heyward','Dexter Fowler','Charlie Blackmon',
    'DJ LeMahieu','Giancarlo Stanton','Aaron Nola','Kevin Gausman','Sonny Gray','Corbin Burnes',
    'Tarik Skubal','Cole Ragans','Hunter Brown','George Kirby','Bryan Woo','Framber Valdez',
    'Alek Manoah','Ranger Suarez','Freddy Peralta','Justin Steele','Emmanuel Clase','Josh Hader',
    'Devin Williams','Ryan Helsley','Edwin Diaz','Aroldis Chapman','Kenley Jansen','Craig Kimbrel',
    'Zack Wheeler','Spencer Strider','Blake Snell','Shane McClanahan','Robbie Ray','Shane Bieber',
    'Yu Darvish','Masahiro Tanaka','Hyun-Jin Ryu','Hiroki Kuroda','Kenta Maeda','Chase Utley',
    'Ryan Howard','Jimmy Rollins','Dustin Pedroia','Kevin Youkilis','Adrian Gonzalez','Prince Fielder',
    'Ryan Braun','Andrew McCutchen','Robinson Cano','Miguel Cabrera','Joey Votto','Paul Konerko',
    'Miguel Tejada','Vladimir Guerrero','David Wright','Chase Utley','Jose Reyes','Jimmy Rollins',
    'Ryan Braun','Prince Fielder','Robinson Cano','Justin Morneau','Joe Mauer','Yadier Molina',
    'Buster Posey','Salvador Perez','Adrian Beltre','Robinson Cano','Nelson Cruz','Josh Reddick',
    'Ben Zobrist','David Freese','Trevor Story','Corey Dickerson','Justin Turner','Enrique Hernandez',
    'Chris Taylor','Max Muncy','Cody Bellinger','Joc Pederson','Adrian Gonzalez','Yasiel Puig',
    'Justin Upton','B.J. Upton','B.J. Upton','Adrian Beltre','Nelson Cruz','Robinson Cano',
    'Brett Gardner','Brian McCann','Yadier Molina','Ryan Zimmerman','Ian Desmond','Anthony Rendon',
    'Bryce Harper','Adam Eaton','Yasiel Puig','Adam Jones','Manny Machado','Chris Davis','Nelson Cruz',
    'Mark Trumbo','Adam Jones','J.J. Hardy','Matt Wieters','Chris Tillman','Zack Britton','Kevin Gausman',
    'Jose Berrios','Josh Donaldson','Marcus Stroman','Aaron Sanchez','Robbie Ray','Kevin Pillar',
    'Kevin Kiermaier','Kevin Kiermaier','Blake Snell','Chris Archer','David Price','Evan Longoria',
    'Randy Arozarena','Jose Ramirez','Francisco Lindor','Michael Brantley','Yandy Diaz','Wander Franco',
    'Ke\'Bryan Hayes','Bryan Reynolds','Rowdy Tellez','Adam Frazier','Jose Iglesias','Ke\'Bryan Hayes',
    'Andrew Chafin','Josh Hader','Corbin Burnes','Christian Yelich','Willy Adames','Freddy Peralta',
    'Brandon Woodruff','Devin Williams','Rowdy Tellez','Jesse Winker','Jonathan India','Joey Votto',
    'Ke\'Bryan Hayes','Christian Yelich','Ronald Acuna Jr.','Ozzie Albies','Matt Olson','Austin Riley',
    'Michael Harris II','Spencer Strider','Kyle Wright','Charlie Morton','Max Fried','Chris Sale',
    'Aaron Nola','Zack Wheeler','Trea Turner','Bryce Harper','J.T. Realmuto','Kyle Schwarber',
    'Nick Castellanos','Alec Bohm','Bryson Stott','Brandon Marsh','Ranger Suarez','Cristopher Sanchez',
    // Barometer bumps - recognizable role players / cult heroes friends flagged
    'Jim Thome','Curtis Granderson','Coco Crisp','Julio Franco','Nomar Garciaparra','Magglio Ordonez',
    'Cliff Floyd','Mike Cameron','Bronson Arroyo','John Olerud','Bartolo Colon','Nick Markakis',
    'Juan Pierre','Luis Castillo','Mike Lowell','J.D. Drew','Denard Span','Grady Sizemore','Cody Ross',
    'Matt Garza','James Shields','Daisuke Matsuzaka','Orlando Hernandez','Keith Foulke','Armando Benitez',
    'Rey Ordonez','Mark Bellhorn','Bill Mueller','Jeff Francoeur'
  ];

  root.RTG_STARS = {
    NBA: { icons: NBA_ICONS, stars: NBA_STARS },
    NFL: { icons: NFL_ICONS, stars: NFL_STARS },
    MLB: { icons: MLB_ICONS, stars: MLB_STARS }
  };
})(typeof self !== 'undefined' ? self : this);
