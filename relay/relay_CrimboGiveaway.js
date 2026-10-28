/*
 * CrimboGiveaway v0.1 - KoLmafia relay dropdown workbench.
 * Human-reviewed campaign prototype. No Kmail or store mutation APIs are called.
 */
var k = require("kolmafia");
var core = require("../scripts/crimbo-core.js");

// KoLmafia serves .js URLs as JavaScript unless relay=true is present.
// Keep this marker on every link and form, not just the dropdown entry.
var RELAY_URL = "relay_CrimboGiveaway.js?relay=true";

function escapeHtml(s) {
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function attr(s){return escapeHtml(s);}
function now(){return String(k.nowToInt());}
function lines(contents){
  if(!contents)return [];
  if(contents instanceof Array)return contents;
  var keys=Object.keys(contents).sort(function(a,b){return Number(a)-Number(b);});
  var out=[];for(var i=0;i<keys.length;i++)out.push(String(contents[keys[i]]));return out;
}
function statePath(owner){return "crimbo-giveaway-"+owner+".json";}
function load(owner){
  var raw=lines(k.fileToArray(statePath(owner))).join("\n");
  if(!core.trim(raw))return core.makeState(owner);
  try{
    var state=JSON.parse(raw);
    if(state.schema!=="crimbo-giveaway.v0.1"||state.ownerId!==owner||!state.config||!state.sales||!state.profiles||!state.exclusions||!state.decisions||!state.events||!state.nameIds)throw new Error("State schema/account mismatch");
    return state;
  }catch(e){throw new Error("State file unreadable; refusing to overwrite it. Back up data/"+statePath(owner)+" first. "+e);}
}
function save(owner,s){
  if(!k.bufferToFile(JSON.stringify(s,null,2)+"\n",statePath(owner)))throw new Error("Could not write data/"+statePath(owner));
}
function addEvent(s,kind,subject,detail){s.events.push({at:now(),day:s.config.day,kind:kind,subject:String(subject||""),detail:String(detail||"")});}
function formStart(tab){return "<form method='POST' action='"+RELAY_URL+"'><input type='hidden' name='tab' value='"+attr(tab||"queue")+"'>";}
function submit(action,label,fields,cls,tab){
  var h=formStart(tab||"queue")+"<input type='hidden' name='action' value='"+attr(action)+"'>";
  var names=Object.keys(fields||{});for(var i=0;i<names.length;i++)h+="<input type='hidden' name='"+attr(names[i])+"' value='"+attr(fields[names[i]])+"'>";
  return h+"<button class='"+attr(cls||"minor")+"' type='submit'>"+escapeHtml(label)+"</button></form>";
}
function refreshSales(owner,s){
  var html=String(k.visitUrl("backoffice.php?which=3")||"");
  if(!/Recent Store Activity/i.test(html))throw new Error("KoL did not return a recognizable Store Log. No changes made.");
  var sales=core.parseSales(html);
  // Empty Store Log is allowed; malformed non-empty transaction logs are not.
  if(/\bbought\s+[\d,]+\s*\(/i.test(core.htmlText(html))&&!sales.length)throw new Error("Store Log contained sales but the parser failed. No changes made.");
  var merged=core.mergeSales(s.sales,sales);
  s.sales=merged.sales;
  s.lastScan=now();
  addEvent(s,"sales_refresh","", "parsed="+sales.length+" new="+merged.added);
  save(owner,s);
  return "Store Log refreshed: "+sales.length+" transactions parsed; "+merged.added+" new transactions recorded.";
}
function inspect(owner,s,id){
  id=core.safeId(id);if(!id)throw new Error("Invalid player ID.");
  var html=String(k.visitUrl("showplayer.php?who="+id)||"");
  var p=core.parseProfile(html,id);p.capturedAt=now();
  s.profiles[id]=p;
  if(p.valid&&p.created>=s.config.cutoff){
    if(!s.exclusions[id]){
      s.exclusions[id]={reason:"account_created_on_or_after_cutoff",source:"automatic",at:now()};
      addEvent(s,"automatic_exclusion",id,p.created);
    }
    // Even after an operator un-excludes the record, the hard cutoff remains enforced.
  }
  addEvent(s,"profile_inspected",id,p.valid?"parsed":"unknown_fields");
  save(owner,s);
  return p.valid?"Profile #"+id+" inspected.":"Profile #"+id+" could not be fully parsed and remains on hold.";
}
function handle(owner,s){
  var action=String(k.formField("action")||"");
  if(!action)return "";
  var id=core.safeId(k.formField("id"));
  if(action==="refresh")return refreshSales(owner,s);
  if(action==="set_day"){
    var day=core.isoDate(k.formField("day"));
    if(!day||day<s.config.start||day>s.config.end)throw new Error("Select a valid campaign day, Dec 1-31, 2026.");
    s.config.day=day;addEvent(s,"day_selected",day,"");save(owner,s);return "Selected giveaway day "+day+".";
  }
  if(action==="settings"){
    var proxy=core.trim(k.formField("proxy")),prize=core.trim(k.formField("prize"));
    if(proxy.length<2||proxy.length>100||prize.length<2||prize.length>100)throw new Error("Proxy/prize names must be 2-100 characters.");
    s.config.proxy=proxy;s.config.prize=prize;
    addEvent(s,"settings_updated","",proxy+" / "+prize);save(owner,s);
    return "Proxy and prize labels saved. Live sending is still disabled.";
  }
  if(action==="link"){
    var name=core.normalize(k.formField("name"));
    if(!id||!name||name.length>120)throw new Error("Valid player name and ID required.");
    // Never allow a typed ID to replace a previously captured authoritative sale ID.
    for(var j=0;j<s.sales.length;j++)if(core.normalize(s.sales[j].name)===name&&s.sales[j].playerId&&s.sales[j].playerId!==id)throw new Error("Sale log already associates this name with another player ID; manual override denied.");
    s.nameIds[name]=id;addEvent(s,"player_id_linked",id,name);save(owner,s);return "Resolved "+name+" to player #"+id+". Inspect the profile next.";
  }
  if(action==="inspect")return inspect(owner,s,id);
  if(action==="inspect_next"){
    var queue=core.makeQueue(s),n=0,summary=[];
    for(var i=0;i<queue.length&&n<5;i++){
      var q=queue[i];if(q.id&&(!s.profiles[q.id]||!s.profiles[q.id].valid)){
        summary.push(inspect(owner,s,q.id));n++;
      }
    }
    return n?"Inspected "+n+" profile(s). "+summary.join(" "):"No unresolved player IDs to inspect (maximum five per click).";
  }
  if(!id)throw new Error("Valid player ID required.");
  if(action==="exclude"){
    var reason=core.trim(k.formField("reason"))||"manual_review";
    if(reason.length>180)throw new Error("Reason too long.");
    s.exclusions[id]={reason:reason,source:"manual",at:now()};
    delete s.decisions[s.config.day+"|"+id];addEvent(s,"manual_exclusion",id,reason);save(owner,s);
    return "Player #"+id+" excluded.";
  }
  if(action==="unexclude"){
    if(!s.exclusions[id])return "Player #"+id+" was not excluded.";
    delete s.exclusions[id];addEvent(s,"manual_unexclude",id,"");save(owner,s);
    return "Player #"+id+" removed from manual exclusions (account-date cutoff still applies).";
  }
  if(action==="approve"||action==="hold"){
    var rows=core.makeQueue(s),found=null;
    for(var x=0;x<rows.length;x++)if(rows[x].id===id)found=rows[x];
    if(!found||found.excluded||found.underage||!s.profiles[id]||!s.profiles[id].valid)throw new Error("Cannot approve/hold unresolved or excluded player.");
    s.decisions[s.config.day+"|"+id]=action;
    addEvent(s,action==="approve"?"player_approved":"player_held",id,found.flags.join(","));save(owner,s);
    return "Player #"+id+" marked "+action+" for "+s.config.day+".";
  }
  throw new Error("Unknown action; no change made.");
}
function css(){return "<style>"+
":root{--ink:#000000;--frost:#ABD1F3;--tropical:#C2E0F9;--paper:#FCFCFF;--clear:#DFF7FA}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font:14px/1.45 Arial,sans-serif;margin:0;padding:16px}main{max-width:1200px;margin:auto}h1{font-size:24px;margin:0}h2{font-size:17px;margin:0 0 10px}h3{font-size:14px}p{margin:7px 0}header{background:var(--tropical);border:2px solid var(--ink);padding:16px}nav{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}a{color:var(--ink)}nav a,.link{border:1px solid var(--ink);padding:8px 12px;background:var(--clear);text-decoration:none;font-weight:bold}nav a.current{background:var(--frost)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.tile{background:var(--clear);border:1px solid var(--ink);padding:12px}.tile b{display:block;font-size:21px}.panel{border:1px solid var(--ink);background:var(--paper);margin:12px 0;padding:12px}.section{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}button{border:1px solid var(--ink);color:var(--ink);background:var(--frost);font-weight:bold;padding:7px 10px;cursor:pointer}button:hover{background:var(--clear)}button.minor{background:var(--paper)}button:focus-visible,input:focus-visible{outline:2px solid var(--ink);outline-offset:3px}button:disabled{background:var(--tropical);cursor:not-allowed}form{display:inline-block;margin:2px}input{border:1px solid var(--ink);padding:7px;max-width:220px;color:var(--ink);background:var(--paper)}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--ink);padding:7px;text-align:left;vertical-align:top}th{background:var(--tropical)}.tablewrap{overflow-x:auto}.flags{font-size:12px;max-width:260px}.status{font-weight:bold;white-space:nowrap}.note{background:var(--clear);padding:8px;border-left:3px solid var(--ink)}.alert{background:var(--tropical);padding:9px;border:2px solid var(--ink)}.muted{font-size:12px}.actions{min-width:220px}.actions form{display:inline-block}.small{font-size:12px}.foot{border-top:2px solid var(--ink);margin-top:18px;padding-top:8px}@media(max-width:680px){body{padding:6px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}th,td{padding:4px;font-size:12px}header{padding:8px}}"+
"</style>";}
function render(owner,s,message,error){
  var tab=String(k.formField("tab")||"queue");if(["queue","exclusions","archive","settings"].indexOf(tab)<0)tab="queue";
  var rows=core.makeQueue(s),approved=0,flagged=0,excluded=0,held=0;
  for(var i=0;i<rows.length;i++){if(rows[i].status==="APPROVED")approved++;if(rows[i].flags.length)flagged++;if(rows[i].status==="EXCLUDED")excluded++;if(rows[i].status==="HOLD: ID/profile"||rows[i].status==="HELD")held++;}
  var h=["<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='darkreader-lock'><title>CrimboGiveaway</title>",css(),"</head><body><main>"];
  h.push("<header><div class='section'><div><h1>❄ CrimboGiveaway</h1><p>KoLmafia giveaway workbench · Prototype v0.1</p></div><div class='small'>Operator: "+escapeHtml(k.myName())+" (#"+escapeHtml(owner)+")<br>Selected day: "+escapeHtml(s.config.day)+"</div></div></header>");
  h.push("<nav>");var tabs={queue:"Daily queue",exclusions:"Exclusions",archive:"Audit archive",settings:"Settings"};
  Object.keys(tabs).forEach(function(t){h.push("<a class='"+(tab===t?"current":"")+"' href='"+RELAY_URL+"&amp;tab="+t+"'>"+tabs[t]+"</a>");});h.push("</nav>");
  if(error)h.push("<div class='alert' role='alert'>"+escapeHtml(error)+"</div>");
  if(message)h.push("<div class='note' role='status'>"+escapeHtml(message)+"</div>");
  h.push("<div class='grid'><div class='tile'><b>"+rows.length+"</b>Daily purchasers</div><div class='tile'><b>"+flagged+"</b>Flagged</div><div class='tile'><b>"+excluded+"</b>Excluded</div><div class='tile'><b>"+approved+"</b>Approved</div></div>");
  if(tab==="queue"){
    h.push("<section class='panel'><div class='section'><div><h2>Daily purchase and verification queue</h2><p class='small'>Proxy: <b>"+escapeHtml(s.config.proxy)+"</b> · Prize: <b>"+escapeHtml(s.config.prize)+"</b> · Held: "+held+"</p></div><div>"+submit("refresh","Refresh KoL Store Log",{},"")+" "+submit("inspect_next","Inspect next 5 profiles",{},"minor")+"</div></div>");
    h.push("<div class='note'>A purchase does not authorize a send. All recipients require explicit approval. This version <b>does not send Kmail</b>.</div>");
    h.push("<div class='tablewrap'><table><thead><tr><th>Player / profile</th><th>Purchases</th><th>Profile flags</th><th>Status</th><th>Operator review</th></tr></thead><tbody>");
    if(!rows.length)h.push("<tr><td colspan='5'>No matching purchases captured for this giveaway day. Refresh the Store Log or select another date.</td></tr>");
    for(i=0;i<rows.length;i++){
      var q=rows[i];h.push("<tr><td><b>"+escapeHtml(q.name)+"</b><br>");
      if(q.id)h.push("<a target='_blank' rel='noopener' href='showplayer.php?who="+q.id+"'>#"+q.id+" · Profile</a>");
      else h.push("<span class='small'>ID missing — resolve manually</span>");
      h.push("</td><td>"+q.orders+" order(s)<br>"+q.quantity+" ticket(s)</td><td class='flags'>"+escapeHtml(q.flags.join(" · ")||"No current flags")+"</td><td class='status'>"+escapeHtml(q.status)+"</td><td class='actions'>");
      if(q.id){
        h.push(submit("inspect","Inspect",{id:q.id},"minor"));
        if(q.status!=="EXCLUDED"&&q.status!=="HOLD: ID/profile"){
          h.push(submit("approve","Approve",{id:q.id},""));
          h.push(submit("hold","Hold",{id:q.id},"minor"));
        }
        if(!q.excluded)h.push(submit("exclude","Exclude",{id:q.id,reason:"manual_review"},"minor"));
      }else{
        h.push(formStart("queue")+"<input type='hidden' name='action' value='link'><input type='hidden' name='name' value='"+attr(q.name)+"'><input name='id' inputmode='numeric' placeholder='Player ID' aria-label='Player ID for "+attr(q.name)+"' required><button type='submit'>Resolve ID</button></form>");
      }
      h.push("</td></tr>");
    }
    h.push("</tbody></table></div></section>");
    var csv=core.exportCsv(rows,s);h.push("<section class='panel'><h2>Daily export and distribution</h2><p>Approved players: <b>"+approved+"</b>. This CSV is a review/export record, not an authoritative Kmail receipt.</p><a class='link' download='crimbo-"+s.config.day+".csv' href='data:text/csv;charset=utf-8,"+attr(encodeURIComponent(csv))+"'>Export daily CSV</a> <button disabled title='Live Kmail is not implemented or verified in prototype v0.1'>Send approved batch — not available in v0.1</button></section>");
  }else if(tab==="settings"){
    h.push("<section class='panel'><h2>Campaign configuration</h2><p>Dates: "+s.config.start+" through "+s.config.end+". Accounts created on or after "+s.config.cutoff+" are automatically excluded when inspected.</p>");
    h.push(formStart("settings")+"<input type='hidden' name='action' value='set_day'><label>Review day <input type='date' name='day' min='2026-12-01' max='2026-12-31' value='"+attr(s.config.day)+"'></label> <button>Set day</button></form><p class='small'>Dates follow the KoL Store Log day; verify the rollover boundary before distributing.</p>");
    h.push("<hr>"+formStart("settings")+"<input type='hidden' name='action' value='settings'><label>Exact proxy item name <input name='proxy' required value='"+attr(s.config.proxy)+"'></label> <label>Prize label <input name='prize' required value='"+attr(s.config.prize)+"'></label> <button>Save labels</button></form>");
    h.push("<p>Review flags: ascensions ≤ "+s.config.ascensionsMax+", lifetime turns &lt; "+s.config.turnsBelow+", missing clan/store/display case, or name contains ‘bot’.</p></section>");
  }else if(tab==="exclusions"){
    var ids=Object.keys(s.exclusions).sort();h.push("<section class='panel'><h2>Exclusion registry</h2><p>Exclusions apply across the full campaign. Removing an automatically excluded new account cannot bypass the creation-date rule.</p><div class='tablewrap'><table><tr><th>Player</th><th>Reason</th><th>Source</th><th>Action</th></tr>");
    for(i=0;i<ids.length;i++){var id=ids[i],e=s.exclusions[id];h.push("<tr><td><a target='_blank' rel='noopener' href='showplayer.php?who="+id+"'>#"+id+"</a></td><td>"+escapeHtml(e.reason)+"</td><td>"+escapeHtml(e.source)+"</td><td>"+submit("unexclude","Remove",{id:id},"minor","exclusions")+"</td></tr>");}
    if(!ids.length)h.push("<tr><td colspan='4'>No excluded players yet.</td></tr>");
    h.push("</table></div><h3>Exclude by player ID</h3>"+formStart("exclusions")+"<input type='hidden' name='action' value='exclude'><input name='id' placeholder='Player ID' required> <input name='reason' placeholder='Reason' maxlength='180' required> <button>Exclude</button></form></section>");
  }else{
    h.push("<section class='panel'><h2>Audit archive</h2><p>Append-style event history in <code>data/"+escapeHtml(statePath(owner))+"</code>. Profiles and sales are stored separately inside the same state file.</p><div class='tablewrap'><table><tr><th>Timestamp (ms)</th><th>Day</th><th>Event</th><th>Player</th><th>Detail</th></tr>");
    var recent=s.events.slice(-200).reverse();
    for(i=0;i<recent.length;i++){var ev=recent[i];h.push("<tr><td>"+escapeHtml(ev.at)+"</td><td>"+escapeHtml(ev.day)+"</td><td>"+escapeHtml(ev.kind)+"</td><td>"+escapeHtml(ev.subject)+"</td><td>"+escapeHtml(ev.detail)+"</td></tr>");}
    if(!recent.length)h.push("<tr><td colspan='5'>No events yet.</td></tr>");h.push("</table></div></section>");
  }
  h.push("<div class='foot small'>CrimboGiveaway v0.1 · Owner-separated state · Manual review · No live Kmail capability · GitHub: donCannoli-burns/CrimboGiveaway</div></main></body></html>");
  return h.join("");
}
module.exports.main=function main(){
  var owner=String(k.myId()),s=null,message="",error="";
  try{s=load(owner);message=handle(owner,s);}catch(e){error=String(e.message||e);if(!s){k.write("<h1>CrimboGiveaway cannot load safely</h1><pre>"+escapeHtml(error)+"</pre>");return;}}
  k.write(render(owner,s,message,error));
};
