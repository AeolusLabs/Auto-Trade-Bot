/* 05_pack.js: The Pack tab: agent cards, equity charts, tiles, pack board, Sentinel card, the howl (decision stream), toasts, and the Trading and Risk tab tables that read live state. */
/* ---------- view model: one entry per live (non-archived) agent ---------- */
var W={},ORDER=[],sig="";
function byOrder(a,b){return (a.order||0)-(b.order||0)}
function rebuildW(){
  var list=Object.keys(AG).map(function(k){return AG[k]}).filter(function(a){return a.status!=="archived"}).sort(byOrder);
  ORDER=list.map(function(a){return a.id});W={};
  list.forEach(function(a){var s=SIM[a.id]||null,st=strategyOf(a)||a.strategy||{};
    W[a.id]={id:a.id,agent:a,name:a.name,tag:a.tagline||"",style:a.style||"",coins:(a.instruments||[]).join(" "),real:!!a.real,sim:s,color:accentOf(a),art:artFor(a),hypo:st.hypothesis||"",
      start:s?s.start:0,eq:s?s.eq:0,curve:s?s.curve:[],status:s?s.status:"",cap:s?s.cap:null}});
}
function simIds(){return ORDER.filter(function(id){return W[id]&&W[id].sim})}
function agentSig(){return JSON.stringify(ORDER.map(function(id){var a=AG[id];return [id,a.name,a.tagline,a.style,a.art,a.hue,a.status,(a.instruments||[]).join(),(strategyOf(a)||a.strategy||{}).hypothesis,a.strategyId,stageLabel(a),(strategyOf(a)||{}).name,a.real,missingRequired(a).length]}))}
function colorStyle(id){return "--w:"+W[id].color}

