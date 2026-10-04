/* 06_agents.js: The Agents tab: agent list, identity editor, assigned strategy, lifecycle (archive, duplicate, delete). */
/* ---------- Agents tab: list, identity, strategy intake, lifecycle ---------- */
var ED={id:null,sub:"identity"},NEW=null,PORT={art:"hue",hue:200},EDSIG="";
var TIMEFRAMES=["M1","M3","M5","M15","M30","H1","H4","D1"];
function liveAgents(){return Object.keys(AG).map(function(k){return AG[k]}).filter(function(a){return a.status!=="archived"}).sort(byOrder)}
function archivedAgents(){return Object.keys(AG).map(function(k){return AG[k]}).filter(function(a){return a.status==="archived"}).sort(byOrder)}
function roBanner(){return STORE.canWrite?"":'<div class="ro">This page is read only for you. Ask the owner for Contributor access to add or change agents.</div>'}
function dis(){return STORE.canWrite?"":" disabled"}

function startNewAgent(){
  if(liveAgents().length>=MAX_AGENTS){toast("LIMIT REACHED","An install runs up to "+MAX_AGENTS+" agents. Archive one to add another.","warn");return}
  if(!STORE.canWrite){toast("READ ONLY","You can look but not change agents on this page.","warn");return}
  NEW={name:"",tagline:"",style:"",instruments:[]};PORT={art:"hue",hue:Math.floor(Math.random()*360)};
  ED={id:"new",sub:"identity"};activate("agents");renderAgents(true);setTimeout(function(){var n=$("#f-name");if(n)n.focus()},60);
}
function goAgent(id){if(!AG[id])return;ED={id:id,sub:"identity"};PORT={art:AG[id].art||"hue",hue:AG[id].hue==null?200:AG[id].hue};activate("agents");renderAgents(true)}

function renderAgentList(){
  var live=liveAgents(),arch=archivedAgents();
  function item(a){var c=accentOf(a);return '<button class="ag-item'+(a.status==="archived"?" archived":"")+'" style="--w:'+c+'" data-sel="'+a.id+'" aria-current="'+(ED.id===a.id)+'"><span class="pt">'+artFor(a)+'</span><span style="min-width:0"><div class="nm">'+esc(a.name)+'</div><div class="sb">'+esc(a.status==="archived"?"Archived":stageLabel(a))+'</div></span><span class="chip '+(a.real?"good":a.example?"":"info")+'">'+(a.real?"real":a.example?"example":a.status)+'</span></button>'}
  $("#ag-list").innerHTML='<div class="card-h"><h2>Agents</h2><span class="dim xs">'+live.length+" of "+MAX_AGENTS+'</span></div>'+
   (live.length?live.map(item).join(""):'<p class="dim" style="margin-bottom:10px">None yet.</p>')+
   '<div style="margin-top:12px"><button class="btn" id="ag-add"'+(live.length>=MAX_AGENTS||!STORE.canWrite?" disabled":"")+'>Add agent</button></div>'+
   (arch.length?'<div class="eyebrow" style="margin:16px 0 6px">Archived</div>'+arch.map(item).join(""):"");
}
$("#ag-list").addEventListener("click",function(ev){
  var b=ev.target.closest&&ev.target.closest("button");if(!b)return;
  if(b.id==="ag-add")startNewAgent();else if(b.dataset.sel){ED={id:b.dataset.sel,sub:ED.id===b.dataset.sel?ED.sub:"identity"};var a=AG[ED.id];PORT={art:a.art||"hue",hue:a.hue==null?200:a.hue};renderAgents(true)}
});

