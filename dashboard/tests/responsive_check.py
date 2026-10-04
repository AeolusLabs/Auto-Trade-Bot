"""
Responsive check: loads the built dashboard in iframes of phone, tablet and desktop widths and reports anything that sticks out past the right edge.

    python dashboard/tests/responsive_check.py              # table of widths x tabs, exit code 1 if anything overflows
    python dashboard/tests/responsive_check.py --shots      # also saves screenshots to dashboard/tests/shots/

Needs Google Chrome or Microsoft Edge (set CHROME=path to use another browser). An iframe's width is what its media queries see,
so this tests 320 px phones even though a desktop browser window cannot get that narrow.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "..", "dist", "auto-trade-bot.html")
WIDTHS = [320, 360, 390, 414, 600, 768, 820, 1024, 1280, 1440, 1920]
TABS = ["pack", "agents", "record", "trading", "stats", "risk", "strategy", "control"]

HARNESS = r"""<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222">
<script>
var HTML=__HTML__,WIDTHS=__WIDTHS__,TABS=__TABS__,ONLY=__ONLY__,out=[];
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function scrollers(el,doc){for(var p=el.parentElement;p&&p!==doc.body&&p!==doc.documentElement;p=p.parentElement){var o=doc.defaultView.getComputedStyle(p).overflowX;if(o==="auto"||o==="scroll"||o==="hidden"||o==="clip")return true}return false}
function name(e){return e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+(e.className&&typeof e.className==="string"?"."+e.className.trim().split(/\s+/).slice(0,2).join("."):"")}
async function run(){
  for(var wi=0;wi<WIDTHS.length;wi++){
    var w=WIDTHS[wi];if(ONLY&&ONLY.w&&ONLY.w!==w)continue;
    var f=document.createElement("iframe");f.style.cssText="display:block;margin:0 auto;border:0;background:#000;width:"+w+"px;height:"+(ONLY?ONLY.h:900)+"px";f.srcdoc=HTML;document.body.appendChild(f);
    await new Promise(function(r){f.onload=r});await sleep(900);
    var d=f.contentDocument,de=d.documentElement;
    for(var ti=0;ti<TABS.length;ti++){
      var t=TABS[ti];if(ONLY&&ONLY.tab&&ONLY.tab!==t)continue;
      d.querySelector('#tabs [data-tab="'+t+'"]').click();await sleep(450);
      var cw=de.clientWidth,bad=[];
      [].slice.call(d.querySelectorAll("body *")).forEach(function(e){
        var r=e.getBoundingClientRect();if(r.width===0||r.height===0)return;
        if(r.right>cw+1&&!scrollers(e,d)){var cs=d.defaultView.getComputedStyle(e);if(cs.position==="fixed")return;bad.push(name(e)+" right="+Math.round(r.right))}
      });
      out.push({w:w,tab:t,cw:cw,sw:de.scrollWidth,bad:bad.slice(0,4),n:bad.length});
    }
    if(!ONLY)f.remove();
  }
  var pre=document.createElement("pre");pre.id="result";pre.textContent=JSON.stringify(out);document.body.appendChild(pre);document.body.setAttribute("data-done","1");
}
run();
</script>"""


def find_chrome():
    cands = [os.environ.get("CHROME"), r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
             r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
             "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    for c in cands:
        if c and os.path.exists(c):
            return c
    raise SystemExit("No Chrome or Edge found. Set the CHROME environment variable to its path.")


def harness(only=None):
    html = open(DIST, encoding="utf-8").read()
    return (HARNESS.replace("__HTML__", json.dumps(html).replace("</", "<" + chr(92) + "/")).replace("__WIDTHS__", json.dumps(WIDTHS)).replace("__TABS__", json.dumps(TABS))
            .replace("__ONLY__", json.dumps(only)))


def run_browser(chrome, page, extra):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(page)
        path = f.name
    try:
        return subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars"] + extra + ["file:///" + path.replace("\\", "/")],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600), path
    finally:
        pass


def check():
    chrome = find_chrome()
    res, path = run_browser(chrome, harness(), ["--virtual-time-budget=400000", "--window-size=1500,1000", "--dump-dom"])
    os.unlink(path)
    m = re.search(r'<pre id="result">(.*?)</pre>', res.stdout, re.S)
    if not m:
        raise SystemExit("The browser returned no result.")
    rows = json.loads(m.group(1).replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&"))
    bad = [r for r in rows if r["n"]]
    if "--verbose" in sys.argv:
        for r in rows:
            print("  %4dpx %-9s client=%d scroll=%d offenders=%d" % (r["w"], r["tab"], r["cw"], r["sw"], r["n"]))
    print("%d widths x %d tabs checked" % (len(WIDTHS), len(TABS)))
    for r in bad:
        print("  OVERFLOW %4dpx  %-9s %s" % (r["w"], r["tab"], "; ".join(r["bad"])))
    print("clean" if not bad else "%d combinations overflow" % len(bad))
    return 1 if bad else 0


def shots():
    chrome = find_chrome()
    out = os.path.join(HERE, "shots")
    os.makedirs(out, exist_ok=True)
    for w, tab, h in [(390, "pack", 2400), (390, "strategy", 2600), (768, "pack", 2000), (768, "strategy", 2200), (1280, "strategy", 1800)]:
        page = harness({"w": w, "tab": tab, "h": h})
        win = max(w + 40, 600)
        res, path = run_browser(chrome, page, ["--virtual-time-budget=30000", "--window-size=%d,%d" % (win, min(h, 3000)), "--screenshot=" + os.path.join(out, "%s_%d.png" % (tab, w))])
        os.unlink(path)
        print("saved", "%s_%d.png" % (tab, w))


if __name__ == "__main__":
    code = check()
    if "--shots" in sys.argv:
        shots()
    sys.exit(code)
