/* KoLmafia gCLI entrypoint: CrimboGiveaway [help] */
var k = require("kolmafia");
module.exports.main=function main(command){
  var arg=String(command||"").replace(/^\s+|\s+$/g,"").toLowerCase();
  k.print("CrimboGiveaway v0.1 — relay-first giveaway review workbench.","blue");
  k.print("Open KoLmafia's Relay Browser, then choose 'CrimboGiveaway' from the -run script- dropdown.");
  k.print("Direct relay URL: http://127.0.0.1:60080/relay_CrimboGiveaway.js");
  k.print("Review daily purchases, inspect player profiles, approve/hold/exclude, and export CSV.");
  k.print("LIVE KMAIL SENDING IS DISABLED IN THIS PROTOTYPE.","red");
  if(arg && arg!=="help" && arg!=="?" && arg!=="-h" && arg!=="--help"){
    k.print("Unknown command. Use: CrimboGiveaway help","red");
  }
};