/* ---------- cards ---------- */
function meter(label,val,max,text){var f=max>0?Math.min(1,val/max):0;return '<div class="meter"><div class="mh"><span>'+label+'</span><span class="num">'+text+'</span></div><div class="track"><div class="fill '+(f>=1?"crit":f>=.75?"warn":"")+'" style="width:'+(f*100)+'%"></div></div></div>'}
function head(w,i){
  return '<header class="w-head"><div class="portrait">'+w.art+'</div><div style="min-width:0"><div class="w-name">'+esc(w.name)+'</div><div class="w-tag">'+esc(w.tag)+(w.style?" · "+esc(w.style):"")+(w.coins?' · <span class="num">'+esc(w.coins)+"</span>":"")+'</div></div>'+
   '<div class="rank"><div class="n" id="rk-'+w.id+'"></div><div class="g num" id="gp-'+w.id+'"></div></div></header>';
}
function kindLine(w){var a=w.agent,st=strategyOf(a),k=w.real?"Real strategy · "+(st?st.name:"SME Baseline v1"):st?"Strategy · "+st.name:a.example?"Example agent":a.status==="draft"?"Draft agent":"Your agent";return '<div class="kind '+(w.real?"real":"")+'"><i></i>'+k+'</div>'}
function buildCards(){
  $("#row").innerHTML=ORDER.map(function(id,i){var w=W[id],s=w.sim,a=w.agent;
    if(!s){
      var rd=readiness(a),next=rd.filter(function(r){return !r[0]})[0];
      return '<div class="cell" style="'+colorStyle(id)+';transition-delay:'+(i*60)+'ms"><article class="wolf agent-empty" aria-label="'+esc(w.name)+'">'+kindLine(w)+head(w,i)+
       '<div class="w-rules">'+(w.hypo?esc(w.hypo):"No hypothesis written yet.")+'</div>'+
       '<div class="pos-card"><div class="pos-main"><span class="side dim">NO LIVE DATA YET</span></div><div class="pos-sub">'+esc(stageLabel(a))+'. '+(next?"Next: "+esc(next[1].toLowerCase())+".":"Ready to queue a backtest.")+'</div></div>'+
       '<div class="last"><div class="hd"><span class="eyebrow">Readiness</span></div><div class="checks">'+rd.map(function(r){return '<div class="chk '+(r[0]?"ok":"no")+'"><span class="m">'+(r[0]?"✓":"✕")+'</span><span>'+esc(r[1])+"</span></div>"}).join("")+'</div></div>'+
       '<div class="bt">Backtest: <b>not run yet</b>. A strategy must pass the promotion gates before it trades.</div>'+
       '<div class="inl"><button class="btn sm" data-edit="'+id+'">Edit agent</button><button class="btn sm ghost" data-gates="'+id+'">Gates</button></div></article></div>';
    }
    return '<div class="cell" style="'+colorStyle(id)+';transition-delay:'+(i*60)+'ms"><article class="wolf" aria-label="'+esc(w.name)+'">'+kindLine(w)+head(w,i)+
     '<div class="w-rules" title="'+esc(w.hypo)+'">'+esc(w.hypo)+'</div>'+
     '<div class="equity"><span class="big" id="eq-'+id+'"></span><span class="d num" id="dl-'+id+'"></span></div>'+
     '<div id="bn-'+id+'"></div><div id="ps-'+id+'"></div>'+
     '<div class="chart" id="ch-'+id+'"><div id="sv-'+id+'"></div><div class="tip" id="tp-'+id+'"></div></div>'+
     '<div class="last"><div class="hd"><span class="eyebrow">Pack law check</span><span class="dim num xs">3 ms</span></div><div class="checks">'+s.checks.map(function(c){return '<div class="chk '+c[0]+'"><span class="m">'+(c[0]==="ok"?"✓":c[0]==="no"?"✕":"–")+'</span><span>'+c[1]+"</span></div>"}).join("")+'</div><div class="status-line">'+s.status+'</div></div>'+
     '<div class="meters">'+meter("Trades today",s.tradesToday,s.maxTrades,s.tradesToday+" / "+s.maxTrades)+meter("Cost budget",s.cost,s.costMax,money(s.cost)+" / "+money(s.costMax,0))+'</div>'+
     '<div class="costs"><div><span class="eyebrow">spread</span><span class="v">'+money(s.fees.spread)+'</span></div><div><span class="eyebrow">commission</span><span class="v">'+money(s.fees.comm)+'</span></div><div><span class="eyebrow">slippage</span><span class="v">'+money(s.fees.slip)+'</span></div><div><span class="eyebrow">decisions</span><span class="v">'+s.fees.dec.toLocaleString()+'</span></div></div>'+
     '<div class="bt">'+s.bt+'</div>'+
     '<div class="inl" style="justify-content:space-between"><span class="swrap"><button class="sw rest" data-id="'+id+'" role="switch" aria-checked="false" aria-label="Rest '+esc(w.name)+'"></button>Rest '+esc(w.name)+'</span><button class="btn sm ghost" data-edit="'+id+'">Edit agent</button></div>'+
     '</article></div>'}).join("");
  $("#pack-empty").innerHTML=ORDER.length?"":'<div class="empty"><h2>No agents yet</h2><p>An agent is one strategy with its own risk rules and promotion gates. Spin up one, two or up to '+MAX_AGENTS+'.</p><div class="inl" style="justify-content:center;margin-top:14px"><button class="btn" data-newagent="1">Add your first agent</button><button class="btn ghost" id="load-examples">Load the example agents</button></div></div>';
  $("#row").style.display=ORDER.length?"":"none";
}
function chartSvg(w,id,first){
  var c=w.curve,n=c.length,W_=400,H=150,L=6,R=46,Tp=12,B=128,pw=W_-L-R,lo=Math.min.apply(null,c.concat([0])),hi=Math.max.apply(null,c.concat([0])),pad=(hi-lo)*0.14||1;lo-=pad;hi+=pad;
  var x=function(i){return L+pw*i/(n-1)},y=function(v){return Tp+(B-Tp)*(1-(v-lo)/(hi-lo))};
  w.geo={x:x,y:y,n:n,L:L,pw:pw,W:W_};
  var line="M"+c.map(function(v,i){return x(i).toFixed(1)+","+y(v).toFixed(1)}).join("L"),zero=y(0);
  return '<svg viewBox="0 0 '+W_+" "+H+'" role="img" aria-label="'+esc(w.name)+' equity curve, example data. Now '+sgn(c[n-1],0)+' dollars from start."><defs><linearGradient id="g-'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--w);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--w);stop-opacity:0"/></linearGradient></defs>'+
   '<line x1="'+L+'" x2="'+(W_-R+6)+'" y1="'+zero.toFixed(1)+'" y2="'+zero.toFixed(1)+'" style="stroke:var(--line)" stroke-dasharray="3 4"/><text x="'+(L+2)+'" y="'+(zero-4).toFixed(1)+'">start</text>'+
   '<path d="'+line+"L"+x(n-1).toFixed(1)+","+zero.toFixed(1)+"L"+x(0)+","+zero.toFixed(1)+'Z" fill="url(#g-'+id+')"/><path class="'+(first&&!REDUCED?"draw":"")+'" pathLength="1" d="'+line+'" fill="none" style="stroke:var(--w)" stroke-width="2" stroke-linejoin="round"/>'+
   '<line id="xl-'+id+'" x1="0" x2="0" y1="'+Tp+'" y2="'+B+'" style="stroke:var(--fg3);display:none"/><circle id="xd-'+id+'" r="4.5" style="fill:var(--w);stroke:var(--surface);display:none" stroke-width="2"/>'+
   '<circle cx="'+x(n-1).toFixed(1)+'" cy="'+y(c[n-1]).toFixed(1)+'" r="4.5" style="fill:var(--w);stroke:var(--surface)" stroke-width="2"/>'+
   '<text x="'+(W_-R+10)+'" y="'+(y(hi-pad)+3).toFixed(1)+'">'+sgn(hi-pad,0)+'</text><text x="'+(W_-R+10)+'" y="'+(y(lo+pad)+3).toFixed(1)+'">'+sgn(lo+pad,0)+'</text>'+
   '<text x="'+L+'" y="'+(H-4)+'">12:14</text><text x="'+(W_-R)+'" y="'+(H-4)+'" text-anchor="end">now</text></svg>';
}
function banner(id){
  var w=W[id],p=POS[id];
  if(PACK.locked)return '<div class="banner crit" role="status"><b>LOCKED</b><span>The Sentinel locked the den: no orders, resting orders cancelled.</span></div>';
  if(PACK.recalled&&!p)return '<div class="banner" role="status"><b>RECALLED</b><span>The Packmaster called the pack home. Flat until entries resume.</span></div>';
  if(PACK.paused)return '<div class="banner" role="status"><b>PAUSED</b><span>New entries are paused. Open positions keep their stops.</span></div>';
  if(REST[id])return '<div class="banner" role="status"><b>RESTING</b><span>The Packmaster rested '+esc(w.name)+'. Open positions keep their stops.</span></div>';
  if(w.cap)return '<div class="banner" role="status"><b>'+w.cap+'</b><span>'+w.status+'</span></div>';
  return "";
}
function heldTxt(m){return m>=60?Math.floor(m/60)+"h "+(m%60)+"m":m+"m"}
function posHtml(id){
  var p=POS[id],w=W[id];
  return p?'<div class="pos-card"><div class="pos-main"><span class="side '+(p.side==="long"?"pos":"neg")+'">'+(p.side==="long"?"▲ LONG":"▼ SHORT")+'</span><span class="pos-coin">'+p.coin+'</span><span class="pos-size">'+money(p.size,0)+'</span></div><div class="pos-sub num"><span class="'+cls(p.upl)+'">'+(p.upl>=0?"▲ ":"▼ ")+smoney(p.upl)+'</span> unrealised · '+heldTxt(p.held)+' held</div><div class="pos-sub num">entry '+p.entry+' → mark '+p.mark+' · stop '+p.stop+'</div></div>'
   :'<div class="pos-card"><div class="pos-main"><span class="side dim">FLAT</span><span class="dim">'+(w.cap||REST[id]?"resting":"2m in cash")+'</span></div></div>';
}
var flashT={};
function updateCard(id,rank,gap,first){
  var w=W[id];if(!w||!w.sim)return;
  var d=w.eq-w.start,eq=$("#eq-"+id);if(!eq)return;var prev=eq.dataset.v?+eq.dataset.v:null;
  eq.textContent=money(w.eq);eq.dataset.v=w.eq;
  if(prev!==null&&prev!==w.eq&&!PACK.stale){eq.dataset.flash=w.eq>prev?"up":"down";clearTimeout(flashT[id]);flashT[id]=setTimeout(function(){delete eq.dataset.flash},700)}
  $("#dl-"+id).innerHTML='<span class="'+cls(d)+'">'+(d>=0?"▲ ":"▼ ")+smoney(d)+' <span class="dim">('+sgn(d/w.start*100,2)+'%)</span></span>';
  $("#rk-"+id).textContent="#"+rank;$("#gp-"+id).textContent=gap===0?"leading":money(gap)+" behind";
  $("#bn-"+id).innerHTML=banner(id);$("#ps-"+id).innerHTML=posHtml(id);
  if($("#tp-"+id).style.display!=="block"||first)$("#sv-"+id).innerHTML=chartSvg(w,id,first);
  var sw=$('.rest[data-id="'+id+'"]');if(sw)sw.setAttribute("aria-checked",String(!!REST[id]));
}
function rankInfo(){var o=simIds().sort(function(a,b){return W[b].eq-W[a].eq});return {order:o,lead:o.length?W[o[0]].eq:0}}
function updateAll(first){var r=rankInfo();r.order.forEach(function(id){updateCard(id,r.order.indexOf(id)+1,r.lead-W[id].eq,first)});renderBoard(r.order,r.lead);renderLive()}
function renderLive(){renderTiles();renderSentinel(false);renderBar();renderPositions();renderExposure();renderControl()}
$("#row").addEventListener("pointermove",function(ev){
  var host=ev.target.closest&&ev.target.closest(".chart");if(!host)return;var id=host.id.slice(3),w=W[id],g=w&&w.geo;if(!g)return;
  var svg=host.querySelector("svg"),r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*g.W,i=Math.round((px-g.L)/g.pw*(g.n-1));i=Math.max(0,Math.min(g.n-1,i));
  var xs=g.x(i),v=w.curve[i],xl=$("#xl-"+id),xd=$("#xd-"+id),tip=$("#tp-"+id);
  xl.setAttribute("x1",xs);xl.setAttribute("x2",xs);xl.style.display="";xd.setAttribute("cx",xs);xd.setAttribute("cy",g.y(v));xd.style.display="";
  tip.style.display="block";tip.innerHTML='<span class="num '+cls(v)+'">'+smoney(v)+'</span> <span class="dim">from start, point '+(i+1)+" of "+g.n+"</span>";
  var hb=host.getBoundingClientRect();tip.style.left=Math.max(0,Math.min(ev.clientX-hb.left+12,hb.width-170))+"px";tip.style.top="0px";
});
$("#row").addEventListener("pointerout",function(ev){var host=ev.target.closest&&ev.target.closest(".chart");if(!host)return;var id=host.id.slice(3);var tp=$("#tp-"+id);if(tp)tp.style.display="none";var xl=$("#xl-"+id),xd=$("#xd-"+id);if(xl)xl.style.display="none";if(xd)xd.style.display="none"});
$("#row").addEventListener("click",function(ev){
  var t=ev.target.closest&&ev.target.closest("button");if(!t)return;
  if(t.classList.contains("rest"))setRest(t.dataset.id,!REST[t.dataset.id]);
  else if(t.dataset.edit)goAgent(t.dataset.edit);
  else if(t.dataset.gates){var ag=AG[t.dataset.gates];LAB.id=ag&&ag.strategyId?ag.strategyId:null;LAB.sub="overview";activate("strategy")}
});
$("#pack-empty").addEventListener("click",function(ev){var t=ev.target.closest&&ev.target.closest("button");if(!t)return;if(t.dataset.newagent)startNewAgent();if(t.id==="load-examples")loadExamples()});
$("#pack-add").onclick=function(){startNewAgent()};
function setRest(id,v){REST[id]=v;logCmd("Leigh",v?"rest_agent":"resume_agent",W[id].name+(v?" rested: entries paused for this agent":" back on: entries enabled"),"executed");toast(v?esc(W[id].name).toUpperCase()+" RESTING":esc(W[id].name).toUpperCase()+" BACK ON",v?"Entries paused for this agent only. Its open position keeps its stop.":"Entries enabled for this agent.",v?"warn":"good");updateAll(false)}

