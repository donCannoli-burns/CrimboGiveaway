'use strict';
const assert=require('assert');
const Module=require('module');
const storage={};let fields={},writes=[],visits=[],commands=[],stock=6;
const names={101:'proxy ticket',202:'Uncle Buck'};
const log='<h2>Recent Store Activity</h2>12/01/26 15:00:00 <a href="showplayer.php?who=321">RealPlayer</a> bought 1 (proxy ticket) for 100 Meat.<br>';
const profile='Ascensions: 100<br>Turns Played (total): 100000<br>Account Created: January 1, 2006';
const mock={
 Item:{get:id=>({id:Number(id),name:names[Number(id)]||'none'})},toInt:item=>item.id,
 nowToInt:()=>1796140000000,todayToString:()=> '20261201',myId:()=>99,myName:()=> 'Tester',formField:n=>fields[n]||'',
 visitUrl:uri=>{visits.push(uri);return uri.startsWith('backoffice')?log:profile;},
 fileToArray:path=>storage[path]?storage[path].split('\n'):[],
 bufferToFile:(buf,path)=>{storage[path]=buf;return true;},
 itemAmount:()=>stock,
 cliExecute:cmd=>{commands.push(cmd);stock--;return true;},
 write:html=>writes.push(html),print:()=>{}
};
const old=Module._load;
Module._load=function(request,parent,isMain){if(request==='kolmafia')return mock;return old.call(this,request,parent,isMain);};
const app=require('../relay/relay_CrimboGiveaway.js');
function page(f){fields=f||{};writes=[];app.main();return writes.join('');}
function s(){return JSON.parse(storage['crimbo-giveaway-99.json']);}
assert(page({}).includes('CrimboGiveaway'));
assert.equal(commands.length,0);
page({action:'settings',tab:'settings',proxyItemId:'101',prizeItemId:'202'});
page({action:'refresh'});page({action:'inspect',id:'321'});
assert(page({action:'approve',id:'321'}).includes('APPROVED'));
assert(page({}).includes('Freeze approved batch'));
assert(page({action:'prepare_batch'}).includes('Frozen 1 approved recipients'));
let b=s().batches['2026-12-01'];
assert.equal(b.recipients[0].id,'321');
assert.equal(commands.length,0);
assert(page({action:'settings',proxyItemId:'101',prizeItemId:'202'}).includes('cannot change while a frozen batch'));
assert(page({action:'set_day',day:'2026-12-02'}).includes('Finish the active frozen batch'));
assert(page({action:'send_next',confirmation:'WRONG'}).includes('Type SEND'));
assert.equal(commands.length,0);
const html=page({});
assert(html.includes('Send next 5 approved prizes'));
assert(html.includes('relay_CrimboGiveaway.js?relay=true'));
assert(page({action:'send_next',confirmation:'SEND '+b.id}).includes('Sent/observed 1 item'));
assert.equal(commands.length,1);
assert.equal(commands[0],'send 1 ¶202 to 321 || Happy Crimbo! Your daily giveaway prize for 2026-12-01.');
assert.equal(s().sendLedger['2026-12-01|321'].status,'SENT_OBSERVED');
assert(page({action:'send_next',confirmation:'SEND '+b.id}).includes('not available'));
assert.equal(commands.length,1);
assert(page({tab:'archive'}).includes('mail_sent_observed'));
console.log('relay-mail.test.js PASS');
