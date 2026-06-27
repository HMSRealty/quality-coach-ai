#!/usr/bin/env python3
"""Build the REAL LETSSKIPTRACE logo set from the actual brand assets."""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT="/home/user/quality-coach-ai/brand/letsskiptrace/svg"
os.makedirs(OUT, exist_ok=True)

# ---- real mark vector (tight 283x356) ----
MARK_D=open("real/mark_tight_d.txt").read().strip()
MARK_W, MARK_H = 283.0, 356.0
ICON512_D=open("real/icon_trace_d.txt").read().strip()  # 512x512 padded

# ---- colors / spec from style.css + variables.css ----
GREY="#8A8A8A"      # --text-secondary  (LETSSKIP)
WHITE="#FFFFFF"     # --text-primary    (TRACE on dark)
INK="#000000"       # text on light
TILE="#0F0F0F"      # --bg-surface tile

# ---- Inter fonts ----
fonts={600:TTFont("Inter-SemiBold.ttf"),700:TTFont("Inter-Bold.ttf")}
UPM=2048; CAPU=1490
def gset(w): return fonts[w].getGlyphSet()
def cmap(w): return fonts[w].getBestCmap()
def adv(w,ch): return fonts[w]["hmtx"][cmap(w)[ord(ch)]][0]

# wordmark segments: (text, weight) ; LETSSKIP=600 grey, TRACE=700 white
SEGS=[("LETSSKIP",600),("TRACE",700)]
TRACK=-0.02   # letter-spacing em

def wordmark_paths(F, baseline, x0=0.0):
    """Return list of (path_d, weight) and end_x. Caps centered via baseline."""
    s=F/UPM; ls=TRACK*F
    x=x0; paths=[]
    seq=[(c,w) for (t,w) in SEGS for c in t]
    for i,(ch,w) in enumerate(seq):
        sink=SVGPathPen(gset(w))
        tp=TransformPen(sink,(s,0,0,-s,x,baseline))
        gset(w)[cmap(w)[ord(ch)]].draw(tp)
        paths.append((sink.getCommands(),w))
        x+= adv(w,ch)*s
        if i!=len(seq)-1: x+=ls
    return paths,x

def wm_width(F):
    s=F/UPM; ls=TRACK*F; seq=[(c,w) for (t,w) in SEGS for c in t]
    x=0
    for i,(ch,w) in enumerate(seq):
        x+=adv(w,ch)*s
        if i!=len(seq)-1: x+=ls
    return x

def write(name,svg):
    open(os.path.join(OUT,name),"w").write(svg)
    print("wrote",name)

def mark_group(scale, fill, tx=0.0, ty=0.0, d=MARK_D):
    return f'<g transform="translate({tx},{ty}) scale({scale})"><path d="{d}" fill="{fill}" fill-rule="evenodd"/></g>'

# ============ MARKS ============
for name,fill in [("mark-white",WHITE),("mark-black",INK)]:
    svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MARK_W:g} {MARK_H:g}" '
         f'width="{MARK_W:g}" height="{MARK_H:g}" role="img" aria-label="LETSSKIPTRACE mark">'
         f'<path d="{MARK_D}" fill="{fill}" fill-rule="evenodd"/></svg>\n')
    write(name+".svg",svg)

# app icon: 512 logo on rounded dark tile
icon=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" '
      f'role="img" aria-label="LETSSKIPTRACE app icon">'
      f'<rect width="512" height="512" rx="112" fill="{TILE}"/>'
      f'<g transform="translate(96,96) scale(0.625)"><path d="{ICON512_D}" fill="{WHITE}" fill-rule="evenodd"/></g></svg>\n')
write("icon.svg",icon)

# ============ WORDMARK ============
F=120.0; cap=CAPU/UPM*F; PAD=10.0
bl=PAD+cap; H=cap+2*PAD; W=wm_width(F); vbW=round(W+2*PAD,1)
def wordmark_svg(trace_fill):
    paths,_=wordmark_paths(F, bl, PAD)
    body=""
    for d,w in paths:
        fill=GREY if w==600 else trace_fill
        body+=f'<path d="{d}" fill="{fill}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW} {round(H,1)}" '
            f'width="{vbW}" height="{round(H,1)}" role="img" aria-label="LETSSKIPTRACE">{body}</svg>\n')
write("wordmark-white.svg", wordmark_svg(WHITE))
write("wordmark-ink.svg",   wordmark_svg(INK))

# ============ HORIZONTAL LOCKUP (.lockup spec: icon h:font = 2:1, gap 0.8*font) ============
icon_h=2*F                       # 240
ms=icon_h/MARK_H                 # mark scale
mark_w=MARK_W*ms
gap=0.8*F                        # 96
axis=icon_h/2
hb=axis+cap/2                    # caps centered on axis
wx=mark_w+gap
Wh=wm_width(F)
hvbW=round(wx+Wh,1); hvbH=round(icon_h,1)
def hlock(mark_fill, trace_fill):
    paths,_=wordmark_paths(F, hb, wx)
    body=mark_group(ms, mark_fill)
    for d,w in paths:
        fill=GREY if w==600 else trace_fill
        body+=f'<path d="{d}" fill="{fill}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {hvbW} {hvbH}" '
            f'width="{hvbW}" height="{hvbH}" role="img" aria-label="LETSSKIPTRACE">{body}</svg>\n')
write("lockup-horizontal-white.svg", hlock(WHITE,WHITE))
write("lockup-horizontal-ink.svg",   hlock(INK,INK))

# ============ VERTICAL LOCKUP ============
vmark_h=300.0
vms=vmark_h/MARK_H
vmark_w=MARK_W*vms
vgap=64.0
F2=110.0; cap2=CAPU/UPM*F2
vWw=wm_width(F2)
vvbW=round(max(vmark_w,vWw),1)
vbl=vmark_h+vgap+cap2
vvbH=round(vbl+10,1)
mark_x=round(vvbW/2 - vmark_w/2,1)
wm_x=round(vvbW/2 - vWw/2,1)
def vlock(mark_fill, trace_fill):
    paths,_=wordmark_paths(F2, vbl, wm_x)
    body=mark_group(vms, mark_fill, tx=mark_x)
    for d,w in paths:
        fill=GREY if w==600 else trace_fill
        body+=f'<path d="{d}" fill="{fill}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vvbW} {vvbH}" '
            f'width="{vvbW}" height="{vvbH}" role="img" aria-label="LETSSKIPTRACE">{body}</svg>\n')
write("lockup-vertical-white.svg", vlock(WHITE,WHITE))
write("lockup-vertical-ink.svg",   vlock(INK,INK))

print(f"\nwordmark W(F120)={W:.1f}  cap={cap:.1f}  horiz vb={hvbW}x{hvbH}  vert vb={vvbW}x{vvbH}")
