/* 03_engine.js: The research engine. Pure functions, no DOM, so it also runs in Node (see tests/engine.test.js).
   Strategy templates, a one-position-at-a-time simulator, trade statistics, the research agent (bounded grid search, out-of-sample judging),
   CSV trade-list import, and the ranking function rankOf() that scores a strategy out of 100. */
/* ===== research engine: pure functions, no DOM. Runs in the page and in Node (for seeding and tests). ===== */
var BARS=null,SPREAD=0.20; /* gold, price units; modelled round-trip cost */
function initBars(d){
  var n=d.o.length,ts=new Array(n),t=d.t0,i;
  for(i=0;i<n;i++){t+=d.dt[i];ts[i]=t}
  var atr=new Array(n),prev=d.c[0],a=null;
  for(i=0;i<n;i++){
    var tr=Math.max(d.h[i]-d.l[i],Math.abs(d.h[i]-prev),Math.abs(d.l[i]-prev));prev=d.c[i];
    if(i<14){a=(a==null?0:a)+tr;atr[i]=i===13?a/14:null;if(i===13)a=a/14}else{a=(a*13+tr)/14;atr[i]=a}
  }
  BARS={n:n,ts:ts,o:d.o,h:d.h,l:d.l,c:d.c,atr:atr,first:ts[0],last:ts[n-1]};
  return BARS;
}
function rollMax(a,n){var out=new Array(a.length),q=[],i;for(i=0;i<a.length;i++){while(q.length&&a[q[q.length-1]]<=a[i])q.pop();q.push(i);if(q[0]<=i-n)q.shift();out[i]=i>=n-1?a[q[0]]:null}return out}
function rollMin(a,n){var out=new Array(a.length),q=[],i;for(i=0;i<a.length;i++){while(q.length&&a[q[q.length-1]]>=a[i])q.pop();q.push(i);if(q[0]<=i-n)q.shift();out[i]=i>=n-1?a[q[0]]:null}return out}
function emaOf(a,n){var k=2/(n+1),out=new Array(a.length),e=a[0],i;for(i=0;i<a.length;i++){e=i===0?a[0]:a[i]*k+e*(1-k);out[i]=i>=n-1?e:null}return out}
function rsiOf(c,n){
  var out=new Array(c.length),g=0,l=0,i;
  for(i=1;i<c.length;i++){var d=c[i]-c[i-1],up=d>0?d:0,dn=d<0?-d:0;
    if(i<=n){g+=up;l+=dn;if(i===n){g/=n;l/=n;out[i]=l===0?100:100-100/(1+g/l)}else out[i]=null}
    else{g=(g*(n-1)+up)/n;l=(l*(n-1)+dn)/n;out[i]=l===0?100:100-100/(1+g/l)}}
  out[0]=null;return out;
}