function portraitPicker(){
  var ids=["ridge","scout","dusk","ember"],h=PORT.hue;
  return '<div class="field" style="grid-column:1/-1"><span class="lbl">Portrait</span><div class="inl" style="align-items:flex-start;gap:16px"><div id="f-preview" class="portrait" style="--w:'+(PORT.art==="hue"?"oklch(64% 0.13 "+h+")":PRESET_COLOR[PORT.art])+';width:84px;height:84px">'+(PORT.art==="hue"?hueArt(h):ART[PORT.art])+'</div>'+
   '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px"><div class="seg" id="f-art" role="group" aria-label="Portrait style">'+ids.map(function(i){return '<button data-art="'+i+'" aria-pressed="'+(PORT.art===i)+'">'+i[0].toUpperCase()+i.slice(1)+'</button>'}).join("")+'<button data-art="hue" aria-pressed="'+(PORT.art==="hue")+'">Custom colour</button></div>'+
   '<div class="field"><label class="lbl" for="f-hue">Colour (custom)</label><input class="inp" id="f-hue" type="range" min="0" max="359" value="'+h+'" style="padding:0"'+(PORT.art==="hue"?"":" disabled")+'></div></div></div></div>';
}
function refreshPreview(){
  var p=$("#f-preview");if(!p)return;p.style.setProperty("--w",PORT.art==="hue"?"oklch(64% 0.13 "+PORT.hue+")":PRESET_COLOR[PORT.art]);p.innerHTML=PORT.art==="hue"?hueArt(PORT.hue):ART[PORT.art];
  $$("#f-art button").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.art===PORT.art))});var hr=$("#f-hue");if(hr)hr.disabled=PORT.art!=="hue";
}
function parseInstruments(s){return String(s||"").toUpperCase().split(/[\s,;]+/).filter(Boolean)}
function renderIdentity(a){
  var isNew=ED.id==="new",o=isNew?NEW:a;
  return roBanner()+'<div class="form-grid">'+
   '<div class="field"><label class="lbl" for="f-name">Name</label><input class="inp" id="f-name" maxlength="24" value="'+esc(o.name)+'" placeholder="e.g. Ridge"'+dis()+'><span class="err" id="e-name"></span></div>'+
   '<div class="field"><label class="lbl" for="f-tag">Role, in a few words</label><input class="inp" id="f-tag" maxlength="40" value="'+esc(o.tagline)+'" placeholder="e.g. the patient tracker"'+dis()+'></div>'+
   '<div class="field"><label class="lbl" for="f-style">Style</label><input class="inp" id="f-style" maxlength="24" value="'+esc(o.style)+'" placeholder="e.g. Order blocks, Scalper, Trend"'+dis()+'></div>'+
   '<div class="field"><label class="lbl" for="f-inst">Instruments</label><input class="inp mono" id="f-inst" maxlength="80" value="'+esc((o.instruments||[]).join(", "))+'" placeholder="XAUUSD, EURUSD"'+dis()+'><span class="err" id="e-inst"></span></div>'+
   portraitPicker()+'</div>'+
   '<div class="inl" style="margin-top:16px"><button class="btn" id="f-save"'+dis()+'>'+(isNew?"Create agent":"Save identity")+'</button>'+(isNew?'<button class="btn ghost" id="f-cancel">Cancel</button>':"")+'<span class="help" id="f-msg"></span></div>';
}
async function saveIdentity(){
  var isNew=ED.id==="new",name=$("#f-name").value.trim(),inst=parseInstruments($("#f-inst").value),ok=true;
  $("#e-name").textContent="";$("#e-inst").textContent="";
  var dup=liveAgents().some(function(a){return a.name.toLowerCase()===name.toLowerCase()&&a.id!==ED.id});
  if(name.length<2){$("#e-name").textContent="Give the agent a name of at least 2 characters.";ok=false}else if(dup){$("#e-name").textContent="Another agent already has that name.";ok=false}
  var bad=inst.filter(function(s){return !/^[A-Z0-9._]{3,12}$/.test(s)});
  if(bad.length){$("#e-inst").textContent="Use symbols like XAUUSD or EURUSD. Not valid: "+bad.join(", ");ok=false}else if(inst.length>6){$("#e-inst").textContent="At most 6 instruments.";ok=false}
  if(!ok)return;
  if(isNew){
    var id="a"+rid(),a=ensureDefaults({id:id,name:name,tagline:$("#f-tag").value.trim(),style:$("#f-style").value.trim(),instruments:inst,art:PORT.art,hue:PORT.hue,status:"draft",order:Date.now(),createdAt:Date.now()});
    a.strategy.magic=nextMagic();
    if(await saveAgent(a)){await audit("agent_created",id,"Created agent "+name);toast("AGENT CREATED",esc(name)+" is a draft. Add its strategy next.","good");ED={id:id,sub:"strategy"};renderAgents(true)}
  }else{
    var a=AG[ED.id];a.name=name;a.tagline=$("#f-tag").value.trim();a.style=$("#f-style").value.trim();a.instruments=inst;a.art=PORT.art;a.hue=PORT.hue;
    if(await saveAgent(a)){await audit("agent_edited",a.id,"Edited identity of "+name);$("#f-msg").textContent="Saved.";toast("SAVED","Identity of "+esc(name)+" saved.","good")}
  }
}

