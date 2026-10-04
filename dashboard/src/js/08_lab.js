/* 08_lab.js: Strategy lab, part 1: ranking and recommendation, leaderboard, assignment flow, the Add strategy form, static review of uploaded files,
   the research-agent runner, CSV imports, and automatic evaluation of gates from results. */
/* ---------- Strategy lab: submit, test, rank, recommend, assign ---------- */
var LAB={id:null,sub:"overview",adding:null},ADD={};
var TIMEFRAMES=["M1","M3","M5","M15","M30","H1","H4","D1"];
function strategies(){return Object.keys(STR).map(function(k){return STR[k]}).filter(function(s){return s.status!=="archived"}).sort(byOrder)}
function rankFor(s){return rankOf(s)}
function rankAll(){
  var items=strategies().map(function(s){return {s:s,res:rankFor(s)}});
  items.sort(function(a,b){var x=a.res.score==null?-1:a.res.score,y=b.res.score==null?-1:b.res.score;return y-x});
  var top=null;items.forEach(function(it,i){it.rank=it.res.score==null?null:i+1;it.ready=it.res.eligible&&stageIndex(it.s)>=3;if(!top&&it.ready){top=it}});
  items.forEach(function(it){it.recommended=top===it});
  return items;
}
function recommendation(){
  var items=rankAll(),top=items.filter(function(i){return i.recommended})[0]||null,closest=items.filter(function(i){return i.res.score!=null&&!i.ready})[0]||null;
  var agents=liveAgents(),target=null;
  if(top){
    var empty=agents.filter(function(a){return !a.strategyId||!STR[a.strategyId]})[0];
    if(empty)target={agent:empty,mode:"empty"};
    else{
      var weakest=agents.map(function(a){var r=rankFor(STR[a.strategyId]);return {a:a,sc:r.score==null?-1:r.score}}).sort(function(x,y){return x.sc-y.sc})[0];
      if(weakest&&top.res.score>=weakest.sc+5&&weakest.a.strategyId!==top.s.id)target={agent:weakest.a,mode:"replace"};
    }
  }
  return {items:items,top:top,closest:closest,target:target};
}
function srcChip(s){
  var m={repo:["good","In the repo, verified"],uploaded:["info","Uploaded file"],manual:["info","Built manually"],idea:["","Idea only"]}[s.source]||["",s.source||""];
  return '<span class="chip '+m[0]+'">'+m[1]+'</span>';
}
function statusChip(it){
  if(it.res.score==null)return '<span class="chip">Needs results</span>';
  if(it.recommended)return '<span class="chip good">★ Recommended</span>';
  if(it.ready)return '<span class="chip good">✓ Eligible</span>';
  if(it.res.eligible)return '<span class="chip warn">Gates pending</span>';
  return '<span class="chip">Candidate</span>';
}
function assignedTo(sid){return liveAgents().filter(function(a){return a.strategyId===sid})}

