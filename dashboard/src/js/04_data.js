/* 04_data.js: Catalogues and data model: risk-rule types, gate metrics and default criteria, readiness checks, the simulated live data for the example agents,
   and the store (the page database, or in-memory when no database is available). */
/* ---------- art for any agent: four hand-drawn presets, or a wolf generated from a hue ---------- */
function hueArt(h){
  var o=function(l,c,hh){return "oklch("+l+"% "+c+" "+(((hh%360)+360)%360)+")"};
  return wolf({d:o(30,.05,h),m:o(46,.08,h),l:o(64,.08,h),ll:o(82,.05,h),ear:o(56,.15,h+15),mask:o(22,.04,h),eye:o(86,.13,h+150),pupil:o(14,.02,h),nose:o(15,.02,h),mark:'<polygon points="46,22 50,21 50,34 47,32" fill="'+o(24,.04,h)+'"/>'});
}
var PRESET_COLOR={ridge:"var(--w-ridge)",scout:"var(--w-scout)",dusk:"var(--w-dusk-hi)",ember:"var(--w-ember)"};
function artFor(a){return ART[a.art]||hueArt(a.hue==null?200:a.hue)}
function accentOf(a){return PRESET_COLOR[a.art]||("oklch(64% 0.13 "+(a.hue==null?200:a.hue)+")")}

