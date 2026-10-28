/* CrimboGiveaway pure functions (ES5-compatible for KoLmafia Rhino). */
function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
function plain(s) {
  return String(s || "").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&#x([0-9a-f]+);/gi,function(_,x){return String.fromCharCode(parseInt(x,16));})
    .replace(/&#(\d+);/g,function(_,x){return String.fromCharCode(parseInt(x,10));})
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">");
}
function normalize(s) { return trim(plain(s)).toLowerCase().replace(/\s+/g," "); }
function htmlText(s) {
  return plain(String(s || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/(?:tr|li|p|div|table|h\d)>/gi,"\n")
    .replace(/<[^>]+>/g," "));
}
function isoDate(str) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(str));
  if (!m) return "";
  var d = new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
  return d.getUTCFullYear()===Number(m[1]) && d.getUTCMonth()+1===Number(m[2]) && d.getUTCDate()===Number(m[3]) ? str : "";
}
function dateFromSale(s) {
  var m=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trim(s));
  if(!m)return "";
  var y=Number(m[3]);if(y<100)y+=y>=70?1900:2000;
  return isoDate(y+"-"+("0"+Number(m[1])).slice(-2)+"-"+("0"+Number(m[2])).slice(-2));
}
function parseSales(html) {
  var raw=String(html||"");
  var chunks=raw.replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/(?:tr|div|p|li)>/gi,"\n").split(/\r?\n/);
  var result=[],re=/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}:\d{2})\s+(.+?)\s+bought\s+([\d,]+)\s+\((.+)\)\s+for\s+([\d,]+)\s+Meat\.?/i;
  for(var i=0;i<chunks.length;i++) {
    var chunk=chunks[i];
    var text=trim(htmlText(chunk).replace(/\s+/g," "));
    var m=re.exec(text);if(!m)continue;
    var date=dateFromSale(m[1]),qty=Number(m[4].replace(/,/g,"")),total=Number(m[6].replace(/,/g,""));
    if(!date||!qty||qty<1||!isFinite(total)||total<0)continue;
    var idMatch=/showplayer\.php\?who=(\d+)/i.exec(chunk);
    result.push({day:date,time:m[2],name:trim(m[3]),playerId:idMatch?idMatch[1]:"",item:trim(m[5]),quantity:qty,totalMeat:total});
  }
  return result;
}
function saleKey(s) {return [s.day,s.time,normalize(s.name),normalize(s.item),s.quantity,s.totalMeat].join("|");}
function mergeSales(existing, captured) {
  // Multiplicity counts preserve distinct transactions whose visible fields are identical.
  var out=(existing||[]).slice(),known={},seen={},added=0;
  for(var i=0;i<out.length;i++){var k=saleKey(out[i]);known[k]=(known[k]||0)+1;}
  for(var j=0;j<captured.length;j++){
    var row=captured[j],key=saleKey(row),n=(seen[key]||0)+1;seen[key]=n;
    if(n<= (known[key]||0)) {
      // Improve ID evidence if it wasn't available in a previous capture.
      if(row.playerId)for(var t=0;t<out.length;t++)if(saleKey(out[t])===key&&!out[t].playerId){out[t].playerId=row.playerId;break;}
      continue;
    }
    out.push(row);known[key]=(known[key]||0)+1;added++;
  }
  return {sales:out,added:added};
}
function extractMetric(text,label) {
  var re=new RegExp(label+"\\s*:?\\s*([\\d,]+)","i"),m=re.exec(text);
  return m?Number(m[1].replace(/,/g,"")):null;
}
function parseProfile(html,playerId) {
  var raw=String(html||""),text=htmlText(raw).replace(/\s+/g," ");
  var dateMatch=/Account Created\s*:?\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(text);
  var months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  var creation="";
  if(dateMatch){var n=months[dateMatch[1].toLowerCase()];if(n)creation=isoDate(dateMatch[3]+"-"+("0"+n).slice(-2)+"-"+("0"+Number(dateMatch[2])).slice(-2));}
  var asc=extractMetric(text,"Ascensions"),turns=extractMetric(text,"Turns Played \\(total\\)");
  var hasClan=/showclan\.php\?whichclan=\d+/i.test(raw);
  var hasStore=/mallstore\.php\?whichstore=\d+/i.test(raw);
  var hasDisplay=/displaycollection\.php\?who=\d+/i.test(raw);
  // Negative link absence only treated as a negative on a complete recognizable profile.
  return {playerId:String(playerId),created:creation,ascensions:asc,totalTurns:turns,
    clan:hasClan,store:hasStore,display:hasDisplay,
    valid:!!(creation&&asc!==null&&turns!==null&&/Account Created/i.test(text)),
    capturedAt:""};
}
function makeConfig() {return {start:"2026-12-01",end:"2026-12-31",cutoff:"2026-12-01",day:"2026-12-01",proxy:"proxy ticket",prize:"Uncle Buck",ascensionsMax:1,turnsBelow:10000};}
function makeState(ownerId) {return {schema:"crimbo-giveaway.v0.1",ownerId:String(ownerId),config:makeConfig(),sales:[],profiles:{},nameIds:{},exclusions:{},decisions:{},events:[],lastScan:""};}
function reviewFlags(name, profile, config) {
  var flags=[];
  if(/bot/i.test(String(name||"")))flags.push("name_contains_bot");
  if(!profile||!profile.valid){flags.push("profile_unknown");return flags;}
  if(profile.ascensions<=config.ascensionsMax)flags.push("low_ascensions");
  if(profile.totalTurns<config.turnsBelow)flags.push("low_turns");
  if(!profile.clan)flags.push("no_clan");
  if(!profile.store)flags.push("no_store");
  if(!profile.display)flags.push("no_display_case");
  return flags;
}
function makeQueue(state) {
  var c=state.config,byId={},out=[];
  for(var i=0;i<state.sales.length;i++){
    var s=state.sales[i];if(s.day!==c.day||normalize(s.item)!==normalize(c.proxy))continue;
    var id=String(s.playerId||state.nameIds[normalize(s.name)]||"");
    var key=id?"id:"+id:"name:"+normalize(s.name),q=byId[key];
    if(!q){q={key:key,id:id,name:s.name,orders:0,quantity:0};byId[key]=q;out.push(q);}
    q.orders++;q.quantity+=s.quantity;
  }
  for(i=0;i<out.length;i++){
    var row=out[i],p=row.id?state.profiles[row.id]:null;
    row.flags=reviewFlags(row.name,p,c);
    row.excluded=!!(row.id&&state.exclusions[row.id]);
    row.underage=!!(p&&p.valid&&p.created>=c.cutoff);
    row.decision=row.id?state.decisions[c.day+"|"+row.id]||"":"";
    row.status=(!row.id||!p||!p.valid)?"HOLD: ID/profile":row.excluded||row.underage?"EXCLUDED":row.decision==="approve"?"APPROVED":row.decision==="hold"?"HELD":"REVIEW";
  }
  out.sort(function(a,b){var ranks={"HOLD: ID/profile":0,EXCLUDED:1,REVIEW:2,HELD:3,APPROVED:4};return ranks[a.status]-ranks[b.status]||a.name.localeCompare(b.name);});
  return out;
}
function safeId(value){var s=trim(value);return /^\d{1,12}$/.test(s)&&Number(s)>0?s:"";}
function csvCell(v){var s=String(v==null?"":v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function exportCsv(rows,state){var lines=["day,player_id,player_name,proxy_purchases,flags,status,prize_item"];
 for(var i=0;i<rows.length;i++){var q=rows[i];lines.push([state.config.day,q.id,q.name,q.orders,q.flags.join(";"),q.status,state.config.prize].map(csvCell).join(","));}
 return lines.join("\n")+"\n";}
module.exports={trim:trim,plain:plain,normalize:normalize,htmlText:htmlText,isoDate:isoDate,dateFromSale:dateFromSale,parseSales:parseSales,
  saleKey:saleKey,mergeSales:mergeSales,parseProfile:parseProfile,makeConfig:makeConfig,makeState:makeState,
  reviewFlags:reviewFlags,makeQueue:makeQueue,safeId:safeId,exportCsv:exportCsv};
