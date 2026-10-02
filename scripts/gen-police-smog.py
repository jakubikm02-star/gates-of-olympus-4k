"""Prerenders the ZÁSAH police-light haze textures into public/fx (run once; the game only moves them).

Fog: fractal value noise × radial falloff, blurred, alpha = density (a white-hot core on the main pair).
Beam: a soft cone with a little haze texture. python3 scripts/gen-police-smog.py  (numpy, scipy, Pillow)
"""
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

OUT = "public/fx/"
N = 512
y, x = np.mgrid[0:N, 0:N] / (N - 1) * 2 - 1
rad = np.sqrt(x**2 + y**2)


def fbm(seed):
    r = np.random.default_rng(seed)
    acc = np.zeros((N, N))
    amp, tot = 1.0, 0.0
    for o in range(5):
        s = 4 * 2**o
        acc += amp * zoom(r.random((s, s)), N / s, order=3, mode="grid-wrap")[:N, :N]
        tot += amp
        amp *= 0.55
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min())


def fog(rgb, seed, name, core=0.0):
    d = np.clip(1 - rad, 0, 1) ** 1.6 * (0.35 + 0.9 * fbm(seed) ** 1.5)
    d = gaussian_filter(d, 6)
    d = np.clip(d / d.max(), 0, 1)
    c = np.array(rgb, float) / 255
    w = np.clip((d - 0.7) / 0.3, 0, 1)[..., None] * core
    col = c * (1 - w) + w
    img = np.dstack([(col * 255).astype(np.uint8), (d * 255).astype(np.uint8)])
    Image.fromarray(img, "RGBA").resize((384, 384), Image.LANCZOS).save(OUT + name, quality=82, method=6)


def beam(rgb, seed, name):
    W, H = 768, 256
    yy, xx = np.mgrid[0:H, 0:W]
    u = xx / W
    v = (yy - H / 2) / (H / 2)
    cone = np.exp(-((v / (0.08 + 0.9 * u)) ** 2) * 2.2) * np.clip(1 - u, 0, 1) ** 0.8 * np.clip(u * 12, 0, 1)
    cone *= 0.6 + 0.4 * zoom(np.random.default_rng(seed).random((8, 24)), (H / 8, W / 24), order=3)[:H, :W]
    cone = gaussian_filter(cone, 3)
    a = (np.clip(cone / cone.max(), 0, 1) * 255).astype(np.uint8)
    hot = np.clip(cone / cone.max() * 1.4 - 0.6, 0, 1)[..., None]
    col = np.array(rgb, float) / 255 * (1 - hot) + hot
    img = np.dstack([(col * 255).astype(np.uint8), a])
    Image.fromarray(img, "RGBA").save(OUT + name, quality=80, method=6)


fog((255, 28, 48), 1, "smog-red.webp", 0.35)
fog((40, 96, 255), 2, "smog-blue.webp", 0.35)
fog((255, 60, 90), 3, "smog-red2.webp")
fog((60, 130, 255), 4, "smog-blue2.webp")
beam((255, 70, 80), 9, "beam-red.webp")
beam((90, 140, 255), 10, "beam-blue.webp")
