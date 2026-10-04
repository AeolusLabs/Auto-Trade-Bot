/* 09_lab_detail.js: Strategy lab, part 2: the detail panel (Overview, Backtest, Forward, Gates, Ranking), equity charts and the promotion-gate editor. */
/* ---------- strategy detail: overview, backtest, forward, gates, ranking ---------- */
var DSIG="",DRT=0;
function renderLab(force){
  if(LAB.id&&!STR[LAB.id])LAB.id=null;
  var ranked=rankAll();if(!LAB.id&&ranked.length)LAB.id=ranked[0].s.id;
  renderReco();renderBoardLab();renderDetail(force);
}
function hoursToDate(h){return new Date(h*3600000)}
function dstr(h){var d=hoursToDate(h);return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0")}
function kpiStrip(m,extra){
  var K=[["Trades",m.n,""],["Expectancy",sgn(m.exp,3)+"R",m.exp>=0?"pos":"neg"],["Profit factor",m.pf.toFixed(2),""],["Win rate",m.winp.toFixed(1)+"%",""],["Total R",sgn(m.totR,1),m.totR>=0?"pos":"neg"],["Max drawdown",m.maxDD.toFixed(1)+"R","neg"],["t-stat",m.t.toFixed(2),""],["Top 5 trades",Math.round(m.top5*100)+"% of total",m.top5>0.65?"neg":""]];
  return '<div class="kpis">'+K.map(function(k){return '<div><div class="k">'+k[0]+'</div><div class="v '+k[2]+'">'+k[1]+'</div></div>'}).join("")+'</div>';
}
function eqChart(trades,width,opts){
  opts=opts||{};var sorted=trades.slice().sort(function(a,b){return a[1]-b[1]}),pts=[],c=0;
  sorted.forEach(function(t){c+=t[3];pts.push([t[1],c])});
  if(pts.length<2)return {svg:'<p class="dim">Not enough trades to chart.</p>',pts:pts};
  var W_=Math.max(320,Math.round(width||700)),H=210,L=46,Rm=12,Tp=12,B=176,pw=W_-L-Rm,x0=pts[0][0],x1=pts[pts.length-1][0],ys=pts.map(function(p){return p[1]}),lo=Math.min.apply(null,ys.concat([0])),hi=Math.max.apply(null,ys.concat([0])),pad=(hi-lo)*0.08||1;lo-=pad;hi+=pad;
  var x=function(t){return L+pw*((t-x0)/(x1-x0||1))},y=function(v){return Tp+(B-Tp)*(1-(v-lo)/(hi-lo))},g="",step=(hi-lo)/4,mag=Math.pow(10,Math.floor(Math.log10(step))),ns=[1,2,5,10].map(function(m){return m*mag}).filter(function(m){return m>=step})[0];
  for(var v=Math.ceil(lo/ns)*ns;v<=hi;v+=ns)g+='<line x1="'+L+'" x2="'+(W_-Rm)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="'+cv("--grid")+'"/><text x="'+(L-6)+'" y="'+(y(v)+4).toFixed(1)+'" text-anchor="end">'+(Math.abs(v)<1e-9?"0":v.toFixed(0))+'R</text>';
  var d0=hoursToDate(x0),yr=d0.getUTCFullYear(),mo=d0.getUTCMonth()<6?0:6;
  for(var tk=Date.UTC(yr,mo,1)/36e5;tk<=x1;){if(tk>=x0){var dt=hoursToDate(tk);g+='<line x1="'+x(tk).toFixed(1)+'" x2="'+x(tk).toFixed(1)+'" y1="'+B+'" y2="'+(B+4)+'" stroke="'+cv("--line")+'"/><text x="'+x(tk).toFixed(1)+'" y="'+(B+17)+'" text-anchor="middle">'+dt.getUTCFullYear()+"-"+String(dt.getUTCMonth()+1).padStart(2,"0")+'</text>'}mo+=6;if(mo>=12){mo-=12;yr++}tk=Date.UTC(yr,mo,1)/36e5}
  var col=opts.color||cv("--pos"),line="M"+pts.map(function(p){return x(p[0]).toFixed(1)+","+y(p[1]).toFixed(1)}).join("L"),zero=y(0);
  g+='<line x1="'+L+'" x2="'+(W_-Rm)+'" y1="'+zero.toFixed(1)+'" y2="'+zero.toFixed(1)+'" stroke="'+cv("--fg3")+'" stroke-dasharray="3 4"/>';
  if(opts.cut&&opts.cut>x0&&opts.cut<x1){var cx=x(opts.cut);g+='<rect x="'+cx.toFixed(1)+'" y="'+Tp+'" width="'+(W_-Rm-cx).toFixed(1)+'" height="'+(B-Tp)+'" fill="'+cv("--surface2")+'" opacity=".55"/><line x1="'+cx.toFixed(1)+'" x2="'+cx.toFixed(1)+'" y1="'+Tp+'" y2="'+B+'" stroke="'+cv("--fg3")+'" stroke-dasharray="4 4"/><text x="'+(cx+6).toFixed(1)+'" y="'+(Tp+12)+'">out-of-sample, never used to pick the parameters</text>'}
  g+='<path d="'+line+"L"+x(x1).toFixed(1)+","+zero.toFixed(1)+"L"+x(x0).toFixed(1)+","+zero.toFixed(1)+'Z" fill="'+col+'" fill-opacity=".14"/><path d="'+line+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/>';
  g+='<line class="eqx" x1="0" x2="0" y1="'+Tp+'" y2="'+B+'" stroke="'+cv("--fg3")+'" style="display:none"/><circle class="eqd" r="4.5" fill="'+col+'" stroke="'+cv("--surface")+'" stroke-width="2" style="display:none"/><rect class="eqh" x="'+L+'" y="'+Tp+'" width="'+pw+'" height="'+(B-Tp)+'" fill="transparent"/>';
  return {svg:'<svg class="ch eq" viewBox="0 0 '+W_+" "+H+'" width="100%" role="img" aria-label="Cumulative R by trade close time" data-x0="'+x0+'" data-x1="'+x1+'" data-L="'+L+'" data-pw="'+pw+'" data-W="'+W_+'" data-lo="'+lo+'" data-hi="'+hi+'" data-tp="'+Tp+'" data-b="'+B+'">'+g+'</svg><div class="tip"></div>',pts:pts};
}
function bindEq(box,pts){
  var svg=box.querySelector("svg.eq"),tip=box.querySelector(".tip");if(!svg||!tip)return;
  var d=svg.dataset,x0=+d.x0,x1=+d.x1,L=+d.L,pw=+d.pw,W_=+d.W,lo=+d.lo,hi=+d.hi,Tp=+d.tp,B=+d.b,hit=svg.querySelector(".eqh"),xl=svg.querySelector(".eqx"),dot=svg.querySelector(".eqd");
  hit.addEventListener("pointermove",function(ev){
    var r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*W_,tt=x0+(px-L)/pw*(x1-x0),bi=0,bd=1e18;
    pts.forEach(function(p,i){var dd=Math.abs(p[0]-tt);if(dd<bd){bd=dd;bi=i}});
    var p=pts[bi],xs=L+pw*((p[0]-x0)/(x1-x0||1)),ys=Tp+(B-Tp)*(1-(p[1]-lo)/(hi-lo));
    xl.setAttribute("x1",xs);xl.setAttribute("x2",xs);xl.style.display="";dot.setAttribute("cx",xs);dot.setAttribute("cy",ys);dot.style.display="";
    tip.style.display="block";tip.innerHTML="<b>"+dstr(p[0])+'</b><br><span class="num '+cls(p[1])+'">'+sgn(p[1],1)+"R</span> cumulative, trade "+(bi+1)+" of "+pts.length;
    var bx=box.getBoundingClientRect();tip.style.left=Math.max(4,Math.min(ev.clientX-bx.left+14,bx.width-210))+"px";tip.style.top=Math.max(4,ev.clientY-bx.top-56)+"px"});
  hit.addEventListener("pointerleave",function(){tip.style.display="none";xl.style.display="none";dot.style.display="none"});
}
function foldsTable(folds,from){var names=["First third","Middle third","Last third"];return '<div class="tw"><table><tr><th>Period</th><th class="r">Trades</th><th class="r">Total R</th><th class="r">Per trade</th></tr>'+folds.map(function(f,i){return '<tr><td>'+names[i]+'</td><td class="r num">'+f.n+'</td><td class="r num '+cls(f.totR)+'">'+sgn(f.totR,1)+'R</td><td class="r num">'+sgn(f.exp,3)+'R</td></tr>'}).join("")+'</table></div>'}
function tradeRows(trades,n){
  var rows=trades.slice().sort(function(a,b){return b[1]-a[1]}).slice(0,n);
  return '<div class="tw"><table><tr><th>Opened (UTC)</th><th>Closed (UTC)</th><th>Side</th><th class="r">Result</th></tr>'+rows.map(function(t){return '<tr><td class="num">'+dstr(t[0])+'</td><td class="num">'+dstr(t[1])+'</td><td>'+(t[2]?"sell":"buy")+'</td><td class="r num '+cls(t[3])+'">'+(t[3]>=0?"▲ ":"▼ ")+sgn(t[3],2)+'R</td></tr>'}).join("")+'</table></div>';
}
function importBox(kind,s){
  var isBt=kind==="backtest";
  return '<div class="drop" id="drop-'+kind+'"><p style="margin-bottom:8px">Import a <b>trade list (CSV)</b> '+(isBt?"from your own backtest":"from the demo account")+'</p><label class="btn" for="imp-file-'+kind+'" style="display:inline-flex">Choose a CSV</label><input id="imp-file-'+kind+'" data-impkind="'+kind+'" type="file" accept=".csv,.txt" class="sr"'+dis()+'>'+
   '<p class="help" style="margin-top:8px">Needs a column <b>R</b> and times (<b>fill</b> and <b>exit</b>, or <b>opened</b> and <b>closed</b>). Optional <b>side</b>, <b>entry</b> and <b>stop</b>; with entry and stop, cost stress can be computed.</p></div>'+
   (isBt?'<div class="form-grid" style="margin-top:10px"><div class="field"><label class="lbl" for="imp-trials">How many variants did you try to find this one?</label><input class="inp mono" id="imp-trials" type="number" min="1" value="1"><span class="help">Be honest: it sets the multiple-testing bar.</span></div><div class="field"><label class="lbl" for="imp-ds">Data and cost assumptions</label><input class="inp" id="imp-ds" maxlength="80" placeholder="e.g. XAUUSD H1, 2023-2026, spread 0.20"></div></div>':"")+'<span class="err" id="imp-msg"></span>';
}

async function renderDetail(force){
  var host=$("#lab-detail"),s=LAB.id?STR[LAB.id]:null,my=++DRT;
  if(!s){host.innerHTML="";return}
  var sig=[s.id,LAB.sub,s.updatedAt,Object.keys(AG).length,assignedTo(s.id).map(function(a){return a.id}).join()].join("|");
  if(!force&&sig===DSIG)return;
  if(!force&&host.contains(document.activeElement)&&host.dataset.sid===s.id&&host.dataset.sub===LAB.sub)return;
  var res=rankFor(s),tabs=[["overview","Overview"],["backtest","Backtest"],["forward","Forward"],["gates","Gates"],["ranking","Ranking"]],body="";
  if(LAB.sub==="overview")body=await detailOverview(s);
  else if(LAB.sub==="backtest")body=await detailBacktest(s,host.clientWidth-36);
  else if(LAB.sub==="forward")body=await detailForward(s,host.clientWidth-36);
  else if(LAB.sub==="gates")body='<div id="lab-gates"></div>';
  else body=detailRanking(s,res);
  if(my!==DRT)return;DSIG=sig;
  host.dataset.sid=s.id;host.dataset.sub=LAB.sub;
  host.innerHTML='<div class="card" style="margin-top:14px"><div class="card-h"><div class="inl"><h2>'+esc(s.name)+'</h2>'+srcChip(s)+'<span class="chip">'+(res.score==null?"No results yet":"Score "+res.score.toFixed(0))+'</span><span class="pill-stage">'+(stageIndex(s)>=6?"All gates passed":"Stage "+stageIndex(s)+": "+STAGE_NAMES[stageIndex(s)])+'</span></div></div>'+
   '<div class="subtabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" data-lsub="'+t[0]+'" aria-selected="'+(LAB.sub===t[0])+'">'+t[1]+'</button>'}).join("")+'</div>'+body+'</div>';
  if(LAB.sub==="gates")gatesEditor($("#lab-gates"),s.id);
  var eq=host.querySelector(".chartbox[data-trades]");if(eq&&eq._pts)bindEq(eq,eq._pts);
  host.querySelectorAll(".chartbox").forEach(function(b){if(b._pts)bindEq(b,b._pts)});
}
async function detailOverview(s){
  var ag=assignedTo(s.id),code=s.kind==="file"?await getRun(s.id,"code"):null,agents=liveAgents();
  var info='<div class="kv"><div><span>Instruments</span><span class="num">'+esc(s.instruments.join(", "))+'</span></div><div><span>Timeframe</span><span class="num">'+esc(s.timeframe||"")+'</span></div><div><span>Trials so far</span><span class="num">'+(s.trials||0)+'</span></div><div><span>Assigned to</span><span>'+(ag.length?ag.map(function(a){return esc(a.name)}).join(", "):"no agent")+'</span></div></div>';
  var fileBox="";
  if(s.kind==="file"){fileBox='<h3 style="margin:18px 0 8px">Strategy file</h3><div class="grid g2e" style="align-items:start"><div class="kv"><div><span>File</span><span class="num">'+esc((s.file||{}).name||"")+'</span></div><div><span>Language</span><span>'+(s.language==="mql5"?"MQL5 Expert Advisor":"Python strategy plugin")+'</span></div>'+(s.source==="repo"?'<div><span>Where it lives</span><span>The runner code in the repository</span></div>':'<div><span>Size</span><span class="num">'+(((s.file||{}).size||0)/1024).toFixed(1)+' KB</span></div><div><span>SHA-256</span><span class="num">'+esc(((s.file||{}).sha256||"").slice(0,16))+'…</span></div>')+'</div><div><h3 style="margin-bottom:8px">Static review</h3>'+((s.file||{}).review&&s.file.review.length?'<ul class="lint">'+s.file.review.map(function(l){return '<li class="'+(l.k==="ok"?"ok":l.k==="bad"?"bad":"warn")+'"><span class="m">'+(l.k==="ok"?"✓":l.k==="bad"?"✕":"▲")+'</span><span>'+esc(l.t)+'</span></li>'}).join("")+'</ul><p class="help" style="margin-top:8px">A text scan, not a security guarantee. Uploaded code runs only in a sandbox on the research worker after you approve it.</p>':'<p class="dim">No review on record.</p>')+'</div></div>'+(code?'<div class="inl" style="margin-top:8px"><button class="btn sm ghost" id="ld-view">View code</button></div><div id="ld-code"></div>':"")}
  if(s.kind==="template"){var T=TEMPLATES[s.template.id];fileBox='<h3 style="margin:18px 0 8px">Template: '+T.label+'</h3><div class="tw"><table><tr><th>Parameter</th><th class="r">Min</th><th class="r">Max</th><th class="r">Step</th>'+(s.backtest&&s.backtest.params?'<th class="r">Chosen</th>':"")+'</tr>'+Object.keys(T.params).map(function(k){var b=s.template.bounds[k];return '<tr><td>'+T.params[k].label+'</td><td class="r num">'+b.min+'</td><td class="r num">'+b.max+'</td><td class="r num">'+b.step+'</td>'+(s.backtest&&s.backtest.params?'<td class="r num">'+s.backtest.params[k]+'</td>':"")+'</tr>'}).join("")+'</table></div>'}
  var assign=agents.length?'<h3 style="margin:18px 0 8px">Assign to an agent</h3><div class="inl"><label class="lbl" for="ld-agent">Agent</label><select class="sel" id="ld-agent" style="max-width:300px"'+dis()+'>'+agents.map(function(a){return '<option value="'+a.id+'"'+(a.strategyId===s.id?" selected":"")+'>'+esc(a.name)+(a.strategyId&&STR[a.strategyId]?" (has "+esc(STR[a.strategyId].name)+")":" (free)")+'</option>'}).join("")+'</select><button class="btn" id="ld-assign"'+dis()+'>Assign</button></div><div id="ld-slot"></div>':'<p class="dim" style="margin-top:14px">Add an agent to assign this strategy.</p>';
  var danger='<h3 style="margin:18px 0 8px">Remove</h3><div class="inl"><button class="btn" id="ld-arch"'+dis()+(ag.length?" disabled":"")+'>Archive</button><label class="lbl" for="ld-name">or type <b class="num" style="color:var(--fg)">'+esc(s.name)+'</b> to delete</label><input class="inp mono" id="ld-name" style="max-width:220px" autocomplete="off"'+dis()+'><button class="btn danger" id="ld-del" disabled>Delete</button></div>'+(ag.length?'<p class="help">Unassign it from '+ag.map(function(a){return esc(a.name)}).join(", ")+' first.</p>':"");
  return (STORE.canWrite?"":'<div class="ro">Read only: you can look but not change anything.</div>')+'<p class="sec" style="margin-bottom:12px">'+esc(s.hypothesis||"No hypothesis written.")+'</p>'+info+fileBox+assign+danger;
}
async function detailBacktest(s,width){
  var bt=s.backtest;
  if(!bt){
    var ctl=s.kind==="template"?'<div class="inl"><button class="btn" id="ld-research"'+dis()+'>Run the research agent</button><span class="help">Searches '+gridSize(s.template.id,s.template.bounds)+' combinations on 3 years of gold, picks on the first 66%, and judges on the rest.</span></div>':s.kind==="file"?importBox("backtest",s)+'<p class="help" style="margin-top:8px">Or queue it for the research worker, which will run it in a sandbox when one is connected.</p><div class="inl" style="margin-top:6px"><button class="btn" id="ld-queue"'+dis()+'>Queue for the research worker</button>'+(s.job?'<span class="chip warn">Queued '+fmtTs(s.job.ts)+'</span>':"")+'</div>':'<p class="dim">An idea card has nothing to test. Add a file or a template.</p>';
    return '<div class="empty" style="margin-bottom:14px"><h2>No backtest results yet</h2><p>Results decide the strategy\'s rank.</p></div>'+ctl;
  }
  var m=bt.metrics,run=await getRun(s.id,"backtest"),trades=run&&run.trades?run.trades:[];
  var ch=eqChart(trades,width,{cut:bt.cutHour});
  var prov='<div class="inl" style="margin-bottom:12px"><span class="chip '+(bt.kind==="engine"?"good":bt.verified?"good":"warn")+'">'+(bt.kind==="engine"?"Run by the research agent":bt.verified?"Imported, reproduced":"Imported, unverified")+'</span><span class="dim xs">'+esc(bt.dataset)+' · '+esc(bt.costModel)+' · '+bt.trials+' trial'+(bt.trials===1?"":"s")+' · '+fmtTs(bt.ts)+'</span></div>';
  var split=m.oos?'<h3 style="margin:16px 0 8px">In-sample against out-of-sample</h3><div class="tw"><table><tr><th>Period</th><th class="r">Trades</th><th class="r">Per trade</th><th class="r">Profit factor</th><th class="r">t-stat</th><th class="r">Total R</th></tr>'+[["Selection period (first 66%)",m.is],["Out-of-sample (last 34%)",m.oos],["Full history",m.full]].map(function(r){return '<tr><td>'+r[0]+'</td><td class="r num">'+r[1].n+'</td><td class="r num">'+sgn(r[1].exp,3)+'R</td><td class="r num">'+r[1].pf.toFixed(2)+'</td><td class="r num">'+r[1].t.toFixed(2)+'</td><td class="r num">'+sgn(r[1].totR,1)+'R</td></tr>'}).join("")+'</table></div>':"";
  var par=bt.params?'<div class="inl" style="margin-top:12px"><span class="dim xs">Chosen parameters</span>'+Object.keys(bt.params).map(function(k){return '<span class="tag">'+k+" = "+bt.params[k]+'</span>'}).join("")+'</div>':"";
  var stress=m.costStressR==null?'<span class="dim">not available (needs entry and stop columns)</span>':'<span class="num '+cls(m.costStressR)+'">'+sgn(m.costStressR,1)+'R</span> with +50% cost';
  var actions=s.kind==="template"?'<button class="btn" id="ld-research"'+dis()+'>Run the research agent again</button><span class="help">Adds trials, which raises the significance bar.</span>':'<button class="btn" id="ld-clear-bt"'+dis()+'>Replace the results</button>';
  var box='<div class="chartbox" data-trades="1">'+ch.svg+'</div>';
  var out=prov+kpiStrip(m.full)+box+split+'<div class="grid g2e" style="margin-top:14px;align-items:start"><div><h3 style="margin-bottom:8px">Stability across time</h3>'+foldsTable(m.folds)+'</div><div><h3 style="margin-bottom:8px">Robustness</h3><div class="kv"><div><span>Cost stress</span><span>'+stress+'</span></div><div><span>Full-history t-stat</span><span class="num">'+m.full.t.toFixed(2)+'</span></div><div><span>Best-of-'+bt.trials+' bar</span><span class="num">'+m.expMaxZ.toFixed(2)+'</span></div><div><span>t-stat after the bar</span><span class="num '+cls(m.deflT)+'">'+sgn(m.deflT,2)+'</span></div><div><span>Long / short R</span><span class="num"><span class="pos">'+sgn(m.full.longR,1)+'</span> / <span class="'+cls(m.full.shortR)+'">'+sgn(m.full.shortR,1)+'</span></span></div></div></div></div>'+par+'<h3 style="margin:16px 0 8px">Latest trades</h3>'+tradeRows(trades,10)+'<div class="inl" style="margin-top:14px">'+actions+'</div>';
  setTimeout(function(){var b=$("#lab-detail .chartbox");if(b)b._pts=ch.pts},0);
  return out;
}
async function detailForward(s,width){
  var fw=s.forward,bt=s.backtest;
  if(!fw){return '<div class="empty" style="margin-bottom:14px"><h2>No forward results yet</h2><p>The forward test runs the strategy on a demo account in real time and checks it against the backtest. '+(assignedTo(s.id).length?"It is assigned to "+assignedTo(s.id).map(function(a){return esc(a.name)}).join(", ")+". Import the demo trades when it has some.":"Assign it to an agent to start one, then import the demo trades.")+'</p></div>'+importBox("forward",s)+'<div class="kv" style="margin-top:14px"><div><span>Progress</span><span class="num">0 of 150 trades</span></div></div>'}
  var m=fw.metrics.full,run=await getRun(s.id,"forward"),trades=run&&run.trades?run.trades:[],ch=eqChart(trades,width,{color:cv("--accent")||cv("--pos")});
  var ev=bt?(bt.metrics.oos||bt.metrics.full):null,btRun=bt?await getRun(s.id,"backtest"):null,ci=btRun&&btRun.trades?bootstrapCI(btRun.trades.map(function(t){return t[3]}),800):null;
  var band=ci?(m.exp>=ci[0]?'<span class="chip good">✓ inside the backtest range</span>':'<span class="chip warn">▲ below the backtest range</span>')+' <span class="dim xs">80% range of the backtest per-trade result: '+sgn(ci[0],2)+'R to '+sgn(ci[1],2)+'R</span>':"";
  var pc=Math.min(100,m.n/150*100);
  setTimeout(function(){var b=$("#lab-detail .chartbox");if(b)b._pts=ch.pts},0);
  return '<div class="inl" style="margin-bottom:12px"><span class="chip info">Imported demo trades</span><span class="dim xs">'+fmtTs(fw.ts)+'</span></div>'+kpiStrip(m)+'<div class="chartbox" data-trades="1">'+ch.svg+'</div>'+
   '<div class="srow" style="border:0"><div class="top"><span style="font-weight:500">Forward trades</span><span class="num">'+m.n+' of 150</span></div><div class="t"><div style="width:'+pc+'%;background:var(--accent)"></div></div><div class="d"><span>'+(m.n>=150?"Enough trades for a verdict.":"No verdict before 150 trades.")+'</span></div></div>'+
   (ev?'<h3 style="margin:14px 0 8px">Forward against backtest</h3><div class="tw"><table><tr><th>Measure</th><th class="r">Backtest'+(bt.metrics.oos?" (out-of-sample)":"")+'</th><th class="r">Forward</th></tr><tr><td>Trades</td><td class="r num">'+ev.n+'</td><td class="r num">'+m.n+'</td></tr><tr><td>Per trade</td><td class="r num">'+sgn(ev.exp,3)+'R</td><td class="r num '+cls(m.exp)+'">'+sgn(m.exp,3)+'R</td></tr><tr><td>Profit factor</td><td class="r num">'+ev.pf.toFixed(2)+'</td><td class="r num">'+m.pf.toFixed(2)+'</td></tr><tr><td>Win rate</td><td class="r num">'+ev.winp.toFixed(1)+'%</td><td class="r num">'+m.winp.toFixed(1)+'%</td></tr><tr><td>Max drawdown</td><td class="r num">'+ev.maxDD.toFixed(1)+'R</td><td class="r num">'+m.maxDD.toFixed(1)+'R</td></tr></table></div><div class="inl" style="margin-top:8px">'+band+'</div>':"")+
   '<h3 style="margin:16px 0 8px">Latest demo trades</h3>'+tradeRows(trades,10)+'<div class="inl" style="margin-top:14px"><button class="btn" id="ld-clear-fw"'+dis()+'>Replace the forward results</button></div>';
}
function detailRanking(s,res){
  if(res.score==null)return '<div class="empty"><h2>Not ranked yet</h2><p>The score needs backtest results. '+esc(res.reasons[0]||"")+'</p></div>';
  var rows=res.parts.map(function(p){return '<tr><td><b>'+p.name+'</b><div class="help">'+esc(p.why)+'</div></td><td style="white-space:normal;min-width:190px;font-size:13px">'+esc(p.input)+'</td><td style="min-width:130px"><div class="track"><div class="fill" style="width:'+(p.pts/p.max*100)+'%;background:var(--good)"></div></div></td><td class="r num">'+p.pts.toFixed(1)+' / '+p.max+'</td></tr>'}).join("");
  var pens=res.penalties.map(function(p){return '<tr><td><b>'+p.name+'</b></td><td colspan="2" class="sec" style="white-space:normal">'+esc(p.why)+'</td><td class="r num neg">-'+p.pts.toFixed(1)+'</td></tr>'}).join("");
  return '<div class="grid g2e" style="align-items:start"><div><div class="inl" style="margin-bottom:10px"><span style="font-size:34px;font-weight:700" class="num">'+res.score.toFixed(0)+'</span><span class="dim">out of 100, judged on '+res.basis+'</span></div>'+
   '<div class="tw"><table><tr><th>Component</th><th>Input</th><th></th><th class="r">Points</th></tr>'+rows+pens+'<tr><td><b>Trust</b><div class="help">Imported results that were not reproduced count for 85%.</div></td><td colspan="2"></td><td class="r num">× '+res.trust.toFixed(2)+'</td></tr>'+(res.fwNote?'<tr><td><b>Forward evidence</b><div class="help">'+esc(res.fwNote)+'</div></td><td colspan="2"></td><td class="r num '+cls(res.fwAdj)+'">'+sgn(res.fwAdj,1)+'</td></tr>':"")+'</table></div></div>'+
   '<div><h3 style="margin-bottom:8px">Eligible to be recommended?</h3>'+(res.reasons.length?'<ul class="lint">'+res.reasons.map(function(r){return '<li class="bad"><span class="m">✕</span><span>'+esc(r)+'</span></li>'}).join("")+'</ul>':'<ul class="lint"><li class="ok"><span class="m">✓</span><span>Meets every minimum</span></li></ul>')+
   '<ul class="lint" style="margin-top:8px"><li class="'+(stageIndex(s)>=3?"ok":"bad")+'"><span class="m">'+(stageIndex(s)>=3?"✓":"✕")+'</span><span>Backtest and validation gates passed (stage '+stageIndex(s)+')</span></li><li class="'+(res.score>=40?"ok":"bad")+'"><span class="m">'+(res.score>=40?"✓":"✕")+'</span><span>Score of at least 40</span></li></ul>'+
   '<h3 style="margin:16px 0 8px">How the score works</h3><p class="help">Edge 30, robustness 25, significance 20, risk 15, sample 10, then penalties for results that rest on a few trades or one side of the market. The score uses the out-of-sample period when there is one, because the parameters were picked on the rest. Without one, the full history is judged against the best-of-N bar for the number of variants tried. Minimums for recommendation: 150 trades, +0.10R per trade, surviving +50% cost, and no gate failures.</p></div></div>';
}

