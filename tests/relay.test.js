"use strict";
const assert=require('assert');
const Module=require('module');
const fs={};let fields={},writes=[],visited=[];
const log='<h2>Recent Store Activity</h2>12/01/26 18:00:00 <a href="showplayer.php?who=321">PlayerBot</a> bought 1 (proxy ticket) for 100 Meat.<br>';
const profile='Ascensions: 0<br>Turns Played (total): 200<br>Account Created: December 2, 2026';
const names={101:'proxy ticket',202:'Uncle Buck',303:'quantum taco',404:'<unsafe&name>',405:'renamed proxy ticket'};
const mock={
 Item:{get:id=>{
   if (!Object.prototype.hasOwnProperty.call(names,id))throw Error('Unknown item');
   return {id:Number(id),name:names[id]};
 }},
 toInt:item=>item.id,
 nowToInt:()=>1700000000000,myId:()=>99,myName:()=>"Tester",formField:n=>fields[n]||'',
 visitUrl:uri=>{visited.push(uri);return uri.startsWith('backoffice')?log:profile;},
 fileToArray:path=>fs[path]?fs[path].split('\n'):[],bufferToFile:(buf,path)=>{fs[path]=buf;return true;},
 write:html=>writes.push(html),print:()=>{}
};
const old=Module._load;
Module._load=function(request,parent,isMain){if(request==='kolmafia')return mock;return old.call(this,request,parent,isMain);};
const app=require('../relay/relay_CrimboGiveaway.js');
function page(f){fields=f||{};writes=[];app.main();return writes.join('');}
assert(page({}).includes('CrimboGiveaway'));
// KoLmafia serves JavaScript scripts as text/javascript unless relay=true is
// included on every relay page request, not just the first dropdown click.
// This caused HTML source to appear after clicking tabs and action buttons.
const tabs=['queue','exclusions','archive','settings'];
for (const tab of tabs) {
  const html=page({tab});
  assert(html.startsWith('<!doctype html>'),tab+' must return a full HTML page');
  const nav=html.match(/<nav>([\s\S]*?)<\/nav>/)[1];
  const hrefs=Array.from(nav.matchAll(/href='(relay_CrimboGiveaway\.js[^']*)'/g),m=>m[1]);
  assert.equal(hrefs.length,4,tab+' must have all four navigation links');
  for (const href of hrefs) {
    assert(href.startsWith('relay_CrimboGiveaway.js?relay=true&amp;tab='),
      tab+' navigation must route via HTML relay execution: '+href);
  }
  const forms=Array.from(html.matchAll(/<form\s+[^>]*action='([^']+)'/g),m=>m[1]);
  if (tab !== 'archive') assert(forms.length>0,tab+' must present one or more actions');
  for (const formAction of forms) {
    assert.equal(formAction,'relay_CrimboGiveaway.js?relay=true',
      tab+' forms must submit to relay execution, not the static JS file');
  }
}
// An upgraded v0.1 name-only state must require new numeric IDs.
assert(page({action:'refresh'}).includes('Item configuration incomplete or invalid'));
assert(!page({}).includes('PlayerBot'));
let settings=page({tab:'settings'});
assert(settings.includes("type='number' min='1' max='2147483647' step='1' inputmode='numeric' name='proxyItemId'"));
assert(settings.includes("name='prizeItemId'"));
assert(!settings.includes("name='proxy'"));
assert(!settings.includes("name='prize'"));
assert(page({action:'settings',tab:'settings',proxyItemId:'101',prizeItemId:'202'}).includes('Item IDs saved'));
assert(page({}).includes('proxy ticket <span class='));
assert(page({}).includes('Uncle Buck <span class='));
assert(page({}).includes('PlayerBot'));
let saved=JSON.parse(fs['crimbo-giveaway-99.json']);
assert.equal(saved.config.proxyItemId,'101');
assert.equal(saved.config.prizeItemId,'202');
assert.equal(saved.config.proxy,undefined);
assert.equal(saved.config.prize,undefined);
// Unknown, same, name string, and oversized IDs all fail atomically.
for (const [proxyItemId,prizeItemId] of [['99999','202'],['101','101'],['Uncle Buck','202'],['2147483648','202'],['0','202']]) {
  const html=page({action:'settings',tab:'settings',proxyItemId,prizeItemId});
  assert(html.includes('Nothing saved'), 'bad ids should fail '+proxyItemId+' / '+prizeItemId);
  const after=JSON.parse(fs['crimbo-giveaway-99.json']);
  assert.equal(after.config.proxyItemId,'101');
  assert.equal(after.config.prizeItemId,'202');
}
assert(page({action:'refresh'}).includes('PlayerBot'));
assert.equal(visited.length,2);
assert(page({action:'inspect',id:'321'}).includes('EXCLUDED'));
assert(page({tab:'exclusions'}).includes("name='tab' value='exclusions'"));
assert(page({action:'approve',id:'321'}).includes('Cannot approve'));
assert(page({action:'unexclude',id:'321'}).includes('EXCLUDED')); // hard cutoff persists
assert(page({action:'refresh'}).includes('0 new transactions'));
assert.equal(visited.filter(x=>x.startsWith('backoffice')).length,3);
assert(!visited.some(x=>/sendmessage|cli_execute/.test(x)));
assert.equal(JSON.parse(fs['crimbo-giveaway-99.json']).sales.length,1);
// Item names are derived afresh from the numeric IDs on each page render.
names[101]='renamed proxy ticket';
assert(page({}).includes('renamed proxy ticket'));
assert(!page({}).includes('PlayerBot'));
names[101]='proxy ticket';
assert(page({}).includes('PlayerBot'));
// Unknown IDs fail closed even when older sales remain in state.
const badState=JSON.parse(fs['crimbo-giveaway-99.json']);
badState.config.proxyItemId='99999';
fs['crimbo-giveaway-99.json']=JSON.stringify(badState);
assert(page({}).includes('NOT CONFIGURED / UNKNOWN ITEM ID'));
assert(!page({}).includes('PlayerBot'));
assert(page({action:'approve',id:'321'}).includes('Cannot review approvals'));
// Malicious item names returned by a mocked database are escaped as data.
const escapedState=JSON.parse(fs['crimbo-giveaway-99.json']);
escapedState.config.proxyItemId='404';
fs['crimbo-giveaway-99.json']=JSON.stringify(escapedState);
assert(page({}).includes('&lt;unsafe&amp;name&gt;'));
assert(!page({}).includes('<unsafe&name>'));
console.log('relay.test.js PASS');