/* ---------- tiles, board, blocked ---------- */
function openRisk(){return simIds().reduce(function(a,id){return a+(POS[id]?POS[id].risk:0)},0)}
function packEq(){var e=simIds().reduce(function(a,id){return a+W[id].eq},0);return e||1}
function renderTiles(){
  var ids=simIds(),pnl=ids.reduce(function(a,id){return a+W[id].eq-W[id].start},0),sp=ids.reduce(function(a,id){return a+SIM[id].fees.spread+SIM[id].fees.comm},0),sl=ids.reduce(function(a,id){return a+SIM[id].fees.slip},0);
  var X=[["Pack P&L",'<span class="'+cls(pnl)+'">'+smoney(pnl)+"</span>",ids.length+" demo accounts"],["Costs paid",money(sp),"spread + commission"],["Slippage",money(sl),"mean +0.18 per trade"],["Decisions",(PACK.decisions+7010).toLocaleString(),"every one recorded"],["Guard trips",String(PACK.trips),"today"],["Open risk",(openRisk()/packEq()*100).toFixed(2)+"%","cap "+((packRules().filter(function(r){return r.t==="open_risk"})[0]||{v:3}).v)+"%"]];
  $("#tiles").innerHTML=X.map(function(t){return '<div class="tile"><span class="eyebrow">'+t[0]+'</span><div class="v">'+t[1]+'</div><div class="s">'+t[2]+"</div></div>"}).join("");
  var n=ORDER.length;$("#lead").innerHTML='<span>Day 9</span><span>'+n+" agent"+(n===1?"":"s")+'</span><span>MT5 demo accounts</span><span>Windows VPS</span><span>Not financial advice</span>';
  $("#pack-count").textContent=n+" of "+MAX_AGENTS;
  var add=$("#pack-add");add.disabled=n>=MAX_AGENTS||!STORE.canWrite;add.title=n>=MAX_AGENTS?"The limit is "+MAX_AGENTS+" agents":"";
}
function renderBoard(order,lead){
  var host=$("#board");
  if(host.dataset.sig!==order.join()){host.dataset.sig=order.join();host.style.height=Math.max(order.length,1)*46+"px";host.innerHTML=order.length?order.map(function(id){return '<div class="board-row" data-id="'+id+'" style="'+colorStyle(id)+'"><span class="num dim" data-r></span><div class="pt">'+W[id].art+'</div><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis">'+esc(W[id].name)+'</span><span class="bar2"><span data-b></span></span><span class="num" data-e></span></div>'}).join(""):'<p class="dim">No agent has live data yet.</p>'}
  $$("#board .board-row").forEach(function(row){var id=row.dataset.id,i=order.indexOf(id);row.style.transform="translateY("+i*46+"px)";row.querySelector("[data-r]").textContent=i+1;row.querySelector("[data-b]").style.width=Math.max(4,W[id].eq/lead*100)+"%";row.querySelector("[data-e]").textContent=money(W[id].eq)});
}
$("#blocked").innerHTML=[["XAGUSD","41 pt"],["GBPJPY","28 pt"],["USDZAR","96 pt"],["EURTRY","310 pt"]].map(function(b){return "<span>"+b[0]+' <span class="dim">'+b[1]+"</span></span>"}).join("");

