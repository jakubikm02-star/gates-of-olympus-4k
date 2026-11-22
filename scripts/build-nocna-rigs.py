#!/usr/bin/env python3
"""Cut flat enemy art into overlap parts and write a Spine-subset rig.

Spine space: +x right, +y up, rotation CCW degrees from +x.
Image space: +x right, +y down.
A bone's pixi rotation (clockwise degrees) is the negation of its spine rotation.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "nocna" / "rigs"


def clamp_box(box, w, h, pad=6):
    x, y, bw, bh = box
    x = max(0, x - pad)
    y = max(0, y - pad)
    x2 = min(w, x + bw + pad * 2)
    y2 = min(h, y + bh + pad * 2)
    return (x, y, x2 - x, y2 - y)


# aim: "child" points +x at the first child pivot; "up"/"down"/"right" are fixed.
CHARACTERS = [
    {
        "id": "neplatic",
        "name": "Neplatič",
        "src": "public/nocna/enemies/enemy-neplatic.webp",
        "parts": [
            ("legL2", "legL", (18, 340, 96, 165), (48, 18), False, False, "down"),
            ("legR2", "legR", (140, 348, 100, 158), (42, 16), False, False, "down"),
            ("legL", "root", (32, 228, 100, 150), (55, 20), False, False, "child"),
            ("legR", "root", (122, 230, 108, 150), (42, 18), False, False, "child"),
            ("torso", "root", (42, 78, 170, 185), (85, 160), True, False, "up"),
            ("strap", "torso", (58, 200, 130, 52), (65, 10), False, True, "right"),
            ("armL", "torso", (4, 88, 90, 110), (72, 28), False, False, "child"),
            ("armL2", "armL", (2, 158, 80, 105), (46, 16), False, False, "down"),
            ("armR", "torso", (150, 90, 98, 110), (20, 30), False, False, "child"),
            ("armR2", "armR", (160, 165, 88, 100), (30, 14), False, False, "down"),
            ("head", "torso", (68, 4, 116, 112), (58, 100), False, False, "up"),
        ],
    },
    {
        "id": "inkasak",
        "name": "Inkasák",
        "src": "public/nocna/enemies/enemy-inkasak.webp",
        "parts": [
            ("legL2", "legL", (28, 355, 100, 150), (52, 14), False, False, "down"),
            ("legR2", "legR", (165, 360, 105, 145), (42, 14), False, False, "down"),
            ("legL", "root", (36, 245, 110, 140), (58, 16), False, False, "child"),
            ("legR", "root", (155, 245, 115, 145), (48, 16), False, False, "child"),
            ("torso", "root", (36, 72, 250, 210), (125, 185), True, False, "up"),
            ("chain", "torso", (125, 88, 100, 78), (18, 48), False, True, "down"),
            ("armL", "torso", (2, 100, 110, 120), (90, 28), False, False, "child"),
            ("armL2", "armL", (2, 185, 120, 130), (72, 18), False, False, "down"),
            ("armR", "torso", (210, 100, 115, 110), (18, 32), False, False, "child"),
            ("armR2", "armR", (220, 145, 105, 120), (22, 16), False, False, "right"),
            ("head", "torso", (105, 2, 130, 118), (65, 105), False, False, "up"),
        ],
    },
    {
        "id": "kurier",
        "name": "Pekelný kuriér",
        "boss": True,
        "src": "public/nocna/bosses/boss-1-pekelny-kurier.webp",
        "parts": [
            ("wheelF", "scooter", (8, 385, 140, 120), (70, 58), False, False, "right"),
            ("wheelR", "scooter", (245, 365, 140, 120), (68, 55), False, False, "right"),
            ("scooter", "root", (30, 245, 320, 175), (160, 48), True, False, "right"),
            ("torso", "root", (125, 130, 180, 150), (90, 125), True, False, "up"),
            ("flame", "torso", (270, 30, 140, 180), (24, 150), False, True, "up"),
            ("pack", "torso", (240, 120, 150, 160), (22, 70), False, False, "up"),
            ("armL", "torso", (70, 175, 100, 90), (78, 22), False, False, "child"),
            ("armL2", "armL", (48, 205, 90, 80), (62, 14), False, False, "left"),
            ("armR", "torso", (220, 170, 100, 90), (16, 24), False, False, "child"),
            ("armR2", "armR", (240, 200, 95, 85), (18, 16), False, False, "right"),
            ("head", "torso", (140, 12, 150, 160), (75, 145), False, False, "up"),
        ],
    },
]

STILL_STATIC = [
    {"id": "pokutomat", "name": "Pokutomat", "src": "public/nocna/enemies/enemy-pokutomat.webp"},
    {"id": "ozran", "name": "Ožran", "src": "public/nocna/enemies/enemy-ozran.webp"},
    {"id": "zlodej", "name": "Zlodej paragónov", "src": "public/nocna/enemies/enemy-zlodej-paragonov.webp"},
    {"id": "uradnicka", "name": "Úradníčka", "src": "public/nocna/enemies/enemy-uradnicka.webp"},
    {"id": "krovinorez", "name": "Krovinorez", "src": "public/nocna/enemies/elite-krovinorez.webp"},
    {"id": "motorka", "name": "Motorka smrti", "src": "public/nocna/enemies/elite-motorka-smrti.webp"},
    {"id": "vyberca", "name": "Výberca mýta", "src": "public/nocna/enemies/elite-vyberca-myta.webp"},
    {"id": "demon", "name": "Démon žiariviek", "src": "public/nocna/bosses/boss-2-demon-ziariviek.webp"},
    {"id": "anjel", "name": "Anjel exekúcie", "src": "public/nocna/bosses/boss-3-anjel-exekucie.webp"},
    {"id": "general", "name": "Generál podateľne", "src": "public/nocna/bosses/boss-4-general-podatelne.webp"},
    {"id": "prednosta", "name": "Prednosta", "src": "public/nocna/bosses/boss-5-prednosta.webp"},
]


def rot_vec(lx, ly, pixi_deg):
    a = math.radians(pixi_deg)
    c, s = math.cos(a), math.sin(a)
    return (lx * c - ly * s, lx * s + ly * c)


def build(char: dict) -> None:
    src = Image.open(ROOT / char["src"]).convert("RGBA")
    w, h = src.size
    root_xy = (w / 2, h - 8)
    parts = []
    for name, parent, box, pivot, mesh, spring, aim in char["parts"]:
        box = clamp_box(box, w, h, 4)
        px = box[0] + pivot[0] * box[2] / max(1, (box[2])) if False else box[0] + pivot[0]
        # pivot is in the unpadded box space; clamp_box grew the box by 4.
        # Recompute pivot inside the padded crop: original pivot was relative to unpadded box.
        # We stored pivot in the pre-pad box. Easier: pass pivot as absolute image coords.
        parts.append((name, parent, box, pivot, mesh, spring, aim))

    # pivots above are relative to the PRE-pad box. clamp_box subtracted pad from x,y.
    # Fix: store absolute pivots.
    abs_parts = []
    for name, parent, box0, pivot, mesh, spring, aim in char["parts"]:
        ax, ay = box0[0] + pivot[0], box0[1] + pivot[1]
        box = clamp_box(box0, w, h, 8)
        local_pivot = (ax - box[0], ay - box[1])
        abs_parts.append({
            "name": name,
            "parent": parent,
            "box": box,
            "pivot_img": (ax, ay),
            "pivot_local": local_pivot,
            "mesh": mesh,
            "spring": spring,
            "aim": aim,
        })

    by = {p["name"]: p for p in abs_parts}
    children = {p["name"]: [] for p in abs_parts}
    for p in abs_parts:
        if p["parent"] != "root":
            children[p["parent"]].append(p["name"])

    def aim_vec(p):
        kids = children[p["name"]]
        if p["aim"] == "child" and kids:
            c = by[kids[0]]["pivot_img"]
            return (c[0] - p["pivot_img"][0], c[1] - p["pivot_img"][1])
        if p["aim"] == "up":
            return (0, -1)
        if p["aim"] == "down":
            return (0, 1)
        if p["aim"] == "left":
            return (-1, 0)
        return (1, 0)

    # spine rotation so +x matches aim, expressed for a bone whose parent rotation is known.
    # We compute world spine rotation first (absolute), then local = world - parent world.
    world_spine = {"root": 0.0}

    def world_aim_spine(p):
        dx, dy = aim_vec(p)
        # image atan2(dy, dx): 0 right, +90 down. Spine CCW from +x: negate.
        return -math.degrees(math.atan2(dy, dx))

    # parent-before-child: parts list is not strictly ordered. Topo.
    order = []
    seen = set()

    def visit(name):
        if name in seen or name == "root":
            return
        seen.add(name)
        parent = by[name]["parent"]
        if parent != "root":
            visit(parent)
        order.append(name)

    for p in abs_parts:
        visit(p["name"])

    for name in order:
        p = by[name]
        world_spine[name] = world_aim_spine(p)

    bones = [{"name": "root"}]
    for name in order:
        p = by[name]
        parent = p["parent"]
        pp = root_xy if parent == "root" else by[parent]["pivot_img"]
        dx, dy = p["pivot_img"][0] - pp[0], p["pivot_img"][1] - pp[1]
        # Setup rotations stay 0 so each cut-out sits upright. Clips and IK rotate away from this.
        spine_x, spine_y = dx, -dy
        local_spine_rot = 0.0
        length = math.hypot(dx, dy)
        if p["aim"] != "child":
            length = max(36.0, min(p["box"][2], p["box"][3]) * 0.45)
        bones.append({
            "name": name,
            "parent": parent,
            "x": round(spine_x, 2),
            "y": round(spine_y, 2),
            "rotation": round(local_spine_rot, 2),
            "length": round(max(8.0, length), 2),
        })

    # Verify reconstruction.
    bone_l = {b["name"]: b for b in bones}

    def world_img(name):
        if name == "root":
            return root_xy[0], root_xy[1], 0.0
        b = bone_l[name]
        px, py, prot = world_img(b["parent"])
        lx, ly = b["x"], -b["y"]
        rx, ry = rot_vec(lx, ly, prot)
        return px + rx, py + ry, prot + (-b["rotation"])

    worst = 0.0
    for name in order:
        x, y, _ = world_img(name)
        ax, ay = by[name]["pivot_img"]
        err = math.hypot(x - ax, y - ay)
        worst = max(worst, err)
    print(f"{char['id']} pivot error {worst:.3f}px")
    if worst > 1.5:
        raise SystemExit(f"pivot reconstruction failed for {char['id']}")

    # Pack atlas.
    pad = 2
    sizes = [(p["name"], p["box"][2], p["box"][3]) for p in abs_parts]
    shelf_w = 1024
    x = pad
    y = pad
    row_h = 0
    placed = {}
    for name, bw, bh in sizes:
        if x + bw + pad > shelf_w:
            x = pad
            y += row_h + pad
            row_h = 0
        placed[name] = (x, y, bw, bh)
        x += bw + pad
        row_h = max(row_h, bh)
    page_h = y + row_h + pad
    page_w = shelf_w
    page = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
    crops = {}
    for p in abs_parts:
        crop = src.crop((p["box"][0], p["box"][1], p["box"][0] + p["box"][2], p["box"][1] + p["box"][3]))
        crops[p["name"]] = crop
        page.paste(crop, placed[p["name"]][:2], crop)

    folder = OUT / char["id"]
    folder.mkdir(parents=True, exist_ok=True)
    page_name = f"{char['id']}.webp"
    page.save(folder / page_name, "WEBP", quality=90, method=4)

    atlas_lines = [
        page_name,
        f"size: {page_w},{page_h}",
        "format: RGBA8888",
        "filter: Linear,Linear",
        "repeat: none",
    ]
    for p in abs_parts:
        px, py, bw, bh = placed[p["name"]]
        # libgdx y is bottom-left.
        ay = page_h - py - bh
        atlas_lines += [
            p["name"],
            "  rotate: false",
            f"  xy: {px}, {ay}",
            f"  size: {bw}, {bh}",
            f"  orig: {bw}, {bh}",
            "  offset: 0, 0",
            "  index: -1",
        ]
    (folder / f"{char['id']}.atlas").write_text("\n".join(atlas_lines) + "\n", encoding="utf-8")

    slots = []
    attachments = {}
    for p in abs_parts:
        slots.append({"name": p["name"], "bone": p["name"], "attachment": p["name"]})
        ax, ay = p["pivot_local"]
        bw, bh = p["box"][2], p["box"][3]
        # Center offset from pivot, spine y-up, assuming the attachment's counter-rotation
        # makes the image upright in the bone's parent... stored for the runtime:
        # attachment rotation cancels the bone's LOCAL visual so setup looks upright
        # relative to the parent. See runtime.
        att = {
            "x": round(bw / 2 - ax, 2),
            "y": round(ay - bh / 2, 2),
            "rotation": 0,
            "width": bw,
            "height": bh,
        }
        if p["mesh"]:
            att["type"] = "mesh"
        attachments[p["name"]] = {p["name"]: att}

    ik = []
    physics = []
    for p in abs_parts:
        if p["spring"]:
            physics.append({
                "name": p["name"],
                "bone": p["name"],
                "strength": 14,
                "damping": 0.62,
                "mix": 1,
            })
    for chain, target_name in (("armL", "armL2"), ("armR", "armR2"), ("legL", "legL2"), ("legR", "legR2")):
        if chain in by and target_name in by:
            tip = by[target_name]["pivot_img"]
            # target bone in root space
            dx, dy = tip[0] - root_xy[0], tip[1] - root_xy[1]
            tname = f"{chain}-ik"
            bones.append({
                "name": tname,
                "parent": "root",
                "x": round(dx, 2),
                "y": round(-dy, 2),
                "rotation": 0,
                "length": 8,
            })
            ik.append({
                "name": tname,
                "order": len(ik),
                "bones": [chain, target_name],
                "target": tname,
                "bendPositive": chain.endswith("L"),
                "mix": 1,
            })

    def bone_anim(name, rotate=None, translate=None, scale=None):
        out = {}
        if rotate:
            out["rotate"] = rotate
        if translate:
            out["translate"] = translate
        if scale:
            out["scale"] = scale
        return out

    bez = [0.4, 0, 0.2, 1]
    idle_bones = {
        "torso": bone_anim(
            "torso",
            rotate=[{"time": 0, "angle": -2.5, "curve": bez}, {"time": 0.7, "angle": 2.5, "curve": bez}, {"time": 1.4, "angle": -2.5}],
            scale=[{"time": 0, "x": 1, "y": 1, "curve": bez}, {"time": 0.7, "x": 1.03, "y": 0.97, "curve": bez}, {"time": 1.4, "x": 1, "y": 1}],
        ),
        "head": bone_anim(
            "head",
            rotate=[{"time": 0, "angle": 3, "curve": bez}, {"time": 0.7, "angle": -3, "curve": bez}, {"time": 1.4, "angle": 3}],
        ),
    }
    if "wheelF" in by:
        idle_bones["wheelF"] = bone_anim("wheelF", rotate=[{"time": 0, "angle": 0}, {"time": 1.4, "angle": -360}])
        idle_bones["wheelR"] = bone_anim("wheelR", rotate=[{"time": 0, "angle": 0}, {"time": 1.4, "angle": -360}])

    animations = {
        "idle": {"bones": idle_bones},
        "attack": {
            "bones": {
                "torso": bone_anim(
                    "torso",
                    rotate=[
                        {"time": 0, "angle": 0, "curve": [0.4, 0, 0.8, 0.4]},
                        {"time": 0.16, "angle": -14},
                        {"time": 0.32, "angle": 18, "curve": bez},
                        {"time": 0.55, "angle": 0},
                    ],
                ),
                "head": bone_anim(
                    "head",
                    rotate=[{"time": 0, "angle": 0}, {"time": 0.16, "angle": 8}, {"time": 0.32, "angle": -6}, {"time": 0.55, "angle": 0}],
                ),
            },
            "events": [{"time": 0.32, "name": "hit"}, {"time": 0.32, "name": "shake"}],
        },
        "hit": {
            "bones": {
                "torso": bone_anim(
                    "torso",
                    rotate=[{"time": 0, "angle": 0}, {"time": 0.08, "angle": 12, "curve": bez}, {"time": 0.28, "angle": 0}],
                    translate=[{"time": 0, "x": 0, "y": 0}, {"time": 0.08, "x": 18, "y": 0}, {"time": 0.28, "x": 0, "y": 0}],
                )
            },
            "events": [{"time": 0.08, "name": "fx"}],
        },
        "stun": {
            "bones": {
                "head": bone_anim(
                    "head",
                    rotate=[
                        {"time": 0, "angle": -8},
                        {"time": 0.15, "angle": 8},
                        {"time": 0.3, "angle": -8},
                    ],
                )
            }
        },
        "death": {
            "bones": {
                "torso": bone_anim(
                    "torso",
                    rotate=[{"time": 0, "angle": 0, "curve": bez}, {"time": 0.45, "angle": 70}],
                    translate=[{"time": 0, "x": 0, "y": 0}, {"time": 0.45, "x": 20, "y": -30}],
                ),
                "head": bone_anim("head", rotate=[{"time": 0, "angle": 0}, {"time": 0.45, "angle": 25}]),
            },
            "events": [{"time": 0.2, "name": "fx"}],
        },
    }
    if char.get("boss"):
        animations["intro"] = {
            "bones": {
                "torso": bone_anim(
                    "torso",
                    scale=[{"time": 0, "x": 0.86, "y": 0.86, "curve": bez}, {"time": 0.55, "x": 1, "y": 1}],
                    rotate=[{"time": 0, "angle": -8, "curve": bez}, {"time": 0.55, "angle": 0}],
                )
            },
            "events": [{"time": 0.4, "name": "shake"}],
        }

    # Angles in animation are offsets from setup (Spine rotate timeline is absolute local rotation).
    # Our keys are DELTAS. Bake them onto the setup local rotation so the runtime can treat them as absolute.
    setup_rot = {b["name"]: b.get("rotation", 0) for b in bones}
    for clip in animations.values():
        for bname, timelines in clip.get("bones", {}).items():
            base = setup_rot.get(bname, 0)
            if "rotate" in timelines:
                for key in timelines["rotate"]:
                    key["angle"] = round(base + key["angle"], 2)

    doc = {
        "skeleton": {
            "hash": char["id"],
            "spine": "4.1.0",
            "x": round(-root_xy[0], 2),
            "y": 0,
            "width": w,
            "height": h,
            "images": "./",
            "fps": 60,
        },
        "bones": bones,
        "slots": slots,
        "skins": [{"name": "default", "attachments": attachments}],
        "ik": ik,
        "physics": physics,
        "events": {"hit": {}, "fx": {}, "shake": {}},
        "animations": animations,
    }
    (folder / f"{char['id']}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    # Flat preview, setup pose, no IK.
    preview = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for p in abs_parts:
        x, y, pixi = world_img(p["name"])
        # attachment cancels world spine rotation (absolute), so image stays upright.
        # Net pixi rotation of the sprite relative to screen:
        # chain pixi + sprite local. sprite local pixi = -attachmentSpine = -(-world_spine) = world_spine
        # chain pixi = -world_spine. Sum 0. Paste upright, centered so pivot matches.
        crop = crops[p["name"]]
        ox = int(round(x - p["pivot_local"][0]))
        oy = int(round(y - p["pivot_local"][1]))
        preview.alpha_composite(crop, (ox, oy))
    preview.save(f"/tmp/rig-{char['id']}.webp", "WEBP", quality=80)
    print("wrote", folder)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    spec = {"characters": [], "stillStatic": STILL_STATIC, "notes": [
        "Parts are cut from the flat WebP with 8px overlap at the joints.",
        "Pivot is pixels from the part's top-left. Spine +x points along the limb, +y is up.",
        "Replace a part by keeping the same name, size and pivot, then re-export the atlas.",
    ]}
    for char in CHARACTERS:
        build(char)
        spec["characters"].append({
            "id": char["id"],
            "name": char["name"],
            "source": char["src"],
            "parts": [
                {
                    "name": name,
                    "parent": parent,
                    "box": list(box),
                    "pivot": list(pivot),
                    "mesh": mesh,
                    "spring": spring,
                }
                for name, parent, box, pivot, mesh, spring, _aim in char["parts"]
            ],
        })
    (OUT / "parts-spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