/* ----- recommendation card and leaderboard ----- */
function renderReco(){
  var r=recommendation(),host=$("#lab-reco");
  var html;
  if(!Object.keys(STR).length)html='<div class="empty"><h2>No strategies yet</h2><p>The lab tests strategies and recommends the best performer for an agent. Add one by uploading a file, building one from a template, or describing an idea.</p><div class="inl" style="justify-content:center;margin-top:14px"><button class="btn" data-labadd="manual"'+dis()+'>Build one from a template</button><button class="btn" data-labadd="file"'+dis()+'>Upload a file</button><button class="btn ghost" id="load-examples">Load the examples</button></div></div>';
  else if(r.top){
    var t=r.top,tg=r.target;
    html='<div class="card" style="border-color:var(--good)"><div class="card-h"><div class="inl"><span class="chip good">★ Recommended</span><h2>'+esc(t.s.name)+'</h2><span class="chip">Score '+t.res.score.toFixed(0)+'</span></div></div>'+
     '<p class="sec" style="margin-bottom:10px">Best eligible performer on '+t.res.basis+': '+esc(t.res.parts[0].input)+', '+esc(t.res.parts[2].input)+'. '+(t.res.penalties.length?"Caution: "+t.res.penalties.map(function(p){return esc(p.why)}).join("; ")+".":"")+'</p>'+
     (tg?'<div class="inl"><span>'+(tg.mode==="empty"?"Assign to <b>"+esc(tg.agent.name)+"</b>, which has no strategy.":"Replace <b>"+esc(strategyOf(tg.agent).name)+"</b> on <b>"+esc(tg.agent.name)+"</b>, which scores lower.")+'</span><button class="btn" data-assign="'+t.s.id+'|'+tg.agent.id+'"'+dis()+'>'+(tg.mode==="empty"?"Assign and start the demo forward test":"Review the replacement")+'</button></div><div id="reco-slot"></div>':
       '<p class="dim">No free agent. Every agent already has a strategy that scores about as well, or add an agent first.</p>')+'</div>';
  }else{
    var c=r.closest;
    html='<div class="card" style="border-color:var(--warn)"><div class="card-h"><div class="inl"><span class="chip warn">▲ Nothing is eligible yet</span></div></div><p class="sec">No strategy has passed backtest and validation with an eligible score.'+(c?' Closest: <b>'+esc(c.s.name)+'</b> (score '+c.res.score.toFixed(0)+'). Blocking: '+(c.res.reasons.length?esc(c.res.reasons[0]):"gates not yet passed ("+esc(stageLabel({strategyId:c.s.id}))+")")+'.':"")+'</p></div>';
  }
  host.innerHTML=html;
}
function renderBoardLab(){
  var items=rankAll(),host=$("#lab-board");
  host.innerHTML='<div class="card-h"><h2>Strategy leaderboard</h2><div class="inl"><span class="dim xs">Ranked by the research agent\'s score, highest first</span><button class="btn" id="lab-add-btn"'+dis()+'>Add strategy</button></div></div>'+
   (items.length?'<div class="tw"><table class="lb"><tr><th>#</th><th>Strategy</th><th>Score</th><th class="r">Backtest</th><th class="r">Forward</th><th>Gates</th><th>Status</th><th>Agent</th></tr>'+items.map(function(it){
     var s=it.s,bt=s.backtest,fw=s.forward,ev=bt?(bt.metrics.oos||bt.metrics.full):null,fm=fw?fw.metrics.full:null,ag=assignedTo(s.id).map(function(a){return esc(a.name)}).join(", ");
     return '<tr class="lbrow" data-sid="'+s.id+'" aria-selected="'+(LAB.id===s.id)+'" tabindex="0"><td class="num">'+(it.rank||"–")+'</td><td style="white-space:normal;min-width:170px"><div style="font-weight:600">'+esc(s.name)+'</div>'+srcChip(s)+'</td>'+
      '<td style="min-width:110px">'+(it.res.score==null?'<span class="dim">no results</span>':'<div class="num">'+it.res.score.toFixed(0)+'</div><div class="track" style="width:90px"><div class="fill'+(it.res.score<40?" warn":"")+'" style="width:'+it.res.score+'%;background:'+(it.res.score<40?"":"var(--good)")+'"></div></div>')+'</td>'+
      '<td class="r num">'+(ev?ev.n+" · "+sgn(ev.exp,2)+"R · PF "+ev.pf.toFixed(2):'<span class="dim">–</span>')+'</td><td class="r num">'+(fm?fm.n+" · "+sgn(fm.exp,2)+"R":'<span class="dim">–</span>')+'</td>'+
      '<td><span class="chip">'+(stageIndex(s)>=6?"All passed":"Stage "+stageIndex(s))+'</span></td><td>'+statusChip(it)+'</td><td>'+(ag||'<span class="dim">unassigned</span>')+'</td></tr>'}).join("")+'</table></div>':'<p class="dim">No strategies yet.</p>');
}
$("#lab-board").addEventListener("click",function(ev){
  if(ev.target.closest&&ev.target.closest("#lab-add-btn")){startAdd();return}
  var r=ev.target.closest&&ev.target.closest(".lbrow");if(r){LAB.id=r.dataset.sid;LAB.sub="overview";renderLab(true);var d=$("#lab-detail");if(d&&d.scrollIntoView)d.scrollIntoView({block:"nearest",behavior:REDUCED?"auto":"smooth"})}
});
$("#lab-board").addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){var r=ev.target.closest&&ev.target.closest(".lbrow");if(r){ev.preventDefault();LAB.id=r.dataset.sid;LAB.sub="overview";renderLab(true)}}});
$("#lab-reco").addEventListener("click",function(ev){
  var b=ev.target.closest&&ev.target.closest("button");if(!b)return;
  if(b.dataset.assign){var p=b.dataset.assign.split("|");assignFlow(p[0],p[1],$("#reco-slot"))}
  else if(b.dataset.labadd){startAdd(b.dataset.labadd)}
  else if(b.id==="load-examples")loadExamples();
});

