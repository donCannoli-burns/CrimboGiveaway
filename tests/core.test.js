"use strict";
const assert=require('assert');
const core=require('../scripts/crimbo-core.js');
const log=`<html><h2>Recent Store Activity</h2>
10/24/26 17:07:00 <a href="showplayer.php?who=1952270"><b>Saddler</b></a> bought 3 (proxy ticket) for 300 Meat.<br>
10/24/26 17:06:59 <a href="showplayer.php?who=3837987"><b>Terrarapin</b></a> bought 9 (quantum taco) for 900 Meat.<br>
10/24/26 17:07:00 <a href="showplayer.php?who=1952270"><b>Saddler</b></a> bought 3 (proxy ticket) for 300 Meat.
</html>`;
const parsed=core.parseSales(log);
assert.equal(parsed.length,3);
assert.equal(parsed[0].playerId,'1952270');
assert.equal(parsed[0].name,'Saddler');
assert.equal(parsed[0].day,'2026-10-24');
assert.equal(parsed[0].quantity,3);
const first=core.mergeSales([],parsed);
assert.equal(first.added,3); // same-second duplicate rows count as distinct sales
const repeat=core.mergeSales(first.sales,parsed);
assert.equal(repeat.added,0);
assert.equal(repeat.sales.length,3);
const sample=`<b>DOncAnNOli (#1079721)</b> Ascensions: 350<br>Turns Played (total): 538,001<br>Account Created: September 25, 2006<br><a href="showclan.php?whichclan=76956">Clan</a><a href="mallstore.php?whichstore=1079721">Store</a><a href="displaycollection.php?who=1079721">Display Case</a>`;
const p=core.parseProfile(sample,'1079721');
assert.equal(p.valid,true);
assert.equal(p.created,'2006-09-25');
assert.equal(p.totalTurns,538001);
assert.equal(core.reviewFlags('DOncAnNOli',p,core.makeConfig()).length,0);
const young=core.parseProfile('Ascensions: 0<br>Turns Played (total): 200<br>Account Created: December 1, 2026','500');
assert.equal(young.valid,true);
assert(young.created>=core.makeConfig().cutoff);
assert(core.reviewFlags('TotallyBot',young,core.makeConfig()).includes('name_contains_bot'));
assert(core.reviewFlags('TotallyBot',young,core.makeConfig()).includes('no_clan'));
assert.equal(core.isoDate('2026-02-30'),'');
const state=core.makeState('99');
state.config.day='2026-10-24';
state.sales=repeat.sales;
state.profiles['1952270']=p;
let rows=core.makeQueue(state);
assert.equal(rows.length,1);
assert.equal(rows[0].orders,2);
assert.equal(rows[0].status,'REVIEW');
state.decisions['2026-10-24|1952270']='approve';
rows=core.makeQueue(state);
assert.equal(rows[0].status,'APPROVED');
state.exclusions['1952270']={reason:'manual'};
rows=core.makeQueue(state);
assert.equal(rows[0].status,'EXCLUDED');
assert.equal(core.safeId('1;send 2'),'');
assert(core.exportCsv([{name:'=HYPERLINK("evil")',id:'5',orders:1,flags:[],status:'REVIEW'}],state).includes("'=HYPERLINK"));
console.log('core.test.js PASS');