/* ---------- rule and gate catalogues ---------- */
var RULE_TYPES={
 risk_per_trade:{label:"Risk per trade",unit:"% of equity",def:0.5,min:0.05,max:2,step:0.05,tighter:"lower",action:"Shrink the order, or skip it",help:"Money lost if the stop is hit, as a share of equity."},
 daily_loss:{label:"Daily loss limit",unit:"% of day start",def:5,min:0.5,max:10,step:0.5,tighter:"lower",action:"Halt new orders until a person resumes",help:"Equity below the day's start by this much trips a halt."},
 max_drawdown:{label:"Max drawdown",unit:"% below high-water",def:12.5,min:2,max:30,step:0.5,tighter:"lower",action:"Halt new orders until a person resumes",help:"Distance below the equity high-water mark."},
 retire:{label:"Retire line",unit:"% of start equity",def:80,min:50,max:98,step:1,tighter:"higher",action:"Retire until a person deletes the file",help:"Equity at or below this share of the starting equity retires the agent."},
 open_risk:{label:"Open risk cap",unit:"% of equity",def:1.5,min:0.25,max:5,step:0.25,tighter:"lower",action:"Refuse the new order",help:"Total money at the stops of positions and resting orders."},
 trades_per_day:{label:"Entries per day",unit:"entries",def:20,min:1,max:100,step:1,tighter:"lower",action:"Rest until 00:00 UTC",help:"Counts each new position once."},
 cost_budget:{label:"Daily spread budget",unit:"% of equity",def:1,min:0.1,max:3,step:0.1,tighter:"lower",action:"Rest until 00:00 UTC",help:"Estimated spread cost of the day's entries."},
 cooldown:{label:"Pause between entries",unit:"minutes",def:0,min:0,max:240,step:1,tighter:"higher",action:"Refuse the new order",help:"0 means off."},
 max_spread:{label:"Max spread at entry",unit:"points",def:40,min:5,max:500,step:1,tighter:"lower",action:"Refuse the new order",help:"Wider than this at the moment of the order."},
 stale_quote:{label:"Max quote age",unit:"seconds",def:300,min:10,max:900,step:10,tighter:"lower",action:"Refuse the new order",help:"No orders on old quotes."},
 max_positions:{label:"Positions at once",unit:"positions",def:1,min:1,max:5,step:1,tighter:"lower",action:"Close extras, newest first",help:"Reduce-only: extras are closed, never opened."},
 max_lots:{label:"Max lots per order",unit:"lots",def:5,min:0.01,max:50,step:0.01,tighter:"lower",action:"Cap the size",help:"A hard ceiling whatever the maths says."},
 news_blackout:{label:"News blackout",unit:"minutes either side",def:0,min:0,max:120,step:5,tighter:"higher",action:"Refuse the new order",help:"Needs an economic calendar feed. 0 means off."}
};
var DEFAULT_RULES=["risk_per_trade","daily_loss","max_drawdown","retire","open_risk","trades_per_day","cost_budget","max_spread","stale_quote","max_positions"];
var PACK_RULE_TYPES=["daily_loss","max_drawdown","open_risk","retire"];
var REQUIRED_RULES=["risk_per_trade","daily_loss","max_drawdown","open_risk"];
var LOCKED_RULES=[["Stop-loss on every order","An order without a stop is refused."],["Reduce-only control","The hub can pause, cancel, flatten and kill. It cannot open or add."],["No martingale or averaging down","Enforced in the order path."],["Demo only until Micro-live starts","The runner refuses a real account before that."]];
var METRICS={
 data_checks_ok:{label:"Data checks passed (1 = yes)",unit:"",dec:0},
 trades_n:{label:"Closed trades",unit:"",dec:0},
 net_expectancy_r:{label:"Net expectancy",unit:"R",dec:3},
 profit_factor:{label:"Profit factor",unit:"",dec:2},
 max_drawdown_r:{label:"Max drawdown",unit:"R",dec:1},
 worst_fold_r:{label:"Worst walk-forward fold",unit:"R",dec:1},
 cost_stress_r:{label:"Total R with +50% cost",unit:"R",dec:1},
 t_vs_trials:{label:"t-stat minus best-of-N bar",unit:"",dec:2},
 fills_match_pct:{label:"Fills matching the backtest",unit:"%",dec:0},
 slippage_mean:{label:"Mean extra slippage",unit:"price units",dec:2},
 rule_violations:{label:"Rule violations by the runner",unit:"",dec:0},
 owner_signoff:{label:"Owner sign-off (1 = yes)",unit:"",dec:0}
};
var STAGE_NAMES=["Data","Backtest","Validation","Demo forward","Micro-live","Scale"];
var STAGE_HELP=["Is the price data clean and in UTC?","Does it make money after spread and commission?","Does it survive cost stress, walk-forward folds and the multiple-testing bar?","Does it match the backtest on a demo account in real time?","Real money at the minimum lot.","Raise the risk step by step."];
var OPS=[">=","<=",">","<","=="];
function crit(m,op,v){return {m:m,op:op,v:v}}
function defaultCriteria(){return [
 [crit("data_checks_ok",">=",1)],
 [crit("trades_n",">=",150),crit("net_expectancy_r",">=",0.1),crit("profit_factor",">=",1.2)],
 [crit("worst_fold_r",">=",-5),crit("cost_stress_r",">",0),crit("t_vs_trials",">=",0)],
 [crit("trades_n",">=",150),crit("net_expectancy_r",">=",0.1),crit("profit_factor",">=",1.2),crit("max_drawdown_r","<=",25),crit("fills_match_pct",">=",90),crit("slippage_mean","<=",0.5),crit("rule_violations","<=",0)],
 [crit("trades_n",">=",100),crit("net_expectancy_r",">=",0.05),crit("max_drawdown_r","<=",15),crit("slippage_mean","<=",0.5),crit("rule_violations","<=",0)],
 [crit("owner_signoff",">=",1)]
]}
function defaultGates(){return defaultCriteria().map(function(c,i){return {i:i,v:1,status:"pending",lockedAt:null,revisedAfterFail:false,criteria:c,runs:[]}})}
function defaultRules(types){return (types||DEFAULT_RULES).map(function(t){return {t:t,v:RULE_TYPES[t].def,at:null}})}
function ensureDefaults(a){
  if(!a.rules)a.rules=defaultRules();
  if(!a.strategy)a.strategy={magic:0,hypothesis:""};
  if(!a.instruments)a.instruments=[];
  return a;
}
function ensureStrategy(s){
  if(!s.gates)s.gates=defaultGates();
  if(!s.instruments)s.instruments=[];
  if(!s.research)s.research=[];
  if(s.trials==null)s.trials=0;
  return s;
}
function ruleVal(a,t){var r=(a.rules||[]).filter(function(x){return x.t===t})[0];return r?r.v:null}
function missingRequired(a){return REQUIRED_RULES.filter(function(t){return ruleVal(a,t)==null})}
function passed(g){return g.status==="passed"}
function stageIndex(h){var g=h.gates||[];for(var i=0;i<g.length;i++)if(!passed(g[i]))return i;return g.length}
function strategyOf(a){return a&&a.strategyId?STR[a.strategyId]||null:null}
function stageLabel(a){var s=strategyOf(a);if(!s)return "No strategy assigned";var i=stageIndex(s);return i>=6?"All gates passed":"Stage "+i+": "+STAGE_NAMES[i]}
function readiness(a){
  var s=strategyOf(a),miss=missingRequired(a);
  return [
   [!!s,s?"Strategy assigned: "+s.name:"Assign a strategy from the lab"],
   [!!(s&&stageIndex(s)>=3),"Strategy has passed backtest and validation"],
   [!miss.length,miss.length?"Required rules missing: "+miss.map(function(t){return RULE_TYPES[t].label}).join(", "):"Required rules in place"],
   [!!(a.instruments||[]).length,"Instruments set"]
  ];
}

