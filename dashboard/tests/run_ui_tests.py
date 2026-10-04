"""
Click-through test of the built dashboard in headless Chrome or Edge. Exit code 1 if any check fails.

    python dashboard/build.py
    python dashboard/tests/run_ui_tests.py

It copies dist/auto-trade-bot.html, appends ui_selftest.js (which clicks through tabs, assigns, overrides, deletes, imports files...), loads it, and reads the results.
"""
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from responsive_check import find_chrome  # noqa: E402


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    html = open(os.path.join(HERE, "..", "dist", "auto-trade-bot.html"), encoding="utf-8").read()
    test = open(os.path.join(HERE, "ui_selftest.js"), encoding="utf-8").read()
    page = html.replace("</body>", "<script>" + test + "</script></body>")
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(page)
        path = f.name
    try:
        res = subprocess.run([find_chrome(), "--headless=new", "--disable-gpu", "--virtual-time-budget=120000", "--dump-dom", "file:///" + path.replace("\\", "/")],
                             capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    finally:
        os.unlink(path)
    m = re.search(r'<pre id="selftest">(.*?)</pre>', res.stdout, re.S)
    if not m:
        raise SystemExit("The browser returned no test result.")
    lines = [l.replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&") for l in m.group(1).split("\n")]
    print("\n".join(lines))
    fails = [l for l in lines if not l.startswith("PASS")]
    print("\n%d checks, %d not passing" % (len(lines), len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