/* ---------- events inside the detail panel ---------- */
$("#lab-detail").addEventListener("click",function(ev){
  var b=ev.target.closest&&ev.target.closest("button");if(!b)return;var s=LAB.id?STR[LAB.id]:null;if(!s)return;
  if(b.dataset.lsub){LAB.sub=b.dataset.lsub;renderDetail(true);return}
  switch(b.id){
   case"ld-research":b.disabled=true;runResearch(s.id).then(function(){renderLab(true)});break;
   case"ld-queue":s.job={status:"queued",ts:Date.now()};saveStrategy(s).then(function(){audit("backtest_queued",s.id,"Queued "+s.name+" for the research worker");toast("QUEUED","No research worker is connected yet, so nothing runs until one is.","warn");renderDetail(true)});break;
   case"ld-clear-bt":s.backtest=null;s.trials=0;putRun(s.id,"backtest",null).then(function(){return saveStrategy(s)}).then(function(){audit("results_removed",s.id,"Removed the backtest results of "+s.name);renderLab(true)});break;
   case"ld-clear-fw":s.forward=null;putRun(s.id,"forward",null).then(function(){return saveStrategy(s)}).then(function(){audit("results_removed",s.id,"Removed the forward results of "+s.name);renderLab(true)});break;
   case"ld-view":getRun(s.id,"code").then(function(c){var box=$("#ld-code");if(!c){box.innerHTML='<p class="dim">The file text is not in the database.</p>';return}box.innerHTML='<pre class="code" style="margin-top:8px"></pre>';box.querySelector("pre").textContent=c.text});break;
   case"ld-assign":assignFlow(s.id,$("#ld-agent").value,$("#ld-slot"));break;
   case"ld-arch":s.status="archived";saveStrategy(s).then(function(){audit("strategy_archived",s.id,"Archived "+s.name);toast("ARCHIVED",esc(s.name)+" is out of the leaderboard.","warn");LAB.id=null;renderLab(true)});break;
   case"ld-del":{var n=s.name;removeStrategy(s.id).then(function(ok){if(ok){audit("strategy_deleted",s.id,"Deleted strategy "+n);toast("DELETED",esc(n)+" was removed.","warn");LAB.id=null;renderLab(true)}})}break;
  }
});
$("#lab-detail").addEventListener("input",function(ev){if(ev.target.id==="ld-name"){var s=STR[LAB.id];$("#ld-del").disabled=!s||ev.target.value.trim()!==s.name||!STORE.canWrite}});
$("#lab-detail").addEventListener("change",function(ev){var t=ev.target;if(t.dataset&&t.dataset.impkind&&t.files[0])importResults(LAB.id,t.dataset.impkind,t.files[0])});