/* ---------- assigned strategy: pick from the lab's ranked library ---------- */
function renderAssignment(a){
  var cur=strategyOf(a),ranked=rankAll(),reco=recommendation();
  var opts=ranked.map(function(r){return '<option value="'+r.s.id+'"'+(cur&&cur.id===r.s.id?" selected":"")+'>'+esc(r.s.name)+(r.res.score==null?" · no results":" · score "+r.res.score.toFixed(0))+(r.recommended?" · recommended":r.res.eligible?" · eligible":"")+'</option>'}).join("");
  var recoNote=reco&&reco.top&&(!cur||cur.id!==reco.top.s.id)?'<div class="notice" style="margin-bottom:12px"><span><b>Recommended by the research agent:</b> '+esc(reco.top.s.name)+' (score '+reco.top.res.score.toFixed(0)+'). <button class="btn sm" data-asreco="'+reco.top.s.id+'"'+dis()+'>Select it</button></span></div>':"";
  return roBanner()+recoNote+
   (cur?'<div class="card" style="margin-bottom:14px"><div class="card-h"><div class="inl"><h2>'+esc(cur.name)+'</h2>'+srcChip(cur)+'<span class="pill-stage">'+esc(stageLabel(a))+'</span></div><button class="btn sm ghost" data-asopen="'+cur.id+'">Open in the lab</button></div><p class="sec">'+esc(cur.hypothesis||"No hypothesis written.")+'</p>'+(function(){var r=rankFor(cur);return '<div class="inl" style="margin-top:10px"><span class="chip '+(r.eligible?"good":"")+'">'+(r.score==null?"No results yet":"Score "+r.score.toFixed(0)+(r.eligible?" · eligible":""))+'</span></div>'})()+'</div>':'<div class="empty" style="margin-bottom:14px"><h2>No strategy assigned</h2><p>An agent trades one strategy. Pick one from the lab. Assigning an eligible strategy starts its demo forward test on this agent.</p></div>')+
   (ranked.length?'<div class="inl"><label class="lbl" for="as-sel">Strategy</label><select class="sel" id="as-sel" style="max-width:360px"'+dis()+'>'+opts+'</select><button class="btn" id="as-go"'+dis()+'>'+(cur?"Replace strategy":"Assign strategy")+'</button>'+(cur?'<button class="btn ghost" id="as-un"'+dis()+'>Unassign</button>':"")+'</div><div id="as-slot"></div>':'<p class="dim">The lab has no strategies yet. Add one in the Strategy gates tab.</p>')+
   '<div class="kv" style="margin-top:16px"><div><span>Magic number</span><span class="num">'+esc((a.strategy||{}).magic||"not assigned")+'</span></div><div><span>Instruments</span><span class="num">'+esc((a.instruments||[]).join(", ")||"none")+'</span></div></div>';
}

