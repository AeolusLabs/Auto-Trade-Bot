/* 01_core.js: Shared helpers: DOM shortcuts, number formatting, escaping, seeded random numbers. Also loads the real backtest data (DATA) and the seed (SEED). */
var D=__DATA__, SEED=__SEED__;
var $=function(s){return document.querySelector(s)};
var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
function sgn(n,d){return (n>=0?"+":"-")+Math.abs(n).toFixed(d==null?1:d)}
function money(n,d){d=d==null?2:d;return (n<0?"-$":"$")+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})}
function smoney(n){return (n>=0?"+$":"-$")+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
function cls(n){return n>=0?"pos":"neg"}
function cv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
function mkRnd(seed){return function(){seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296}}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function clone(o){return JSON.parse(JSON.stringify(o))}
function rid(){return Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4)}
function fmtTs(ts){var d=new Date(ts);return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0")+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")}
var REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
var S=D.S,T=D.trades,rnd=mkRnd(7);
