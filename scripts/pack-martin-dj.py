"""Cut Martin's DJ concept into a transparent rig. Checkerboard becomes real alpha.

YAMAHA on the keyboard lip becomes NÁMAHA in the same gray block letters.
The small model mark under the tambourine is wiped. EASY TOWN stays.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("art-source/dj/dj-concept-martin.jpg")
OUT = Path("public/nocna/rigs/blastbeat")
BOSS = Path("public/nocna/bosses")
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def is_checker(r: int, g: int, b: int) -> bool:
    if max(r, g, b) - min(r, g, b) > 24:
        return False
    return min(r, g, b) >= 168


def key_checker(src: Image.Image) -> Image.Image:
    im = src.convert("RGBA")
    px = im.load()
    w, h = im.size
    bg = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if bg[i]:
            return
        r, g, b, _a = px[x, y]
        if not is_checker(r, g, b):
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
    # Eat checker pockets the red aura closed off, still only the gray squares.
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if is_checker(r, g, b):
                bg[y * w + x] = 1
                px[x, y] = (0, 0, 0, 0)
            elif bg[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
    # Peel the pale jpeg fringe, but never the red aura.
    for _ in range(3):
        kill: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 16:
                    continue
                if max(r, g, b) - min(r, g, b) > 28 or min(r, g, b) < 150:
                    continue
                if r > g + 40 and r > b + 40:
                    continue
                edge = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 16:
                        edge = True
                        break
                if edge:
                    kill.append((x, y))
        for x, y in kill:
            px[x, y] = (0, 0, 0, 0)
    return im


def glyph(r: int, g: int, b: int, a: int) -> bool:
    if a < 200:
        return False
    if max(r, g, b) - min(r, g, b) > 28:
        return False
    return 68 <= r <= 190


def wipe_glyphs(im: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int, int] | None:
    """Paint gray logo pixels with the local black panel. Returns the glyph bounds."""
    px = im.load()
    x0, y0, x1, y1 = box
    hits: list[tuple[int, int]] = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if glyph(*px[x, y]):
                hits.append((x, y))
    if len(hits) < 30:
        return None
    xs = [p[0] for p in hits]
    ys = [p[1] for p in hits]
    bounds = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    for x, y in hits:
        samples: list[tuple[int, int, int]] = []
        for dx, dy in ((-6, 0), (6, 0), (0, -5), (0, 5), (-10, 0), (10, 0)):
            nx, ny = x + dx, y + dy
            if nx < x0 or ny < y0 or nx >= x1 or ny >= y1:
                continue
            r, g, b, a = px[nx, ny]
            if a > 200 and r < 48 and not glyph(r, g, b, a):
                samples.append((r, g, b))
        if samples:
            r = sum(s[0] for s in samples) // len(samples)
            g = sum(s[1] for s in samples) // len(samples)
            b = sum(s[2] for s in samples) // len(samples)
            px[x, y] = (r, g, b, 255)
        else:
            px[x, y] = (18, 18, 20, 255)
    return bounds


def restore_pole(original: Image.Image, im: Image.Image, box: tuple[int, int, int, int]) -> None:
    """The mic stand is painted over the logo. Put those dark pixels back on top."""
    src = original.load()
    px = im.load()
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = src[x, y]
            if a < 200 or r > 55:
                continue
            # A stand pixel is dark and sits in a vertical run.
            run = 0
            for dy in range(-8, 9):
                ny = y + dy
                if ny < 0 or ny >= original.height:
                    continue
                rr, gg, bb, aa = src[x, ny]
                if aa > 200 and rr < 55:
                    run += 1
            if run >= 12:
                px[x, y] = (r, g, b, 255)


def draw_namaha(im: Image.Image, bounds: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = bounds
    pad_x = 2
    # Room for the acute accent above the cap height.
    box_w = max(8, x1 - x0 - pad_x * 2)
    box_h = max(8, y1 - y0)
    font_size = box_h
    font = ImageFont.truetype(FONT, font_size)
    text = "NÁMAHA"
    while font_size > 8:
        font = ImageFont.truetype(FONT, font_size)
        left, top, right, bottom = font.getbbox(text)
        if right - left <= box_w and bottom - top <= box_h + 4:
            break
        font_size -= 1
    left, top, right, bottom = font.getbbox(text)
    tw, th = right - left, bottom - top
    plate = Image.new("RGBA", (tw + 4, th + 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(plate)
    # Yamaha's letters are a flat medium gray, slightly cooler than pure white.
    draw.text((-left + 1, -top + 2), text, font=font, fill=(92, 94, 98, 255))
    draw.text((-left, -top + 1), text, font=font, fill=(168, 170, 174, 255))
    plate = plate.filter(ImageFilter.GaussianBlur(radius=0.4))
    ox = x0 + pad_x + (box_w - plate.width) // 2
    oy = y0 + (box_h - plate.height) // 2 + 1
    im.alpha_composite(plate, (ox, oy))


def fill_panel(im: Image.Image, box: tuple[int, int, int, int], color: tuple[int, int, int]) -> None:
    px = im.load()
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        for x in range(x0, x1):
            if px[x, y][3] < 16:
                continue
            px[x, y] = (*color, 255)


def draw_namaha(im: Image.Image, bounds: tuple[int, int, int, int]) -> None:
    """Bold gray block letters, same box and colour as the old wordmark."""
    x0, y0, x1, y1 = bounds
    box_w = x1 - x0
    box_h = y1 - y0
    text = "NÁMAHA"
    font_size = box_h
    font = ImageFont.truetype(FONT, font_size)
    while font_size > 10:
        font = ImageFont.truetype(FONT, font_size)
        left, top, right, bottom = font.getbbox(text)
        if right - left <= box_w - 4 and bottom - top <= box_h - 2:
            break
        font_size -= 1
    left, top, right, bottom = font.getbbox(text)
    tw, th = right - left, bottom - top
    plate = Image.new("RGBA", (tw + 8, th + 8), (0, 0, 0, 0))
    draw = ImageDraw.Draw(plate)
    # Face of the original letters sits near rgb 96. A 1px offset thickens the gothic.
    ink = (96, 98, 100, 255)
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1)):
        draw.text((-left + 4 + dx, -top + 4 + dy), text, font=font, fill=ink)
    ox = x0 + (box_w - plate.width) // 2
    oy = y0 + (box_h - plate.height) // 2
    im.alpha_composite(plate, (max(0, ox), max(0, oy)))


def wipe_model_mark(im: Image.Image) -> None:
    """The small engraved model name under the tambourine. Flatten it into the lip."""
    px = im.load()
    for y in range(1312, 1366):
        for x in range(634, 820):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            # Keep the cable core and its specular edge. The letters live in the mid grays.
            if r > 230:
                continue
            px[x, y] = (15, 16, 18, 255)


def fix_brands(im: Image.Image) -> Image.Image:
    # The wordmark sits on the front lip, clear of the mic stand on its right.
    box = (148, 1304, 332, 1394)
    fill_panel(im, box, (12, 14, 16))
    draw_namaha(im, box)
    wipe_model_mark(im)
    return im


def is_skin(r: int, g: int, b: int, a: int) -> bool:
    if a < 140 or r < 145 or g < 90 or b < 55:
        return False
    if r - b < 22 or b > r:
        return False
    if g > 205 and b > 165:
        return False
    return True


def is_aura(r: int, g: int, b: int, a: int) -> bool:
    if a < 40:
        return False
    return r > 80 and r > g + 36 and r > b + 24 and not is_skin(r, g, b, a)


def blank(size: tuple[int, int]) -> Image.Image:
    return Image.new("RGBA", size, (0, 0, 0, 0))


def cut_parts(im: Image.Image) -> dict[str, Image.Image]:
    w, h = im.size
    px = im.load()
    part_names = ["aura", "auraHot", "desk", "mic", "torso", "head", "jaw", "eyes", "armLU", "armLL", "handL", "armRU", "armRL", "handR"]
    parts = {name: blank((w, h)) for name in part_names}
    out = {name: parts[name].load() for name in part_names}
    # Mic stand: a polyline from the clip up to the grille, wide enough for both poles.
    stand = [(80, 1460), (250, 1080), (520, 720), (700, 480), (760, 400)]

    def near_stand(x: int, y: int) -> bool:
        best = 1e9
        for (x0, y0), (x1, y1) in zip(stand, stand[1:]):
            dx, dy = x1 - x0, y1 - y0
            den = dx * dx + dy * dy or 1
            t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / den))
            qx, qy = x0 + t * dx, y0 + t * dy
            best = min(best, (x - qx) ** 2 + (y - qy) ** 2)
        return best < 34 * 34

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            skin = is_skin(r, g, b, a)
            aura = is_aura(r, g, b, a)
            if aura:
                out["aura"][x, y] = (r, g, b, a)
                out["auraHot"][x, y] = (min(255, r + 40), g // 3, b // 3, min(255, a + 40))
            # Eyes and the red streaks: additive glow, also left in the head.
            if 680 < x < 980 and 150 < y < 340 and r > 170 and g < 100 and b < 110 and a > 180:
                out["eyes"][x, y] = (r, min(255, g + 20), b, 255)
            head_zone = 600 < x < 1060 and y < 470
            teeth = head_zone and r > 190 and g > 170 and b > 150
            if (skin or teeth or (head_zone and a > 180 and r < 90 and not aura)) and head_zone and not aura:
                if y >= 312:
                    out["jaw"][x, y] = (r, g, b, a)
                if y <= 340:
                    out["head"][x, y] = (r, g, b, a)
            if skin and not head_zone:
                if x < 760:
                    if y < 860:
                        out["armLU"][x, y] = (r, g, b, a)
                    if 780 < y < 1140:
                        out["armLL"][x, y] = (r, g, b, a)
                    if y > 1040:
                        out["handL"][x, y] = (r, g, b, a)
                elif x > 880:
                    if y < 900:
                        out["armRU"][x, y] = (r, g, b, a)
                    if 820 < y < 1180:
                        out["armRL"][x, y] = (r, g, b, a)
                    if y > 1060:
                        out["handR"][x, y] = (r, g, b, a)
            shirt = (
                not skin
                and not aura
                and a > 180
                and r < 78
                and 460 < x < 1180
                and 300 < y < 1160
                and not near_stand(x, y)
            )
            if shirt and not (y > 1040 and (x < 560 or x > 1080)):
                out["torso"][x, y] = (r, g, b, a)
            if near_stand(x, y) and not skin and not aura and y < 1320:
                if r < 170 or (abs(r - g) < 30 and r < 210):
                    out["mic"][x, y] = (r, g, b, a)
            if y > 1000 and not skin and not aura:
                out["desk"][x, y] = (r, g, b, a)
    # Inpaint the hands off the keys so a mash doesn't show a hole.
    desk = parts["desk"]
    dp = desk.load()
    for y in range(1000, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not is_skin(r, g, b, a):
                continue
            found = None
            for rad in range(2, 22):
                for dx, dy in ((rad, 0), (-rad, 0), (0, rad), (0, -rad)):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 1000 or nx >= w or ny >= h:
                        continue
                    sr, sg, sb, sa = px[nx, ny]
                    if sa > 180 and not is_skin(sr, sg, sb, sa) and not is_aura(sr, sg, sb, sa):
                        found = (sr, sg, sb, 255)
                        break
                if found:
                    break
            if found:
                dp[x, y] = found
    # Extend each limb a little past the pivot so a small rotation doesn't open a gap.
    return {name: trim(parts[name]) for name in part_names}


def trim(im: Image.Image, pad: int = 2) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im.crop((0, 0, 1, 1))
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    cropped = im.crop((x0, y0, x1, y1))
    cropped.info["origin"] = (x0, y0)  # type: ignore[attr-defined]
    return cropped


def trim_with_origin(im: Image.Image, pad: int = 2) -> tuple[Image.Image, tuple[int, int]]:
    box = im.getbbox()
    if not box:
        return im.crop((0, 0, 1, 1)), (0, 0)
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1)), (x0, y0)


def silhouette(im: Image.Image) -> Image.Image:
    src = im.copy()
    px = src.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if r > g + 30 and r > 70:
                px[x, y] = (120, 24, 28, min(255, a))
            else:
                px[x, y] = (18, 10, 14, min(220, int(a * 0.92)))
    src = src.crop((420, 10, 1180, 1180))
    box = src.getbbox()
    if box:
        src = src.crop(box)
    src.thumbnail((240, 420), Image.Resampling.LANCZOS)
    return src


def pack(im: Image.Image) -> None:
    raw = {name: blank_full(im, name) for name in ()}
    del raw
    w, h = im.size
    px = im.load()
    layers = cut_full(im)
    # contact sheet for a quick look
    sheet = Image.new("RGBA", (w, h), (20, 16, 24, 255))
    order = ["aura", "desk", "torso", "armLU", "armLL", "handL", "armRU", "armRL", "handR", "head", "jaw", "eyes", "mic"]
    for name in order:
        piece, _origin = layers[name]
        # paste back using origin stored
        origin = layers[name][1]
        sheet.alpha_composite(piece, origin)
    sheet.resize((704, 704), Image.Resampling.BOX).save("/tmp/dj-rebuild.png")
    print("parts", {k: layers[k][0].size for k in layers})


def blank_full(im: Image.Image, name: str) -> Image.Image:
    return im


def cut_full(im: Image.Image) -> dict[str, tuple[Image.Image, tuple[int, int]]]:
    w, h = im.size
    px = im.load()
    names = ["aura", "auraHot", "desk", "mic", "torso", "head", "jaw", "eyes", "armLU", "armLL", "handL", "armRU", "armRL", "handR"]
    layers = {name: blank((w, h)) for name in names}
    out = {name: layers[name].load() for name in names}
    stand = [(70, 1480), (220, 1120), (480, 760), (680, 500), (745, 410)]

    def near_stand(x: int, y: int) -> bool:
        best = 1e9
        for (x0, y0), (x1, y1) in zip(stand, stand[1:]):
            dx, dy = x1 - x0, y1 - y0
            den = dx * dx + dy * dy or 1
            t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / den))
            qx, qy = x0 + t * dx, y0 + t * dy
            best = min(best, (x - qx) ** 2 + (y - qy) ** 2)
        return best < 28 * 28

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            skin = is_skin(r, g, b, a)
            aura = is_aura(r, g, b, a)
            if aura:
                out["aura"][x, y] = (r, g, b, min(255, a),) if False else (r, g, b, a)
                out["auraHot"][x, y] = (min(255, int(r * 1.15) + 30), max(0, g // 4), max(0, b // 4), min(255, a))
            if 700 < x < 960 and 160 < y < 330 and r > 175 and g < 95 and b < 105 and a > 200:
                # Only the sockets, not the whole aura. Require nearby skin.
                skin_near = False
                for dx, dy in ((8, 0), (-8, 0), (0, 8), (0, -8)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and is_skin(*px[nx, ny]):
                        skin_near = True
                        break
                if skin_near:
                    out["eyes"][x, y] = (255, 40, 30, 255)
            dxh = (x - 800) / 300
            dyh = (y - 200) / 250
            head_zone = (dxh * dxh + dyh * dyh) <= 1.05 or (700 < x < 960 and 280 < y < 500)
            teeth = head_zone and r > 170 and g > 150 and b > 130 and a > 160
            face_px = head_zone and a > 160 and not aura
            if face_px and not near_stand(x, y) and (skin or teeth or (r < 210 and g < 180)):
                if y >= 308:
                    out["jaw"][x, y] = (r, g, b, a)
                if y <= 336:
                    out["head"][x, y] = (r, g, b, a)
            if skin and y > 430:
                if x < 780:
                    if y < 900:
                        out["armLU"][x, y] = (r, g, b, a)
                    if y > 820:
                        out["armLL"][x, y] = (r, g, b, a)
                    if y > 1060:
                        out["handL"][x, y] = (r, g, b, a)
                elif x > 900:
                    if y < 940:
                        out["armRU"][x, y] = (r, g, b, a)
                    if y > 860:
                        out["armRL"][x, y] = (r, g, b, a)
                    if y > 1080:
                        out["handR"][x, y] = (r, g, b, a)
            if (
                not skin
                and not aura
                and a > 200
                and r < 70
                and 500 < x < 1140
                and 340 < y < 1140
                and not near_stand(x, y)
            ):
                out["torso"][x, y] = (r, g, b, a)
            if near_stand(x, y) and not skin and not aura and 360 < y < 1400:
                out["mic"][x, y] = (r, g, b, a)
            if y > 1010 and not skin and not aura and not (near_stand(x, y) and x < 420):
                out["desk"][x, y] = (r, g, b, a)
    dp = layers["desk"].load()
    for y in range(1010, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 140 or not is_skin(r, g, b, a):
                continue
            found = None
            for rad in range(3, 28, 2):
                for dx, dy in ((rad, 0), (-rad, 0), (0, rad), (0, -rad), (rad, rad), (-rad, rad)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 1010 <= ny < h):
                        continue
                    sr, sg, sb, sa = px[nx, ny]
                    if sa > 160 and not is_skin(sr, sg, sb, sa) and not is_aura(sr, sg, sb, sa):
                        found = (sr, sg, sb, 255)
                        break
                if found:
                    break
            dp[x, y] = found or (28, 26, 30, 255)
    trimmed: dict[str, tuple[Image.Image, tuple[int, int]]] = {}
    for name in names:
        piece, origin = trim_with_origin(layers[name])
        trimmed[name] = (piece, origin)
    return trimmed


def main() -> None:
    src = Image.open(ROOT).convert("RGB")
    keyed = key_checker(src)
    fixed = fix_brands(keyed)
    OUT.mkdir(parents=True, exist_ok=True)
    fixed.save("/tmp/dj-keyed.png")
    fixed.crop((120, 1308, 420, 1408)).resize((900, 300), Image.Resampling.NEAREST).save("/tmp/dj-word.png")
    fixed.crop((610, 1295, 900, 1375)).resize((870, 240), Image.Resampling.NEAREST).save("/tmp/dj-center-check.png")
    layers = cut_full(fixed)
    w, h = fixed.size
    sheet = Image.new("RGBA", (w, h), (24, 18, 28, 255))
    for name in ["aura", "desk", "torso", "armLU", "armLL", "handL", "armRU", "armRL", "handR", "head", "jaw", "mic"]:
        piece, origin = layers[name]
        sheet.alpha_composite(piece, origin)
    sheet.resize((640, 640), Image.Resampling.BOX).save("/tmp/dj-rebuild.png")
    print("parts", {k: v[0].size for k, v in layers.items()})
    emit_rig(fixed, layers)


def emit_rig(full: Image.Image, layers: dict[str, tuple[Image.Image, tuple[int, int]]]) -> None:
    """Pack a half-res atlas. Bone space stays in the original pixels so the pose matches."""
    scale = 0.5
    names = ["aura", "auraHot", "desk", "torso", "armLU", "armLL", "handL", "armRU", "armRL", "handR", "head", "jaw", "eyes", "mic"]
    scaled: dict[str, Image.Image] = {}
    for name in names:
        piece, _origin = layers[name]
        sw = max(1, int(round(piece.width * scale)))
        sh = max(1, int(round(piece.height * scale)))
        scaled[name] = piece.resize((sw, sh), Image.Resampling.LANCZOS)
    page_w = 2048
    x = 4
    y = 4
    row_h = 0
    boxes: dict[str, tuple[int, int, int, int]] = {}
    placed: list[tuple[str, int, int]] = []
    for name in names:
        im = scaled[name]
        if x + im.width + 4 > page_w:
            y += row_h + 4
            x = 4
            row_h = 0
        placed.append((name, x, y))
        boxes[name] = (x, y, im.width, im.height)
        x += im.width + 4
        row_h = max(row_h, im.height)
    page_h = y + row_h + 4
    page = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
    for name, px0, py0 in placed:
        page.paste(scaled[name], (px0, py0), scaled[name])
    OUT.mkdir(parents=True, exist_ok=True)
    page.save(OUT / "blastbeat.webp", "WEBP", lossless=True, quality=100, method=4)

    lines = ["blastbeat.webp", f"size: {page_w},{page_h}", "format: RGBA8888", "filter: Linear,Linear", "repeat: none"]
    for name in names:
        left, top, bw, bh = boxes[name]
        bottom = page_h - (top + bh)
        lines += [name, "  rotate: false", f"  xy: {left}, {bottom}", f"  size: {bw}, {bh}", f"  orig: {bw}, {bh}", "  offset: 0, 0", "  index: -1"]
    (OUT / "blastbeat.atlas").write_text("\n".join(lines) + "\n")

    ox, oy = 704, 1408

    def sp(ix: float, iy: float) -> tuple[float, float]:
        return round(ix - ox, 1), round(oy - iy, 1)

    parents = {
        "aura": "root",
        "auraHot": "root",
        "desk": "root",
        "mic": "root",
        "torso": "root",
        "head": "torso",
        "jaw": "head",
        "eyes": "head",
        "armLU": "torso",
        "armLL": "armLU",
        "handL": "armLL",
        "armRU": "torso",
        "armRL": "armRU",
        "handR": "armRL",
    }
    pivots: dict[str, tuple[float, float]] = {"root": (ox, oy)}
    for name in names:
        piece, origin = layers[name]
        ix, iy = origin
        w, h = piece.size
        cx, cy = ix + w / 2, iy + h / 2
        if name == "head":
            pivots[name] = (cx, iy + h - 6)
        elif name == "jaw":
            pivots[name] = (cx, iy + 4)
        elif name == "torso":
            pivots[name] = (cx, iy + h - 4)
        elif name == "armLU":
            pivots[name] = (ix + w - 8, iy + 12)
        elif name == "armRU":
            pivots[name] = (ix + 8, iy + 12)
        elif name in ("armLL", "armRL", "handL", "handR"):
            pivots[name] = (cx, iy + 6)
        else:
            pivots[name] = (cx, cy)

    def bone_json(name: str) -> str:
        parent = parents[name]
        wx, wy = sp(*pivots[name])
        px, py = sp(*pivots[parent])
        return f'{{ "name": "{name}", "parent": "{parent}", "x": {round(wx - px, 1)}, "y": {round(wy - py, 1)}, "length": 40 }}'

    def slot_json(name: str) -> str:
        return f'{{ "name": "{name}", "bone": "{name}", "attachment": "{name}" }}'

    def att_json(name: str) -> str:
        piece, origin = layers[name]
        ix, iy = origin
        w, h = piece.size
        cx, cy = ix + w / 2, iy + h / 2
        ax, ay = sp(cx, cy)
        bx, by = sp(*pivots[name])
        return (
            f'        "{name}": {{\n'
            f'          "{name}": {{ "width": {w}, "height": {h}, "x": {round(ax - bx, 1)}, "y": {round(ay - by, 1)} }}\n'
            f"        }}"
        )

    bones = ",\n    ".join(['{ "name": "root" }', *[bone_json(n) for n in names]])
    slots = ",\n    ".join(slot_json(n) for n in names)
    atts = ",\n".join(att_json(n) for n in names)
    # Torso stays inside ±5°. The head, jaw and hands do the performing.
    anim = r"""
    "idle": { "bones": {
      "torso": { "translate": [ {"time": 0, "y": 0}, {"time": 0.7, "y": 3}, {"time": 1.4, "y": 0} ],
                 "rotate": [ {"time": 0, "angle": -2}, {"time": 0.7, "angle": 2}, {"time": 1.4, "angle": -2} ] },
      "head": { "rotate": [ {"time": 0, "angle": -3}, {"time": 0.7, "angle": 4}, {"time": 1.4, "angle": -3} ] },
      "eyes": { "scale": [ {"time": 0, "x": 1, "y": 1}, {"time": 0.35, "x": 1.45, "y": 1.45}, {"time": 0.7, "x": 1, "y": 1}, {"time": 1.05, "x": 1.35, "y": 1.35}, {"time": 1.4, "x": 1, "y": 1} ] },
      "handL": { "rotate": [ {"time": 0, "angle": -6}, {"time": 0.18, "angle": 7}, {"time": 0.36, "angle": -4}, {"time": 0.54, "angle": 8}, {"time": 1.4, "angle": -6} ] },
      "handR": { "rotate": [ {"time": 0, "angle": 5}, {"time": 0.22, "angle": -8}, {"time": 0.44, "angle": 4}, {"time": 0.66, "angle": -6}, {"time": 1.4, "angle": 5} ] }
    }, "events": [ {"time": 0.35, "name": "arp"}, {"time": 1.05, "name": "arp"} ] },
    "headbang": { "bones": {
      "torso": { "rotate": [ {"time": 0, "angle": -3}, {"time": 0.18, "angle": 4}, {"time": 0.36, "angle": -3}, {"time": 0.54, "angle": 4}, {"time": 0.72, "angle": -3} ] },
      "head": { "rotate": [ {"time": 0, "angle": 16}, {"time": 0.12, "angle": -22}, {"time": 0.24, "angle": 18}, {"time": 0.36, "angle": -20}, {"time": 0.48, "angle": 14}, {"time": 0.6, "angle": -18}, {"time": 0.72, "angle": 16} ] },
      "eyes": { "scale": [ {"time": 0, "x": 1.1, "y": 1.1}, {"time": 0.18, "x": 1.6, "y": 1.6}, {"time": 0.36, "x": 1.1, "y": 1.1}, {"time": 0.72, "x": 1.1, "y": 1.1} ] },
      "handL": { "rotate": [ {"time": 0, "angle": -8}, {"time": 0.12, "angle": 10}, {"time": 0.24, "angle": -8}, {"time": 0.72, "angle": -8} ] },
      "handR": { "rotate": [ {"time": 0, "angle": 8}, {"time": 0.12, "angle": -10}, {"time": 0.24, "angle": 8}, {"time": 0.72, "angle": 8} ] }
    }, "events": [ {"time": 0.12, "name": "arp"}, {"time": 0.36, "name": "arp"} ] },
    "attack": { "bones": {
      "torso": { "rotate": [ {"time": 0, "angle": -2}, {"time": 0.16, "angle": 4}, {"time": 0.42, "angle": -2} ] },
      "head": { "rotate": [ {"time": 0, "angle": 6}, {"time": 0.16, "angle": -14}, {"time": 0.42, "angle": 4} ] },
      "jaw": { "rotate": [ {"time": 0, "angle": 0}, {"time": 0.14, "angle": 28}, {"time": 0.34, "angle": 8}, {"time": 0.42, "angle": 0} ] },
      "eyes": { "scale": [ {"time": 0, "x": 1, "y": 1}, {"time": 0.14, "x": 1.7, "y": 1.7}, {"time": 0.42, "x": 1, "y": 1} ] }
    }, "events": [ {"time": 0.14, "name": "cymbal"}, {"time": 0.14, "name": "wave"}, {"time": 0.16, "name": "paint"}, {"time": 0.18, "name": "hit"} ] },
    "hit": { "bones": {
      "torso": { "rotate": [ {"time": 0, "angle": 0}, {"time": 0.08, "angle": 5}, {"time": 0.28, "angle": 0} ] },
      "head": { "rotate": [ {"time": 0, "angle": 0}, {"time": 0.08, "angle": 12}, {"time": 0.28, "angle": 0} ] }
    }, "events": [ {"time": 0.08, "name": "shake"}, {"time": 0.08, "name": "paint"} ] },
    "stun": { "bones": {
      "torso": { "rotate": [ {"time": 0, "angle": 4}, {"time": 0.6, "angle": 3} ] },
      "head": { "rotate": [ {"time": 0, "angle": 22}, {"time": 0.6, "angle": 18} ] },
      "jaw": { "rotate": [ {"time": 0, "angle": 8}, {"time": 0.6, "angle": 6} ] },
      "handL": { "rotate": [ {"time": 0, "angle": 14}, {"time": 0.6, "angle": 10} ] },
      "handR": { "rotate": [ {"time": 0, "angle": -12}, {"time": 0.6, "angle": -8} ] }
    } },
    "death": { "bones": {
      "torso": { "rotate": [ {"time": 0, "angle": 0}, {"time": 0.5, "angle": 5} ], "translate": [ {"time": 0, "y": 0}, {"time": 0.5, "y": -18} ] },
      "head": { "rotate": [ {"time": 0, "angle": 4}, {"time": 0.5, "angle": 32} ] },
      "jaw": { "rotate": [ {"time": 0, "angle": 0}, {"time": 0.5, "angle": 16} ] }
    } },
    "intro": { "bones": {
      "head": { "rotate": [ {"time": 0, "angle": 18}, {"time": 0.2, "angle": -16}, {"time": 0.45, "angle": 2} ] },
      "jaw": { "rotate": [ {"time": 0, "angle": 0}, {"time": 0.2, "angle": 22}, {"time": 0.45, "angle": 0} ] },
      "torso": { "rotate": [ {"time": 0, "angle": -2}, {"time": 0.45, "angle": 2} ] }
    }, "events": [ {"time": 0.2, "name": "cymbal"}, {"time": 0.2, "name": "wave"} ] }
"""
    doc = f"""{{
  "skeleton": {{ "hash": "blastbeat-martin", "spine": "4.1.0", "x": -520, "y": 0, "width": 1040, "height": 1400, "images": "./", "fps": 30 }},
  "bones": [
    {bones}
  ],
  "slots": [
    {slots}
  ],
  "skins": [{{ "name": "default", "attachments": {{
{atts}
  }} }}],
  "animations": {{ {anim} }}
}}
"""
    (OUT / "blastbeat.json").write_text(doc)
    board = full.copy()
    box = board.getbbox()
    if box:
        board = board.crop(box)
    board.thumbnail((720, 960), Image.Resampling.LANCZOS)
    BOSS.mkdir(parents=True, exist_ok=True)
    board.save(BOSS / "boss-dj-blastbeat.webp", "WEBP", quality=86, method=6)
    sil = silhouette(full)
    sil.save(BOSS / "clone-silhouette.webp", "WEBP", quality=82, method=6)
    print("atlas", page.size, "clone", sil.size)


if __name__ == "__main__":
    main()