/* strategy templates: each returns entry signals (+1 long, -1 short, 0 none at the close of bar i), exit signals (+1 = exit a long, -1 = exit a short) and the stop distance multiple */
var TEMPLATES={
 donchian:{label:"Donchian breakout",hyp:"Price that breaks out of its recent range tends to keep going, so buying new highs and selling new lows with an ATR stop captures trends.",
  params:{n:{label:"Breakout bars",min:10,max:60,step:10},exitN:{label:"Exit channel bars",min:5,max:30,step:5},k:{label:"Stop (ATR multiple)",min:1,max:4,step:1}},
  build:function(p){var B=BARS,hi=rollMax(B.h,p.n),lo=rollMin(B.l,p.n),hx=rollMax(B.h,p.exitN),lx=rollMin(B.l,p.exitN),n=B.n,sig=new Array(n).fill(0),ex=new Array(n).fill(0),i;
    for(i=p.n+1;i<n;i++){if(B.c[i]>hi[i-1])sig[i]=1;else if(B.c[i]<lo[i-1])sig[i]=-1;if(lx[i-1]!=null&&B.c[i]<lx[i-1])ex[i]=1;if(hx[i-1]!=null&&B.c[i]>hx[i-1])ex[i]=ex[i]===1?2:-1}
    return {sig:sig,ex:ex,k:p.k,maxHold:0}}},
 ema_cross:{label:"EMA crossover",hyp:"A fast average crossing a slow one marks a change of trend, so trading the cross and exiting on the cross back rides the move.",
  params:{fast:{label:"Fast EMA",min:5,max:30,step:5},slow:{label:"Slow EMA",min:30,max:120,step:10},k:{label:"Stop (ATR multiple)",min:1,max:4,step:1}},
  valid:function(p){return p.fast<p.slow},
  build:function(p){var B=BARS,f=emaOf(B.c,p.fast),s=emaOf(B.c,p.slow),n=B.n,sig=new Array(n).fill(0),ex=new Array(n).fill(0),i;
    for(i=p.slow+1;i<n;i++){if(f[i]>s[i]&&f[i-1]<=s[i-1])sig[i]=1;else if(f[i]<s[i]&&f[i-1]>=s[i-1])sig[i]=-1;if(f[i]<s[i])ex[i]=1;if(f[i]>s[i])ex[i]=ex[i]===1?2:-1}
    return {sig:sig,ex:ex,k:p.k,maxHold:0}}},
 rsi_reversion:{label:"RSI reversion",hyp:"After a stretched move the price tends to snap back, so buying a low RSI and selling a high RSI with a time limit and an ATR stop pays on average.",
  params:{n:{label:"RSI length",min:5,max:21,step:4},lo:{label:"Oversold level",min:15,max:35,step:5},k:{label:"Stop (ATR multiple)",min:1,max:3,step:1},hold:{label:"Max hold (bars)",min:6,max:48,step:6}},
  build:function(p){var B=BARS,r=rsiOf(B.c,p.n),n=B.n,sig=new Array(n).fill(0),ex=new Array(n).fill(0),i;
    for(i=p.n+1;i<n;i++){if(r[i]<p.lo)sig[i]=1;else if(r[i]>100-p.lo)sig[i]=-1;if(r[i]>50)ex[i]=1;if(r[i]<50)ex[i]=ex[i]===1?2:-1}
    return {sig:sig,ex:ex,k:p.k,maxHold:p.hold}}}
};

/* simulator: one position at a time. Entry at the next open, stop checked from the entry bar on (gaps fill at the open), signal exits at the next open.
   R = (move - cost) / stop distance. Window [a,b): entries only inside it, any open trade closes at the last close. */
function simulate(spec,costMult,a,b){
  var B=BARS,trades=[],pos=null,cost=SPREAD*costMult,j,start=Math.max(a,15);
  function close(idx,px){var mv=(px-pos.entry)*pos.dir-cost;trades.push([pos.i,idx,pos.dir>0?0:1,mv/pos.risk]);pos=null}
  for(j=start+1;j<b;j++){
    if(pos){
      var e=spec.ex[j-1],exitNow=(pos.dir>0&&(e===1||e===2))||(pos.dir<0&&(e===-1||e===2))||(spec.maxHold&&j-pos.i>=spec.maxHold);
      if(exitNow){close(j,B.o[j]);}
    }
    if(!pos){
      var s=spec.sig[j-1];
      if(s!==0&&B.atr[j-1]!=null&&j>=start+1){var risk=spec.k*B.atr[j-1];if(risk>0)pos={dir:s,i:j,entry:B.o[j],risk:risk,sl:B.o[j]-s*risk}}
    }
    if(pos){
      if(pos.dir>0){if(B.o[j]<=pos.sl)close(j,B.o[j]);else if(B.l[j]<=pos.sl)close(j,pos.sl)}
      else{if(B.o[j]>=pos.sl)close(j,B.o[j]);else if(B.h[j]>=pos.sl)close(j,pos.sl)}
    }
  }
  if(pos)close(b-1,B.c[b-1]);
  return trades;
}
function runParams(tpl,p,costMult,a,b){var T=TEMPLATES[tpl];if(T.valid&&!T.valid(p))return [];return simulate(T.build(p),costMult==null?1:costMult,a==null?0:a,b==null?BARS.n:b)}

/* statistics */
function phi(x){return 0.5*(1+erf(x/Math.SQRT2))}
function erf(x){var s=x<0?-1:1;x=Math.abs(x);var t=1/(1+0.3275911*x),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return s*y}
function invNorm(p){ /* Acklam */
  var a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00],b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01],c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00],d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00],q,r;
  if(p<0.02425){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}
  if(p>1-0.02425){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}
  q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function expMaxZ(N){if(N<=1)return 0;var g=0.5772156649;return (1-g)*invNorm(1-1/N)+g*invNorm(1-1/(N*Math.E))}
