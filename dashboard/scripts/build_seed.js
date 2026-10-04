/*
 * Builds dashboard/src/data/seed.json: the starter strategies (with their results) and agents.
 *
 *   node dashboard/scripts/build_seed.js        (Node 18 or newer, no packages)
 *
 * It runs the same research engine the dashboard uses (src/js/03_engine.js) on the bundled gold candles, so the three template strategies'
 * results are computed, not typed in. "SME Baseline v1" uses Allan's real 437-trade list. Gates 0 to 2 are evaluated from the results
 * exactly as the dashboard's "Evaluate from the results" button does. Run prepare_data.py first.
 */
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

function mkRnd(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const SGN = 'function sgn(n,d){return (n>=0?"+":"-")+Math.abs(n).toFixed(d==null?1:d)}\n';
const engine = SGN + fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '03_engine.js'), 'utf8');
const T0 = Date.UTC(2026, 9, 3, 12);

const build = new Function('mkRnd', 'bars', 'sme', 'T0', engine + `
initBars(bars);
function crit(m,op,v){return {m:m,op:op,v:v}}
// Default gate criteria. Keep in sync with defaultCriteria() in src/js/04_data.js.
var CR=[[crit("data_checks_ok",">=",1)],
 [crit("trades_n",">=",150),crit("net_expectancy_r",">=",0.1),crit("profit_factor",">=",1.2)],
 [crit("worst_fold_r",">=",-5),crit("cost_stress_r",">",0),crit("t_vs_trials",">=",0)],
 [crit("trades_n",">=",150),crit("net_expectancy_r",">=",0.1),crit("profit_factor",">=",1.2),crit("max_drawdown_r","<=",25),crit("fills_match_pct",">=",90),crit("slippage_mean","<=",0.5),crit("rule_violations","<=",0)],
 [crit("trades_n",">=",100),crit("net_expectancy_r",">=",0.05),crit("max_drawdown_r","<=",15),crit("slippage_mean","<=",0.5),crit("rule_violations","<=",0)],
 [crit("owner_signoff",">=",1)]];
function gates(){return CR.map(function(c,i){return {i:i,v:1,status:"pending",lockedAt:null,revisedAfterFail:false,criteria:JSON.parse(JSON.stringify(c)),runs:[]}})}
function cmp(v,op,x){switch(op){case">=":return v>=x;case"<=":return v<=x;case">":return v>x;case"<":return v<x;default:return v===x}}
function computed(s){var m=s.backtest.metrics,ev=m.oos||m.full;
  return {data_checks_ok:1,trades_n:m.full.n,net_expectancy_r:ev.exp,profit_factor:ev.pf,max_drawdown_r:m.full.maxDD,
          worst_fold_r:Math.min.apply(null,m.folds.map(function(f){return f.totR})),cost_stress_r:m.costStressR,t_vs_trials:m.deflT}}
function autoGates(s,ts){
  var cv=computed(s);
  for(var i=0;i<3;i++){
    var g=s.gates[i];if(g.status==="passed")continue;if(i>0&&s.gates[i-1].status!=="passed")break;
    var vals={},miss=0;g.criteria.forEach(function(c){var x=cv[c.m];if(x==null||isNaN(x))miss++;else vals[c.m]=x});if(miss)break;
    var met=g.criteria.filter(function(c){return cmp(vals[c.m],c.op,c.v)}).length,res=met===g.criteria.length?"pass":"fail";
    g.runs.push({ts:ts,v:1,sv:0,values:vals,met:met,result:res,note:"Computed from the "+(s.backtest.kind==="engine"?"research agent's run":"imported results")});
    g.status=res==="pass"?"passed":"failed";g.lockedAt=ts;if(res==="pass")g.passedAt=ts;if(res!=="pass")break;
  }
}
var out={strategies:[],runs:{}},order=0;

// 1. SME Baseline v1: the real, reproduced trade list (imported, marked verified)
var bt=importedBacktest(sme,{trials:64,dataset:"XAUUSD H1, 2023-09 to 2026-09 (Dukascopy)",cost:"Spread 0.20 per round trip"});bt.verified=true;bt.ts=T0;
var s1={id:"sme1",name:"SME Baseline v1",kind:"file",source:"repo",language:"python",
  file:{name:"for_partner/code/engine.py and live_runner.py",size:0,sha256:null,v:1,review:[]},
  hypothesis:"Price tends to return to the last order block in the direction of the previous session. Entering at the block edge with a stop on the far side pays about 2.3 times the loss when right, and it is right about one time in three.",
  instruments:["XAUUSD"],timeframe:"M3",status:"candidate",order:T0+order++,createdAt:T0,backtest:bt,forward:null,trials:64,research:[],gates:gates()};
autoGates(s1,T0);s1.gates[3].status="running";s1.gates[3].lockedAt=T0;   // Allan's demo forward test is already running
out.strategies.push(s1);out.runs.sme1={backtest:{trades:sme}};

// 2. Template strategies, researched by the same engine the dashboard runs
[["donchian","Donchian breakout"],["ema_cross","EMA crossover"],["rsi_reversion","RSI reversion"]].forEach(function(t){
  var T=TEMPLATES[t[0]],b={};Object.keys(T.params).forEach(function(k){b[k]={min:T.params[k].min,max:T.params[k].max,step:T.params[k].step}});
  var r=research(t[0],b,0);r.backtest.ts=T0;
  var s={id:"t_"+t[0],name:t[1],kind:"template",source:"manual",template:{id:t[0],bounds:b},hypothesis:T.hyp,instruments:["XAUUSD"],timeframe:"H1",status:"candidate",
    order:T0+order++,createdAt:T0,backtest:r.backtest,forward:null,trials:r.backtest.trials,
    research:[{ts:T0,added:r.evaluated,params:r.backtest.params}],gates:gates()};
  autoGates(s,T0);out.strategies.push(s);out.runs[s.id]={backtest:{trades:r.trades}};
});
out.rank=out.strategies.map(function(s){var r=rankOf(s);return {name:s.name,score:r.score&&+r.score.toFixed(1),eligible:r.eligible,reasons:r.reasons}});
return out;`);

const out = build(mkRnd, read('bars.json'), read('sme_rows.json'), T0);
console.log('Ranking computed while seeding:');
out.rank.forEach((r) => console.log('  ' + r.name.padEnd(20) + String(r.score).padStart(5) + (r.eligible ? '  eligible' : '  not eligible: ' + r.reasons[0])));
const seed = read('seed_agents.json');
seed.strategies = out.strategies;
seed.runs = out.runs;
fs.writeFileSync(path.join(DATA, 'seed.json'), JSON.stringify(seed));
console.log('wrote seed.json ' + (fs.statSync(path.join(DATA, 'seed.json')).size / 1024).toFixed(1) + ' KB');