/* ---------- lifecycle ---------- */
function renderLifecycle(a){
  var live=liveAgents().length;
  return roBanner()+'<div class="grid g2e"><div class="card"><h3>Archive</h3><p class="sec" style="margin:6px 0 10px">'+(a.status==="archived"?"Archived agents keep their strategy, rules and history but do not trade or count toward the limit.":"Takes the agent off the pack. Its strategy, rules and history are kept and it can be restored.")+'</p><button class="btn" id="l-arch"'+dis()+(a.status==="archived"&&live>=MAX_AGENTS?" disabled":"")+'>'+(a.status==="archived"?"Restore agent":"Archive agent")+'</button></div>'+
   '<div class="card"><h3>Duplicate</h3><p class="sec" style="margin:6px 0 10px">Copies the identity, hypothesis, parameter bounds and rules. Gates start fresh and no file is copied.</p><button class="btn" id="l-dup"'+dis()+(live>=MAX_AGENTS?" disabled":"")+'>Duplicate agent</button></div></div>'+
   '<div class="card" style="margin-top:14px;border-color:var(--crit)"><h3>Delete permanently</h3><p class="sec" style="margin:6px 0 10px">Removes the agent, its file, rules and gate results. The change log keeps a record. This cannot be undone.</p><div class="inl"><label class="lbl" for="l-name">Type <b class="num" style="color:var(--fg)">'+esc(a.name)+'</b> to confirm</label><input class="inp mono" id="l-name" style="max-width:220px" autocomplete="off"'+dis()+'><button class="btn danger" id="l-del" disabled>Delete</button></div></div>';
}
async function archiveToggle(){var a=AG[ED.id];a.status=a.status==="archived"?"draft":"archived";if(a.status==="draft"&&a.example)a.status="active";if(await saveAgent(a)){await audit(a.status==="archived"?"agent_archived":"agent_restored",a.id,(a.status==="archived"?"Archived ":"Restored ")+a.name);toast(a.status==="archived"?"ARCHIVED":"RESTORED",esc(a.name)+(a.status==="archived"?" is off the pack.":" is back on the pack."),"good");renderAgents(true)}}
async function duplicateAgent(){
  var a=AG[ED.id],id="a"+rid(),c=clone(a);c.id=id;c.name=(a.name+" copy").slice(0,24);c.order=Date.now();c.createdAt=Date.now();c.status="draft";c.real=false;c.example=false;c.strategyId=null;c.strategy={magic:nextMagic(),hypothesis:""};
  if(await saveAgent(c)){await audit("agent_duplicated",id,"Duplicated "+a.name);toast("DUPLICATED",esc(c.name)+" created as a draft with the same rules and no strategy.","good");ED={id:id,sub:"identity"};PORT={art:c.art||"hue",hue:c.hue==null?200:c.hue};renderAgents(true)}
}
async function deleteAgent(){var a=AG[ED.id],n=a.name;if(await removeAgent(a.id)){await audit("agent_deleted",a.id,"Deleted "+n);toast("DELETED",esc(n)+" was removed.","warn");ED={id:null,sub:"identity"};renderAgents(true)}}
async function loadExamples(){
  if(!STORE.canWrite){toast("READ ONLY","You can look but not change anything on this page.","warn");return}
  for(var i=0;i<SEED.strategies.length;i++){var s=ensureStrategy(thaw(SEED.strategies[i]));await saveStrategy(s);var rn=(SEED.runs||{})[s.id];if(rn){for(var k in rn)await putRun(s.id,k,thaw(rn[k]))}}
  for(var j=0;j<SEED.agents.length;j++){await saveAgent(ensureDefaults(thaw(SEED.agents[j])))}
  await audit("examples_loaded","","Loaded the example strategies and agents");toast("EXAMPLES LOADED","Four example strategies and agents are in place.","good");
}