/* ---------- sentinel ---------- */
function srow(label,val,used,limit,sub){var st=used<70?"good":used<90?"warn":"crit",col={good:"var(--good)",warn:"var(--warn)",crit:"var(--crit)"}[st],ic={good:"● ok",warn:"▲ watch",crit:"✕ near breach"}[st];
  return '<div class="srow"><div class="top"><span style="font-weight:500">'+label+'</span><span><span class="num">'+val+'</span> <span class="chip '+st+'">'+ic+'</span></span></div><div class="t" role="img" aria-label="'+used.toFixed(0)+' percent of limit used"><div style="width:'+Math.min(100,used)+'%;background:'+col+'"></div></div><div class="d"><span class="num">'+used.toFixed(0)+"% of "+limit+"</span><span>"+sub+"</span></div></div>"}
function pr(t){var r=packRules().filter(function(x){return x.t===t})[0];return r?r.v:RULE_TYPES[t].def}
function sRows(){var r=openRisk()/packEq()*100,dl=PACK.stale?0.78:0.78;return srow("Daily loss","0.78%",0.78/pr("daily_loss")*100,pr("daily_loss").toFixed(2)+"% limit","halts new orders")+srow("Drawdown from high-water","1.87%",1.87/pr("max_drawdown")*100,pr("max_drawdown").toFixed(2)+"% limit","halts new orders")+srow("Open risk at stops",r.toFixed(2)+"%",r/pr("open_risk")*100,pr("open_risk").toFixed(2)+"% cap","blocks new orders")}
function engChip(){return PACK.locked?'<span class="chip crit" id="s-chip">✕ Den locked</span>':PACK.paused?'<span class="chip warn" id="s-chip">▲ Entries paused</span>':'<span class="chip good" id="s-chip">● On watch</span>'}
function renderSentinel(full){
  if(!full&&$("#sentinel").dataset.built){$("#s-chip").outerHTML=engChip();$("#s-rows").innerHTML=sRows();return}
  $("#sentinel").innerHTML='<div class="sent-head"><div class="portrait">'+ART.sentinel+'</div><div style="min-width:0"><div style="font-size:22px;font-weight:700">Sentinel</div><div class="dim" style="font-size:13px">the guardian · reduce-only</div></div>'+engChip()+'</div><div id="s-rows">'+sRows()+'</div>'+
   '<div class="powers"><span class="chip good">✓ pause</span><span class="chip good">✓ cancel</span><span class="chip good">✓ flatten</span><span class="chip good">✓ kill</span><span class="chip"><span class="no">open or add</span></span></div>'+
   '<div class="btnrow"><button class="btn danger" id="b-recall">Recall the pack</button><button class="btn danger" id="b-lock">Lock the den</button><button class="btn ghost sm" id="b-rules">Pack rules</button></div>';
  $("#sentinel").dataset.built="1";
  $("#b-recall").onclick=function(){goControl("recall")};$("#b-lock").onclick=function(){goControl("lock")};$("#b-rules").onclick=function(){setRulesScope("pack");activate("risk")};
}
function renderBar(){var e=$("#chip-engine");if(PACK.locked){e.className="chip crit";e.textContent="✕ Den locked"}else if(PACK.paused){e.className="chip warn";e.textContent="▲ Entries paused"}else{e.className="chip good";e.textContent="● Pack hunting"}}

