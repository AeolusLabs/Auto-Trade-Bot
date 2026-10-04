(async function(){
var out=[],$=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
window.addEventListener("unhandledrejection",function(e){out.push("REJ "+(e.reason&&(e.reason.stack||e.reason.message)||e.reason))});window.addEventListener("error",function(e){out.push("ERR "+e.message)});
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
async function until(fn,ms){for(var i=0;i<(ms||4000)/40;i++){try{if(fn())return true}catch(e){}await sleep(40)}return false}
function ok(name,cond,extra){out.push((cond?"PASS ":"FAIL ")+name+(extra?" :: "+extra:""))}
function setv(el,v){el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
function click(el){el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}))}
function csv(n,seed,pos,withRisk){var r=seed,rows=["fill,exit,side,R"+(withRisk?",entry,stop":"")];function rnd(){r=(r*1664525+1013904223)%4294967296;return r/4294967296}
  for(var i=0;i<n;i++){var d=new Date(Date.UTC(2024,0,1)+i*36e5*40),e=new Date(d.getTime()+36e5*6),R=rnd()<pos?+(0.8+rnd()*1.6).toFixed(2):-+(0.5+rnd()*0.4).toFixed(2);
   rows.push(d.toISOString().slice(0,16).replace("T"," ")+","+e.toISOString().slice(0,16).replace("T"," ")+","+(i%2?"sell":"buy")+","+R+(withRisk?","+(2000+i)+","+(1995+i):""))}
  return rows.join("\n")}
