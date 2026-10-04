#!/usr/bin/env python3
"""Rebuild the swappable game art from source PNGs (needs Pillow). Output names are fixed, so swapping art is:
drop new PNGs in, run this, commit the webps.

  python3 scripts/art/build-art.py versus  <dir with duel.png triple.png four.png>  [--box x0,y0,x1,y1]
      -> src/assets/versus/{duel,triple,four}.webp   384x384 (square card art, centre cover-crop; --box crops first)
  python3 scripts/art/build-art.py marcipan <dir with welcome point clap shock win shrug .png (RGBA)>
      -> src/assets/koleso/marcipan-{pose}-{512,768}.webp   square, alpha; all poses at one common scale (cut
         from one sheet), feet on one baseline, centred. win.png may be a copy of another pose (CSS adds coins).
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def cover(im, w, h):
    r = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def versus(src, box=None):
    out = ROOT / "src/assets/versus"
    out.mkdir(parents=True, exist_ok=True)
    for k in ("duel", "triple", "four"):
        im = Image.open(src / f"{k}.png").convert("RGB")
        if box:
            im = im.crop(box)
        cover(im, 384, 384).save(out / f"{k}.webp", "WEBP", quality=80, method=6)
        print("wrote", out / f"{k}.webp")


def marcipan(src):
    """Poses cut from one character sheet share one scale: every pose is scaled by the same factor (tallest pose
    -> 86% of the canvas, or narrower if a pose is too wide), feet on one baseline, centred."""
    out = ROOT / "src/assets/koleso"
    out.mkdir(parents=True, exist_ok=True)
    S, FIG, BASE, MAXW = 1024, 0.86 * 1024, 0.985 * 1024, 0.98 * 1024
    poses = {}
    for k in ("welcome", "point", "clap", "shock", "win", "shrug"):
        im = Image.open(src / f"{k}.png").convert("RGBA")
        a = im.split()[3].point(lambda v: 255 if v > 40 else 0)
        poses[k] = im.crop(a.getbbox())
    s = min(min(FIG / max(p.height for p in poses.values()), MAXW / p.width) for p in poses.values())
    for k, im in poses.items():
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        c = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        c.alpha_composite(im, ((S - im.width) // 2, round(BASE - im.height)))
        for px in (512, 768):
            c.resize((px, px), Image.LANCZOS).save(out / f"marcipan-{k}-{px}.webp", "WEBP", quality=84, method=6)
        print("wrote", out / f"marcipan-{k}-{{512,768}}.webp")


if __name__ == "__main__":
    what, src = sys.argv[1], Path(sys.argv[2])
    box = None
    if "--box" in sys.argv:
        box = tuple(int(v) for v in sys.argv[sys.argv.index("--box") + 1].split(","))
    {"versus": lambda: versus(src, box), "marcipan": lambda: marcipan(src)}[what]()