/* ---------- the howl, toasts ---------- */
var HOW=[["ridge","HOLD","holding the short, stop 4176.80","+$8.28"],["scout","WATCHING","wanted BUY limit, code said no: spread_gate 0.46","+$0.00"],["ember","TRAIL","moved the stop up to 1.26910","+$14.60"],["dusk","RESTING","trade cap: 4 of 4 used today","-$0.00"],["ridge","WATCHING","price 9.4 points above the nearest block","+$8.10"],["scout","HOLD","holding the long EURUSD, stop 1.08190","+$2.40"],["ember","HOLD","trend intact, higher low on H1","+$14.10"],["dusk","RESTING","back at 00:00 UTC","-$0.00"]];
var howl=[],hi=0;
function pushHowl(){
  var pool=HOW.filter(function(h){return W[h[0]]&&W[h[0]].sim});if(!pool.length){$("#howl").innerHTML='<p class="dim">The howl shows each agent\'s decisions once it is running.</p>';return}
  var h=pool[hi%pool.length];hi++;PACK.decisions++;var n=new Date(),t=String(n.getUTCHours()).padStart(2,"0")+":"+String(n.getUTCMinutes()).padStart(2,"0")+":"+String(n.getUTCSeconds()).padStart(2,"0");
  howl.unshift(h.concat([t]));howl=howl.slice(0,9);renderHowl();$("#perMin").textContent="11/min";
}
function renderHowl(){
  var rows=howl.filter(function(r){return W[r[0]]});
  if(!rows.length)return;
  $("#howl").innerHTML=rows.map(function(r){var pos=r[3].charAt(0)==="+";return '<div class="hrow" style="'+colorStyle(r[0])+'"><span class="dot"></span><span><span class="who">'+esc(W[r[0]].name)+'</span><span class="lab">'+r[1]+'</span></span><span class="num '+(pos?"pos":"neg")+'">'+(pos?"▲ ":"▼ ")+r[3]+'</span><span class="why">'+r[2]+'</span></div>'}).join("");
}
function toast(title,msg,kind){
  var el=document.createElement("div");el.className="toast";el.innerHTML='<b style="color:var(--'+(kind==="crit"?"crit":kind==="warn"?"warn":kind==="good"?"good":"pos")+')">'+title+"</b>"+msg;$("#toasts").appendChild(el);
  while($("#toasts").children.length>3)$("#toasts").firstChild.remove();
  setTimeout(function(){el.classList.add("out");setTimeout(function(){el.remove()},160)},6500);
}

