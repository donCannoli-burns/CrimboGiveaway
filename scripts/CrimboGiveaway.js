/* KoLmafia gCLI entrypoint: CrimboGiveaway [help] */
var k = require("kolmafia");
module.exports.main=function main(command){
  var arg=String(command||"").replace(/^\s+|\s+$/g,"").toLowerCase();
  k.print("CrimboGiveaway v0.2 — relay-first guarded Kmail workbench.","blue");
  k.print("Open KoLmafia's Relay Browser, then choose 'CrimboGiveaway' from the -run script- dropdown.");
  k.print("Direct relay URL: http://127.0.0.1:60080/relay_CrimboGiveaway.js?relay=true");
  k.print("Review daily purchases, inspect player profiles, approve/hold/exclude, and export CSV.");
  k.print("Kmail requires a frozen approved batch, typed authorization, and sends at most 5 per click. Test with a cheap item first!","red");
  if(arg && arg!=="help" && arg!=="?" && arg!=="-h" && arg!=="--help"){
    k.print("Unknown command. Use: CrimboGiveaway help","red");
  }
};
