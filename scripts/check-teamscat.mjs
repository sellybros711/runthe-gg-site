/* Regression guard for the "exactly two franchises" family.
 *
 * A player reported being told "Real player - we couldn't verify this category"
 * for Rodney Stuckey (Pistons, then Pacers) on "Played for exactly two
 * franchises". Two defects met there:
 *
 *   1. the category ran on teamsMax 2, which is AT MOST two, so it also
 *      accepted every one-franchise player and offered Bill Russell and David
 *      Robinson as answers you could have given;
 *   2. softPass() required a confirmation from another clause, and this
 *      category has no other clause, so no correct answer outside our 9,434
 *      player corpus could ever be counted.
 *
 * These four cases pin the corners. Run: node scripts/check-teamscat.mjs */
import fs from 'fs';
const src = fs.readFileSync('arcade/livecheck.js','utf8');

// pull the three pure functions out of the module so the test can't drift
function grab(name){
  const i = src.indexOf('function '+name+'(');
  let d=0; for(let k=src.indexOf('{',i); k<src.length; k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } }
}
const blob = 'var SOFT_GAP = ' + /var SOFT_GAP = (\{[^}]*\});/.exec(src)[1] + ';'
  + 'var ROSTER_PRED = ' + /var ROSTER_PRED = (\{[^}]*\});/.exec(src)[1] + ';'
  + grab('predicate') + grab('verdict') + grab('softPass')
  + 'return { verdict: verdict, softPass: softPass };';
const { verdict, softPass } = new Function(blob)();

const CAT = { k:'teamsExact', n:2 };            // "Played for exactly two franchises"
const OLD = { k:'teamsMax',  max:2 };           // what it used to run on

function run(label, subj, pr){
  const gaps = {};
  const v = verdict(subj, pr, gaps);
  const soft = v === null && softPass(gaps);
  const outcome = v === true ? 'ACCEPTED (verified)'
    : v === false ? 'REJECTED (refuted)'
    : soft ? 'ACCEPTED (counted, unverified)' : 'REJECTED ("couldn’t verify")';
  console.log('  ' + label.padEnd(42) + outcome);
  return outcome;
}

const stuckey = { name:'Rodney Stuckey', teams:['Detroit Pistons','Indiana Pacers'], sports:['NBA'], occSports:['NBA'], awards:[], pos:null, col:null };
const oneTeam = { name:'David Robinson', teams:['San Antonio Spurs'], sports:['NBA'], occSports:['NBA'], awards:[], pos:null, col:null };
const many    = { name:'Journeyman',     teams:['A','B','C','D'], sports:['NBA'], occSports:['NBA'], awards:[], pos:null, col:null };
const noRoster= { name:'Unknown Person', teams:[], sports:['NBA'], occSports:['NBA'], awards:[], pos:null, col:null };

console.log('\n"Played for exactly two franchises", answers NOT in our corpus:');
const a = run('Rodney Stuckey (Pistons, Pacers)', stuckey, CAT);
const b = run('David Robinson (Spurs only)', oneTeam, CAT);
const c = run('a four-franchise journeyman', many, CAT);
const d = run('a real athlete with no roster on file', noRoster, CAT);

console.log('\nsame player under the OLD predicate (teamsMax 2), for contrast:');
run('Rodney Stuckey', stuckey, OLD);

const fails = [];
if (!a.startsWith('ACCEPTED')) fails.push('Stuckey must be accepted');
if (!b.startsWith('REJECTED')) fails.push('a one-franchise player must NOT satisfy "exactly two"');
if (!c.startsWith('REJECTED')) fails.push('a four-franchise player must be refuted');
if (!d.startsWith('REJECTED')) fails.push('no roster means no evidence, so no free point');
console.log('\n' + (fails.length ? 'FAIL: ' + fails.join('; ') : 'PASS: all four behave correctly'));
process.exit(fails.length ? 1 : 0);
