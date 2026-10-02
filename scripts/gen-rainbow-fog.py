"""Prerenders the 4KA TV rainbow fog sprite sheet into public/fx (run once; the game only moves/fades it).

One 1024×1024 WebP, 4×4 cells of 256 px: rows 0-1 = shape A, rows 2-3 = shape B, 8 hues each
(red, orange, yellow, green, cyan, blue, violet, magenta; cell = shape*8 + hue). Each cell is a soft,
swirled (domain-warped fractal noise) blob already blurred, alpha = density with a lighter core, so the
visualizer can draw it with plain drawImage + globalAlpha, no live blur.
python3 scripts/gen-rainbow-fog.py  (numpy, scipy, Pillow)
"""
import colorsys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates, zoom

OUT = "public/fx/fog-rainbow.webp"
N = 384  # render size, downsampled to C
C = 256
y, x = np.mgrid[0:N, 0:N] / (N - 1) * 2 - 1


def fbm(seed, octaves=5, base=3):
    r = np.random.default_rng(seed)
    acc = np.zeros((N, N))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = base * 2**o
        acc += amp * zoom(r.random((s, s)), N / s, order=3, mode="grid-wrap")[:N, :N]
        tot += amp
        amp *= 0.55
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min())


def shape(seed):
    # Swirl: rotate coordinates by an angle that falls off with radius, then warp by noise (liquid look).
    rad = np.sqrt(x**2 + y**2)
    ang = np.arctan2(y, x) + 2.4 * np.exp(-rad * 1.4)
    sx, sy = rad * np.cos(ang), rad * np.sin(ang)
    wx, wy = fbm(seed + 10) - 0.5, fbm(seed + 20) - 0.5
    px = ((sx + 0.9 * wx) + 1) / 2 * (N - 1)
    py = ((sy + 0.9 * wy) + 1) / 2 * (N - 1)
    n = map_coordinates(fbm(seed), [py, px], order=1, mode="wrap")
    fall = np.exp(-(rad**2) * 4.2)
    d = fall * (0.18 + 1.0 * n**2.0)
    d = gaussian_filter(d, 8)
    # Fade to exactly zero at the cell border (no seams when drawn large).
    d *= np.clip((1 - rad) / 0.15, 0, 1)
    return np.clip(d / d.max(), 0, 1)


HUES = [0, 30, 55, 130, 185, 220, 270, 315]
sheet = Image.new("RGBA", (C * 4, C * 4))
for s, seed in enumerate((7, 23)):
    d = shape(seed)
    for h, deg in enumerate(HUES):
        c = np.array(colorsys.hsv_to_rgb(deg / 360, 0.92, 1.0))
        w = (np.clip((d - 0.6) / 0.4, 0, 1) * 0.22)[..., None]  # slightly lighter core
        col = c * (1 - w) + w
        img = np.dstack([(col * 255).astype(np.uint8), (d * 255).astype(np.uint8)])
        cell = Image.fromarray(img, "RGBA").resize((C, C), Image.LANCZOS)
        i = s * 8 + h
        sheet.paste(cell, ((i % 4) * C, (i // 4) * C))
sheet.save(OUT, quality=80, method=6)
