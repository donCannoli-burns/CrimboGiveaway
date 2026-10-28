"use strict";
const assert=require('assert');
const Module=require('module');
const fs={};let fields={},writes=[],visited=[];
const log='<h2>Recent Store Activity</h2>12/01/26 18:00:00 <a href="showplayer.php?who=321">PlayerBot</a> bought 1 (proxy ticket) for 100 Meat.<br>';
const profile='Ascensions: 0<br>Turns Played (total): 200<br>Account Created: December 2, 2026';
const mock={
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
  const hrefs=Array.from(html.matchAll(/href='(relay_CrimboGiveaway\.js[^']*)'/g),m=>m[1]);
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
assert(page({action:'refresh'}).includes('PlayerBot'));
assert.equal(visited.length,1);
assert(page({action:'inspect',id:'321'}).includes('EXCLUDED'));
assert(page({tab:'exclusions'}).includes("name='tab' value='exclusions'"));
assert(page({action:'approve',id:'321'}).includes('Cannot approve'));
assert(page({action:'unexclude',id:'321'}).includes('EXCLUDED')); // hard cutoff persists
assert(page({action:'refresh'}).includes('0 new transactions'));
assert.equal(visited.filter(x=>x.startsWith('backoffice')).length,2);
assert(!visited.some(x=>/sendmessage|cli_execute/.test(x)));
assert.equal(JSON.parse(fs['crimbo-giveaway-99.json']).sales.length,1);
console.log('relay.test.js PASS');