function metricsOf(tr){
  var n=tr.length;if(!n)return {n:0,exp:0,sd:0,t:0,pf:0,winp:0,totR:0,maxDD:0,top5:0,longR:0,shortR:0,longN:0,shortN:0};
  var R=tr.map(function(x){return x[3]}),tot=0,w=0,l=0,wn=0,pk=0,eq=0,dd=0,lR=0,sR=0,lN=0,sN=0,i;
  for(i=0;i<n;i++){var r=R[i];tot+=r;if(r>0){w+=r;wn++}else l-=r;eq+=r;if(eq>pk)pk=eq;if(pk-eq>dd)dd=pk-eq;if(tr[i][2]===0){lR+=r;lN++}else{sR+=r;sN++}}
  var m=tot/n,v=0;for(i=0;i<n;i++)v+=(R[i]-m)*(R[i]-m);var sd=n>1?Math.sqrt(v/(n-1)):0,t=sd>0?m/(sd/Math.sqrt(n)):0;
  var s=R.slice().sort(function(a,b){return b-a}),t5=s.slice(0,5).reduce(function(a,b){return a+b},0);
  return {n:n,exp:m,sd:sd,t:t,pf:l>0?w/l:(w>0?99:0),winp:wn/n*100,totR:tot,maxDD:dd,top5:tot>0?t5/tot:0,longR:lR,shortR:sR,longN:lN,shortN:sN};
}
function foldsOf(tr,from,to,k){var out=[],i,span=(to-from)/k;for(i=0;i<k;i++){var a=from+i*span,b=a+span,f=tr.filter(function(x){return x[0]>=a&&x[0]<b});out.push({n:f.length,totR:f.reduce(function(s,x){return s+x[3]},0),exp:f.length?f.reduce(function(s,x){return s+x[3]},0)/f.length:0})}return out}
function bootstrapCI(R,iters,seed){var rr=mkRnd(seed||5),n=R.length,m=[],i,j;if(n<5)return null;for(i=0;i<iters;i++){var s=0;for(j=0;j<n;j++)s+=R[Math.floor(rr()*n)];m.push(s/n)}m.sort(function(a,b){return a-b});return [m[Math.floor(iters*0.1)],m[Math.floor(iters*0.9)]]}

/* the research agent: bounded grid search, selected on the first 66% of history, judged on the rest */
function gridOf(tpl,bounds){
  var T=TEMPLATES[tpl],keys=Object.keys(T.params),axes=keys.map(function(k){var b=bounds[k]||T.params[k],v=[],x;for(x=b.min;x<=b.max+1e-9;x+=b.step)v.push(+x.toFixed(6));return v}),out=[{}],i;
  keys.forEach(function(k,ki){var nx=[];out.forEach(function(o){axes[ki].forEach(function(v){var c=Object.assign({},o);c[k]=v;nx.push(c)})});out=nx});
  return out.filter(function(p){return !T.valid||T.valid(p)});
}
function research(tpl,bounds,prevTrials,opts){
  opts=opts||{};var B=BARS,cut=Math.floor(B.n*0.66),warm=30,grid=gridOf(tpl,bounds),cap=opts.cap||400;
  if(grid.length>cap){var rr=mkRnd(11);grid=grid.map(function(g){return [rr(),g]}).sort(function(a,b){return a[0]-b[0]}).slice(0,cap).map(function(x){return x[1]})}
  var best=null,evaluated=0,tried=[];
  grid.forEach(function(p){var tr=runParams(tpl,p,1,warm,cut),m=metricsOf(tr);evaluated++;var score=m.n>=40?m.t:-99;tried.push(score);if(!best||score>best.score)best={p:p,score:score,m:m}});
  var p=best.p,full=runParams(tpl,p,1,warm,B.n),oos=runParams(tpl,p,1,cut,B.n),isT=runParams(tpl,p,1,warm,cut),stress=runParams(tpl,p,1.5,warm,B.n),mf=metricsOf(full),mo=metricsOf(oos),mi=metricsOf(isT),ms=metricsOf(stress),N=(prevTrials||0)+evaluated;
  var hours=function(tr){return tr.map(function(x){return [B.ts[x[0]],B.ts[x[1]],x[2],+x[3].toFixed(4)]})};
  var folds=foldsOf(full,warm,B.n,3);
  return {backtest:{kind:"engine",dataset:"XAUUSD H1, 2023-09 to 2026-09 (Dukascopy)",costModel:"Spread "+SPREAD.toFixed(2)+" per round trip",params:p,trials:N,cutHour:B.ts[cut],
    metrics:{full:mf,is:mi,oos:mo,folds:folds,costStressR:ms.totR,deflT:mf.t-expMaxZ(N),expMaxZ:expMaxZ(N)},ts:Date.now()},trades:hours(full),evaluated:evaluated};
}

