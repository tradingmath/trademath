"""Adds ?v=<content hash> to every local .js / .css link in the HTML pages.

Browsers may keep scripts and styles for a long time (that is what makes the site fast). A new ?v= value changes the
address whenever a file changes, so everyone gets the new version at once and old and new files never get mixed.
Run this before every deploy:   python tools/stamp_assets.py
"""
import hashlib, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATTR = re.compile(r'(?P<a>\b(?:src|href)=")(?P<slash>/?)(?P<name>[\w.-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(?P<z>")')
changed = 0
pages = [fn for fn in sorted(os.listdir(ROOT)) if fn.endswith(".html")]
us = os.path.join(ROOT, "us")                                # the US pages live in a folder and use /-rooted asset links
if os.path.isdir(us): pages += ["us/" + fn for fn in sorted(os.listdir(us)) if fn.endswith(".html")]
for fn in pages:
    p = os.path.join(ROOT, fn)
    raw = open(p, encoding="utf-8", newline="").read(); crlf = "\r\n" in raw; s = raw.replace("\r\n", "\n")
    def sub(m):
        f = os.path.join(ROOT, m["name"])
        if not os.path.isfile(f): return m.group(0)
        h = hashlib.sha1(open(f, "rb").read().replace(b"\r\n", b"\n")).hexdigest()[:8]
        return f'{m["a"]}{m["slash"]}{m["name"]}?v={h}{m["z"]}'
    t = ATTR.sub(sub, s)
    if t != s:
        open(p, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n") if crlf else t); changed += 1
print(f"stamped {changed} page(s)")
