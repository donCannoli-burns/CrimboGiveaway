'use strict';
const assert=require('assert');
const core=require('../scripts/crimbo-core.js');
const mail=require('../scripts/crimbo-mail.js');
const item={id:202,name:'Uncle Buck'};
const k={
  nowToInt:()=>1796155200000,
  todayToString:()=> '20261201',
  Item:{get:()=>item},
  itemAmount:()=>stock,
  cliExecute:cmd=>{commands.push(cmd);stock--;return commandResult;}
};
let stock=20,commands=[],commandResult=true,saveCount=0,events=[];
const save=()=>{saveCount++;},evt=(...args)=>events.push(args);
const s=core.makeState('99');s.config.proxyItemId='101';s.config.prizeItemId='202';
const items={proxy:{id:'101',name:'proxy ticket',valid:true},prize:{id:'202',name:'Uncle Buck',valid:true}};
function add(id,flag){
 s.sales.push({day:'2026-12-01',time:'12:00:00',name:'Player'+id,playerId:String(id),item:'proxy ticket',quantity:1,totalMeat:100});
 s.profiles[id]={valid:true,created:'2006-01-01',ascensions:100,totalTurns:50000,clan:true,store:true,display:true};
 s.decisions['2026-12-01|'+id]=flag||'approve';
}
for(let i=1;i<=8;i++)add(i);
const b=mail.prepare(s,'99',items,k);
assert.equal(b.recipients.length,8);
assert.equal(commands.length,0);
assert.throws(()=>mail.prepare(s,'99',items,k),/existing frozen/);
assert.throws(()=>mail.sendNext(s,'99',items,k,save,evt,'WRONG'),/Type SEND/);
assert.equal(commands.length,0);
// After freeze, the recipient list is immutable; exclusion/decision changes skip safely.
s.exclusions['3']={reason:'manual'};
const first=mail.sendNext(s,'99',items,k,save,evt,'SEND '+b.id);
assert.deepEqual(first,{sent:5,skipped:1,blocked:false});
assert.equal(commands.length,5);
assert(commands.every(c=>/^send 1 ¶202 to [0-9]+ \|\| Happy Crimbo!/.test(c)));
assert(!commands.some(c=>/ to 3 \|\|/.test(c)));
assert.equal(mail.tally(s,b).sent,5);
assert.equal(mail.tally(s,b).skipped,1);
assert(saveCount>=11, 'every STARTED must have a prior durable write');
const second=mail.sendNext(s,'99',items,k,save,evt,'SEND '+b.id);
assert.equal(second.sent,2);
assert.equal(b.status,'COMPLETE');
assert.equal(mail.tally(s,b).sent,7);
assert.throws(()=>mail.sendNext(s,'99',items,k,save,evt,'SEND '+b.id),/not available/);
assert.equal(commands.length,7);
// A second batch on the same day cannot re-send even if the prize ID is changed.
assert.equal(mail.key('2026-12-01','1','202'),mail.key('2026-12-01','1','999'));
const changed={proxy:items.proxy,prize:{id:'404',name:'Other prize',valid:true}};
s.config.prizeItemId='404';
assert.throws(()=>mail.prepare(s,'99',changed,k),/No newly approved/);
// Unknown outcome stops immediately and is never silently retried.
const x=core.makeState('99');x.config.proxyItemId='101';x.config.prizeItemId='202';
let s2=x;x.sales=s.sales.slice(0,2);x.profiles=s.profiles;x.decisions=s.decisions;
const b2=mail.prepare(x,'99',items,k);stock=10;
commandResult=false;
const unknown=mail.sendNext(x,'99',items,k,save,evt,'SEND '+b2.id);
assert.equal(unknown.blocked,true);
assert.equal(mail.tally(x,b2).unknown,1);
const before=commands.length;
assert.throws(()=>mail.sendNext(x,'99',items,k,save,evt,'SEND '+b2.id),/not available/);
assert.equal(commands.length,before);
assert.throws(()=>mail.reconcile(x,'99',items,k,'1','WRONG'),/CONFIRMED SENT/);
assert.equal(mail.reconcile(x,'99',items,k,'1','CONFIRMED SENT 1'),'1');
assert.equal(mail.tally(x,b2).sent,1);
// If a checkpoint save fails, no CLI is invoked.
const y=core.makeState('99');y.config.proxyItemId='101';y.config.prizeItemId='202';y.sales=s.sales.slice(0,1);y.profiles=s.profiles;y.decisions=s.decisions;
const b3=mail.prepare(y,'99',items,k);let count=commands.length;
assert.throws(()=>mail.sendNext(y,'99',items,k,()=>{throw Error('storage failed');},evt,'SEND '+b3.id),/storage failed/);
assert.equal(commands.length,count);
// Roll-over mismatch refuses even batch preparation.
const badDate=Object.assign({},k,{todayToString:()=> '20261202'});
assert.throws(()=>mail.prepare(core.makeState('99'),'99',items,badDate),/rollover day/);
console.log('mail.test.js PASS');