/* parse a trade list (CSV text) from the user's own backtest or demo account */
function parseTimeHours(s){
  s=String(s).trim();if(!s)return NaN;
  if(/^\d{12,13}$/.test(s))return Math.floor(+s/3600000);if(/^\d{9,10}$/.test(s))return Math.floor(+s/3600);
  var m=s.replace("T"," ").replace(/Z$/,"").match(/^(\d{4})[-./](\d{2})[-./](\d{2})(?:[ ](\d{2}):(\d{2}))?/);if(!m)return NaN;
  return Math.floor(Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0))/3600000);
}
function parseTradesCsv(text){
  var lines=String(text).replace(/\r/g,"").split("\n").filter(function(l){return l.trim()}),err="";
  if(lines.length<2)return {err:"The file needs a header row and at least one trade."};
  var sep=lines[0].indexOf(";")>=0&&lines[0].indexOf(",")<0?";":",",hd=lines[0].split(sep).map(function(h){return h.trim().toLowerCase().replace(/^"|"$/g,"")});
  function col(names){for(var i=0;i<names.length;i++){var k=hd.indexOf(names[i]);if(k>=0)return k}return -1}
  var cO=col(["fill","opened","open","open_time","time","entry_time","opened_utc"]),cX=col(["exit_exec","exit","closed","close","close_time","exit_time","closed_utc"]),cS=col(["side","type","direction"]),cR=col(["r","r_multiple","result_r","net_r"]),cE=col(["entry","entry_price","price_open"]),cK=col(["stop","sl","stop_loss"]);
  if(cR<0)return {err:"No R column found. The file needs a column named R (profit in units of the risk taken)."};
  if(cO<0&&cX<0)return {err:"No time column found. Use fill or opened for the open time and exit or closed for the close time."};
  var rows=[],bad=0;
  for(var i=1;i<lines.length&&rows.length<5000;i++){
    var c=lines[i].split(sep).map(function(x){return x.trim().replace(/^"|"$/g,"")}),r=parseFloat(c[cR]);
    var t0=cO>=0?parseTimeHours(c[cO]):NaN,t1=cX>=0?parseTimeHours(c[cX]):NaN;if(isNaN(t0))t0=t1;if(isNaN(t1))t1=t0;
    if(isNaN(r)||isNaN(t0)){bad++;continue}
    var sd=cS>=0?String(c[cS]).toLowerCase():"buy",side=/sell|short|1$/.test(sd)?1:0,row=[t0,t1,side,+r.toFixed(4)];
    if(cE>=0&&cK>=0){var e=parseFloat(c[cE]),k=parseFloat(c[cK]);if(!isNaN(e)&&!isNaN(k)&&e!==k)row.push(+Math.abs(e-k).toFixed(4))}
    rows.push(row);
  }
  if(rows.length<5)return {err:"Only "+rows.length+" usable trades found"+(bad?" ("+bad+" rows skipped)":"")+". At least 5 are needed."};
  rows.sort(function(a,b){return a[0]-b[0]});
  return {rows:rows,skipped:bad};
}
function importedBacktest(rows,meta){
  var m=metricsOf(rows),first=rows[0][0],last=rows[rows.length-1][1],hasRisk=rows.every(function(r){return r.length>4}),stress=null;
  if(hasRisk)stress=rows.reduce(function(s,r){return s+r[3]-(SPREAD*0.5)/r[4]},0);
  var N=Math.max(1,meta.trials||1);
  return {kind:"imported",dataset:meta.dataset||"Imported trade list",costModel:meta.cost||"As supplied",params:null,trials:N,
    metrics:{full:m,is:null,oos:null,folds:foldsOf(rows,first,last+1,3),costStressR:stress,deflT:m.t-expMaxZ(N),expMaxZ:expMaxZ(N)},ts:Date.now()};
}