/* ---------- editor shell ---------- */
var RT=0;
async function renderAgents(force){
  var my=++RT;renderAgentList();
  var host=$("#ag-editor"),a=ED.id&&ED.id!=="new"?AG[ED.id]:null,sg=ED.id+"|"+ED.sub+"|"+(a?a.updatedAt:0)+"|"+(a?(a.rules||[]).length:0)+"|"+Object.keys(STR).length;
  if(ED.id&&ED.id!=="new"&&!a){ED={id:null,sub:"identity"};force=true}
  if(!force&&sg===EDSIG)return;EDSIG=sg;
  if(!ED.id){host.innerHTML='<div class="empty"><h2>'+(liveAgents().length?"Pick an agent":"Spin up your first agent")+'</h2><p>An agent trades one strategy under its own risk rules. Choose one on the left, or add a new one.</p><div class="inl" style="justify-content:center;margin-top:14px"><button class="btn" data-newagent="1"'+(STORE.canWrite?"":" disabled")+'>Add agent</button>'+(Object.keys(AG).length?"":'<button class="btn ghost" id="load-examples2">Load the examples</button>')+'</div></div>';return}
  var isNew=ED.id==="new",title=isNew?"New agent":a.name,tabs=[["identity","Identity"],["strategy","Strategy"],["rules","Rules"],["lifecycle","Lifecycle"]];
  var body="";
  if(isNew)body=renderIdentity(null);
  else if(ED.sub==="identity")body=renderIdentity(a);
  else if(ED.sub==="strategy")body=renderAssignment(a);
  else if(ED.sub==="rules")body='<div id="ag-rules-host"></div>';
  else body=renderLifecycle(a);
  host.innerHTML='<div class="card"><div class="card-h"><div class="inl"><h2>'+esc(title)+'</h2>'+(isNew?'<span class="chip info">not created yet</span>':'<span class="chip '+(a.real?"good":a.example?"":"info")+'">'+(a.real?"real strategy":a.example?"example":esc(a.status))+'</span><span class="pill-stage">'+esc(stageLabel(a))+'</span>')+'</div></div>'+
   (isNew?"":'<div class="subtabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" data-sub="'+t[0]+'" aria-selected="'+(ED.sub===t[0])+'">'+t[1]+'</button>'}).join("")+'</div>')+body+'</div>';
  if(!isNew&&ED.sub==="rules")rulesEditor($("#ag-rules-host"),ED.id);
}
$("#ag-editor").addEventListener("click",function(ev){
  var t=ev.target.closest&&ev.target.closest("button");if(!t)return;
  if(t.dataset.sub){ED.sub=t.dataset.sub;renderAgents(true);return}
  if(t.dataset.newagent){startNewAgent();return}
  if(t.dataset.asopen){LAB.id=t.dataset.asopen;LAB.sub="overview";activate("strategy");return}
  if(t.dataset.asreco){var sel=$("#as-sel");if(sel)sel.value=t.dataset.asreco;return}
  if(t.dataset.art){PORT.art=t.dataset.art;refreshPreview();return}
  switch(t.id){
   case"f-save":saveIdentity();break;
   case"f-cancel":ED={id:null,sub:"identity"};NEW=null;renderAgents(true);break;
   case"as-go":assignFlow($("#as-sel").value,ED.id,$("#as-slot"));break;
   case"as-un":unassign(ED.id);break;
   case"l-arch":archiveToggle();break;
   case"l-dup":duplicateAgent();break;
   case"l-del":deleteAgent();break;
   case"load-examples2":loadExamples();break;
  }
});
$("#ag-editor").addEventListener("input",function(ev){
  if(ev.target.id==="f-hue"){PORT.hue=+ev.target.value;refreshPreview()}
  if(ev.target.id==="l-name"){$("#l-del").disabled=ev.target.value.trim()!==AG[ED.id].name||!STORE.canWrite}
});