/* ----- assignment ----- */
function assignFlow(sid,aid,slot){
  var s=STR[sid],a=AG[aid];if(!s||!a)return;
  if(a.strategyId===sid){toast("ALREADY ASSIGNED",esc(s.name)+" is already on "+esc(a.name)+".","warn");return}
  var res=rankFor(s),ready=res.eligible&&stageIndex(s)>=3,cur=strategyOf(a);
  if(ready&&!cur){doAssign(sid,aid,"");return}
  var word=ready?"REPLACE":"OVERRIDE",why=[];
  if(!ready){why.push("This strategy is not eligible: "+(res.reasons.length?res.reasons.join("; "):"backtest and validation gates are not both passed")+".")}
  if(cur)why.push("It replaces "+cur.name+" on "+a.name+".");
  if(!slot)return;
  slot.innerHTML='<div class="confirm" style="border-color:'+(ready?"var(--warn)":"var(--crit)")+'"><b>'+(ready?"Replace the strategy on "+esc(a.name)+"?":"Assign a strategy that is not eligible?")+'</b><p class="help" style="margin:6px 0">'+why.map(esc).join(" ")+(ready?"":" Assigning starts its demo run anyway, and the override is written to the change log.")+'</p><div class="inl">'+(ready?"":'<label class="lbl" for="ov-why">Reason</label><input class="inp" id="ov-why" maxlength="120" style="max-width:300px">')+'<label class="lbl" for="ov-word">Type <b class="num" style="color:var(--fg)">'+word+'</b></label><input class="inp mono" id="ov-word" style="max-width:150px" autocomplete="off"><button class="btn danger" id="ov-go" disabled>Assign</button><button class="btn sm ghost" id="ov-x">Cancel</button></div></div>';
  var w=slot.querySelector("#ov-word"),y=slot.querySelector("#ov-why"),go=slot.querySelector("#ov-go");
  function chk(){go.disabled=w.value.trim()!==word||(y&&y.value.trim().length<5)}w.oninput=chk;if(y)y.oninput=chk;w.focus();
  go.onclick=function(){doAssign(sid,aid,ready?"":" (override: "+(y?y.value.trim():"")+")")};slot.querySelector("#ov-x").onclick=function(){slot.innerHTML=""};
}
async function doAssign(sid,aid,note){
  var s=STR[sid],a=AG[aid],prev=strategyOf(a);a.strategyId=sid;if(!a.strategy)a.strategy={magic:nextMagic(),hypothesis:""};
  var started=false;
  if(stageIndex(s)===3&&s.gates[3].status==="pending"){s.gates[3].status="running";s.gates[3].lockedAt=Date.now();started=true;await saveStrategy(s)}
  if(await saveAgent(a)){await audit("strategy_assigned",aid,"Assigned "+s.name+" to "+a.name+(prev?" (replacing "+prev.name+")":"")+(started?"; demo forward test started, criteria locked":"")+note);
    toast("ASSIGNED",esc(s.name)+" is now on "+esc(a.name)+"."+(started?" Its demo forward test has started.":""),"good");renderAgents(true);renderLab(true)}
}
async function unassign(aid){var a=AG[aid],s=strategyOf(a);a.strategyId=null;if(await saveAgent(a)){await audit("strategy_unassigned",aid,"Unassigned "+(s?s.name:"strategy")+" from "+a.name);toast("UNASSIGNED",esc(a.name)+" has no strategy now.","warn");renderAgents(true);renderLab(true)}}

