/* 10_evidence.js: Track record, Statistics and Trading tabs for the real SME Baseline backtest: KPIs, growth chart, monthly returns, bar charts, trade history. */
/* ---------- track record ---------- */
function renderKpis(){
  var K=[["Gain",sgn(S.gain,1)+"%","0.5% risk, compounded","pos"],["Max drawdown","-"+S.mdd+"%",S.mddR+"R, peak to trough","neg"],["Total R",sgn(S.totR,1),"net of spread",S.totR>=0?"pos":"neg"],["Trades",S.n,S.perWeek+" per week",""],["Win rate",S.winp+"%",S.wins+" winners",""],["Profit factor",S.pf.toFixed(2),"gross win / gross loss",""],["Avg win / loss",sgn(S.avgW,2)+" / "+sgn(S.avgL,2),"in R",""],["Expectancy",sgn(S.exp,3)+"R","per trade",S.exp>=0?"pos":"neg"]];
  $("#kpis").innerHTML=K.map(function(k){return '<div><div class="k">'+k[0]+'</div><div class="v '+k[3]+'">'+k[1]+'</div><div class="s">'+k[2]+"</div></div>"}).join("");
  $("#kpi-cap").textContent="Backtest, gold H1, "+S.first+" to "+S.last+", modeled spread 0.20. These are not live results.";
}
var gMetric=1,gRange=0;
function dayNum(s){return Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/864e5}
function drawGrowth(){
  var all=D.series,last=dayNum(all[all.length-1][0]),from=gRange?last-gRange:-1e9;
  var pts=all.filter(function(p){return dayNum(p[0])>=from});if(pts.length<2)pts=all;
  var gh=$("#growth").parentNode,Wd=Math.max(340,Math.round(gh.clientWidth||900)),H=300,L=52,Rm=14,Tp=12,B=262,pw=Wd-L-Rm,x0=dayNum(pts[0][0]),x1=dayNum(pts[pts.length-1][0]);
  var x=function(d){return L+pw*((d-x0)/(x1-x0||1))};
  var vals=pts.map(function(p){return p[gMetric]}),lo=Math.min.apply(null,vals.concat([0])),hi=Math.max.apply(null,vals.concat([0]));if(hi-lo<1)hi=lo+1;
  var pad=(hi-lo)*0.06;lo-=pad;hi+=gMetric===3?0:pad;if(gMetric===3)hi=Math.max(hi,0.3);
  var y=function(v){return Tp+(B-Tp)*(1-(v-lo)/(hi-lo))},unit=gMetric===2?"R":"%";
  var g="",step=(hi-lo)/5,mag=Math.pow(10,Math.floor(Math.log10(step))),ns=[1,2,5,10].map(function(m){return m*mag}).filter(function(m){return m>=step})[0];
  for(var v=Math.ceil(lo/ns)*ns;v<=hi;v+=ns){g+='<line x1="'+L+'" x2="'+(Wd-Rm)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="'+cv("--grid")+'"/><text x="'+(L-8)+'" y="'+(y(v)+4).toFixed(1)+'" text-anchor="end">'+(Math.abs(v)<1e-9?"0":v.toFixed(ns<1?1:0))+unit+"</text>"}
  var d0=new Date(x0*864e5),yr=d0.getUTCFullYear(),mo=d0.getUTCMonth()<6?0:6;
  for(var tk=Date.UTC(yr,mo,1)/864e5;tk<=x1;){if(tk>=x0){var dt=new Date(tk*864e5);g+='<line x1="'+x(tk).toFixed(1)+'" x2="'+x(tk).toFixed(1)+'" y1="'+B+'" y2="'+(B+4)+'" stroke="'+cv("--line")+'"/><text x="'+x(tk).toFixed(1)+'" y="'+(B+17)+'" text-anchor="middle">'+dt.getUTCFullYear()+"-"+String(dt.getUTCMonth()+1).padStart(2,"0")+"</text>"}
    mo+=6;if(mo>=12){mo-=12;yr++}tk=Date.UTC(yr,mo,1)/864e5}
  var col=gMetric===3?cv("--neg"):cv("--pos"),zero=y(0);
  var line="M"+pts.map(function(p){return x(dayNum(p[0])).toFixed(1)+","+y(p[gMetric]).toFixed(1)}).join("L");
  g+='<line x1="'+L+'" x2="'+(Wd-Rm)+'" y1="'+zero.toFixed(1)+'" y2="'+zero.toFixed(1)+'" stroke="'+cv("--fg3")+'" stroke-dasharray="3 4"/>';
  g+='<path d="'+line+"L"+x(x1).toFixed(1)+","+zero.toFixed(1)+"L"+x(x0).toFixed(1)+","+zero.toFixed(1)+'Z" fill="'+col+'" fill-opacity=".14"/><path d="'+line+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/>';
  var lp=pts[pts.length-1];
  g+='<circle cx="'+x(x1).toFixed(1)+'" cy="'+y(lp[gMetric]).toFixed(1)+'" r="4.5" fill="'+col+'" stroke="'+cv("--surface")+'" stroke-width="2"/><text x="'+(x(x1)-9).toFixed(1)+'" y="'+(y(lp[gMetric])-10).toFixed(1)+'" text-anchor="end" style="fill:'+cv("--fg")+';font-weight:500">'+(gMetric===3?lp[gMetric].toFixed(1):sgn(lp[gMetric],1))+unit+"</text>";
  g+='<line id="gx" x1="0" x2="0" y1="'+Tp+'" y2="'+B+'" stroke="'+cv("--fg3")+'" style="display:none"/><circle id="gd" r="4.5" fill="'+col+'" stroke="'+cv("--surface")+'" stroke-width="2" style="display:none"/><rect id="ghit" x="'+L+'" y="'+Tp+'" width="'+pw+'" height="'+(B-Tp)+'" fill="transparent"/>';
  var svg=$("#growth");svg.setAttribute("viewBox","0 0 "+Wd+" "+H);svg.innerHTML=g;
  var tip=$("#gtip"),box=$("#gbox"),names=["","Growth","Total R","Drawdown"];
  $("#ghit").addEventListener("pointermove",function(ev){
    var r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*Wd,dn=x0+(px-L)/pw*(x1-x0),bi=0,bd=1e9;
    pts.forEach(function(p,i){var dd=Math.abs(dayNum(p[0])-dn);if(dd<bd){bd=dd;bi=i}});
    var p=pts[bi],xs=x(dayNum(p[0]));
    $("#gx").setAttribute("x1",xs);$("#gx").setAttribute("x2",xs);$("#gx").style.display="";$("#gd").setAttribute("cx",xs);$("#gd").setAttribute("cy",y(p[gMetric]));$("#gd").style.display="";
    tip.style.display="block";tip.innerHTML="<b>"+p[0]+"</b><br>"+names[gMetric]+" "+(gMetric===3?p[3].toFixed(2):sgn(p[gMetric],1))+unit+'<br><span class="dim">growth '+sgn(p[1],1)+"% · "+sgn(p[2],1)+"R</span>";
    var bx=box.getBoundingClientRect();tip.style.left=Math.max(4,Math.min(ev.clientX-bx.left+14,bx.width-190))+"px";tip.style.top=Math.max(4,ev.clientY-bx.top-60)+"px"});
  $("#ghit").addEventListener("pointerleave",function(){tip.style.display="none";$("#gx").style.display="none";$("#gd").style.display="none"});
  $("#g-table").innerHTML='<table><tr><th>Closed</th><th class="r">Growth</th><th class="r">Total R</th><th class="r">Drawdown</th></tr>'+pts.slice(-10).reverse().map(function(p){return "<tr><td class=num>"+p[0]+'</td><td class="r num">'+sgn(p[1],1)+'%</td><td class="r num">'+sgn(p[2],1)+'</td><td class="r num">'+p[3].toFixed(2)+"%</td></tr>"}).join("")+"</table>";
}
function seg(id,attr,cb){$$(id+" button").forEach(function(b){b.onclick=function(){$$(id+" button").forEach(function(o){o.setAttribute("aria-pressed",String(o===b))});cb(b.dataset[attr])}})}
seg("#seg-metric","m",function(v){gMetric=+v;drawGrowth()});seg("#seg-range","r",function(v){gRange=+v;drawGrowth()});
$("#g-table-btn").onclick=function(){var t=$("#g-table");t.hidden=!t.hidden;this.textContent=t.hidden?"Table view":"Hide table"};
function renderMonthly(){
  var M=["J","F","M","A","M","J","J","A","S","O","N","D"],ys=Object.keys(D.grid).sort(),mx=1;
  ys.forEach(function(y){D.grid[y].m.forEach(function(c){if(c)mx=Math.max(mx,Math.abs(c[0]))})});
  var h="<tr><th></th>"+M.map(function(m){return "<th>"+m+"</th>"}).join("")+'<th style="text-align:right;padding-left:10px">Year</th></tr>';
  ys.forEach(function(y){var g=D.grid[y];h+='<tr><td class="y">'+y+"</td>"+g.m.map(function(c){if(!c)return '<td class="c none"></td>';var a=Math.min(60,8+Math.abs(c[0])/mx*52),col=c[0]>=0?"var(--pos)":"var(--neg)";return '<td class="c" title="'+c[1]+" trades, "+sgn(c[2],1)+'R" style="background:color-mix(in oklch,'+col+" "+a.toFixed(0)+'%,var(--surface))">'+(c[0]>=0?"+":"-")+Math.abs(c[0]).toFixed(1)+"</td>"}).join("")+'<td class="ytd '+cls(g.ytd)+'">'+sgn(g.ytd,1)+"%</td></tr>"});
  $("#mg").innerHTML=h;
}
function bars(id,tipId,items,fmt){
  var Wd=Math.max(260,Math.round($(id).parentNode.clientWidth||520)),H=220,L=38,B=186,Tp=16,n=items.length,pw=Wd-L-8,bw=pw/n,vs=items.map(function(i){return i.v}),hi=Math.max.apply(null,vs.concat([1])),lo=Math.min.apply(null,vs.concat([0])),pad=(hi-lo)*0.1;hi+=pad;if(lo<0)lo-=pad;
  var y=function(v){return Tp+(B-Tp)*(1-(v-lo)/(hi-lo))},g="",step=(hi-lo)/4,mag=Math.pow(10,Math.floor(Math.log10(step))),ns=[1,2,5,10].map(function(m){return m*mag}).filter(function(m){return m>=step})[0];
  for(var v=Math.ceil(lo/ns)*ns;v<=hi;v+=ns){g+='<line x1="'+L+'" x2="'+(Wd-8)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="'+cv("--grid")+'"/><text x="'+(L-6)+'" y="'+(y(v)+4).toFixed(1)+'" text-anchor="end">'+v.toFixed(0)+"</text>"}
  items.forEach(function(it,i){var x=L+i*bw+bw*0.16,w=bw*0.68,y0=y(0),y1=y(it.v),top=Math.min(y0,y1),h=Math.max(1,Math.abs(y1-y0));
    g+='<rect data-i="'+i+'" x="'+x.toFixed(1)+'" y="'+top.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" fill="'+(it.v>=0?cv("--pos"):cv("--neg"))+'"/>';
    if(it.label)g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-10)+'" text-anchor="middle">'+it.label+"</text>";
    if(it.top)g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(it.v>=0?top-5:top+h+12).toFixed(1)+'" text-anchor="middle" style="fill:'+cv("--fg")+'">'+it.top+"</text>"});
  g+='<line x1="'+L+'" x2="'+(Wd-8)+'" y1="'+y(0).toFixed(1)+'" y2="'+y(0).toFixed(1)+'" stroke="'+cv("--fg3")+'"/>';
  var svg=$(id);svg.setAttribute("viewBox","0 0 "+Wd+" "+H);svg.innerHTML=g;var tip=$(tipId),box=svg.parentNode;
  $$(id+" rect").forEach(function(r){r.addEventListener("pointermove",function(ev){var it=items[+r.dataset.i],bx=box.getBoundingClientRect();tip.style.display="block";tip.innerHTML=fmt(it);tip.style.left=Math.max(4,Math.min(ev.clientX-bx.left+12,bx.width-150))+"px";tip.style.top=Math.max(4,ev.clientY-bx.top-44)+"px"});r.addEventListener("pointerleave",function(){tip.style.display="none"})});
}
function drawBars(){
  var DN=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  bars("#wk","#wktip",D.wk.map(function(w,i){return {label:DN[i],v:w[0],top:w[1]?String(w[1]):""}}),function(it){return "<b>"+it.label+"</b> · "+'<span class="'+cls(it.v)+'">'+sgn(it.v,1)+"R</span>, "+it.top+" trades"});
  var hrs=[];D.hr.forEach(function(h,i){hrs.push({label:i%3===0?String(i):"",v:h[0],n:h[1]})});
  bars("#hr","#hrtip",hrs,function(it){return '<span class="'+cls(it.v)+'">'+sgn(it.v,1)+"R</span>, "+it.n+" trades"});
  var Q={};T.forEach(function(t){var q=t[0].slice(2,4)+"Q"+(Math.floor((+t[0].slice(5,7)-1)/3)+1);Q[q]=(Q[q]||0)+t[3]});
  var qs=Object.keys(Q).sort().map(function(k){return {label:k,v:Math.round(Q[k]*10)/10,top:Math.abs(Q[k])>=15?sgn(Q[k],0):""}});
  bars("#qchart","#qtip",qs,function(it){return "<b>"+it.label+"</b> · "+'<span class="'+cls(it.v)+'">'+sgn(it.v,1)+"R</span>"});
  var sorted=qs.map(function(q){return q.v}).slice().sort(function(a,b){return b-a}),top2=sorted[0]+sorted[1],tot=qs.reduce(function(a,q){return a+q.v},0),l3=qs.slice(-3).map(function(q){return sgn(q.v,1)+"R"});
  $("#qnote").textContent="The best two quarters carry "+top2.toFixed(0)+"R of "+tot.toFixed(0)+"R. The last three are "+l3.join(", ")+".";
}
function drawAll(){drawGrowth();drawBars()}
function kv(id,rows){$(id).innerHTML=rows.map(function(r){return "<div><span>"+r[0]+'</span><span class="num '+(r[2]||"")+'">'+r[1]+"</span></div>"}).join("")}
function renderStats(){
  kv("#kv1",[["Total trades",S.n],["Long",S.longN+" ("+S.longWin+"% won)"],["Short",S.shortN+" ("+S.shortWin+"% won)"],["Trades per week",S.perWeek],["Ended by stop",S.stopPct+"%"],["Ended by run flip",(100-S.stopPct).toFixed(1)+"%"],["Monitoring period",S.first+" to "+S.last]]);
  kv("#kv2",[["Win rate",S.winp+"%"],["Average win",sgn(S.avgW,2)+"R","pos"],["Average loss",sgn(S.avgL,2)+"R","neg"],["Best trade",sgn(S.best,2)+"R","pos"],["Worst trade",sgn(S.worst,2)+"R","neg"],["Longest winning streak",S.sW],["Longest losing streak",S.sL]]);
  kv("#kv3",[["Profit factor",S.pf.toFixed(2)],["Expectancy",sgn(S.exp,3)+"R"],["Std deviation of R",S.sd],["Max drawdown",S.mddR+"R ("+S.mdd+"%)"],["Average hold",S.holdAvg+" h"],["Median hold",S.holdMed+" h"],["Total R",sgn(S.totR,1)+"R"]]);
  var R=T.map(function(t){return t[3]}).sort(function(a,b){return b-a}),tot=R.reduce(function(a,b){return a+b},0),t5=R.slice(0,5).reduce(function(a,b){return a+b},0),t10=R.slice(0,10).reduce(function(a,b){return a+b},0);
  $("#depends").innerHTML='<div><h3>Heavy tails</h3><div class="num" style="font-size:22px;margin:4px 0">'+Math.round(t5/tot*100)+'%</div><p class="sec xs">of the total R comes from the best 5 of '+S.n+' trades ('+sgn(t5,1)+'R). Without the best 10 the total is '+sgn(tot-t10,1)+'R.</p></div>'+
   '<div><h3>One-sided edge</h3><div class="num" style="font-size:22px;margin:4px 0"><span class="pos">'+sgn(S.longR,1)+'R</span> / <span class="neg">'+sgn(S.shortR,1)+'R</span></div><p class="sec xs">long against short. Shorts won '+S.shortWin+'% of the time. Gold rose from about 1,940 to 4,366 in this period.</p></div>'+
   '<div><h3>What it means</h3><p class="sec xs" style="margin-top:4px">The system behaves like trend capture: many small stops and a few very large winners. A quiet stretch without a big winner can look like failure. Judge it over hundreds of trades and several regimes, not weeks.</p></div>';
}
var hFilter="all",hShown=15;
function renderHist(){
  var rows=T.slice().reverse().filter(function(t){return hFilter==="all"||(hFilter==="long"&&t[2]===0)||(hFilter==="short"&&t[2]===1)||(hFilter==="win"&&t[3]>0)||(hFilter==="loss"&&t[3]<=0)});
  var show=rows.slice(0,hShown),mx=Math.max.apply(null,rows.slice(0,60).map(function(t){return Math.abs(t[3])}).concat([1]));
  $("#hist").innerHTML='<tr><th>Opened (UTC)</th><th>Closed (UTC)</th><th>Side</th><th class="r">Hold</th><th>Exit</th><th class="r">Result</th></tr>'+show.map(function(t){var h=(Date.parse(t[1].replace(" ","T")+"Z")-Date.parse(t[0].replace(" ","T")+"Z"))/36e5,w=Math.min(60,Math.abs(t[3])/mx*60);
    return '<tr><td class="num">'+t[0]+'</td><td class="num">'+t[1]+"</td><td>"+(t[2]?"sell":"buy")+'</td><td class="r num">'+(h<48?h.toFixed(0)+" h":(h/24).toFixed(1)+" d")+"</td><td>"+(t[4]?"run flip":"stop")+'</td><td class="r"><span class="num '+cls(t[3])+'">'+(t[3]>=0?"▲ ":"▼ ")+sgn(t[3],2)+'R</span><span class="rbar" style="width:'+w.toFixed(0)+'px;background:'+(t[3]>=0?"var(--pos)":"var(--neg)")+'"></span></td></tr>'}).join("");
  $("#hist-count").textContent="Showing "+show.length+" of "+rows.length+" trades";$("#hist-more").hidden=show.length>=rows.length;
}
seg("#seg-hist","f",function(v){hFilter=v;hShown=15;renderHist()});$("#hist-more").onclick=function(){hShown+=15;renderHist()};

