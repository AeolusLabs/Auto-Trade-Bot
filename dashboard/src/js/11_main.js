/* 11_main.js: Control hub (pause, rest, flatten, kill, simulated and reduce-only), live ticking, tabs, and start-up. */
/* ---------- control hub: pause, rest, flatten, kill (simulated, reduce-only) ---------- */
var LOG=[{ts:Date.now()-36e5*5,by:"system",cmd:"guard",detail:"Cancelled 2 pending orders: position open",res:"executed"},{ts:Date.now()-36e5*5,by:"Ridge",cmd:"fill",detail:"SME1 sell limit 4172.31 filled",res:"executed"},{ts:Date.now()-36e5*9,by:"Leigh",cmd:"pause_entries",detail:"Entries paused for NFP",res:"executed"},{ts:Date.now()-36e5*8,by:"Leigh",cmd:"resume_entries",detail:"Entries resumed",res:"executed"}];
function logCmd(by,cmd,detail,res){var e={ts:Date.now(),by:by,cmd:cmd,detail:detail,res:res};LOG.unshift(e);renderAudit();return e}
function renderAudit(){
  var rows=LOG.map(function(l){return {ts:l.ts,by:l.by,cmd:l.cmd,detail:l.detail,res:l.res}}).concat(AUDIT.map(function(e){return {ts:e.ts,by:"you",cmd:e.kind,detail:e.detail,res:"saved"}})).sort(function(a,b){return b.ts-a.ts}).slice(0,60);
  var stc={executed:"good",saved:"good",failed:"crit"};
  $("#audit").innerHTML='<tr><th>Time (UTC)</th><th>By</th><th>Event</th><th>Detail</th><th>Result</th></tr>'+rows.map(function(r){return '<tr><td class="num">'+fmtTs(r.ts)+"</td><td>"+esc(r.by)+'</td><td class="num">'+esc(r.cmd)+'</td><td style="white-space:normal">'+esc(r.detail)+'</td><td><span class="chip '+(stc[r.res]||"")+'">'+(r.res==="executed"?"✓ executed":r.res==="saved"?"✓ saved":r.res==="failed"?"✕ failed":esc(r.res))+"</span></td></tr>"}).join("");
}
function renderControl(){
  var ps=$("#pause-sw");ps.setAttribute("aria-checked",String(PACK.paused));$("#top-pause").setAttribute("aria-checked",String(PACK.paused));
  var pc=$("#pause-chip");pc.className="chip "+(PACK.paused?"warn":"good");pc.textContent=PACK.paused?"▲ Entries paused":"Entries enabled";
  var n=ORDER.filter(function(id){return REST[id]}).length;$("#rest-chip").textContent=n+" resting";
  var rl=$("#rest-list"),rs=ORDER.join()+"|"+ORDER.map(function(id){return !!REST[id]}).join();
  if(rl.dataset.sig!==rs){rl.dataset.sig=rs;rl.innerHTML=ORDER.length?ORDER.map(function(id){return '<div class="rest-row" style="'+colorStyle(id)+'"><span class="nm"><span class="pt">'+W[id].art+"</span>"+esc(W[id].name)+'</span><button class="sw" data-rest="'+id+'" role="switch" aria-checked="'+(!!REST[id])+'" aria-label="Rest '+esc(W[id].name)+'"></button></div>'}).join(""):'<p class="dim">No agents yet.</p>'}
  var pos=simIds().filter(function(id){return POS[id]});$("#flat-chip").textContent=pos.length+" position"+(pos.length===1?"":"s");
  var sel=$("#scope"),cur=sel.value,ss=pos.join();
  if(sel.dataset.sig!==ss){sel.dataset.sig=ss;sel.innerHTML='<option value="all">Whole pack</option>'+pos.map(function(id){return '<option value="wolf:'+id+'">'+esc(W[id].name)+" only ("+POS[id].coin+")</option>"}).join("");if(cur&&sel.querySelector('option[value="'+cur+'"]'))sel.value=cur}
  renderAudit();
}
$("#rest-list").addEventListener("click",function(ev){var b=ev.target.closest&&ev.target.closest("[data-rest]");if(b)setRest(b.dataset.rest,!REST[b.dataset.rest])});
function setPause(v){PACK.paused=v;logCmd("Leigh",v?"pause_entries":"resume_entries",v?"Entries paused for the whole pack":"Entries resumed for the whole pack","executed");toast(v?"PACK PAUSED":"ENTRIES ENABLED",v?"Sentinel set trading_enabled=false. Open positions keep their stops.":"Entries are enabled again.",v?"warn":"good");updateAll(false)}
$("#top-pause").onclick=function(){setPause(!PACK.paused)};$("#pause-sw").onclick=function(){setPause(!PACK.paused)};
var pendingCmd=null;
function affected(kind){var sc=$("#scope").value;return simIds().filter(function(id){return POS[id]&&(kind==="lock"||kind==="recall"||sc==="all"||sc==="wolf:"+id)})}
function openConfirm(kind){
  var ids=affected(kind),word=kind==="lock"?"LOCK":kind==="recall"?"RECALL":"FLATTEN";pendingCmd={kind:kind,ids:ids,word:word};
  var list=(kind==="lock"?'<div>1. Set the pause flag for all agents</div><div>2. Cancel every resting order (0 resting)</div>':"")+(ids.map(function(id,i){var p=POS[id];return "<div>"+((kind==="lock"?3:1)+i)+". Close "+esc(W[id].name)+"'s "+p.side+" "+p.coin+" at market</div>"}).join("")||"<div class='dim'>Nothing is open in this scope.</div>")+(kind==="lock"?"<div>"+(ids.length+3)+". If positions remain, stop the MT5 terminal (restart needs a person)</div>":"");
  $("#confirm-slot").innerHTML='<div class="confirm"><div class="eyebrow">'+(kind==="lock"?"Lock the den":kind==="recall"?"Recall the pack":"Flatten")+'</div><div class="sec" style="display:flex;flex-direction:column;gap:3px;margin:8px 0 12px;font-size:13px">'+list+'</div><div class="inl"><label class="dim" for="cf-in">Type <b class="num" style="color:var(--fg)">'+word+'</b></label><input type="text" id="cf-in" autocomplete="off" spellcheck="false"><button class="btn danger" id="cf-go" disabled>Send command</button><button class="btn sm" id="cf-x">Cancel</button></div><label class="inl dim xs" style="margin-top:10px" for="sim"><input type="checkbox" id="sim"> Simulate market closed (retcode 10018)</label></div>';
  $("#cf-in").focus();
  $("#cf-in").oninput=function(){$("#cf-go").disabled=this.value.trim()!==pendingCmd.word||(!pendingCmd.ids.length&&pendingCmd.kind!=="lock")};
  $("#cf-in").onkeydown=function(e){if(e.key==="Escape")$("#cf-x").click();if(e.key==="Enter"&&!$("#cf-go").disabled)$("#cf-go").click()};
  $("#cf-x").onclick=function(){$("#confirm-slot").innerHTML="";pendingCmd=null};
  $("#cf-go").onclick=runCmd;
}
function goControl(kind){activate("control");setTimeout(function(){openConfirm(kind);$("#confirm-slot").scrollIntoView({block:"center",behavior:REDUCED?"auto":"smooth"})},30)}
$("#flat-btn").onclick=function(){openConfirm("flatten")};$("#kill-btn").onclick=function(){openConfirm("lock")};$("#top-lock").onclick=function(){goControl("lock")};
function chipFor(s){var m={sent:["","sent"],acked:["info","acked"],executed:["good","✓ executed"],failed:["crit","✕ failed"]}[s];return '<span class="chip '+m[0]+'">'+m[1]+"</span>"}
function runCmd(){
  var job=pendingCmd,fail=$("#sim").checked;$("#confirm-slot").innerHTML="";pendingCmd=null;
  var steps=[];if(job.kind==="lock"){steps.push({n:"Set pause flag",t:"flag"});steps.push({n:"Cancel pending orders",t:"cancel"})}
  job.ids.forEach(function(id){steps.push({n:"Close "+esc(W[id].name)+" "+POS[id].coin,t:id})});
  var st=steps.map(function(){return "sent"}),title=job.kind==="lock"?"Lock the den":job.kind==="recall"?"Recall the pack":"Flatten";
  $("#res-card").hidden=false;$("#res-title").textContent=title+", "+steps.length+" step(s)";$("#res-chip").className="chip info";$("#res-chip").textContent="sending";$("#res-foot").textContent="";
  function paint(){$("#res").innerHTML="<tr><th>Step</th><th>Ticket</th><th>State</th><th>Detail</th></tr>"+steps.map(function(s,i){var d=st[i]==="failed"?"retcode 10018, market closed":st[i]==="executed"?(POS[s.t]?"closed at "+POS[s.t].mark:"done"):st[i]==="acked"?"bridge accepted":"waiting for ack";return "<tr><td>"+s.n+'</td><td class="num">'+(POS[s.t]?"#"+(4821900+ORDER.indexOf(s.t)):"-")+"</td><td>"+chipFor(st[i])+'</td><td class="sec">'+d+"</td></tr>"}).join("")}
  paint();
  var entry=logCmd("Leigh",job.kind==="lock"?"kill":"flatten","Scope: "+(job.kind==="flatten"?$("#scope").selectedOptions[0].text:"whole pack")+", "+job.ids.length+" position(s)","sent");
  steps.forEach(function(s,i){setTimeout(function(){st[i]="acked";paint()},500+i*160);setTimeout(function(){st[i]=(fail&&POS[s.t])?"failed":"executed";paint();if(i===steps.length-1)finish()},1200+i*260)});
  function finish(){
    var bad=st.filter(function(x){return x==="failed"}).length,ok=st.filter(function(x){return x==="executed"}).length;
    if(bad){$("#res-chip").className="chip crit";$("#res-chip").textContent="✕ not flat";$("#res-foot").innerHTML="<b>"+ok+" of "+steps.length+" steps executed, "+bad+" failed.</b> "+bad+" position(s) remain open and keep their stops. The bridge retries until its budget runs out.";entry.res="failed";if(job.kind==="lock"){PACK.locked=true;PACK.trips++;kUi()}toast("NOT FLAT",bad+" close(s) failed: market closed. Stops still protect the positions.","crit");updateAll(false);return}
    $("#res-chip").className="chip info";$("#res-chip").textContent="waiting for account snapshot";$("#res-foot").textContent="Executed. The hub shows flat only after the next account snapshot confirms it.";
    setTimeout(function(){job.ids.forEach(function(id){POS[id]=null;if(SIM[id])SIM[id].status="Recalled: flat."});entry.res="executed";if(job.kind==="lock"){PACK.locked=true;PACK.trips++;kUi()}else if(job.kind==="recall")PACK.recalled=true;
      $("#res-chip").className="chip good";$("#res-chip").textContent="✓ confirmed by snapshot";var left=simIds().filter(function(id){return POS[id]}).length;$("#res-foot").textContent=left?left+" position(s) outside this scope remain open.":"Snapshot confirms the account is flat.";
      toast(job.kind==="lock"?"DEN LOCKED":job.kind==="recall"?"PACK RECALLED":"FLATTENED",job.kind==="lock"?"Sentinel locked the den. No orders until a person resets it.":"Positions closed. Entries are unchanged.",job.kind==="lock"?"crit":"warn");updateAll(false);renderAudit()},1100)
  }
}
function kUi(){var c=$("#kill-chip");c.className="chip crit";c.textContent="✕ Triggered";$("#reset-btn").hidden=false}
$("#reset-btn").onclick=function(){location.reload()};