/* ----- add a strategy: file, template, or idea ----- */
function startAdd(method){
  if(!STORE.canWrite){toast("READ ONLY","You can look but not change anything on this page.","warn");return}
  ADD={method:method||"file",file:null,tpl:"donchian",bounds:null,run:true};LAB.adding=ADD.method;renderAddForm();var n=$("#a-name");if(n)n.focus();
  $("#lab-add").scrollIntoView({block:"nearest",behavior:REDUCED?"auto":"smooth"});
}
function boundsFor(tpl){var b={};Object.keys(TEMPLATES[tpl].params).forEach(function(k){var p=TEMPLATES[tpl].params[k];b[k]={min:p.min,max:p.max,step:p.step}});return b}
function renderAddForm(){
  var host=$("#lab-add");
  if(!LAB.adding){host.innerHTML="";return}
  var m=ADD.method;
  function seg(v,l){return '<button data-am="'+v+'" aria-pressed="'+(m===v)+'">'+l+'</button>'}
  var body="";
  if(m==="file"){
    body='<div class="drop" id="drop"><p style="margin-bottom:8px">Drop a <b>.py</b> strategy plugin or an <b>.mq5</b> Expert Advisor here</p><label class="btn" for="a-file" style="display:inline-flex">'+(ADD.file?"Replace file":"Choose a file")+'</label><input id="a-file" type="file" accept=".py,.mq5,.mqh" class="sr"><p class="help" style="margin-top:8px">Up to 180 KB. Stored as text and never run in this page.</p></div>'+
      (ADD.file?'<div class="grid g2e" style="margin-top:12px;align-items:start"><div class="kv"><div><span>File</span><span class="num">'+esc(ADD.file.name)+'</span></div><div><span>Language</span><span>'+(ADD.file.language==="mql5"?"MQL5 Expert Advisor":"Python strategy plugin")+'</span></div><div><span>Size</span><span class="num">'+(ADD.file.size/1024).toFixed(1)+' KB</span></div><div><span>SHA-256</span><span class="num">'+esc(ADD.file.sha256.slice(0,16))+'…</span></div></div><div><h3 style="margin-bottom:8px">Static review</h3><ul class="lint">'+ADD.file.review.map(function(l){return '<li class="'+(l.k==="ok"?"ok":l.k==="bad"?"bad":"warn")+'"><span class="m">'+(l.k==="ok"?"✓":l.k==="bad"?"✕":"▲")+'</span><span>'+esc(l.t)+'</span></li>'}).join("")+'</ul></div></div>':"")+
      '<p class="help" style="margin-top:10px">A file cannot be tested in this page. After you add it, import its backtest results (a trade list) or queue it for the research worker.</p>';
  }else if(m==="manual"){
    var T=TEMPLATES[ADD.tpl],b=ADD.bounds||(ADD.bounds=boundsFor(ADD.tpl)),grid=gridSize(ADD.tpl,b);
    body='<div class="form-grid"><div class="field"><label class="lbl" for="a-tpl">Template</label><select class="sel" id="a-tpl">'+Object.keys(TEMPLATES).map(function(k){return '<option value="'+k+'"'+(k===ADD.tpl?" selected":"")+'>'+TEMPLATES[k].label+'</option>'}).join("")+'</select></div><div class="field"><span class="lbl">What it tests</span><div class="sec" style="font-size:13px">'+esc(T.hyp)+'</div></div></div>'+
      '<h3 style="margin:14px 0 8px">Parameter bounds the research agent may search</h3><div class="tw"><table class="rtable"><tr><th>Parameter</th><th>Min</th><th>Max</th><th>Step</th></tr>'+Object.keys(T.params).map(function(k){return '<tr data-bk="'+k+'"><td>'+T.params[k].label+'</td><td><input class="inp mono" data-bf="min" type="number" step="any" value="'+b[k].min+'"></td><td><input class="inp mono" data-bf="max" type="number" step="any" value="'+b[k].max+'"></td><td><input class="inp mono" data-bf="step" type="number" step="any" value="'+b[k].step+'"></td></tr>'}).join("")+'</table></div>'+
      '<p class="help" style="margin-top:8px" id="a-grid">'+grid+' combinations. Over 400 are sampled. Every combination counts as a trial, which raises the bar for significance.</p>'+
      '<label class="inl" style="margin-top:8px"><input type="checkbox" id="a-run" '+(ADD.run?"checked":"")+'> Run the research agent right after creating it</label>';
  }else body='<p class="sec">An idea card records the hypothesis for later. It cannot be tested until it has a file or a template.</p>';
  host.innerHTML='<div class="card" style="margin-top:14px"><div class="card-h"><h2>Add a strategy</h2><div class="seg" role="group" aria-label="Method">'+seg("file","Upload a file")+seg("manual","Build manually")+seg("idea","Idea only")+'</div></div>'+
   '<div class="form-grid" style="margin-bottom:14px"><div class="field"><label class="lbl" for="a-name">Name</label><input class="inp" id="a-name" maxlength="32" value="'+esc(ADD.name||"")+'" placeholder="e.g. Asian range fade"><span class="err" id="e-aname"></span></div>'+
   '<div class="field"><label class="lbl" for="a-inst">Instruments</label><input class="inp mono" id="a-inst" maxlength="60" value="'+esc(ADD.inst||(m==="manual"?"XAUUSD":""))+'" placeholder="XAUUSD"><span class="err" id="e-ainst"></span></div>'+
   '<div class="field"><label class="lbl" for="a-tf">Timeframe</label><select class="sel" id="a-tf">'+TIMEFRAMES.map(function(t){return '<option'+((ADD.tf||(m==="manual"?"H1":"M15"))===t?" selected":"")+'>'+t+'</option>'}).join("")+'</select></div>'+
   '<div class="field" style="grid-column:1/-1"><label class="lbl" for="a-hyp">Hypothesis: why should this make money?</label><textarea class="ta" id="a-hyp" maxlength="500" placeholder="One or two sentences.">'+esc(ADD.hyp||(m==="manual"?TEMPLATES[ADD.tpl].hyp:""))+'</textarea><span class="err" id="e-ahyp"></span></div></div>'+
   body+'<div class="inl" style="margin-top:16px"><button class="btn" id="a-save">Add strategy</button><button class="btn ghost" id="a-cancel">Cancel</button><span class="err" id="a-msg"></span></div></div>';
}
function gridSize(tpl,b){try{return gridOf(tpl,b).length}catch(e){return 0}}
function keepAddFields(){["name","inst","tf","hyp"].forEach(function(k){var el=$("#a-"+k);if(el)ADD[k]=el.value});}
$("#lab-add").addEventListener("click",function(ev){
  var b=ev.target.closest&&ev.target.closest("button");if(!b)return;
  if(b.dataset.am){keepAddFields();ADD.method=b.dataset.am;LAB.adding=ADD.method;ADD.hyp=ADD.method==="manual"&&!ADD.hyp?"":ADD.hyp;renderAddForm();return}
  if(b.id==="a-cancel"){LAB.adding=null;ADD={};renderAddForm();return}
  if(b.id==="a-save")saveNewStrategy();
});
$("#lab-add").addEventListener("change",function(ev){
  var t=ev.target;
  if(t.id==="a-tpl"){keepAddFields();ADD.tpl=t.value;ADD.bounds=null;ADD.hyp=TEMPLATES[t.value].hyp;renderAddForm()}
  else if(t.id==="a-file"&&t.files[0]){keepAddFields();readStrategyFile(t.files[0]).then(function(f){if(f.err){$("#a-msg").textContent=f.err;return}ADD.file=f;renderAddForm()})}
  else if(t.dataset&&t.dataset.bf){readBounds();var g=$("#a-grid");if(g)g.firstChild&&(g.textContent=gridSize(ADD.tpl,ADD.bounds)+" combinations. Over 400 are sampled. Every combination counts as a trial, which raises the bar for significance.")}
  else if(t.id==="a-run")ADD.run=t.checked;
});
$("#lab-add").addEventListener("dragover",function(ev){var d=ev.target.closest&&ev.target.closest("#drop");if(d){ev.preventDefault();d.classList.add("over")}});
$("#lab-add").addEventListener("dragleave",function(ev){var d=ev.target.closest&&ev.target.closest("#drop");if(d)d.classList.remove("over")});
$("#lab-add").addEventListener("drop",function(ev){var d=ev.target.closest&&ev.target.closest("#drop");if(d){ev.preventDefault();d.classList.remove("over");if(ev.dataTransfer.files[0]){keepAddFields();readStrategyFile(ev.dataTransfer.files[0]).then(function(f){if(f.err){$("#a-msg").textContent=f.err;return}ADD.file=f;renderAddForm()})}}});
function readBounds(){
  var b={},err="";$$("#lab-add tr[data-bk]").forEach(function(tr){var k=tr.dataset.bk,g=function(f){return parseFloat(tr.querySelector('[data-bf="'+f+'"]').value)},mn=g("min"),mx=g("max"),st=g("step");if([mn,mx,st].some(isNaN)||st<=0||mn>mx)err="Check the bounds of "+TEMPLATES[ADD.tpl].params[k].label+".";b[k]={min:mn,max:mx,step:st}});
  ADD.bounds=b;return err;
}
function lintSource(text,lang){
  var out=[],t=text||"";function add(k,m){out.push({k:k,t:m})}
  if(lang==="python"){
    var hs=/class\s+\w*Strategy\b/.test(t),ho=/def\s+on_(bar|tick)\s*\(/.test(t);
    add(hs?"ok":"bad",hs?"Defines a Strategy class":"No class named ...Strategy found");add(ho?"ok":"bad",ho?"Has on_bar or on_tick":"No on_bar or on_tick method found");
    [[/os\.system|subprocess|popen/i,"runs shell commands"],[/\beval\s*\(|\bexec\s*\(|__import__/,"evaluates dynamic code"],[/\bsocket\b|requests\.|urllib|http\.client|aiohttp|websocket/i,"opens network connections"],[/\bctypes\b|\bcffi\b/,"loads native code"],[/\bpickle\b|\bmarshal\b/,"unpickles data"],[/open\s*\([^)]*['"][wax]/,"writes files"],[/MetaTrader5|order_send|\bmt5\./,"talks to MetaTrader directly; a strategy must return intents and let the engine place orders"]].forEach(function(p){if(p[0].test(t))add("bad","Risky: "+p[1])});
    if(!/stop|\bsl\b/i.test(t))add("warn","No stop-loss logic found. Every order needs one.");
  }else{
    var he=/On(Tick|Timer|TradeTransaction)\s*\(/.test(t),hm=/input\s+(int|long|ulong)\s+\w*[Mm]agic/.test(t),hg=/AutoTradeGuard/.test(t);
    add(he?"ok":"bad",he?"Has an event handler (OnTick, OnTimer or OnTradeTransaction)":"No OnTick, OnTimer or OnTradeTransaction found");add(hm?"ok":"warn",hm?"Has a magic number input":"No magic number input. The platform tells agents apart by magic number.");add(hg?"ok":"warn",hg?"Includes AutoTradeGuard.mqh":"Does not include AutoTradeGuard.mqh, so a soft pause will not reach this agent");
    [[/WebRequest|SendFTP|SendMail|SendNotification/,"sends data out of the terminal"],[/FileOpen|FileWrite|FileDelete|FileMove/,"reads or writes files"],[/ShellExecute|WinExec|#import/,"calls Windows or DLL code"],[/TerminalClose/,"can close the terminal"]].forEach(function(p){if(p[0].test(t))add("bad","Risky: "+p[1])});
    if(!/StopLoss|\bsl\b|\bSL\b/.test(t))add("warn","No stop-loss logic found. Every order needs one.");
  }
  if(/martingale|averag(e|ing)\s*down|double\s*(the\s*)?(lot|volume)|grid\s*(size|step|level)/i.test(t))add("warn","Mentions martingale, grid or averaging down. These are refused in the order path.");
  return out;
}
async function sha256(text){
  try{if(window.crypto&&crypto.subtle){var b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.prototype.map.call(new Uint8Array(b),function(x){return x.toString(16).padStart(2,"0")}).join("")}}catch(e){}
  var h=5381;for(var i=0;i<text.length;i++)h=((h<<5)+h+text.charCodeAt(i))>>>0;return "weak-"+h.toString(16);
}
async function readStrategyFile(file){
  var ext=(file.name.split(".").pop()||"").toLowerCase(),lang=ext==="py"?"python":(ext==="mq5"||ext==="mqh")?"mql5":null;
  if(!lang)return {err:"Only Python (.py) and MQL5 (.mq5, .mqh) files are accepted."};
  if(file.size>180*1024)return {err:"That file is "+(file.size/1024).toFixed(0)+" KB. The limit is 180 KB."};
  var text=await file.text();return {name:file.name,size:file.size,language:lang,text:text,sha256:await sha256(text),review:lintSource(text,lang)};
}
async function saveNewStrategy(){
  keepAddFields();var m=ADD.method,name=(ADD.name||"").trim(),hyp=(ADD.hyp||"").trim(),inst=parseInstruments(ADD.inst||""),ok=true,msg=$("#a-msg");msg.textContent="";
  $("#e-aname").textContent="";$("#e-ahyp").textContent="";$("#e-ainst").textContent="";
  if(name.length<2){$("#e-aname").textContent="Give it a name of at least 2 characters.";ok=false}else if(Object.keys(STR).some(function(k){return STR[k].name.toLowerCase()===name.toLowerCase()&&STR[k].status!=="archived"})){$("#e-aname").textContent="Another strategy has that name.";ok=false}
  if(hyp.length<10){$("#e-ahyp").textContent="Write the hypothesis in a sentence or two.";ok=false}
  var bad=inst.filter(function(s){return !/^[A-Z0-9._]{3,12}$/.test(s)});if(!inst.length||bad.length){$("#e-ainst").textContent=bad.length?"Not valid: "+bad.join(", "):"Add at least one instrument.";ok=false}
  if(m==="file"&&!ADD.file){msg.textContent="Choose a file first.";ok=false}
  if(m==="manual"){var be=readBounds();if(be){msg.textContent=be;ok=false}else if(!gridSize(ADD.tpl,ADD.bounds)){msg.textContent="The bounds produce no valid combinations.";ok=false}}
  if(!ok)return;
  var id="s"+rid(),s=ensureStrategy({id:id,name:name,kind:m==="file"?"file":m==="manual"?"template":"idea",source:m==="file"?"uploaded":m==="manual"?"manual":"idea",hypothesis:hyp,instruments:inst,timeframe:$("#a-tf").value,status:"candidate",order:Date.now(),createdAt:Date.now(),backtest:null,forward:null});
  if(m==="file"){s.language=ADD.file.language;s.file={name:ADD.file.name,size:ADD.file.size,sha256:ADD.file.sha256,v:1,review:ADD.file.review}}
  if(m==="manual"){s.template={id:ADD.tpl,bounds:ADD.bounds}}
  if(m==="file"&&!(await putRun(id,"code",{text:ADD.file.text,language:ADD.file.language,sha256:ADD.file.sha256,size:ADD.file.size,name:ADD.file.name,v:1})))return;
  var run=ADD.run&&m==="manual";LAB.adding=null;var tpl=ADD.tpl;ADD={};renderAddForm();
  if(await saveStrategy(s)){await audit("strategy_added",id,"Added "+(m==="file"?"file":m==="manual"?"template":"idea")+" strategy "+name);toast("STRATEGY ADDED",esc(name)+" is in the lab.","good");LAB.id=id;LAB.sub=run?"backtest":"overview";if(run)await runResearch(id);renderLab(true)}
}

/* ----- research agent and imports ----- */
function computedValues(s){
  var bt=s.backtest;if(!bt)return {};var m=bt.metrics,ev=m.oos||m.full,v={trades_n:m.full.n,net_expectancy_r:ev.exp,profit_factor:ev.pf,max_drawdown_r:m.full.maxDD,worst_fold_r:m.folds.length?Math.min.apply(null,m.folds.map(function(f){return f.totR})):null,cost_stress_r:m.costStressR,t_vs_trials:m.deflT};
  if(bt.kind==="engine"||bt.verified)v.data_checks_ok=1;
  var fw=s.forward;if(fw){var f=fw.metrics.full;v.f_trades_n=f.n;v.f_net_expectancy_r=f.exp;v.f_profit_factor=f.pf;v.f_max_drawdown_r=f.maxDD}
  return v;
}
async function autoGates(s,quiet){
  var cv_=computedValues(s),done=[],blocked="";
  for(var i=0;i<3;i++){
    var g=s.gates[i];if(passed(g))continue;if(i>0&&!passed(s.gates[i-1]))break;
    var vals={},miss=[];g.criteria.forEach(function(c){var x=cv_[c.m];if(x==null||isNaN(x))miss.push(METRICS[c.m].label);else vals[c.m]=x});
    if(miss.length){blocked="Stage "+i+" needs a manual value for: "+miss.join(", ");break}
    var met=g.criteria.filter(function(c){return cmp(vals[c.m],c.op,c.v)}).length,res=met===g.criteria.length?"pass":"fail";
    g.runs.push({ts:Date.now(),v:g.v,sv:(s.file?s.file.v:0),values:vals,met:met,result:res,note:"Computed from the "+(s.backtest.kind==="engine"?"research agent's run":"imported results")});
    g.status=res==="pass"?"passed":"failed";g.lockedAt=g.lockedAt||Date.now();if(res==="pass")g.passedAt=Date.now();done.push(i+":"+(res==="pass"?"passed":met+"/"+g.criteria.length));
    if(res!=="pass")break;
  }
  if(done.length)await audit("gates_computed",s.id,"Computed gates for "+s.name+": "+done.join(", "));
  return {done:done,blocked:blocked};
}
async function runResearch(id){
  var s=STR[id];if(!s||!s.template)return;
  var busy=$("#lab-busy");toast("RESEARCH RUNNING","The research agent is searching "+gridSize(s.template.id,s.template.bounds)+" combinations on 3 years of gold.","info");
  await new Promise(function(r){setTimeout(r,30)});
  var out=research(s.template.id,s.template.bounds,s.trials||0);
  s.backtest=out.backtest;s.trials=out.backtest.trials;s.research=(s.research||[]).concat([{ts:Date.now(),added:out.evaluated,params:out.backtest.params}]).slice(-20);
  if(!(await putRun(id,"backtest",{trades:out.trades})))return;
  var g=await autoGates(s);await saveStrategy(s);
  await audit("research_run",id,"Research agent evaluated "+out.evaluated+" combinations for "+s.name+" ("+s.trials+" trials in total); best "+JSON.stringify(out.backtest.params));
  var r=rankFor(s);toast("RESEARCH DONE",esc(s.name)+": score "+(r.score==null?"n/a":r.score.toFixed(0))+(r.eligible?", eligible.":", not eligible: "+esc(r.reasons[0]||"gates pending")),r.eligible?"good":"warn");
}
async function importResults(id,kind,file){
  var s=STR[id],msg=$("#imp-msg");if(msg)msg.textContent="";
  var text=await file.text(),p=parseTradesCsv(text);if(p.err){if(msg)msg.textContent=p.err;return}
  var trialsEl=$("#imp-trials"),trials=trialsEl?Math.max(1,parseInt(trialsEl.value)||1):1;
  if(kind==="backtest"){
    var ds=$("#imp-ds")?$("#imp-ds").value.trim():"";s.backtest=importedBacktest(p.rows,{trials:trials,dataset:ds||"Imported trade list"});s.backtest.verified=!!($("#imp-ver")&&$("#imp-ver").checked&&false);s.trials=trials;
    if(!(await putRun(id,"backtest",{trades:p.rows})))return;var g=await autoGates(s);await saveStrategy(s);await audit("results_imported",id,"Imported "+p.rows.length+" backtest trades for "+s.name+" ("+trials+" trials declared)");
    toast("RESULTS IMPORTED",p.rows.length+" trades"+(p.skipped?", "+p.skipped+" rows skipped":"")+". "+(g.blocked||""),"good");
  }else{
    var m=metricsOf(p.rows);s.forward={kind:"imported",dataset:"Demo account trades",metrics:{full:m},ts:Date.now()};
    if(!(await putRun(id,"forward",{trades:p.rows})))return;await saveStrategy(s);await audit("results_imported",id,"Imported "+p.rows.length+" forward trades for "+s.name);toast("FORWARD RESULTS IMPORTED",p.rows.length+" demo trades.","good");
  }
  renderLab(true);
}
