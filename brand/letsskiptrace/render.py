#!/usr/bin/env python3
import os, re, subprocess, tempfile
SVG="/home/user/quality-coach-ai/brand/letsskiptrace/svg"
PNG="/home/user/quality-coach-ai/brand/letsskiptrace/png"
os.makedirs(PNG, exist_ok=True)
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
SCALE=3
DARK="#0A0C16"
LIGHT="#EEF0F4"

def backdrop(name):
    # dark-bg logos (white text / white-on-dark gradient)
    if name.endswith("-white") or name.endswith("-gradient") and name!="mark-gradient":
        return DARK
    # ink logos for light backgrounds
    if name.endswith("-ink") or name=="mark-black":
        return LIGHT
    return "transparent"   # mark-gradient, icon

def dims(path):
    s=open(path).read()
    m=re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"',s)
    return float(m.group(1)), float(m.group(2))

for fn in sorted(os.listdir(SVG)):
    if not fn.endswith(".svg"): continue
    name=fn[:-4]
    w,h=dims(os.path.join(SVG,fn))
    pad=24
    W=int(round(w))+pad*2; H=int(round(h))+pad*2
    bg = backdrop(name)
    transparent = (bg=="transparent")
    page_bg = "transparent" if transparent else bg
    html=f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;background:{page_bg}}}
.stage{{width:{W}px;height:{H}px;display:flex;align-items:center;justify-content:center}}
img{{width:{int(round(w))}px;height:{int(round(h))}px;display:block}}
</style></head><body><div class="stage"><img src="file://{SVG}/{fn}"></div></body></html>'''
    hp=os.path.join(tempfile.gettempdir(),f"r_{name}.html")
    open(hp,"w").write(html)
    out=os.path.join(PNG,name+".png")
    cmd=[CHROME,"--headless","--no-sandbox","--disable-gpu","--hide-scrollbars",
         f"--force-device-scale-factor={SCALE}",f"--window-size={W},{H}",
         f"--screenshot={out}","file://"+hp]
    if transparent:
        cmd.insert(1,"--default-background-color=00000000")
    subprocess.run(cmd,capture_output=True)
    print("rendered",name+".png", f"({W}x{H} @{SCALE}x)")