/* ---------- live ticking, stale feed, clock ---------- */
function tickMoney(){
  if(PACK.stale||PACK.locked)return;
  simIds().forEach(function(id){var w=W[id],s=SIM[id];if(REST[id]&&!POS[id])return;var dv=+((rnd()-0.48)*6).toFixed(2);s.eq=+(s.eq+dv).toFixed(2);w.eq=s.eq;s.curve.push(+(s.eq-s.start).toFixed(2));if(s.curve.length>56)s.curve.shift();if(POS[id])POS[id].upl=+(POS[id].upl+dv*0.5).toFixed(2)});
  updateAll(false);
}
function setStale(v){PACK.stale=v;document.body.classList.toggle("stale",v);$("#stalebar").hidden=!v;$("#feed-txt").textContent=v?"stalled":"live";$("#chip-feed").className="chip "+(v?"warn":"mute")}
$("#sim-stale").onclick=function(){setStale(true);toast("FEED STALLED","No market updates for 15 seconds. Showing last known values.","warn")};
$("#reconnect").onclick=function(){setStale(false);toast("FEED BACK","Reconnected. Live values resumed.","good")};
function clock(){var n=new Date();$("#clock").textContent=String(n.getUTCHours()).padStart(2,"0")+":"+String(n.getUTCMinutes()).padStart(2,"0")+":"+String(n.getUTCSeconds()).padStart(2,"0")+" UTC"}
function hint(){var r=$("#row");$("#hint").classList.toggle("on",r.scrollWidth>r.clientWidth+4)}
var rz;window.addEventListener("resize",function(){hint();clearTimeout(rz);rz=setTimeout(drawAll,120)});