/* ---------- promotion gates for a strategy: criteria fixed before a stage starts ---------- */
var GS_STAGE={};
function cmp(v,op,x){switch(op){case">=":return v>=x;case"<=":return v<=x;case">":return v>x;case"<":return v<x;default:return v===x}}
function critText(c){var m=METRICS[c.m];return m.label+" "+c.op+" "+c.v+(m.unit?" "+m.unit:"")}
function lastRun(g){for(var i=g.runs.length-1;i>=0;i--)if(g.runs[i].v===g.v)return g.runs[i];return null}
function stageChip(g,cur){
  if(g.status==="passed")return '<span class="chip good">✓ Passed</span>';
  if(g.status==="running")return '<span class="chip info">● Running</span>';
  if(g.status==="failed"){var r=lastRun(g),n=r?r.met:0,t=g.criteria.length;return '<span class="chip warn">▲ '+n+" of "+t+' met</span>'}
  return cur?'<span class="chip">○ Next</span>':'<span class="chip">Locked</span>';
}
function gatesEditor(host,id){
  var s=STR[id];if(!host||!s)return;ensureStrategy(s);
  var cur=stageIndex(s),si=GS_STAGE[id]==null?Math.min(cur,5):GS_STAGE[id],g=s.gates[si];if(!g){si=5;g=s.gates[5]}
  var steps='<div class="stages">'+s.gates.map(function(x,i){return '<button class="stg" data-stage="'+i+'" aria-pressed="'+(i===si)+'"><b>'+i+" "+STAGE_NAMES[i]+'</b>'+stageChip(x,i===cur)+'<span class="m">'+x.criteria.length+" criteri"+(x.criteria.length===1?"on":"a")+(x.v>1?" · v"+x.v:"")+'</span></button>'}).join("")+'</div>';
  var editable=g.status==="pending"&&!g.lockedAt,prevOk=si===0||passed(s.gates[si-1]),lr=lastRun(g);
  var crit=editable?
    '<div class="tw"><table class="rtable" id="g-crit"><tr><th>Measure</th><th>Is</th><th>Value</th><th></th></tr>'+g.criteria.map(function(c,i){return '<tr data-ci="'+i+'"><td><select class="sel" data-cm'+dis()+'>'+Object.keys(METRICS).map(function(k){return '<option value="'+k+'"'+(k===c.m?" selected":"")+'>'+METRICS[k].label+(METRICS[k].unit?" ("+METRICS[k].unit+")":"")+'</option>'}).join("")+'</select></td><td><select class="sel" data-co style="width:70px"'+dis()+'>'+OPS.map(function(o){return '<option'+(o===c.op?" selected":"")+'>'+o+'</option>'}).join("")+'</select></td><td><input class="inp mono" data-cv type="number" step="any" value="'+c.v+'"'+dis()+'></td><td class="r"><button class="btn sm ghost" data-cdel="'+i+'"'+dis()+'>Remove</button></td></tr>'}).join("")+'</table></div><div class="inl" style="margin-top:10px"><button class="btn sm" data-cadd'+dis()+'>Add a criterion</button><button class="btn sm" data-csave'+dis()+'>Save criteria</button><button class="btn sm ghost" data-creset'+dis()+'>Reset to template</button><span class="err" data-cerr></span></div>'
   :'<div class="tw"><table><tr><th>Measure</th><th>Needs</th><th class="r">Latest result</th><th style="padding-left:16px">Met</th></tr>'+g.criteria.map(function(c){var m=METRICS[c.m],v=lr&&lr.values?lr.values[c.m]:undefined,ok=v!=null&&cmp(v,c.op,c.v);return '<tr><td>🔒 '+m.label+'</td><td class="num">'+c.op+" "+c.v+(m.unit?" "+m.unit:"")+'</td><td class="r num">'+(v==null?'<span class="dim">none</span>':(+v).toFixed(m.dec))+'</td><td style="padding-left:16px">'+(v==null?"":'<span class="chip '+(ok?"good":"crit")+'">'+(ok?"✓":"✕")+'</span>')+'</td></tr>'}).join("")+'</table></div>';
  var acts="";
  if(g.status==="pending")acts=prevOk?'<button class="btn" data-gstart'+dis()+'>Start this stage</button><span class="help">Starting locks the criteria.</span>':'<span class="help">Pass stage '+(si-1)+' first.</span>';
  else if(g.status==="running")acts='<button class="btn" data-grec'+dis()+'>Record a result</button>';
  else if(g.status==="failed")acts='<button class="btn" data-grec'+dis()+'>Record another result</button><button class="btn" data-grevise'+dis()+'>Revise the criteria (v'+(g.v+1)+')</button><span class="help">Changing criteria after a failed run is allowed but flagged.</span>';
  else acts='<span class="sec">Passed '+(g.passedAt?fmtTs(g.passedAt):"")+'.</span>';
  var auto=s.backtest&&si<3&&!passed(g)&&(si===0||passed(s.gates[si-1]))?'<button class="btn" data-gauto'+dis()+'>Evaluate from the results</button>':"";
  var runs=g.runs.length?'<div class="runs">'+g.runs.slice().reverse().map(function(r){return '<div class="run"><span class="chip '+(r.result==="pass"?"good":"crit")+'">'+(r.result==="pass"?"✓ passed":"✕ "+r.met+" of "+g.criteria.length)+'</span><span class="sec" style="white-space:normal">'+esc(r.note||"")+' <span class="dim">criteria v'+r.v+'</span></span><span class="dim num">'+fmtTs(r.ts)+'</span></div>'}).join("")+'</div>':'<p class="dim">No results recorded yet.</p>';
  host.dataset.sid=id;host.dataset.stage=si;
  host.innerHTML=steps+'<div class="card" style="background:var(--bg)"><div class="card-h"><div class="inl"><h2>Stage '+si+': '+STAGE_NAMES[si]+'</h2>'+stageChip(g,si===cur)+'<span class="chip">criteria v'+g.v+'</span>'+(g.revisedAfterFail?'<span class="chip warn">▲ revised after a failed run</span>':"")+(g.staleSince?'<span class="chip warn">▲ results changed since</span>':"")+'</div></div><p class="sec" style="margin-bottom:12px">'+STAGE_HELP[si]+'</p>'+crit+
   '<div class="inl" style="margin-top:14px" data-gacts>'+auto+acts+'</div><div id="g-slot"></div><h3 style="margin:18px 0 8px">Results</h3>'+runs+'</div>';
  if(!host.dataset.bound){host.dataset.bound="1";host.addEventListener("click",gateClick)}
}
function collectCriteria(host){var out=[],err="";host.querySelectorAll("#g-crit tr[data-ci]").forEach(function(tr){var m=tr.querySelector("[data-cm]").value,o=tr.querySelector("[data-co]").value,v=parseFloat(tr.querySelector("[data-cv]").value);if(isNaN(v))err="Every criterion needs a number.";out.push({m:m,op:o,v:v})});return {rows:out,err:err}}
async function gateClick(ev){
  var b=ev.target.closest&&ev.target.closest("button");if(!b)return;var host=ev.currentTarget,id=host.dataset.sid,s=STR[id];if(!s)return;var si=+host.dataset.stage,g=s.gates[si],slot=host.querySelector("#g-slot");
  function refresh(){gatesEditor(host,id);renderBoardLab();renderReco()}
  if(b.dataset.stage!=null){GS_STAGE[id]=+b.dataset.stage;gatesEditor(host,id);return}
  if(b.hasAttribute("data-cadd")){g.criteria=collectCriteria(host).rows.concat([crit("trades_n",">=",100)]);gatesEditor(host,id);return}
  if(b.dataset.cdel!=null){var c2=collectCriteria(host);c2.rows.splice(+b.dataset.cdel,1);g.criteria=c2.rows;gatesEditor(host,id);return}
  if(b.hasAttribute("data-creset")){g.criteria=defaultCriteria()[si];gatesEditor(host,id);return}
  if(b.hasAttribute("data-csave")){
    var c3=collectCriteria(host),er=host.querySelector("[data-cerr]");er.textContent="";if(c3.err){er.textContent=c3.err;return}if(!c3.rows.length){er.textContent="Keep at least one criterion.";return}
    g.criteria=c3.rows;if(await saveStrategy(s)){await audit("gate_criteria_saved",id,"Criteria for stage "+si+" ("+STAGE_NAMES[si]+") of "+s.name+": "+c3.rows.map(critText).join("; "));toast("CRITERIA SAVED","Stage "+si+" criteria saved. They lock when the stage starts.","good");refresh()}return;
  }
  if(b.hasAttribute("data-gauto")){var out=await autoGates(s);await saveStrategy(s);toast(out.done.length?"GATES COMPUTED":"NOTHING TO COMPUTE",out.done.length?out.done.join(", "):(out.blocked||"No results to evaluate."),out.done.length?"good":"warn");refresh();return}
  if(b.hasAttribute("data-gstart")){
    if(si===4){
      slot.innerHTML='<div class="confirm"><b>Micro-live uses real money at the minimum lot.</b><p class="help" style="margin:6px 0">Type GO LIVE to confirm you accept the risk of real money. The agent it is assigned to must also have its required rules.</p><div class="inl"><input class="inp mono" data-word style="max-width:160px" aria-label="Type GO LIVE"><button class="btn danger" data-gstart2 disabled>Start Micro-live</button><button class="btn sm ghost" data-gcancel>Cancel</button></div></div>';
      var w=slot.querySelector("[data-word]");w.oninput=function(){slot.querySelector("[data-gstart2]").disabled=w.value.trim()!=="GO LIVE"};w.focus();return;
    }
    await startStage(s,si,host);return;
  }
  if(b.hasAttribute("data-gstart2")){var bad=assignedTo(s.id).filter(function(a){return missingRequired(a).length});if(bad.length){slot.querySelector(".confirm").insertAdjacentHTML("beforeend",'<p class="err">Required rules are missing on '+bad.map(function(a){return esc(a.name)}).join(", ")+'.</p>');return}await startStage(s,si,host);return}
  if(b.hasAttribute("data-gcancel")){slot.innerHTML="";return}
  if(b.hasAttribute("data-grec")){
    if(si===5){slot.innerHTML='<div class="confirm"><b>Sign off the Scale stage</b><p class="help" style="margin:6px 0">This records your sign-off to raise risk step by step. Type SCALE to confirm.</p><div class="inl"><input class="inp mono" data-word style="max-width:160px" aria-label="Type SCALE"><button class="btn danger" data-gsign disabled>Sign off</button><button class="btn sm ghost" data-gcancel>Cancel</button></div></div>';var w5=slot.querySelector("[data-word]");w5.oninput=function(){slot.querySelector("[data-gsign]").disabled=w5.value.trim()!=="SCALE"};w5.focus();return}
    var ms=[];g.criteria.forEach(function(c){if(ms.indexOf(c.m)<0)ms.push(c.m)});var cvv=computedValues(s);
    function pre(m){var v;if(si===3){v=m==="trades_n"?cvv.f_trades_n:m==="net_expectancy_r"?cvv.f_net_expectancy_r:m==="profit_factor"?cvv.f_profit_factor:m==="max_drawdown_r"?cvv.f_max_drawdown_r:undefined}else v=cvv[m];return v==null?"":+(+v).toFixed(4)}
    slot.innerHTML='<div class="confirm" style="border-color:var(--line)"><b>Record a result for stage '+si+'</b>'+(si===3&&s.forward?'<p class="help" style="margin:6px 0">Values from the imported forward trades are filled in. Fills, slippage and rule violations come from the demo account itself.</p>':"")+'<div class="form-grid" style="margin:10px 0">'+ms.map(function(m){return '<div class="field"><label class="lbl" for="rv-'+m+'">'+METRICS[m].label+(METRICS[m].unit?" ("+METRICS[m].unit+")":"")+'</label><input class="inp mono" id="rv-'+m+'" data-rvm="'+m+'" type="number" step="any" value="'+pre(m)+'"></div>'}).join("")+'<div class="field" style="grid-column:1/-1"><label class="lbl" for="rv-note">Note</label><input class="inp" id="rv-note" maxlength="160" placeholder="Where the numbers come from"></div></div><div class="inl"><button class="btn" data-gsave>Check against the criteria</button><button class="btn sm ghost" data-gcancel>Cancel</button><span class="err" data-gerr></span></div></div>';return;
  }
  if(b.hasAttribute("data-gsave")){
    var vals={},bad2=false;slot.querySelectorAll("[data-rvm]").forEach(function(i){var v=parseFloat(i.value);if(isNaN(v))bad2=true;vals[i.dataset.rvm]=v});
    if(bad2){slot.querySelector("[data-gerr]").textContent="Fill in every measure with a number.";return}
    var met=g.criteria.filter(function(c){return cmp(vals[c.m],c.op,c.v)}).length,res=met===g.criteria.length?"pass":"fail";
    g.runs.push({ts:Date.now(),v:g.v,sv:(s.file?s.file.v:0),values:vals,met:met,result:res,note:slot.querySelector("#rv-note").value.trim()});g.status=res==="pass"?"passed":"failed";if(res==="pass")g.passedAt=Date.now();
    if(await saveStrategy(s)){await audit("gate_result",id,"Stage "+si+" ("+STAGE_NAMES[si]+") of "+s.name+": "+met+" of "+g.criteria.length+" criteria met, "+(res==="pass"?"passed":"failed"));toast(res==="pass"?"STAGE PASSED":"STAGE NOT PASSED",met+" of "+g.criteria.length+" criteria met.",res==="pass"?"good":"warn");refresh()}return;
  }
  if(b.hasAttribute("data-gsign")){g.runs.push({ts:Date.now(),v:g.v,sv:0,values:{owner_signoff:1},met:1,result:"pass",note:"Owner sign-off"});g.status="passed";g.passedAt=Date.now();if(await saveStrategy(s)){await audit("gate_result",id,"Scale sign-off recorded for "+s.name);toast("SIGNED OFF","Scale stage passed for "+esc(s.name)+".","good");refresh()}return}
  if(b.hasAttribute("data-grevise")){
    slot.innerHTML='<div class="confirm" style="border-color:var(--warn)"><b>Revise the criteria after a failed run?</b><p class="help" style="margin:6px 0">The new version is flagged as revised after a failed run, so nobody mistakes it for a pre-registered threshold.</p><div class="inl"><label class="lbl" for="rv-why">Reason</label><input class="inp" id="rv-why" data-why maxlength="160" style="max-width:420px"><button class="btn danger sm" data-grevok disabled>Revise to v'+(g.v+1)+'</button><button class="btn sm ghost" data-gcancel>Cancel</button></div></div>';
    var wy=slot.querySelector("[data-why]");wy.oninput=function(){slot.querySelector("[data-grevok]").disabled=wy.value.trim().length<10};wy.focus();return;
  }
  if(b.hasAttribute("data-grevok")){var why=slot.querySelector("[data-why]").value.trim();g.v++;g.status="pending";g.lockedAt=null;g.revisedAfterFail=true;g.revisions=(g.revisions||[]).concat([{ts:Date.now(),reason:why}]);if(await saveStrategy(s)){await audit("gate_revised",id,"Criteria for stage "+si+" of "+s.name+" revised to v"+g.v+" after a failed run: "+why);toast("CRITERIA REVISED","Stage "+si+" is editable again as v"+g.v+", flagged as revised.","warn");refresh()}}
}
async function startStage(s,si,host){var g=s.gates[si];g.status="running";g.lockedAt=Date.now();g.staleSince=null;if(await saveStrategy(s)){await audit("gate_started",s.id,"Started stage "+si+" ("+STAGE_NAMES[si]+") of "+s.name+": criteria locked at v"+g.v);toast("STAGE STARTED","Stage "+si+" criteria are locked at v"+g.v+".","good");GS_STAGE[s.id]=si;gatesEditor(host,s.id);renderBoardLab()}}
