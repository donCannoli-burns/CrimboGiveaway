/* CrimboGiveaway guarded mail executor. No background send and no arbitrary CLI. */
var core = require('./crimbo-core.js');
var MAX_PER_CLICK = 5;
// One recipient per campaign day, even if the operator later changes prize IDs.
function key(day,id,prizeId) { return day+'|'+id; }
function kolDay(k){
  var raw=String(k.todayToString());
  if(!/^\d{8}$/.test(raw))throw new Error('KoL rollover date unavailable; sending blocked.');
  return raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8);
}
function ensureStorage(s){
  if(!s.batches)s.batches={};
  if(!s.sendLedger)s.sendLedger={};
}
function activeBatch(s){ensureStorage(s);return s.batches[s.config.day]||null;}
function assertConfig(s,items){
  if(!items.proxy.valid||!items.prize.valid||items.proxy.id===items.prize.id)throw new Error('Resolve two distinct item IDs before preparing a batch.');
}
function checkFrozen(s,b,owner,items,k){
  if(!b||b.ownerId!==String(owner)||b.day!==s.config.day||b.proxyItemId!==items.proxy.id||b.prizeItemId!==items.prize.id)
    throw new Error('Batch does not match account/day/item IDs; sending blocked.');
  if(kolDay(k)!==b.day)throw new Error('Selected campaign day differs from KoL rollover day; sending blocked.');
}
function prepare(s,owner,items,k){
  ensureStorage(s);assertConfig(s,items);
  if(kolDay(k)!==s.config.day)throw new Error('Can prepare a send batch only for the current KoL rollover day.');
  var b=activeBatch(s);
  if(b&&b.status!=='COMPLETE'&&b.status!=='CANCELLED')throw new Error('Finish or cancel the existing frozen batch first.');
  var rows=core.makeQueue(s,items.proxy),recipients=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    if(r.status!=='APPROVED'||!core.safeId(r.id)||r.id===String(owner))continue;
    var dkey=key(s.config.day,r.id,items.prize.id);
    if(!s.sendLedger[dkey])recipients.push({id:r.id,name:r.name});
  }
  if(!recipients.length)throw new Error('No newly approved recipients. Inspect, approve, and avoid previously attempted IDs.');
  recipients.sort(function(a,b){return Number(a.id)-Number(b.id);});
  if(Number(k.itemAmount(k.Item.get(Number(items.prize.id))))<recipients.length)
    throw new Error('Not enough prize items in inventory for the full frozen batch. Nothing prepared.');
  var batch={id:s.config.day+'-'+String(owner)+'-'+String(k.nowToInt()),ownerId:String(owner),day:s.config.day,
    proxyItemId:items.proxy.id,prizeItemId:items.prize.id,prizeName:items.prize.name,
    recipients:recipients,status:'PREPARED',createdAt:String(k.nowToInt())};
  s.batches[s.config.day]=batch;
  return batch;
}
function cancel(s,owner,items,k){
  var b=activeBatch(s);if(!b)throw new Error('No frozen batch to cancel.');
  checkFrozen(s,b,owner,items,k);
  if(b.status!=='PREPARED')throw new Error('Cannot cancel a batch once sending has started.');
  b.status='CANCELLED';return b;
}
function reconcile(s,owner,items,k,id,phrase){
  ensureStorage(s);
  var b=activeBatch(s);checkFrozen(s,b,owner,items,k);
  id=core.safeId(id);
  if(!id||String(phrase)!=='CONFIRMED SENT '+id)throw new Error('Type CONFIRMED SENT <player ID> after checking the sent-mail record.');
  var belongs=false;
  for(var i=0;i<b.recipients.length;i++)if(b.recipients[i].id===id)belongs=true;
  if(!belongs)throw new Error('Recipient is not in this frozen batch.');
  var dkey=key(b.day,id,b.prizeItemId),r=s.sendLedger[dkey];
  if(!r||(r.status!=='UNKNOWN'&&r.status!=='STARTED'))throw new Error('No unknown/in-flight send for this player.');
  r.status='RECONCILED_SENT';r.reconciledAt=String(k.nowToInt());r.reconciliation='operator_verified_external_sent_record';
  var t=tally(s,b);
  b.status=t.pending===0?'COMPLETE':'IN_PROGRESS';
  return id;
}
function tally(s,b){
  var r={pending:0,sent:0,unknown:0,skipped:0,started:0};
  if(!b)return r;
  for(var i=0;i<b.recipients.length;i++){
    var entry=s.sendLedger[key(b.day,b.recipients[i].id,b.prizeItemId)];
    var st=entry?entry.status:'PENDING';
    if(st==='SENT_OBSERVED'||st==='RECONCILED_SENT')r.sent++;
    else if(st==='UNKNOWN')r.unknown++;
    else if(st==='STARTED')r.started++;
    else if(st==='SKIPPED')r.skipped++;
    else r.pending++;
  }
  return r;
}
// Save durable STARTED record BEFORE invoking KoLmafia CLI. Failure is UNKNOWN,
// not proof that no mail was sent. Never retry a STARTED/UNKNOWN key automatically.
function sendNext(s,owner,items,k,save,event,confirmation){
  ensureStorage(s);var b=activeBatch(s);assertConfig(s,items);checkFrozen(s,b,owner,items,k);
  if(b.status!=='PREPARED'&&b.status!=='IN_PROGRESS')throw new Error('Batch is not available for sending.');
  if(String(confirmation)!=='SEND '+b.id)throw new Error('Type SEND followed by the exact batch ID to authorize this click.');
  if(tally(s,b).unknown||tally(s,b).started)throw new Error('Uncertain/prior in-flight send must be manually reconciled first. No retry.');
  var queue=core.makeQueue(s,items.proxy),lookup={};
  for(var i=0;i<queue.length;i++)if(queue[i].id)lookup[queue[i].id]=queue[i];
  var count=0,skipped=0;
  b.status='IN_PROGRESS';save();
  for(i=0;i<b.recipients.length&&count<MAX_PER_CLICK;i++){
    var r=b.recipients[i],dkey=key(b.day,r.id,b.prizeItemId);
    if(s.sendLedger[dkey])continue;
    var current=lookup[r.id];
    if(!current||current.status!=='APPROVED'||current.excluded||current.underage){
      s.sendLedger[dkey]={status:'SKIPPED',batchId:b.id,at:String(k.nowToInt()),reason:'no_longer_eligible'};
      event('mail_skipped',r.id,'no_longer_eligible');save();skipped++;continue;
    }
    if(Number(k.itemAmount(k.Item.get(Number(b.prizeItemId))))<1)
      throw new Error('Insufficient prize inventory; batch paused without attempting the next recipient.');
    var before=Number(k.itemAmount(k.Item.get(Number(b.prizeItemId))));
    s.sendLedger[dkey]={status:'STARTED',batchId:b.id,at:String(k.nowToInt()),itemId:b.prizeItemId,quantity:1};
    event('mail_started',r.id,'batch='+b.id+' item='+b.prizeItemId);save();
    // Pilcrow forces an exact KoLmafia item ID. IDs are strictly numeric.
    // The message is static, not operator or profile supplied text.
    var cmd='send 1 \u00b6'+b.prizeItemId+' to '+r.id+' || Happy Crimbo! Your daily giveaway prize for '+b.day+'.';
    var ok=false,err='';
    try{ok=k.cliExecute(cmd)===true;}catch(e){err=String(e&&e.message||e);}
    var after=-1;
    try{after=Number(k.itemAmount(k.Item.get(Number(b.prizeItemId))));}catch(e2){err+=' Inventory read failed.';}
    if(ok&&after===before-1){
      s.sendLedger[dkey].status='SENT_OBSERVED';
      s.sendLedger[dkey].atFinished=String(k.nowToInt());
      s.sendLedger[dkey].inventoryBefore=before;s.sendLedger[dkey].inventoryAfter=after;
      event('mail_sent_observed',r.id,'batch='+b.id+' item='+b.prizeItemId);
      save();count++;
    }else{
      s.sendLedger[dkey].status='UNKNOWN';s.sendLedger[dkey].atFinished=String(k.nowToInt());
      s.sendLedger[dkey].detail='CLI='+ok+' inventory='+before+'->'+after+' '+err.slice(0,120);
      b.status='BLOCKED_UNKNOWN';
      event('mail_unknown',r.id,s.sendLedger[dkey].detail);save();
      return {sent:count,skipped:skipped,blocked:true};
    }
  }
  if(tally(s,b).pending===0)b.status='COMPLETE';
  save();return {sent:count,skipped:skipped,blocked:false};
}
module.exports={key:key,kolDay:kolDay,ensureStorage:ensureStorage,activeBatch:activeBatch,
  prepare:prepare,cancel:cancel,tally:tally,reconcile:reconcile,sendNext:sendNext,MAX_PER_CLICK:MAX_PER_CLICK};
