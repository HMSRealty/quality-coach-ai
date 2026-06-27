#!/usr/bin/env python3
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = "SpaceGrotesk-Bold.ttf"
OUT  = "/home/user/quality-coach-ai/brand/letsskiptrace/svg"
os.makedirs(OUT, exist_ok=True)

f = TTFont(FONT)
upm = f["head"].unitsPerEm
cap = f["OS/2"].sCapHeight           # 700
cmap = f.getBestCmap()
gs = f.getGlyphSet()
hmtx = f["hmtx"]

CAP_H = 84.0
SCALE = CAP_H / cap                   # 0.12

def seg_path(text, x_start=0.0, baseline=0.0):
    """Return (path_d, end_x). Caps sit above baseline; y flipped to SVG."""
    x = x_start
    sink = SVGPathPen(gs)
    for ch in text:
        g = cmap[ord(ch)]
        # matrix: a, b, c, d, e, f  -> x'=a*x+c*y+e ; y'=b*x+d*y+f
        tp = TransformPen(sink, (SCALE, 0, 0, -SCALE, x, baseline))
        gs[g].draw(tp)
        x += hmtx[g][0] * SCALE
    return sink.getCommands(), x

def width(text):
    return sum(hmtx[cmap[ord(c)]][0] for c in text) * SCALE

GRAD_BL = '#4F72FF'   # blue
GRAD_CY = '#00D4FF'   # cyan
DARK    = '#0A0C16'

def mark_body(stroke, fill):
    return f'''  <circle cx="32" cy="32" r="22" fill="none" stroke="{stroke}" stroke-width="2" opacity="0.35"/>
  <circle cx="32" cy="32" r="14" fill="none" stroke="{stroke}" stroke-width="3.2"/>
  <circle cx="32" cy="32" r="5" fill="{fill}"/>
  <g stroke="{stroke}" stroke-width="3.2" stroke-linecap="round">
    <line x1="32" y1="18" x2="32" y2="7"/>
    <line x1="46" y1="32" x2="57" y2="32"/>
  </g>'''

def grad_def(gid, x1, y1, x2, y2):
    return (f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{GRAD_BL}"/>'
            f'<stop offset="1" stop-color="{GRAD_CY}"/></linearGradient>')

def write(name, svg):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(svg)
    print("wrote", name)

# ---------- MARKS ----------
def mark_svg(stroke, fill, gid=None, gdef=""):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="LETSSKIPTRACE mark">
{('  <defs>'+gdef+'</defs>') if gdef else ''}
{mark_body(stroke, fill)}
</svg>
'''

gdef_mark = grad_def("lst", 6, 58, 58, 6)
write("mark-gradient.svg", mark_svg("url(#lst)","url(#lst)", gdef=gdef_mark))
write("mark-white.svg",    mark_svg("#FFFFFF","#FFFFFF"))
write("mark-black.svg",    mark_svg(DARK,DARK))

# ---------- APP ICON ----------
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="LETSSKIPTRACE app icon">
  <defs>{grad_def("lst",24,232,232,24)}</defs>
  <rect width="256" height="256" rx="56" fill="{DARK}"/>
  <g transform="translate(128,128) scale(2.6) translate(-32,-32)">
{mark_body("url(#lst)","url(#lst)")}
  </g>
</svg>
'''
write("icon.svg", icon)

# ---------- WORDMARK ----------
W = width("LETSSKIPTRACE")
Wskip = width("LETSSKIP")
PAD = 6
bl = PAD + CAP_H
H = CAP_H + 2*PAD
vbW = round(W + 2*PAD, 1)

d_full,_  = seg_path("LETSSKIPTRACE", PAD, bl)
d_skip,_  = seg_path("LETSSKIP", PAD, bl)
d_trace,_ = seg_path("TRACE", PAD+Wskip, bl)

wm_white = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW} {H}" width="{vbW}" height="{H}" role="img" aria-label="LETSSKIPTRACE">
  <path d="{d_full}" fill="#FFFFFF"/>
</svg>
'''
write("wordmark-white.svg", wm_white)

g_x1 = PAD+Wskip
wm_two = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW} {H}" width="{vbW}" height="{H}" role="img" aria-label="LETSSKIPTRACE">
  <defs>{grad_def("lst", round(g_x1,1), bl, round(PAD+W,1), PAD)}</defs>
  <path d="{d_skip}" fill="#FFFFFF"/>
  <path d="{d_trace}" fill="url(#lst)"/>
</svg>
'''
write("wordmark-twotone.svg", wm_two)

# ---------- HORIZONTAL LOCKUP ----------
# mark height 104 (scale 1.625), caps 84 centered on mark center (52)
MARK_S = 1.625
MARK_H = 64*MARK_S            # 104
GAP = 32
caps_top = (MARK_H - CAP_H)/2 # 10
hb = caps_top + CAP_H         # baseline 94
wx = MARK_H + GAP             # wordmark x start
hvbW = round(wx + W, 1)
hH = round(MARK_H,1)

hd_full,_  = seg_path("LETSSKIPTRACE", wx, hb)
hd_skip,_  = seg_path("LETSSKIP", wx, hb)
hd_trace,_ = seg_path("TRACE", wx+Wskip, hb)