/* ---------- trading tab and risk tab pieces that read the live state ---------- */
function renderPositions(){
  var el=$("#pos-table"),rows=simIds().filter(function(id){return POS[id]});
  if(!rows.length){el.innerHTML='<tr><td class="dim">No open positions. Confirmed by the latest account snapshot.</td></tr>';return}
  el.innerHTML='<tr><th>Agent</th><th>Symbol</th><th>Side</th><th class="r">Lots</th><th class="r">Entry</th><th class="r">Stop</th><th class="r">Floating</th><th class="r">Held</th></tr>'+rows.map(function(id){var p=POS[id];
    return '<tr><td><span class="chip" style="color:'+W[id].color+'">● '+esc(W[id].name)+'</span></td><td>'+p.coin+'</td><td>'+p.side+'</td><td class="r num">'+p.lots.toFixed(2)+'</td><td class="r num">'+p.entry+'</td><td class="r num">'+p.stop+'</td><td class="r num '+cls(p.upl)+'">'+(p.upl>=0?"▲ ":"▼ ")+smoney(p.upl)+'</td><td class="r num">'+heldTxt(p.held)+"</td></tr>"}).join("");
}
function renderExposure(){
  var cur={},rowsH="";
  simIds().forEach(function(id){var p=POS[id];if(!p)return;var b=p.coin.slice(0,3),q=p.coin.slice(3),s=p.side==="long"?1:-1;cur[b]=(cur[b]||0)+s*p.lots;cur[q]=(cur[q]||0)-s*p.lots;rowsH+="<tr><td>"+p.coin+'</td><td><span style="color:'+W[id].color+'">'+esc(W[id].name)+'</span></td><td class="r num">'+(s>0?"+":"-")+p.lots.toFixed(2)+'</td><td class="r num">'+money(p.risk,0)+"</td></tr>"});
  var net=Object.keys(cur).map(function(k){return k+" "+(cur[k]>=0?"+":"-")+Math.abs(cur[k]).toFixed(2)}).join(" · ");
  $("#expo").innerHTML='<tr><th>Symbol</th><th>Agent</th><th class="r">Lots</th><th class="r">Risk at stop</th></tr>'+(rowsH||'<tr><td class="dim">Flat</td></tr>')+(rowsH?'<tr><td colspan="4" class="dim num" style="white-space:normal">Net by currency: '+net+"</td></tr>":"");
}
