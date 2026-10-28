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
assert(page({action:'refresh'}).includes('PlayerBot'));
assert.equal(visited.length,1);
assert(page({action:'inspect',id:'321'}).includes('EXCLUDED'));
assert(page({action:'approve',id:'321'}).includes('Cannot approve'));
assert(page({action:'unexclude',id:'321'}).includes('EXCLUDED')); // hard cutoff persists
assert(page({action:'refresh'}).includes('0 new transactions'));
assert.equal(visited.filter(x=>x.startsWith('backoffice')).length,2);
assert(!visited.some(x=>/sendmessage|cli_execute/.test(x)));
assert.equal(JSON.parse(fs['crimbo-giveaway-99.json']).sales.length,1);
console.log('relay.test.js PASS');