/* ranking: one transparent score out of 100, plus the reasons a strategy is or is not eligible to be recommended */
function rankOf(s){
  var bt=s.backtest,fw=s.forward;
  if(!bt)return {score:null,eligible:false,parts:[],penalties:[],reasons:["No backtest results yet"],trust:0,basis:"none"};
  var m=bt.metrics,full=m.full,oos=m.oos,basis=oos?"out-of-sample":"full history",ev=oos||full,parts=[],pen=[],reasons=[];
  function part(name,pts,max,input,why){parts.push({name:name,pts:Math.max(0,Math.min(max,pts)),max:max,input:input,why:why})}
  part("Edge",ev.exp/0.30*30,30,sgn(ev.exp,3)+"R per trade ("+basis+")","Net expectancy, 0.30R earns full marks");
  var posFolds=m.folds.filter(function(f){return f.totR>0}).length,cs=m.costStressR;
  var rob=(cs==null?0:(cs>0?8:0))+(m.folds.length?posFolds/m.folds.length*12:0)+(oos&&m.is&&m.is.exp>0.01?Math.min(1,Math.max(0,oos.exp/m.is.exp))*5:(oos?0:2.5));
  part("Robustness",rob,25,posFolds+" of "+m.folds.length+" folds positive; cost stress "+(cs==null?"not available":sgn(cs,1)+"R"),"Survives +50% cost, positive across time, out-of-sample keeps the in-sample edge");
  var tEff=oos?oos.t:m.deflT;part("Significance",(tEff+0.5)/3*20,20,"t "+tEff.toFixed(2)+(oos?" out-of-sample":" after "+bt.trials+" trials"),"Out-of-sample t, or the full-history t minus the best-of-N bar");
  var calmar=full.maxDD>0?full.totR/full.maxDD:0;part("Risk",calmar/8*15,15,"return/drawdown "+calmar.toFixed(1),"Total R over max drawdown R, 8 earns full marks");
  part("Sample",full.n/300*10,10,full.n+" trades","300 trades earns full marks");
  var raw=parts.reduce(function(a,p){return a+p.pts},0);
  if(full.top5>0.5){var pt=Math.min(15,(full.top5-0.5)*30);pen.push({name:"Tail concentration",pts:pt,why:Math.round(full.top5*100)+"% of the total comes from 5 trades"});}
  var tot=full.totR;if(tot>0&&(full.longR<=tot*0.1||full.shortR<=tot*0.1))pen.push({name:"One-sided",pts:10,why:"One side earned almost all the profit"});
  var penT=pen.reduce(function(a,p){return a+p.pts},0),trust=bt.kind==="imported"&&!bt.verified?0.85:1,adj=0,fwNote="";
  if(fw&&fw.metrics&&fw.metrics.full.n>=30){var fe=fw.metrics.full.exp,fn=fw.metrics.full.n,ratio=fe/Math.max(ev.exp,0.05);
    if(fe>0){adj=Math.min(10,10*Math.min(1,Math.max(0,ratio))*Math.min(1,fn/150));fwNote="Forward expectancy "+sgn(fe,3)+"R over "+fn+" trades"}else{adj=-10*Math.min(1,fn/100);fwNote="Forward expectancy "+sgn(fe,3)+"R over "+fn+" trades is not positive"}}
  var score=Math.max(0,Math.min(100,(raw-penT)*trust+adj));
  if(full.n<150)reasons.push("Needs at least 150 trades (has "+full.n+")");
  if(ev.exp<0.10)reasons.push("Net expectancy "+sgn(ev.exp,3)+"R is below +0.10R ("+basis+")");
  if(cs==null)reasons.push("Cost stress could not be computed (add entry and stop columns, or run the engine)");else if(cs<=0)reasons.push("Does not survive +50% cost");
  if(m.deflT<0&&!oos)reasons.push("Full-history t-stat does not clear the best-of-"+bt.trials+" bar");
  if(oos&&oos.t<1.0)reasons.push("Out-of-sample t-stat "+oos.t.toFixed(2)+" is below 1.0");
  if(full.top5>0.65)reasons.push("Over 65% of the total comes from 5 trades");
  var eligible=!reasons.length&&score>=40;
  return {score:score,raw:raw,parts:parts,penalties:pen,penTotal:penT,trust:trust,fwAdj:adj,fwNote:fwNote,eligible:eligible,reasons:reasons,basis:basis,tEff:tEff};
}