/* ---------- track record visibility, data refresh, tabs ---------- */
function renderRecord(){
  var has=!!(AG.ridge&&AG.ridge.status!=="archived");
  $("#rec-body").style.display=has?"":"none";
  $("#rec-empty").innerHTML=has?"":'<div class="empty"><h2>No track record yet</h2><p>The track record comes from an agent\'s backtest. Queue one from an agent\'s Strategy tab once its file is uploaded.</p></div>';
}
function onData(){
  if(!STORE.ready){$("#pack-empty").innerHTML='<p class="dim">Loading agents…</p>';return}
  rebuildW();var s=agentSig();
  if(s!==sig){sig=s;buildCards();updateAll(true);renderHowl()}else updateAll(false);
  renderAgents(false);renderRulesTab(false);renderLab(false);renderRecord();renderAudit();setStoreChip();hint();
}
function activate(t){
  if(!$("#p-"+t))t="pack";
  $$("#tabs button").forEach(function(b){b.setAttribute("aria-selected",String(b.dataset.tab===t));b.tabIndex=b.dataset.tab===t?0:-1});
  $$(".panel").forEach(function(p){p.classList.toggle("on",p.id==="p-"+t)});
  try{if(location.hash!=="#"+t)history.replaceState(null,"","#"+t)}catch(e){}   // not allowed in some embedded or sandboxed frames
  if(t==="agents")renderAgents(true);if(t==="risk")renderRulesTab(true);if(t==="strategy")renderLab(true);
  drawAll();if(t==="pack")hint();
}
$$("#tabs button").forEach(function(b,i,all){b.onclick=function(){activate(b.dataset.tab)};b.onkeydown=function(e){var d=e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0;if(d){var n=all[(i+d+all.length)%all.length];n.focus();activate(n.dataset.tab);e.preventDefault()}}});
window.addEventListener("hashchange",function(){activate(location.hash.slice(1))});

/* ---------- boot ---------- */
$("#brand").innerHTML=ART.sentinel+"<span>Auto Trade Bot</span>";
clock();setInterval(clock,1000);
renderSentinel(true);renderKpis();renderMonthly();renderStats();renderHist();
setInterval(function(){if(STORE.ready&&!PACK.locked&&!PACK.stale)pushHowl()},3200);
setInterval(tickMoney,2800);
setTimeout(function(){toast("SENTINEL","Daily loss reached 71% of its limit earlier today. Alert sent.","warn")},4500);
activate(location.hash.slice(1)||"pack");
initBars(__BARS__);
initStore().then(function(){for(var k=0;k<6;k++)pushHowl()});