/* ---------- example live data (simulated) for the seeded example agents ---------- */
function series(n,delta,vol){var a=[0],i;for(i=1;i<n;i++)a.push(a[i-1]+(rnd()-0.5)*vol);var d=a[n-1];return a.map(function(v,k){return +(v-d*(k/(n-1))+delta*(k/(n-1))).toFixed(2)})}
var SIM={
 ridge:{start:10000,eq:10412.60,curve:series(52,412.6,170),tradesToday:3,maxTrades:6,cost:11.40,costMax:30,fees:{spread:38.40,comm:12.00,slip:7.20,dec:1284},
  checks:[["ok","Bias is BEAR, sells only"],["ok","Block armed at 4181.40"],["ok","Spread 0.14, limit 0.40"],["ok","Open risk 0.74% of 1.50%"],["na","Position open: no new order"]],
  status:"Holding its short. Resting orders are cleared while a position is open.",bt:"Backtest, real: <b>+74.1%</b> growth at 0.5% risk · PF <b>1.51</b> · <b>437</b> trades · max drawdown <b>5.7%</b>",
  pos:{side:"short",coin:"XAUUSD",lots:0.12,size:12400,upl:8.28,held:12,entry:"4172.31",mark:"4171.62",stop:"4176.80",risk:52.1}},
 scout:{start:10000,eq:10186.20,curve:series(52,186.2,120),tradesToday:5,maxTrades:12,cost:18.90,costMax:25,fees:{spread:52.10,comm:21.50,slip:11.80,dec:2310},
  checks:[["ok","Momentum trigger fired"],["ok","Session filter London, ok"],["no","Spread 0.46 above the 0.40 limit"],["ok","Open risk within cap"],["ok","Cooldown over"]],
  status:"Wanted BUY limit 4170.12, code said no: spread_gate 0.46.",bt:"Backtest: <b>not run yet</b>. A strategy must pass the promotion gates before it trades.",
  pos:{side:"long",coin:"EURUSD",lots:0.10,size:10800,upl:2.40,held:3,entry:"1.08412",mark:"1.08436",stop:"1.08190",risk:22.2}},
 dusk:{start:10000,eq:9874.50,curve:series(52,-125.5,110),tradesToday:4,maxTrades:4,cost:27.60,costMax:28,fees:{spread:44.80,comm:16.20,slip:9.40,dec:1876},
  checks:[["no","Trade cap: 4 of 4 used today"],["ok","Spread within limit"],["ok","Open risk within cap"],["na","No new orders until 00:00 UTC"]],
  status:"Resting: all 4 trades used today. Back at 00:00 UTC.",cap:"RESTING",bt:"Backtest: <b>not run yet</b>.",pos:null},
 ember:{start:10000,eq:10318.40,curve:series(52,318.4,140),tradesToday:1,maxTrades:3,cost:6.20,costMax:20,fees:{spread:21.30,comm:8.40,slip:4.10,dec:742},
  checks:[["ok","Trend filter: higher highs on H1"],["ok","Pullback entry filled"],["ok","Spread within limit"],["ok","Open risk 0.22% of 1.50%"],["na","Position open: no new order"]],
  status:"Riding the long, trailing the stop under each new low.",bt:"Backtest: <b>not run yet</b>.",
  pos:{side:"long",coin:"GBPUSD",lots:0.10,size:9800,upl:14.60,held:130,entry:"1.27120",mark:"1.27269",stop:"1.26740",risk:37.2}}
};
var POS={};Object.keys(SIM).forEach(function(k){POS[k]=SIM[k].pos});
var PACK={paused:false,locked:false,recalled:false,trips:1,decisions:0,stale:false},REST={};
var fr=mkRnd(1),FT=[];for(var fi=0;fi<41;fi++){var fu=fr();FT.push(fu<0.34?+(1.2+fr()*2.2).toFixed(2):-+(0.55+fr()*0.5).toFixed(2))}
var fcum=0,fpk=0,fdd=0;FT.forEach(function(r){fcum+=r;fpk=Math.max(fpk,fcum);fdd=Math.max(fdd,fpk-fcum)});
var fw=FT.filter(function(r){return r>0}).reduce(function(a,b){return a+b},0),fl=-FT.filter(function(r){return r<=0}).reduce(function(a,b){return a+b},0),fn=FT.length,favg=fcum/fn,fpf=fw/fl;