def mark_group(s, stroke, fill):
    return f'  <g transform="scale({s})">\n{mark_body(stroke,fill)}\n  </g>'

hl_white = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {hvbW} {hH}" width="{hvbW}" height="{hH}" role="img" aria-label="LETSSKIPTRACE">
{mark_group(MARK_S, "#FFFFFF", "#FFFFFF")}
  <path d="{hd_full}" fill="#FFFFFF"/>
</svg>
'''
write("lockup-horizontal-white.svg", hl_white)

hl_grad = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {hvbW} {hH}" width="{hvbW}" height="{hH}" role="img" aria-label="LETSSKIPTRACE">
  <defs>
    {grad_def("lstMark", 6*MARK_S, 58*MARK_S, 58*MARK_S, 6*MARK_S)}
    {grad_def("lstWord", round(wx+Wskip,1), hb, round(wx+W,1), round(hb-CAP_H,1))}
  </defs>
  <g transform="scale({MARK_S})">
{mark_body("url(#lstMark)","url(#lstMark)")}
  </g>
  <path d="{hd_skip}" fill="#FFFFFF"/>
  <path d="{hd_trace}" fill="url(#lstWord)"/>
</svg>
'''
write("lockup-horizontal-gradient.svg", hl_grad)

# ---------- VERTICAL LOCKUP ----------
VS = 2.0
VMARK = 64*VS                 # 128
VGAP = 28
vcaps_top = VMARK + VGAP      # 156
vb = vcaps_top + CAP_H        # 240
vBpad = 6
vvbW = round(W,1)
vvbH = round(vb + vBpad,1)
mark_x = round(vvbW/2 - VMARK/2,1)   # center mark

vd_full,_  = seg_path("LETSSKIPTRACE", 0, vb)
vd_skip,_  = seg_path("LETSSKIP", 0, vb)
vd_trace,_ = seg_path("TRACE", Wskip, vb)

vl_white = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vvbW} {vvbH}" width="{vvbW}" height="{vvbH}" role="img" aria-label="LETSSKIPTRACE">
  <g transform="translate({mark_x},0) scale({VS})">
{mark_body("#FFFFFF","#FFFFFF")}
  </g>
  <path d="{vd_full}" fill="#FFFFFF"/>
</svg>
'''
write("lockup-vertical-white.svg", vl_white)

vl_grad = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vvbW} {vvbH}" width="{vvbW}" height="{vvbH}" role="img" aria-label="LETSSKIPTRACE">
  <defs>
    {grad_def("lstMark", 6*VS, 58*VS, 58*VS, 6*VS)}
    {grad_def("lstWord", round(Wskip,1), vb, round(W,1), round(vb-CAP_H,1))}
  </defs>
  <g transform="translate({mark_x},0) scale({VS})">
{mark_body("url(#lstMark)","url(#lstMark)")}
  </g>
  <path d="{vd_skip}" fill="#FFFFFF"/>
  <path d="{vd_trace}" fill="url(#lstWord)"/>
</svg>
'''
write("lockup-vertical-gradient.svg", vl_grad)

# ---------- INK (dark) VARIANTS for light backgrounds ----------
# wordmark all-ink
wm_ink = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW} {H}" width="{vbW}" height="{H}" role="img" aria-label="LETSSKIPTRACE">
  <path d="{d_full}" fill="{DARK}"/>
</svg>
'''
write("wordmark-ink.svg", wm_ink)

# horizontal lockup: ink wordmark (LETSSKIP) + gradient TRACE + gradient mark
hl_ink = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {hvbW} {hH}" width="{hvbW}" height="{hH}" role="img" aria-label="LETSSKIPTRACE">
  <defs>
    {grad_def("lstMark", 6*MARK_S, 58*MARK_S, 58*MARK_S, 6*MARK_S)}
    {grad_def("lstWord", round(wx+Wskip,1), hb, round(wx+W,1), round(hb-CAP_H,1))}
  </defs>
  <g transform="scale({MARK_S})">
{mark_body("url(#lstMark)","url(#lstMark)")}
  </g>
  <path d="{hd_skip}" fill="{DARK}"/>
  <path d="{hd_trace}" fill="url(#lstWord)"/>
</svg>
'''
write("lockup-horizontal-ink.svg", hl_ink)

# vertical lockup ink
vl_ink = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vvbW} {vvbH}" width="{vvbW}" height="{vvbH}" role="img" aria-label="LETSSKIPTRACE">
  <defs>
    {grad_def("lstMark", 6*VS, 58*VS, 58*VS, 6*VS)}
    {grad_def("lstWord", round(Wskip,1), vb, round(W,1), round(vb-CAP_H,1))}
  </defs>
  <g transform="translate({mark_x},0) scale({VS})">
{mark_body("url(#lstMark)","url(#lstMark)")}
  </g>
  <path d="{vd_skip}" fill="{DARK}"/>
  <path d="{vd_trace}" fill="url(#lstWord)"/>
</svg>
'''
write("lockup-vertical-ink.svg", vl_ink)

print(f"\nMetrics: wordmark W={W:.1f}  LETSSKIP={Wskip:.1f}  cap={CAP_H}")
