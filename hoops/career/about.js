/* Run The Floor: Career, one NBA life from draft night to the Hall of Fame.
 *
 * THE SOURCE IS THIS FOLDER. hoops/career.js is built from these parts, in
 * the order hoops/build/career-bundle.mjs lists, into one closure: a name in
 * one part is read in any other. Balance numbers are in tuning.js.
 *
 * Headless and dependency-free apart from engine.js, so every rule in here can
 * be driven from node. Browser: window.RTF_CAREER. Node: require.
 *
 * THE PLAYER IS INVENTED AND THE LEAGUE IS REAL. Thirty real clubs, their real
 * colours, their real players and their real head coaches. Every person a
 * line talks about has a name: a teammate or an opponent is a real player off
 * the data, an NBA head coach is a real coach (and the carousel moves them),
 * and everybody else is generated off the career's seed. Write an event with
 * a {token} (see peopleKey) and never with a role like "your coach": the
 * token is what makes the line about a person rather than a job.
 *
 * NOT A SECOND MODEL OF A ROSTER. The draft modes rate five real men through
 * the engine's pipeline; this file rates ONE invented man and a club's net
 * rating around him. Year one's club nets come off the real roster through
 * teamStrength, so the 2026-27 Thunder are as good as the data says, and every
 * year after drifts by a mean-reverting walk, because projecting a real
 * person's future is the line above.
 *
 * DETERMINISTIC PER STEP. Every draw is seeded off (seed, year, tag), so a
 * reload lands on the same card with the same outcomes behind it, and a career
 * replayed with the same choices is the same career. Nothing reads the clock.
 *
 * THE SHAPE OF A YEAR, which is the step machine's phases:
 *
 *   pre    the summer: a training card and something off the court
 *   early  games 1 to 27, then a card or two
 *   mid    games 28 to 55, the All-Star break and the trade deadline
 *   late   games 56 to 82, then the awards
 *   po     the playoffs, a round a step, and Game 7 is yours to take
 *   off    development, contracts, free agency, and the question of retiring
 *
 * A step never runs while a card is pending. `step()` moves one phase and
 * returns the beats it produced; `choose()` answers the card on top.
 */