/* ---------- the store: this page's shared database, or in-memory when it is not available ---------- */
var STORE={db:null,mode:"local",canWrite:true,uid:null,ready:false};
var AG={},STR={},RUNS={},PACKSET={rules:null},AUDIT=[],emitT=null;
function emit(){clearTimeout(emitT);emitT=setTimeout(function(){onData()},0)}
function thaw(o){return clone(o)}
function setStoreChip(){
  var c=$("#chip-store");if(!c)return;
  if(STORE.mode==="local"){c.className="chip warn";c.textContent="▲ Not saved: no database"}
  else if(!STORE.canWrite){c.className="chip warn";c.textContent="Read only"}
  else{c.className="chip good";c.textContent="● Saved to database"}
}
function writeFail(e){
  var code=e&&e.code?e.code:"error";
  if(code==="invalid_argument"&&STORE.mode==="db"){STORE.canWrite=false;setStoreChip();toast("READ ONLY","This page rejected the write. Ask the owner for Contributor access to change anything.","warn")}
  else if(code==="quota_exceeded")toast("DATABASE FULL","The page's database is full. Delete old strategies, agents or log entries.","crit");
  else toast("NOT SAVED","The change could not be saved ("+code+"). Try again.","crit");
}
function seedLocal(){
  SEED.agents.forEach(function(a){AG[a.id]=ensureDefaults(thaw(a))});
  SEED.strategies.forEach(function(s){STR[s.id]=ensureStrategy(thaw(s))});
  Object.keys(SEED.runs||{}).forEach(function(k){RUNS[k]=thaw(SEED.runs[k])});
  PACKSET=thaw(SEED.pack);
}
async function initStore(){
  var c=window.claude;
  if(c&&c.use){
    try{STORE.db=await c.use("db")}catch(e){STORE.db=null}
    try{var u=await c.use("user");if(u){var w=u.can?u.can("data.write"):null;if(w===false)STORE.canWrite=false;try{STORE.uid=await u.id()}catch(e){}}}catch(e){}
  }
  if(!STORE.db){STORE.mode="local";seedLocal();STORE.ready=true;setStoreChip();onData();return}
  STORE.mode="db";setStoreChip();
  var got={a:false,s:false,p:false};
  function done(){if(got.a&&got.s&&got.p&&!STORE.ready){STORE.ready=true}onData()}
  STORE.db.collection("agents").onSnapshot(function(snap){var m={};snap.docs.forEach(function(d){var x=thaw(d.data());x.id=d.id;m[d.id]=ensureDefaults(x)});AG=m;got.a=true;done()},function(e){got.a=true;done()});
  STORE.db.collection("strategies").onSnapshot(function(snap){var m={};snap.docs.forEach(function(d){var x=thaw(d.data());x.id=d.id;m[d.id]=ensureStrategy(x)});STR=m;got.s=true;done()},function(e){got.s=true;done()});
  STORE.db.doc("settings/pack").onSnapshot(function(s){PACKSET=s.exists?thaw(s.data()):{rules:null};got.p=true;done()},function(e){got.p=true;done()});
  STORE.db.collection("audit").orderBy("ts","desc").limit(80).onSnapshot(function(snap){AUDIT=snap.docs.map(function(d){return thaw(d.data())});onData()},function(e){});
}
async function saveAgent(a){
  a.updatedAt=Date.now();AG[a.id]=a;
  if(STORE.mode==="db"){try{await STORE.db.doc("agents/"+a.id).set(clone(a))}catch(e){writeFail(e);return false}}
  emit();return true;
}
async function removeAgent(id){
  var ok=true;delete AG[id];
  if(STORE.mode==="db"){try{await STORE.db.doc("agents/"+id).delete()}catch(e){writeFail(e);ok=false}}
  emit();return ok;
}
async function saveStrategy(s){
  s.updatedAt=Date.now();STR[s.id]=s;
  if(STORE.mode==="db"){try{await STORE.db.doc("strategies/"+s.id).set(clone(s))}catch(e){writeFail(e);return false}}
  emit();return true;
}
async function removeStrategy(id){
  var ok=true;delete STR[id];delete RUNS[id];
  if(STORE.mode==="db"){try{await STORE.db.doc("strategies/"+id).delete();await STORE.db.doc("strategies/"+id+"/runs/backtest").delete();await STORE.db.doc("strategies/"+id+"/runs/forward").delete();await STORE.db.doc("strategies/"+id+"/runs/code").delete()}catch(e){writeFail(e);ok=false}}
  emit();return ok;
}
async function getRun(id,kind){
  RUNS[id]=RUNS[id]||{};
  if(RUNS[id][kind]!==undefined)return RUNS[id][kind];
  if(STORE.mode==="db"){try{var s=await STORE.db.doc("strategies/"+id+"/runs/"+kind).get();RUNS[id][kind]=s.exists?thaw(s.data()):null}catch(e){RUNS[id][kind]=null}}else RUNS[id][kind]=null;
  return RUNS[id][kind];
}
async function putRun(id,kind,doc){
  RUNS[id]=RUNS[id]||{};RUNS[id][kind]=doc;
  if(STORE.mode==="db"){try{if(doc)await STORE.db.doc("strategies/"+id+"/runs/"+kind).set(clone(doc));else await STORE.db.doc("strategies/"+id+"/runs/"+kind).delete()}catch(e){writeFail(e);return false}}
  return true;
}
async function savePackSet(){
  if(STORE.mode==="db"){try{await STORE.db.doc("settings/pack").set(clone(PACKSET))}catch(e){writeFail(e);return false}}
  emit();return true;
}
async function audit(kind,ref,detail){
  var e={ts:Date.now(),kind:kind,agent:ref||"",detail:detail};
  AUDIT.unshift(e);AUDIT=AUDIT.slice(0,80);
  if(STORE.mode==="db"){try{await STORE.db.collection("audit").add(e)}catch(err){}}
  emit();
}
function packRules(){if(!PACKSET.rules)PACKSET.rules=defaultRules(PACK_RULE_TYPES).map(function(r){if(r.t==="open_risk")r.v=3;return r});return PACKSET.rules}
function nextMagic(){var max=26100200;Object.keys(AG).forEach(function(k){var m=(AG[k].strategy||{}).magic||0;if(m>max)max=m});return max+1}
var MAX_AGENTS=8;
