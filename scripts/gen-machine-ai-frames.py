"""usage: python3 scripts/gen-machine-ai-frames.py <raw_dir> [repo_dir] [debug_dir]
AI reel-cabinet frames -> 9-slice sheets for CSS border-image.
raw/<id>.png (black bg) -> key black to alpha, fill interior holes, trim, measure band/intrusion/corners,
compose a compact sheet (4 corners + 4 seamless edge tiles, empty centre), write WebP hi/lo + meta.json."""
import json, sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
import os
RAW=sys.argv[1] if len(sys.argv)>1 else "raw"                 # dir with <id>.png on black
REPO=sys.argv[2] if len(sys.argv)>2 else "."
DBG=sys.argv[3] if len(sys.argv)>3 else None                    # optional: keyed + sheet PNGs for review
OUT=f"{REPO}/public/machine-ai"
V=1                                                              # bump with the art: MACHINE_AI_V
os.makedirs(OUT,exist_ok=True)
if DBG: os.makedirs(DBG,exist_ok=True)
NAMES="kredit sloboda smart telka optika duo fiveg nekonecno".split()

def key(n):
    im=np.asarray(Image.open(f"{RAW}/{n}.png").convert("RGB")).astype(np.float32)
    mx=im.max(2); lum=0.2126*im[...,0]+0.7152*im[...,1]+0.0722*im[...,2]
    v=mx*0.75+lum*0.25
    a_soft=np.clip((v-8)/(70-8),0,1)**0.9            # glow: luminance-keyed soft alpha
    core=v>40
    core=ndi.binary_closing(core,np.ones((3,3)),iterations=6)
    core=ndi.binary_opening(core,np.ones((3,3)),iterations=2)
    lab,k=ndi.label(core); sizes=ndi.sum(core,lab,range(1,k+1))
    keep=np.isin(lab,1+np.where(sizes>3000)[0])        # frame body only (no embers)
    keep=ndi.binary_erosion(keep,iterations=1)
    a=np.maximum(a_soft,ndi.gaussian_filter(keep.astype(np.float32),1.0))
    a[v<5]=0
    # interior holes (dark gaps inside the frame body): opaque, not see-through
    clear=a<0.5
    lab,k=ndi.label(clear)
    H,W=a.shape
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    win=lab[H//2,W//2]
    sizes=ndi.sum(clear,lab,range(1,k+1))
    holes=[i+1 for i in range(k) if (i+1) not in border and i+1!=win]
    hole=np.isin(lab,holes)
    hole=ndi.binary_dilation(hole,iterations=1)&(a<0.98)
    a=np.where(hole,1.0,a)
    a=np.clip(a,0,1)
    rgb=np.where(a[...,None]>0.02,np.minimum(im/np.maximum(a[...,None],1e-3),255),0)
    rgb=np.where(hole[...,None],im,rgb)
    rgba=np.dstack([rgb,a*255]).astype(np.uint8)
    ys,xs=np.where(a>0.03)
    return rgba[ys.min():ys.max()+1, xs.min():xs.max()+1]

def measure(rgba):
    A=rgba[...,3].astype(np.float32)/255
    H,W=A.shape
    S=A>0.5
    cy,cx=H//2,W//2
    # inner band edge, scanning from the window centre outward (immune to outer holes / teeth)
    def from_centre(line, c):
        o=np.where(line[:c][::-1])[0]
        return c-o[0] if len(o) else 0          # index of first opaque pixel going outward
    L=np.array([from_centre(S[y],cx) for y in range(H)])                # left inner edge x per row
    Rr=np.array([W-from_centre(S[y][::-1],W-cx) for y in range(H)])    # right inner edge x per row
    T=np.array([from_centre(S[:,x],cy) for x in range(W)])
    B=np.array([H-from_centre(S[::-1,x],H-cy) for x in range(W)])
    med=lambda p,n: int(np.median(p[int(n*.35):int(n*.65)]))
    l=med(L,H); r=W-med(Rr,H); t=med(T,W); b=H-med(B,W)
    solid=A>=0.2
    d=0
    while True:
        y0,y1,x0,x1=t+d,H-b-d,l+d,W-r-d
        if not solid[y0:y1,x0:x1].any(): break
        d+=1
    def outer(line):
        o=np.where(line)[0]; return o[0] if len(o) else len(line)
    Lo=np.array([outer(S[y]) for y in range(H)]); Ro=np.array([outer(S[y][::-1]) for y in range(H)])
    To=np.array([outer(S[:,x]) for x in range(W)]); Bo=np.array([outer(S[::-1,x]) for x in range(W)])
    def ext(prof, n, tol, run=30):
        ref=np.median(prof[int(n*.3):int(n*.7)])
        good=np.abs(prof-ref)<=tol
        def from_end(g):
            c=0
            for i,v in enumerate(g):
                c=c+1 if v else 0
                if c>=run: return i-run+1
            return len(g)//2
        return from_end(good), from_end(good[::-1])
    tol=lambda bnd: max(5,bnd*0.12)
    # (start, end) corner extents along each side, from inner AND outer silhouette
    def both(pi,po,n,bnd):
        a=ext(pi,n,tol(bnd)); z=ext(po,n,tol(bnd)*1.6)
        return max(a[0],z[0]),max(a[1],z[1])
    et=both(T,To,W,t); eb=both(B,Bo,W,b); el=both(L,Lo,H,l); er=both(Rr,Ro,H,r)
    sl=max(et[0],eb[0],l+d)+6; sr=max(et[1],eb[1],r+d)+6
    st=max(el[0],er[0],t+d)+6; sb=max(el[1],er[1],b+d)+6
    return dict(W=W,H=H,band=dict(t=int(t),r=int(r),b=int(b),l=int(l)),d=int(d),slice=dict(t=int(st),r=int(sr),b=int(sb),l=int(sl)))

def period(strip):
    g=strip.astype(np.float32).mean(0) if strip.ndim==2 else strip
    g=g-g.mean()
    if np.abs(g).max()<1e-3: return None
    ac=np.correlate(g,g,"full")[len(g)-1:]
    ac/=ac[0]+1e-6
    lo,hi=40,min(420,len(g)//2)
    k=lo+int(np.argmax(ac[lo:hi]))
    return k if ac[k]>0.5 else None

def seamless(seg, L, N, axis):
    """seg has >= L+N samples along axis: crossfade the first N samples with seg[L:L+N] so tile end wraps to start."""
    seg=seg.astype(np.float32)
    tile=np.take(seg,range(L),axis=axis).copy()
    head=np.take(seg,range(N),axis=axis); tail=np.take(seg,range(L,L+N),axis=axis)
    w=(np.arange(N)/N).reshape([-1 if i==axis else 1 for i in range(seg.ndim)])
    blend=tail*(1-w)+head*w
    idx=[slice(None)]*seg.ndim; idx[axis]=slice(0,N)
    tile[tuple(idx)]=blend
    return tile

def tile_len(rgba, axis, a0, a1, cross):
    # luminance strip along the band: axis 1 = horizontal band
    lum=rgba[...,:3].astype(np.float32).mean(2)*(rgba[...,3]/255)
    s=lum[cross, a0:a1] if axis==1 else lum[a0:a1, cross].T
    return period(s)

def compose(rgba,m):
    H,W=m["H"],m["W"]; s=m["slice"]
    st,sr,sb,sl=s["t"],s["r"],s["b"],s["l"]
    # horizontal tile length from the top band, vertical from the left band (multiple of the pattern period)
    def pick(axis):
        if axis==1:
            span=(sl+40, W-sr-40); P=tile_len(rgba,1,*span,slice(0,m["band"]["t"]))
        else:
            span=(st+40, H-sb-40); P=tile_len(rgba,0,*span,slice(0,m["band"]["l"]))
        L=P*max(1,round(220/P)) if P else 220
        return min(L, (span[1]-span[0])-40), P
    Lh,Ph=pick(1); Lv,Pv=pick(0)
    N=min(32,Lh//4); Nv=min(32,Lv//4)
    cx=(W-Lh)//2; cy=(H-Lv)//2
    top=seamless(rgba[0:st, cx:cx+Lh+N],Lh,N,1)
    bot=seamless(rgba[H-sb:H, cx:cx+Lh+N],Lh,N,1)
    lef=seamless(rgba[cy:cy+Lv+Nv, 0:sl],Lv,Nv,0)
    rig=seamless(rgba[cy:cy+Lv+Nv, W-sr:W],Lv,Nv,0)
    SW,SH=sl+Lh+sr, st+Lv+sb
    sheet=np.zeros((SH,SW,4),np.float32)
    sheet[0:st,0:sl]=rgba[0:st,0:sl]; sheet[0:st,sl+Lh:]=rgba[0:st,W-sr:]
    sheet[st+Lv:,0:sl]=rgba[H-sb:,0:sl]; sheet[st+Lv:,sl+Lh:]=rgba[H-sb:,W-sr:]
    sheet[0:st,sl:sl+Lh]=top; sheet[st+Lv:,sl:sl+Lh]=bot
    sheet[st:st+Lv,0:sl]=lef; sheet[st:st+Lv,sl+Lh:]=rig
    return sheet.clip(0,255).astype(np.uint8), dict(Lh=int(Lh),Lv=int(Lv),Ph=Ph and int(Ph),Pv=Pv and int(Pv))

meta={}; sheets={}
for n in NAMES:
    rgba=key(n)
    m=measure(rgba)
    sheet,tl=compose(rgba,m)
    m.update(tl); m["sheet"]=[sheet.shape[1],sheet.shape[0]]
    img=Image.fromarray(sheet,"RGBA")
    # premultiplied-safe: zero colour where fully transparent (smaller files)
    arr=np.asarray(img).copy(); arr[arr[...,3]==0,:3]=0; img=Image.fromarray(arr,"RGBA")
    img.save(f"{OUT}/{n}.webp","WEBP",quality=86,method=6,alpha_quality=90)
    lo=img.resize((round(img.width*0.5),round(img.height*0.5)),Image.LANCZOS)
    lo.save(f"{OUT}/{n}-m.webp","WEBP",quality=84,method=6,alpha_quality=88)
    sheets[n]=np.asarray(img).astype(np.float32)
    if DBG:
        img.save(f"{DBG}/{n}-sheet.png"); Image.fromarray(rgba,"RGBA").save(f"{DBG}/{n}-keyed.png")
    m["bytes"]=dict(hi=os.path.getsize(f"{OUT}/{n}.webp"),lo=os.path.getsize(f"{OUT}/{n}-m.webp"))
    meta[n]=m
    print(n,json.dumps(m))
print("total hi+lo bytes:",sum(v["bytes"]["hi"]+v["bytes"]["lo"] for v in meta.values()))

# glint anchor: centroid of the most saturated+bright pixels in the top-left corner (gem / bolt / crystal),
# as a fraction of the corner slice box; other corners mirror it.
import colorsys
for n,m in meta.items():
    sh=sheets[n]
    s=m["slice"]; c=sh[0:s["t"],0:s["l"]]
    rgb=c[...,:3]/255; mx=rgb.max(2); mn=rgb.min(2); sat=(mx-mn)/np.maximum(mx,1e-3)
    score=sat*mx*(c[...,3]/255)
    thr=np.quantile(score,0.97)
    ys,xs=np.where(score>=thr)
    m["gem"]=[round(float(xs.mean())/s["l"],3), round(float(ys.mean())/s["t"],3)]
    print(n,"gem",m["gem"])

# ---- emit TS meta + per-rank geometry CSS ----
ts=["/** GENERATED by scripts/gen-machine-ai-frames.py — do not edit. 9-slice sheets in public/machine-ai/. */",
    f"export const MACHINE_AI_V = {V};","",
    "export interface MachineAiMeta {","  /** sheet size (px) of the full-res WebP; `-m` is half size */","  sheet: [number, number];",
    "  /** corner slice insets (px, full-res): top right bottom left */","  slice: [number, number, number, number];",
    "  /** visible band thickness per side (px, full-res) */","  band: [number, number, number, number];",
    "  /** corner ornament intrusion past the band (px): the reel window is inset by band + this */","  intrusion: number;",
    "  /** glint anchor in the corner box (0…1) */","  gem: [number, number];","  bytes: { hi: number; m: number };","}","",
    "export const MACHINE_AI: Record<string, MachineAiMeta> = {"]
css=["/* GENERATED by scripts/gen-machine-ai-frames.py — do not edit.",
     "   Per-rank 9-slice geometry (px of the full-res sheet) for src/machine-ai-frames.css. */",""]
for n,m in meta.items():
    s_=m["slice"]; b=m["band"]; W,H=m["sheet"]; d=m["d"]
    ref=round((b["t"]+b["r"]+b["b"]+b["l"])/4+d,1)
    ts.append(f'  {n}: {{ sheet: [{W}, {H}], slice: [{s_["t"]}, {s_["r"]}, {s_["b"]}, {s_["l"]}], band: [{b["t"]}, {b["r"]}, {b["b"]}, {b["l"]}], intrusion: {d}, gem: [{m["gem"][0]}, {m["gem"][1]}], bytes: {{ hi: {m["bytes"]["hi"]}, m: {m["bytes"]["lo"]} }} }},')
    pct=lambda v,t: f"{100*v/t:.3f}%"
    css+=[f'.reel-frame:has(> .mf.is-ai[data-rank="{n}"]) {{',
          f'  --mai-ref: {ref};',
          f'  --mai-bt: {b["t"]}; --mai-br: {b["r"]}; --mai-bb: {b["b"]}; --mai-bl: {b["l"]}; --mai-d: {d};',
          f'  --mai-st: {s_["t"]}; --mai-sr: {s_["r"]}; --mai-sb: {s_["b"]}; --mai-sl: {s_["l"]};',
          f'  --mai-slice: {pct(s_["t"],H)} {pct(s_["r"],W)} {pct(s_["b"],H)} {pct(s_["l"],W)};',
          f'  --mai-gx: {m["gem"][0]}; --mai-gy: {m["gem"][1]};',
          '}','']
ts+=["};",""]
open(f"{REPO}/src/lib/slot/machine-ai-frames.ts","w").write("\n".join(ts))
open(f"{REPO}/src/machine-ai-frames.gen.css","w").write("\n".join(css))
