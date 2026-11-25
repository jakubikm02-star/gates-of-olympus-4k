"""Pack DJ Blastbeat limb art into the in-house rig atlas. Magenta is the key."""

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path("/opt/cursor/artifacts/assets")
OUT = Path("public/nocna/rigs/blastbeat")
BOSS = Path("public/nocna/bosses")
SYM = Path("public/nocna/symbols")


def is_mag(r: int, g: int, b: int) -> bool:
    # The generator's "magenta" lands near (240, 4, 142), not pure #FF00FF.
    return r > 190 and b > 90 and g < 55 and (r - g) > 130


def is_soft(r: int, g: int, b: int) -> bool:
    return r > 160 and b > 70 and g < 90 and (r - g) > 80


def key_image(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    bg = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if bg[i] or not is_mag(*px[x, y][:3]):
            return
        bg[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                push(nx, ny)
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if bg[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
            elif is_mag(r, g, b):
                px[x, y] = (214, 218, 224, 255)
    for _ in range(5):
        clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 16 or not is_soft(r, g, b):
                    continue
                edge = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 16:
                        edge = True
                        break
                if edge:
                    clear.append((x, y))
        for x, y in clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def trim(im: Image.Image, pad: int = 4) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit(im: Image.Image, height: int) -> Image.Image:
    im = trim(im)
    ratio = height / max(1, im.height)
    w = max(1, int(round(im.width * ratio)))
    return im.resize((w, height), Image.Resampling.LANCZOS)


def save_symbol(name: str, height: int) -> None:
    im = fit(key_image(ROOT / f"{name}.jpg"), height)
    # Square plate so the reel icon stays centered.
    side = max(im.width, im.height) + 24
    plate = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    plate.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    plate.resize((256, 256), Image.Resampling.LANCZOS).save(SYM / f"{name}.webp", "WEBP", quality=86, method=6)


def save_clone(src: str, dest: str, height: int = 520) -> None:
    im = fit(key_image(ROOT / src), height)
    im.save(BOSS / dest, "WEBP", quality=86, method=6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    BOSS.mkdir(parents=True, exist_ok=True)
    SYM.mkdir(parents=True, exist_ok=True)
    parts = {
        "legs": fit(key_image(ROOT / "dj-legs.jpg"), 340),
        "desk": fit(key_image(ROOT / "dj-desk.jpg"), 250),
        "tee": fit(key_image(ROOT / "dj-torso.jpg"), 300),
        "teeBlack": fit(key_image(ROOT / "dj-torso-black.jpg"), 300),
        "armL": fit(key_image(ROOT / "dj-arm-l.jpg"), 280),
        "armR": fit(key_image(ROOT / "dj-arm-r.jpg"), 280),
        "head": fit(key_image(ROOT / "dj-head.jpg"), 260),
    }
    # Drop the black shirt's sleeves so the arm bones stay the arms.
    black = parts["teeBlack"]
    cut = int(black.width * 0.16)
    parts["teeBlack"] = black.crop((cut, 0, black.width - cut, black.height))

    page = Image.new("RGBA", (2048, 420), (0, 0, 0, 0))
    order = ["legs", "desk", "tee", "teeBlack", "armL", "armR", "head"]
    x = 8
    boxes: dict[str, tuple[int, int, int, int]] = {}
    for name in order:
        im = parts[name]
        if x + im.width > 2040:
            raise SystemExit(f"atlas overflow at {name}")
        page.paste(im, (x, 8), im)
        boxes[name] = (x, 8, im.width, im.height)
        x += im.width + 8
    page_w = 2048
    page_h = 420
    page.save(OUT / "blastbeat.webp", "WEBP", lossless=True, quality=100, method=6)

    lines = [
        "blastbeat.webp",
        f"size: {page_w},{page_h}",
        "format: RGBA8888",
        "filter: Linear,Linear",
        "repeat: none",
    ]
    # LibGDX xy is bottom-left. Our paste used top-left.
    for name in order:
        left, top, w, h = boxes[name]
        bottom = page_h - (top + h)
        lines += [
            name,
            "  rotate: false",
            f"  xy: {left}, {bottom}",
            f"  size: {w}, {h}",
            f"  orig: {w}, {h}",
            "  offset: 0, 0",
            "  index: -1",
        ]
    (OUT / "blastbeat.atlas").write_text("\n".join(lines) + "\n")

    def slot(name: str, bone: str, oy: float) -> str:
        _l, _t, w, h = boxes[name]
        return f"""{{
      "name": "{name}",
      "bone": "{bone}",
      "attachment": "{name}"
    }}"""

    def att(name: str, oy: float) -> str:
        _l, _t, w, h = boxes[name]
        return f"""        "{name}": {{
          "{name}": {{ "width": {w}, "height": {h}, "x": 0, "y": {oy} }}
        }}"""

    # Positive attachment y lifts the sprite (runtime negates it).
    json = f"""{{
  "skeleton": {{
    "hash": "blastbeat",
    "spine": "4.1.0",
    "x": -220,
    "y": 0,
    "width": 440,
    "height": 640,
    "images": "./",
    "fps": 30
  }},
  "bones": [
    {{ "name": "root" }},
    {{ "name": "desk", "parent": "root", "x": 0, "y": 70, "length": 40 }},
    {{ "name": "legs", "parent": "root", "x": 0, "y": 300, "length": 280 }},
    {{ "name": "torso", "parent": "root", "x": 0, "y": 300, "length": 160 }},
    {{ "name": "armL", "parent": "torso", "x": -78, "y": 110, "length": 150 }},
    {{ "name": "armR", "parent": "torso", "x": 78, "y": 110, "length": 150 }},
    {{ "name": "head", "parent": "torso", "x": 0, "y": 168, "length": 80 }}
  ],
  "slots": [
    {slot("desk", "desk", 0)},
    {slot("legs", "legs", 0)},
    {slot("tee", "torso", 0)},
    {slot("teeBlack", "torso", 0)},
    {slot("armL", "armL", 0)},
    {slot("armR", "armR", 0)},
    {slot("head", "head", 0)}
  ],
  "skins": [{{
    "name": "default",
    "attachments": {{
{att("desk", 20)},
{att("legs", -150)},
{att("tee", 130)},
{att("teeBlack", 120)},
{att("armL", -90)},
{att("armR", -90)},
{att("head", 70)}
    }}
  }}],
  "animations": {{
    "idle": {{
      "bones": {{
        "torso": {{ "rotate": [
          {{ "time": 0, "angle": -3 }},
          {{ "time": 0.4, "angle": 3 }},
          {{ "time": 0.8, "angle": -3 }}
        ]}},
        "head": {{ "rotate": [
          {{ "time": 0, "angle": 18 }},
          {{ "time": 0.16, "angle": -24 }},
          {{ "time": 0.32, "angle": 16 }},
          {{ "time": 0.5, "angle": -22 }},
          {{ "time": 0.66, "angle": 14 }},
          {{ "time": 0.8, "angle": 18 }}
        ]}},
        "armL": {{ "rotate": [
          {{ "time": 0, "angle": 18 }},
          {{ "time": 0.12, "angle": 62 }},
          {{ "time": 0.28, "angle": 8 }},
          {{ "time": 0.44, "angle": 58 }},
          {{ "time": 0.62, "angle": 14 }},
          {{ "time": 0.8, "angle": 18 }}
        ]}},
        "armR": {{ "rotate": [
          {{ "time": 0, "angle": -14 }},
          {{ "time": 0.18, "angle": -58 }},
          {{ "time": 0.34, "angle": -8 }},
          {{ "time": 0.52, "angle": -64 }},
          {{ "time": 0.8, "angle": -14 }}
        ]}}
      }},
      "events": [
        {{ "time": 0.16, "name": "arp" }},
        {{ "time": 0.5, "name": "arp" }}
      ]
    }},
    "attack": {{
      "bones": {{
        "torso": {{ "rotate": [
          {{ "time": 0, "angle": -2 }},
          {{ "time": 0.18, "angle": 4 }},
          {{ "time": 0.42, "angle": -2 }}
        ]}},
        "head": {{ "rotate": [
          {{ "time": 0, "angle": 20 }},
          {{ "time": 0.16, "angle": -32 }},
          {{ "time": 0.42, "angle": 12 }}
        ]}},
        "armL": {{ "rotate": [
          {{ "time": 0, "angle": 10 }},
          {{ "time": 0.16, "angle": 74 }},
          {{ "time": 0.42, "angle": 16 }}
        ]}},
        "armR": {{ "rotate": [
          {{ "time": 0, "angle": -10 }},
          {{ "time": 0.16, "angle": -72 }},
          {{ "time": 0.42, "angle": -16 }}
        ]}}
      }},
      "events": [
        {{ "time": 0.16, "name": "cymbal" }},
        {{ "time": 0.18, "name": "hit" }}
      ]
    }},
    "hit": {{
      "bones": {{
        "torso": {{ "rotate": [
          {{ "time": 0, "angle": 0 }},
          {{ "time": 0.08, "angle": 5 }},
          {{ "time": 0.28, "angle": 0 }}
        ]}},
        "head": {{ "rotate": [
          {{ "time": 0, "angle": 0 }},
          {{ "time": 0.08, "angle": 16 }},
          {{ "time": 0.28, "angle": 0 }}
        ]}}
      }},
      "events": [{{ "time": 0.08, "name": "shake" }}]
    }},
    "stun": {{
      "bones": {{
        "torso": {{ "rotate": [{{ "time": 0, "angle": 4 }}, {{ "time": 0.6, "angle": 4 }}] }},
        "head": {{ "rotate": [{{ "time": 0, "angle": 28 }}, {{ "time": 0.6, "angle": 24 }}] }},
        "armL": {{ "rotate": [{{ "time": 0, "angle": -8 }}, {{ "time": 0.6, "angle": -4 }}] }},
        "armR": {{ "rotate": [{{ "time": 0, "angle": 8 }}, {{ "time": 0.6, "angle": 4 }}] }}
      }}
    }},
    "death": {{
      "bones": {{
        "torso": {{ "rotate": [{{ "time": 0, "angle": 0 }}, {{ "time": 0.45, "angle": 5 }}] }},
        "head": {{ "rotate": [{{ "time": 0, "angle": 8 }}, {{ "time": 0.45, "angle": 36 }}] }},
        "armL": {{ "rotate": [{{ "time": 0, "angle": 20 }}, {{ "time": 0.45, "angle": -20 }}] }},
        "armR": {{ "rotate": [{{ "time": 0, "angle": -20 }}, {{ "time": 0.45, "angle": 18 }}] }}
      }}
    }},
    "intro": {{
      "bones": {{
        "head": {{ "rotate": [
          {{ "time": 0, "angle": 22 }},
          {{ "time": 0.22, "angle": -28 }},
          {{ "time": 0.5, "angle": 8 }}
        ]}},
        "armL": {{ "rotate": [{{ "time": 0, "angle": 8 }}, {{ "time": 0.22, "angle": 66 }}, {{ "time": 0.5, "angle": 18 }}] }},
        "armR": {{ "rotate": [{{ "time": 0, "angle": -8 }}, {{ "time": 0.22, "angle": -64 }}, {{ "time": 0.5, "angle": -14 }}] }},
        "torso": {{ "rotate": [{{ "time": 0, "angle": -2 }}, {{ "time": 0.5, "angle": 2 }}] }}
      }},
      "events": [{{ "time": 0.22, "name": "cymbal" }}]
    }}
  }}
}}
"""
    (OUT / "blastbeat.json").write_text(json)

    # Fallback portrait: limbs only, no branded shoes from the full poster.
    board = Image.new("RGBA", (640, 860), (0, 0, 0, 0))
    def paste(name: str, xy: tuple[int, int]) -> None:
        im = parts[name]
        board.paste(im, xy, im)
    paste("legs", (170, 500))
    paste("desk", (80, 430))
    paste("tee", (190, 250))
    paste("armL", (40, 280))
    paste("armR", (380, 270))
    paste("head", (190, 20))
    board.save(BOSS / "boss-dj-blastbeat.webp", "WEBP", quality=86, method=6)

    save_symbol("sym-syntik", 220)
    save_symbol("sym-cymbal", 230)
    save_symbol("sym-fan", 230)
    save_clone("clone-dye.jpg", "clone-dye.webp")
    save_clone("clone-dye-up.jpg", "clone-dye-up.webp")
    save_clone("clone-black-up.jpg", "clone-black-up.webp")
    print("packed", {k: boxes[k][2:] for k in order})


if __name__ == "__main__":
    main()