function fileInput(el,name,text){var dt=new DataTransfer();dt.items.add(new File([text],name));if(typeof el==="string")el=$(el);el.files=dt.files;el.dispatchEvent(new Event("change",{bubbles:true}))}
var PY="class RangeStrategy:\n    def on_bar(self, bar):\n        stop = bar.low\n        import subprocess\n        return None\n";
try{
await sleep(600);
ok("four agents render",$$("#row .cell").length===4,String($$("#row .cell").length));
click($('#tabs [data-tab="strategy"]'));await sleep(300);
var rows=$$("#lab-board tr.lbrow");ok("leaderboard has 4 strategies",rows.length===4,String(rows.length));
ok("top strategy is Donchian and recommended",/Donchian/.test(rows[0].textContent)&&/Recommended/.test(rows[0].textContent),rows[0].textContent.slice(0,90));
var sme=rows.filter(function(r){return /SME Baseline/.test(r.textContent)})[0];ok("SME is ranked but not recommended",!!sme&&!/Recommended/.test(sme.textContent)&&/\d/.test($(".num",sme).textContent));
ok("recommendation card offers an agent",/Assign to .*Scout/.test($("#lab-reco").textContent),$("#lab-reco").textContent.slice(0,120));
click(sme);await sleep(250);click($('#lab-detail [data-lsub="ranking"]'));await sleep(300);
ok("ranking tab shows components and reasons",/Edge/.test($("#lab-detail").textContent)&&/best-of-64/.test($("#lab-detail").textContent));
click($('#lab-detail [data-lsub="backtest"]'));await until(function(){return $("#lab-detail svg.eq")});
ok("backtest tab has kpis and chart",$$("#lab-detail .kpis .v").length===8&&!!$("#lab-detail svg.eq"),String($$("#lab-detail .kpis .v").length));
ok("backtest shows 437 trades",/437/.test($("#lab-detail .kpis").textContent));
click($('#lab-detail [data-lsub="forward"]'));await sleep(300);ok("forward tab empty state",/No forward results yet/.test($("#lab-detail").textContent));
fileInput($('[data-impkind="forward"]'),"forward_results.csv",csv(60,9,0.4,false));await until(function(){return $("#lab-detail .kpis")});
ok("forward results imported with kpis",/60/.test(($("#lab-detail .kpis")||{textContent:""}).textContent)&&/of 150/.test($("#lab-detail").textContent));
ok("forward compared with backtest",/Forward against backtest/.test($("#lab-detail").textContent));
click($('#lab-board tr.lbrow'));await sleep(300);
var rb=$("[data-assign]",$("#lab-reco"));ok("assign button present",!!rb);click(rb);await until(function(){return /Scout/.test($("#lab-board").textContent)});await sleep(200);
ok("Donchian assigned to Scout",/Scout/.test($("#lab-board").textContent));
click($("#lab-add-btn"));await sleep(150);click($('#lab-add [data-am="manual"]'));await sleep(100);
setv($("#a-name"),"Fast RSI fade");setv($("#a-inst"),"xauusd");
click($("#a-save"));await until(function(){return $$("#lab-board tr.lbrow").length===5&&$("#lab-detail svg.eq")},8000);
ok("manual strategy added and researched",$$("#lab-board tr.lbrow").length===5&&/Fast RSI fade/.test($("#lab-detail").textContent)&&!!$("#lab-detail svg.eq"),String($$("#lab-board tr.lbrow").length));
ok("research agent recorded trials",/trial/.test($("#lab-detail").textContent));
click($('#lab-detail [data-lsub="gates"]'));await sleep(300);ok("gates computed from results",$$(".stg",$("#lab-gates")).length===6&&/Passed|of \d met/.test($("#lab-gates").textContent));
click($("#lab-add-btn"));await sleep(150);
ok("add form is open",!!$("#a-name"));
setv($("#a-name"),"Range scalper");setv($("#a-inst"),"EURUSD");setv($("#a-hyp"),"Price mean-reverts inside the Asian range, so fading the edges pays.");
fileInput("#a-file","range.py",PY);await until(function(){return $$("#lab-add .lint li").length>=3});
ok("file reviewed before saving",$$("#lab-add .lint li").length>=3&&/shell/.test($("#lab-add").textContent),$("#lab-add").textContent.slice(0,200));
click($("#a-save"));await until(function(){return $$("#lab-board tr.lbrow").length===6},4000);
var rs=$$("#lab-board tr.lbrow").filter(function(r){return /Range scalper/.test(r.textContent)})[0];ok("file strategy listed as needing results",!!rs&&/Needs results/.test(rs.textContent));
click($('#lab-detail [data-lsub="backtest"]'));await sleep(300);
setv($("#imp-trials"),"12");fileInput('[data-impkind="backtest"]',"bt.csv",csv(240,3,0.45,true));await until(function(){return $("#lab-detail svg.eq")});
ok("imported backtest ranked",!!$("#lab-detail svg.eq")&&/Imported, unverified/.test($("#lab-detail").textContent));
rs=$$("#lab-board tr.lbrow").filter(function(r){return /Range scalper/.test(r.textContent)})[0];ok("score shown for imported strategy",/\d+/.test($(".num",rs).textContent)&&!/Needs results/.test(rs.textContent));
click($("#ld-clear-bt"));await until(function(){return $('[data-impkind="backtest"]')});fileInput('[data-impkind="backtest"]',"bad.csv","a,b\n1,2\n3,4");await until(function(){return $("#imp-msg")&&$("#imp-msg").textContent});
ok("bad CSV explained",/No R column/.test($("#imp-msg").textContent),$("#imp-msg").textContent);
fileInput('[data-impkind="backtest"]',"bt.csv",csv(240,3,0.45,true));await until(function(){return $("#lab-detail svg.eq")});
click($('#tabs [data-tab="agents"]'));await sleep(150);
var dk=$$("#ag-list .ag-item").filter(function(i){return /Dusk/.test(i.textContent)})[0];click(dk);await sleep(150);click($('#ag-editor [data-sub="strategy"]'));await sleep(200);
setv($("#as-sel"),$$("#as-sel option").filter(function(o){return /EMA/.test(o.textContent)})[0].value);click($("#as-go"));await sleep(150);
ok("non-eligible assignment needs an override",!!$("#ov-go")&&$("#ov-go").disabled);
setv($("#ov-why"),"Testing the override path");setv($("#ov-word"),"OVERRIDE");ok("override enabled after typing",!$("#ov-go").disabled);click($("#ov-go"));await until(function(){return /EMA crossover/.test($("#ag-editor").textContent)});
ok("override assigned",/EMA crossover/.test($("#ag-editor").textContent));
click($('#ag-editor [data-sub="rules"]'));await sleep(250);ok("rules editor present",$$("#ag-rules-host tr[data-ri]").length===10);
click($('#tabs [data-tab="strategy"]'));await sleep(300);
var rr=$$("#lab-board tr.lbrow").filter(function(r){return /Fast RSI fade/.test(r.textContent)})[0];click(rr);await sleep(300);
setv($("#ld-name"),"Fast RSI fade");ok("delete needs the name",!$("#ld-del").disabled);click($("#ld-del"));await until(function(){return !$$("#lab-board tr.lbrow").some(function(r){return /Fast RSI fade/.test(r.textContent)})});
ok("strategy deleted",!$$("#lab-board tr.lbrow").some(function(r){return /Fast RSI fade/.test(r.textContent)}));
var dn=$$("#lab-board tr.lbrow").filter(function(r){return /Donchian/.test(r.textContent)})[0];click(dn);await sleep(300);ok("assigned strategy cannot be archived",$("#ld-arch").disabled);
click($("#lab-add-btn"));await sleep(120);click($('#lab-add [data-am="idea"]'));await sleep(80);setv($("#a-name"),'<img src=x onerror=window.__pwn=1>');setv($("#a-inst"),"XAUUSD");setv($("#a-hyp"),"Hypothesis long enough to pass.");click($("#a-save"));await sleep(400);
ok("markup in strategy names is escaped",!window.__pwn&&!$("#lab-board img[src=x]")&&!$("#lab-detail img[src=x]"));
click($('#tabs [data-tab="control"]'));await sleep(150);ok("change log has entries",$$("#audit tr").length>12,String($$("#audit tr").length));
}catch(e){out.push("ERROR "+e.message+" "+(e.stack||"").split("\n").slice(0,3).join(" | "))}
var pre=document.createElement("pre");pre.id="selftest";pre.textContent=out.join("\n");document.body.appendChild(pre);
})();
