/* 07_rules.js: The risk rules editor, used by the Risk and rules tab and by each agent. Tightening applies at once; loosening needs a reason; required rules need typed confirmation to remove. */
/* ---------- risk rules editor (used by the Risk and rules tab and by each agent's Rules sub-tab) ---------- */
var RS_SCOPE="pack";
function rulesFor(scope){return scope==="pack"?packRules():(AG[scope]?AG[scope].rules:[])}
function persistRules(scope){return scope==="pack"?savePackSet():saveAgent(AG[scope])}
function scopeName(scope){return scope==="pack"?"the whole pack":(AG[scope]?AG[scope].name:"")}
function isLoosening(t,oldV,newV){var rt=RULE_TYPES[t];return rt.tighter==="lower"?newV>oldV:newV<oldV}
function rulesEditor(host,scope){
  if(!host)return;
  var rules=rulesFor(scope),a=scope==="pack"?null:AG[scope],miss=a?missingRequired(a):REQUIRED_RULES.filter(function(t){return !rules.some(function(r){return r.t===t})});
  var types=scope==="pack"?PACK_RULE_TYPES:Object.keys(RULE_TYPES),have=rules.map(function(r){return r.t}),avail=types.filter(function(t){return have.indexOf(t)<0});
  var rows=rules.map(function(r,i){var rt=RULE_TYPES[r.t],req=REQUIRED_RULES.indexOf(r.t)>=0;
    return '<tr data-ri="'+i+'"><td style="white-space:normal;min-width:190px"><div style="font-weight:500">'+rt.label+(req?' <span class="chip" style="margin-left:4px">required</span>':"")+'</div><div class="help">'+rt.help+'</div></td>'+
     '<td class="vcell"><input class="inp mono" data-rv type="number" min="'+rt.min+'" max="'+rt.max+'" step="'+rt.step+'" value="'+r.v+'" aria-label="'+rt.label+'"'+dis()+'></td><td class="dim">'+rt.unit+'</td><td class="sec" style="white-space:normal;min-width:160px">'+rt.action+'</td><td class="dim num">'+(r.at?fmtTs(r.at):"default")+'</td>'+
     '<td class="acell"><div class="rowact"><button class="btn sm" data-rsave'+dis()+'>Save</button><button class="btn sm ghost" data-rdel'+dis()+'>Remove</button></div></td></tr>'}).join("");
  var locked=LOCKED_RULES.map(function(l){return '<tr class="locked-row"><td style="white-space:normal"><div>🔒 '+l[0]+'</div><div class="help">'+l[1]+'</div></td><td colspan="4">Enforced in code. Not editable here.</td><td></td></tr>'}).join("");
  host.dataset.scope=scope;
  host.innerHTML='<div class="card"><div class="card-h"><h2>Rules for '+esc(scopeName(scope))+'</h2><span class="chip '+(miss.length?"warn":"good")+'">'+(miss.length?"▲ "+miss.length+" required missing":"✓ required rules in place")+'</span></div>'+
   (STORE.canWrite?"":'<div class="ro">Read only: you can look but not change rules.</div>')+
   (miss.length?'<div class="ro">Missing required rules: '+miss.map(function(t){return RULE_TYPES[t].label}).join(", ")+'. An agent cannot start Micro-live without them.</div>':"")+
   '<div class="tw"><table class="rtable"><tr><th>Rule</th><th>Value</th><th>Unit</th><th>At breach</th><th>Changed</th><th></th></tr>'+(rows||'<tr><td colspan="6" class="dim">No rules yet.</td></tr>')+locked+'</table></div>'+
   '<div class="inl" style="margin-top:14px"><label class="lbl" for="r-add-'+scope+'">Add a rule</label><select class="sel" data-radd-sel style="width:auto;min-width:200px"'+(avail.length&&STORE.canWrite?"":" disabled")+'>'+(avail.length?avail.map(function(t){return '<option value="'+t+'">'+RULE_TYPES[t].label+"</option>"}).join(""):"<option>Every rule type is in use</option>")+'</select><button class="btn" data-radd'+(avail.length&&STORE.canWrite?"":" disabled")+'>Add rule</button></div>'+
   '<p class="help" style="margin-top:10px">'+(scope==="pack"?"Pack rules cap the whole install. Where a pack rule and an agent rule overlap, the stricter one applies. ":"")+'Tightening a limit applies at once. Loosening one needs a reason. Every change is written to the change log.</p></div>';
  if(!host.dataset.bound){host.dataset.bound="1";host.addEventListener("click",ruleClick)}
}
function rowCtx(el){var tr=el.closest("tr[data-ri]");var host=el.closest("[data-scope]");return {tr:tr,host:host,scope:host.dataset.scope,i:tr?+tr.dataset.ri:-1}}
function dropConfirm(host){var c=host.querySelector(".inline-confirm");if(c)c.remove()}
async function applyRule(scope,i,newV,note){
  var r=rulesFor(scope)[i],rt=RULE_TYPES[r.t],old=r.v;r.v=newV;r.at=Date.now();
  if(await persistRules(scope)){await audit("rule_changed",scope==="pack"?"":scope,rt.label+" for "+scopeName(scope)+": "+old+" to "+newV+" "+rt.unit+(note||""));toast("RULE SAVED",rt.label+": "+newV+" "+rt.unit,"good");refreshRulesUI()}
}
async function ruleClick(ev){
  var b=ev.target.closest&&ev.target.closest("button");if(!b)return;var c=rowCtx(b),host=c.host,scope=c.scope;
  if(b.hasAttribute("data-rsave")){
    var r=rulesFor(scope)[c.i],rt=RULE_TYPES[r.t],inp=c.tr.querySelector("[data-rv]"),v=parseFloat(inp.value);dropConfirm(host);inp.removeAttribute("aria-invalid");
    if(isNaN(v)||v<rt.min||v>rt.max){inp.setAttribute("aria-invalid","true");toast("OUT OF RANGE",rt.label+" must be between "+rt.min+" and "+rt.max+" "+rt.unit+".","warn");return}
    if(v===r.v)return;
    if(!isLoosening(r.t,r.v,v)){applyRule(scope,c.i,v,"");return}
    var cf=document.createElement("tr");cf.className="inline-confirm";cf.innerHTML='<td colspan="6"><div class="box"><b>This loosens '+rt.label+' from '+r.v+' to '+v+' '+rt.unit+', so the agent can take more risk.</b><div class="inl"><label class="lbl" for="rl-why">Reason</label><input class="inp" id="rl-why" data-why maxlength="120" placeholder="Why is this safe?" style="max-width:380px"></div><label class="inl help"><input type="checkbox" data-ack> I understand this raises the risk this agent can take.</label><div class="inl"><button class="btn danger sm" data-rconfirm disabled>Loosen the limit</button><button class="btn sm ghost" data-rcancel>Cancel</button></div></div></td>';
    c.tr.after(cf);var why=cf.querySelector("[data-why]"),ack=cf.querySelector("[data-ack]"),go=cf.querySelector("[data-rconfirm]");function chk(){go.disabled=why.value.trim().length<5||!ack.checked}why.oninput=chk;ack.onchange=chk;why.focus();
    cf.dataset.i=c.i;cf.dataset.v=v;return;
  }
  if(b.hasAttribute("data-rconfirm")){var cfr=b.closest(".inline-confirm");var i2=+cfr.dataset.i,v2=parseFloat(cfr.dataset.v),why2=cfr.querySelector("[data-why]").value.trim();applyRule(scope,i2,v2," (loosened: "+why2+")");return}
  if(b.hasAttribute("data-rcancel")){dropConfirm(host);refreshRulesUI();return}
  if(b.hasAttribute("data-rdel")){
    var r3=rulesFor(scope)[c.i],rt3=RULE_TYPES[r3.t],req=REQUIRED_RULES.indexOf(r3.t)>=0;dropConfirm(host);
    var cf3=document.createElement("tr");cf3.className="inline-confirm crit";cf3.innerHTML='<td colspan="6"><div class="box"><b>Remove '+rt3.label+'?</b>'+(req?'<span class="help">This is a required rule. Without it the agent cannot start Micro-live. Type REMOVE to confirm.</span><div class="inl"><input class="inp mono" data-word style="max-width:160px" aria-label="Type REMOVE"></div>':'<span class="help">The agent will no longer enforce it.</span>')+'<div class="inl"><button class="btn danger sm" data-rdelok'+(req?" disabled":"")+'>Remove rule</button><button class="btn sm ghost" data-rcancel>Cancel</button></div></div></td>';
    c.tr.after(cf3);cf3.dataset.i=c.i;var w=cf3.querySelector("[data-word]");if(w){w.oninput=function(){cf3.querySelector("[data-rdelok]").disabled=w.value.trim()!=="REMOVE"};w.focus()}return;
  }
  if(b.hasAttribute("data-rdelok")){
    var cf4=b.closest(".inline-confirm"),i4=+cf4.dataset.i,rules=rulesFor(scope),gone=rules[i4];rules.splice(i4,1);
    if(await persistRules(scope)){await audit("rule_removed",scope==="pack"?"":scope,"Removed "+RULE_TYPES[gone.t].label+" from "+scopeName(scope));toast("RULE REMOVED",RULE_TYPES[gone.t].label+" removed.","warn");refreshRulesUI()}
    return;
  }
  if(b.hasAttribute("data-radd")){
    var sel=host.querySelector("[data-radd-sel]"),t=sel.value;if(!RULE_TYPES[t])return;
    rulesFor(scope).push({t:t,v:RULE_TYPES[t].def,at:Date.now()});
    if(await persistRules(scope)){await audit("rule_added",scope==="pack"?"":scope,"Added "+RULE_TYPES[t].label+" ("+RULE_TYPES[t].def+" "+RULE_TYPES[t].unit+") to "+scopeName(scope));toast("RULE ADDED",RULE_TYPES[t].label+" added at its default.","good");refreshRulesUI()}
  }
}
function refreshRulesUI(){renderRulesTab(true);if(ED.sub==="rules"&&ED.id&&AG[ED.id])rulesEditor($("#ag-rules-host"),ED.id)}
function setRulesScope(s){RS_SCOPE=s;renderRulesTab(true)}
function renderRulesTab(force){
  var sel=$("#rules-scope"),opts=[["pack","Pack-wide rules"]].concat(liveAgents().map(function(a){return [a.id,a.name]}));
  if(!AG[RS_SCOPE]&&RS_SCOPE!=="pack")RS_SCOPE="pack";
  var sig=opts.map(function(o){return o[0]+o[1]}).join("|");
  if(sel.dataset.sig!==sig){sel.dataset.sig=sig;sel.innerHTML=opts.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+"</option>"}).join("")}
  sel.value=RS_SCOPE;
  var host=$("#rules-host");if(!force&&host.contains(document.activeElement)&&host.dataset.scope===RS_SCOPE)return;
  rulesEditor(host,RS_SCOPE);
}
$("#rules-scope").onchange=function(){RS_SCOPE=this.value;renderRulesTab(true)};
