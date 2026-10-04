"""
Build the dashboard into one self-contained HTML file.

    python dashboard/build.py

Output: dashboard/dist/auto-trade-bot.html  (open it in a browser; no server, no packages)

It stitches together, in this order: styles (src/styles), page markup (src/index.body.html), and the scripts (src/js, numbered files in order),
and fills three placeholders in the scripts with the JSON in src/data: __DATA__ (track record), __SEED__ (starter strategies and agents), __BARS__ (candles).
To regenerate src/data from the repository's own files, see dashboard/README.md.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
DIST = os.path.join(HERE, "dist")


def read(*parts):
    with open(os.path.join(SRC, *parts), encoding="utf-8") as f:
        return f.read()


def build():
    js_files = sorted(n for n in os.listdir(os.path.join(SRC, "js")) if n.endswith(".js"))
    js = "\n".join(read("js", n) for n in js_files)
    for placeholder, name in (("__DATA__", "data.json"), ("__SEED__", "seed.json"), ("__BARS__", "bars.json")):
        if placeholder not in js:
            raise SystemExit("placeholder %s not found in the scripts" % placeholder)
        js = js.replace(placeholder, read("data", name).strip())
    css = read("styles", "base.css") + read("styles", "extra.css")
    page = ('<title>Auto Trade Bot</title>\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">\n'
            "<style>" + css + "</style>\n" + read("index.body.html") + "\n<script>\n(function(){\n" + js + "\n})();\n</script>\n")
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "auto-trade-bot.html")
    with open(out, "w", encoding="utf-8") as f:
        # a complete document, so it opens straight from disk
        f.write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"></head><body>\n' + page + "</body></html>\n")
    print("built %s (%.0f KB, %d scripts)" % (out, os.path.getsize(out) / 1024, len(js_files)))
    return out


if __name__ == "__main__":
    build()
