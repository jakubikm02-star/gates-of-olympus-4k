#!/usr/bin/env python3
"""Pack the supplied @2x cut-outs into a Spine-subset rig.

Skeleton space stays 1x (the 512-tall source). The atlas is @2x pixels.
Padding is 0: the images are already cut, nothing is cropped from the flat art.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "nocna" / "rigs"
SRC = ROOT / "assets" / "rig-parts"
SPEC = OUT / "parts-spec.json"


def rot_vec(lx, ly, pixi_deg):
    a = math.radians(pixi_deg)
    c, s = math.cos(a), math.sin(a)
    return (lx * c - ly * s, lx * s + ly * c)


def bone_anim(rotate=None, translate=None, scale=None):
    out = {}
    if rotate:
        out["rotate"] = rotate
    if translate:
        out["translate"] = translate
    if scale:
        out["scale"] = scale
    return out


def build(char: dict) -> None:
    cid = char["id"]
    w, h = char["sourceSize"]
    root_xy = (w / 2, h - 8)
    parts = []
    for spec in char["parts"]:
        im = Image.open(SRC / cid / f"{spec['name']}@2x.webp").convert("RGBA")
        if spec.get("wheel"):
            bw, bh = spec["size"]
        else:
            bw, bh = spec["box"][2], spec["box"][3]
        if im.size != (bw * 2, bh * 2):
            raise SystemExit(f"{cid}/{spec['name']} is {im.size}, expected {(bw * 2, bh * 2)}")
        pivot = spec["pivot"]
        if spec.get("wheel"):
            ax, ay = spec["axle"]["x"], spec["axle"]["y"]
        else:
            ax, ay = spec["box"][0] + pivot[0], spec["box"][1] + pivot[1]
        parts.append({
            "name": spec["name"],
            "parent": spec["parent"],
            "im": im,
            "bw": bw,
            "bh": bh,
            "pivot_local": pivot,
            "pivot_img": (ax, ay),
            "spring": bool(spec.get("spring")),
            "wheel": bool(spec.get("wheel")),
            "axle": spec.get("axle"),
        })

    by = {p["name"]: p for p in parts}
    bones = [{"name": "root"}]
    # Parent pivots for non-wheel bones. Wheels hang off an axle whose origin is the axle point.
    pivots = {"root": root_xy}
    for p in parts:
        if p["wheel"]:
            pivots[p["name"] + "-axle"] = p["pivot_img"]
            pivots[p["name"]] = p["pivot_img"]
        else:
            pivots[p["name"]] = p["pivot_img"]

    def add_bone(name, parent, img_xy, rotation=0.0, scale_x=1.0, scale_y=1.0, length=20.0):
        pp = pivots[parent]
        dx, dy = img_xy[0] - pp[0], img_xy[1] - pp[1]
        bone = {
            "name": name,
            "parent": parent,
            "x": round(dx, 2),
            "y": round(-dy, 2),
            "rotation": round(rotation, 2),
            "length": round(length, 2),
        }
        if abs(scale_x - 1) > 1e-4 or abs(scale_y - 1) > 1e-4:
            bone["scaleX"] = round(scale_x, 4)
            bone["scaleY"] = round(scale_y, 4)
        bones.append(bone)

    for p in parts:
        parent = p["parent"]
        if p["wheel"]:
            axle = p["axle"]
            add_bone(
                p["name"] + "-axle",
                parent,
                p["pivot_img"],
                rotation=-axle["rotationImageDeg"],
                scale_x=axle["scaleX"],
                scale_y=axle["scaleY"],
                length=8,
            )
            add_bone(p["name"], p["name"] + "-axle", p["pivot_img"], length=8)
        else:
            pp = pivots[parent]
            dist = math.hypot(p["pivot_img"][0] - pp[0], p["pivot_img"][1] - pp[1])
            add_bone(p["name"], parent, p["pivot_img"], length=max(8.0, dist))

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
    for p in parts:
        x, y, _ = world_img(p["name"])
        err = math.hypot(x - p["pivot_img"][0], y - p["pivot_img"][1])
        worst = max(worst, err)
    print(f"{cid} pivot error {worst:.3f}px")
    if worst > 1.5:
        raise SystemExit(f"pivot reconstruction failed for {cid}")

    pad = 2
    shelf_w = 2048
    x = pad
    y = pad
    row_h = 0
    placed = {}
    for p in parts:
        bw, bh = p["im"].size
        if x + bw + pad > shelf_w:
            x = pad
            y += row_h + pad
            row_h = 0
        placed[p["name"]] = (x, y, bw, bh)
        x += bw + pad
        row_h = max(row_h, bh)
    page_w, page_h = shelf_w, y + row_h + pad
    page = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
    for p in parts:
        page.paste(p["im"], placed[p["name"]][:2], p["im"])

    folder = OUT / cid
    folder.mkdir(parents=True, exist_ok=True)
    page_name = f"{cid}.webp"
    page.save(folder / page_name, "WEBP", quality=90, method=4)

    lines = [page_name, f"size: {page_w},{page_h}", "format: RGBA8888", "filter: Linear,Linear", "repeat: none"]
    for p in parts:
        px, py, bw, bh = placed[p["name"]]
        lines += [
            p["name"],
            "  rotate: false",
            f"  xy: {px}, {page_h - py - bh}",
            f"  size: {bw}, {bh}",
            f"  orig: {bw}, {bh}",
            "  offset: 0, 0",
            "  index: -1",
        ]
    (folder / f"{cid}.atlas").write_text("\n".join(lines) + "\n", encoding="utf-8")

    slots = []
    attachments = {}
    for p in parts:
        # Display size is 1x. The atlas region is @2x, so the runtime scales it by 0.5.
        slots.append({"name": p["name"], "bone": p["name"], "attachment": p["name"]})
        ax, ay = p["pivot_local"]
        bw, bh = p["bw"], p["bh"]
        attachments[p["name"]] = {
            p["name"]: {
                "x": round(bw / 2 - ax, 2),
                "y": round(ay - bh / 2, 2),
                "rotation": 0,
                "width": bw,
                "height": bh,
            }
        }

    ik = []
    physics = []
    for p in parts:
        if not p["spring"]:
            continue
        # The courier flame sits behind the pack. A loose spring swings that fire into view.
        stiff, damp = (48, 0.9) if p["name"] == "flame" else (14, 0.62)
        physics.append({"name": p["name"], "bone": p["name"], "strength": stiff, "damping": damp, "mix": 1})
    for chain, tip_name in (("armL", "armL2"), ("armR", "armR2"), ("legL", "legL2"), ("legR", "legR2")):
        if chain not in by or tip_name not in by:
            continue
        parent = "torso" if chain.startswith("arm") and "torso" in by else "root"
        origin = by["torso"]["pivot_img"] if parent == "torso" else root_xy
        shoulder = by[chain]["pivot_img"]
        elbow = by[tip_name]["pivot_img"]
        ex, ey = elbow[0] - shoulder[0], elbow[1] - shoulder[1]
        elen = math.hypot(ex, ey) or 1.0
        # Fist sits further along the forearm so the two-bone reach has an elbow.
        reach = 1.65 if chain.startswith("arm") else 1.0
        fist = (shoulder[0] + ex / elen * elen * reach, shoulder[1] + ey / elen * elen * reach)
        tx, ty = fist[0] - origin[0], fist[1] - origin[1]
        tname = f"{chain}-ik"
        bones.append({"name": tname, "parent": parent, "x": round(tx, 2), "y": round(-ty, 2), "rotation": 0, "length": 8})
        ik.append({
            "name": tname,
            "order": len(ik),
            "bones": [chain, tip_name],
            "target": tname,
            "bendPositive": not chain.endswith("R"),
            "mix": 1,
            "l1": round(elen, 2),
            "l2": round(elen * 0.65, 2),
        })

    bez = [0.4, 0, 0.2, 1]
    bike = "scooter" in by
    # Root tilt stays inside ±5°. The limbs do the acting.
    # Head stays inside ±12°. Pack and flame are never rotated on their own.

    def rot(name, keys):
        return bone_anim(rotate=keys) if name in by else None

    def put(bag, name, row):
        if row:
            bag[name] = row

    idle = {
        "root": bone_anim(
            translate=[{"time": 0, "x": 0, "y": 0, "curve": bez}, {"time": 0.7, "x": 0, "y": 5, "curve": bez}, {"time": 1.4, "x": 0, "y": 0}],
            rotate=[{"time": 0, "angle": -2, "curve": bez}, {"time": 0.7, "angle": 2, "curve": bez}, {"time": 1.4, "angle": -2}],
        ),
        "head": bone_anim(rotate=[
            {"time": 0, "angle": 8, "curve": bez}, {"time": 0.7, "angle": -8, "curve": bez}, {"time": 1.4, "angle": 8},
        ]),
        "torso": bone_anim(
            rotate=[{"time": 0, "angle": -6, "curve": bez}, {"time": 0.7, "angle": 6, "curve": bez}, {"time": 1.4, "angle": -6}],
        ),
    }
    put(idle, "armL", rot("armL", [{"time": 0, "angle": 6, "curve": bez}, {"time": 0.7, "angle": -8, "curve": bez}, {"time": 1.4, "angle": 6}]))
    put(idle, "armR", rot("armR", [{"time": 0, "angle": -6, "curve": bez}, {"time": 0.7, "angle": 8, "curve": bez}, {"time": 1.4, "angle": -6}]))
    put(idle, "legL", rot("legL", [{"time": 0, "angle": 4, "curve": bez}, {"time": 0.7, "angle": -4, "curve": bez}, {"time": 1.4, "angle": 4}]))
    put(idle, "legR", rot("legR", [{"time": 0, "angle": -4, "curve": bez}, {"time": 0.7, "angle": 4, "curve": bez}, {"time": 1.4, "angle": -4}]))
    if bike:
        idle["scooter"] = bone_anim(
            translate=[{"time": 0, "x": 0, "y": 0, "curve": bez}, {"time": 0.35, "x": 0, "y": 7, "curve": bez}, {"time": 0.7, "x": 0, "y": 0, "curve": bez}, {"time": 1.05, "x": 0, "y": 7, "curve": bez}, {"time": 1.4, "x": 0, "y": 0}],
        )
        idle["wheelF"] = bone_anim(rotate=[{"time": 0, "angle": 0}, {"time": 1.4, "angle": -360}])
        idle["wheelR"] = bone_anim(rotate=[{"time": 0, "angle": 0}, {"time": 1.4, "angle": -360}])

    attack = {
        "root": bone_anim(
            rotate=[{"time": 0, "angle": 0}, {"time": 0.16, "angle": -4}, {"time": 0.34, "angle": 4}, {"time": 0.6, "angle": 0}],
            translate=[{"time": 0, "x": 0, "y": 0}, {"time": 0.16, "x": -8, "y": 0}, {"time": 0.34, "x": 10, "y": 0}, {"time": 0.6, "x": 0, "y": 0}],
        ),
        "torso": bone_anim(rotate=[
            {"time": 0, "angle": 0, "curve": bez}, {"time": 0.16, "angle": -8}, {"time": 0.34, "angle": 10, "curve": bez}, {"time": 0.6, "angle": 0},
        ]),
        "head": bone_anim(rotate=[
            {"time": 0, "angle": 0}, {"time": 0.16, "angle": 10}, {"time": 0.34, "angle": -8}, {"time": 0.6, "angle": 0},
        ]),
    }
    # Lead arm: the IK target draws back, then the fist punches. Elbow bend comes from the solver.
    punch = None if bike else "armR-ik"
    if punch and punch[:-3] in by:
        attack[punch] = bone_anim(translate=[
            {"time": 0, "x": 0, "y": 0, "curve": bez},
            {"time": 0.16, "x": -40, "y": 48},
            {"time": 0.34, "x": 78, "y": -24, "curve": bez},
            {"time": 0.6, "x": 0, "y": 0},
        ])
    put(attack, "armL", rot("armL", [
        {"time": 0, "angle": 0, "curve": bez}, {"time": 0.16, "angle": 14}, {"time": 0.34, "angle": -10}, {"time": 0.6, "angle": 0},
    ]) if not bike else rot("armL", [
        {"time": 0, "angle": 0}, {"time": 0.16, "angle": -6}, {"time": 0.34, "angle": 6}, {"time": 0.6, "angle": 0},
    ]))
    if bike:
        put(attack, "armR", rot("armR", [
            {"time": 0, "angle": 0}, {"time": 0.16, "angle": 6}, {"time": 0.34, "angle": -6}, {"time": 0.6, "angle": 0},
        ]))
        attack["wheelF"] = bone_anim(rotate=[{"time": 0, "angle": 0}, {"time": 0.6, "angle": -280}])
        attack["wheelR"] = bone_anim(rotate=[{"time": 0, "angle": 0}, {"time": 0.6, "angle": -280}])
        attack["scooter"] = bone_anim(translate=[
            {"time": 0, "x": 0, "y": 0}, {"time": 0.16, "x": 0, "y": 4}, {"time": 0.34, "x": 6, "y": -2}, {"time": 0.6, "x": 0, "y": 0},
        ])
    put(attack, "legR", rot("legR", [
        {"time": 0, "angle": 0, "curve": bez}, {"time": 0.16, "angle": -10}, {"time": 0.34, "angle": 24, "curve": bez}, {"time": 0.6, "angle": 0},
    ]))
    put(attack, "legR2", rot("legR2", [
        {"time": 0, "angle": 0, "curve": bez}, {"time": 0.16, "angle": 22}, {"time": 0.34, "angle": -18, "curve": bez}, {"time": 0.6, "angle": 0},
    ]))
    put(attack, "legL", rot("legL", [
        {"time": 0, "angle": 0}, {"time": 0.34, "angle": -8}, {"time": 0.6, "angle": 0},
    ]))

    hit = {
        "root": bone_anim(
            rotate=[{"time": 0, "angle": 0}, {"time": 0.08, "angle": 4}, {"time": 0.36, "angle": 0}],
            translate=[{"time": 0, "x": 0, "y": 0}, {"time": 0.08, "x": 16, "y": -4}, {"time": 0.36, "x": 0, "y": 0}],
        ),
        "torso": bone_anim(rotate=[
            {"time": 0, "angle": 0}, {"time": 0.08, "angle": -18, "curve": bez}, {"time": 0.36, "angle": 0},
        ]),
        "head": bone_anim(rotate=[
            {"time": 0, "angle": 0}, {"time": 0.06, "angle": -12}, {"time": 0.16, "angle": 8}, {"time": 0.36, "angle": 0},
        ]),
    }
    put(hit, "armL", rot("armL", [{"time": 0, "angle": 0}, {"time": 0.08, "angle": 28}, {"time": 0.36, "angle": 0}]))
    put(hit, "armL2", rot("armL2", [{"time": 0, "angle": 0}, {"time": 0.08, "angle": -24}, {"time": 0.36, "angle": 0}]))
    put(hit, "armR", rot("armR", [{"time": 0, "angle": 0}, {"time": 0.08, "angle": -26}, {"time": 0.36, "angle": 0}]))
    put(hit, "armR2", rot("armR2", [{"time": 0, "angle": 0}, {"time": 0.08, "angle": 22}, {"time": 0.36, "angle": 0}]))

    stun = {
        "root": bone_anim(rotate=[{"time": 0, "angle": -2}, {"time": 0.24, "angle": 2}, {"time": 0.48, "angle": -2}]),
        "torso": bone_anim(rotate=[{"time": 0, "angle": 4}, {"time": 0.24, "angle": -4}, {"time": 0.48, "angle": 4}]),
        "head": bone_anim(rotate=[
            {"time": 0, "angle": -12}, {"time": 0.16, "angle": 10}, {"time": 0.32, "angle": -12}, {"time": 0.48, "angle": 8},
        ]),
    }
    put(stun, "armL", rot("armL", [{"time": 0, "angle": 18}, {"time": 0.24, "angle": 8}, {"time": 0.48, "angle": 18}]))
    put(stun, "armL2", rot("armL2", [{"time": 0, "angle": 16}, {"time": 0.24, "angle": 28}, {"time": 0.48, "angle": 16}]))
    put(stun, "armR", rot("armR", [{"time": 0, "angle": -16}, {"time": 0.24, "angle": -8}, {"time": 0.48, "angle": -16}]))
    put(stun, "armR2", rot("armR2", [{"time": 0, "angle": -14}, {"time": 0.24, "angle": -26}, {"time": 0.48, "angle": -14}]))

    death = {
        "root": bone_anim(
            rotate=[{"time": 0, "angle": 0, "curve": bez}, {"time": 0.55, "angle": 5}, {"time": 0.8, "angle": 5}],
            translate=[{"time": 0, "x": 0, "y": 0, "curve": bez}, {"time": 0.45, "x": 6, "y": -12}, {"time": 0.8, "x": 18, "y": -170}],
        ),
        "torso": bone_anim(rotate=[
            {"time": 0, "angle": 0, "curve": bez}, {"time": 0.28, "angle": 8}, {"time": 0.55, "angle": 22}, {"time": 0.8, "angle": 22},
        ]),
        "head": bone_anim(rotate=[{"time": 0, "angle": 0, "curve": bez}, {"time": 0.4, "angle": 12}, {"time": 0.8, "angle": -8}]),
    }
    put(death, "legL", rot("legL", [{"time": 0, "angle": 0, "curve": bez}, {"time": 0.28, "angle": 16}, {"time": 0.55, "angle": 8}]))
    put(death, "legR", rot("legR", [{"time": 0, "angle": 0, "curve": bez}, {"time": 0.28, "angle": -18}, {"time": 0.55, "angle": -6}]))
    put(death, "legL2", rot("legL2", [{"time": 0, "angle": 0, "curve": bez}, {"time": 0.28, "angle": -28}, {"time": 0.55, "angle": -10}]))
    put(death, "legR2", rot("legR2", [{"time": 0, "angle": 0, "curve": bez}, {"time": 0.28, "angle": 26}, {"time": 0.55, "angle": 8}]))
    put(death, "armL", rot("armL", [{"time": 0, "angle": 0, "curve": bez}, {"time": 0.4, "angle": 32}, {"time": 0.8, "angle": 20}]))
    put(death, "armR", rot("armR", [{"time": 0, "angle": 0, "curve": bez}, {"time": 0.4, "angle": -30}, {"time": 0.8, "angle": -18}]))
    put(death, "armL2", rot("armL2", [{"time": 0, "angle": 0}, {"time": 0.4, "angle": 20}]))
    put(death, "armR2", rot("armR2", [{"time": 0, "angle": 0}, {"time": 0.4, "angle": -18}]))
    if bike:
        death["scooter"] = bone_anim(translate=[
            {"time": 0, "x": 0, "y": 0, "curve": bez}, {"time": 0.8, "x": 8, "y": -36},
        ])

    animations = {
        "idle": {"bones": idle},
        "attack": {"bones": attack, "events": [{"time": 0.34, "name": "hit"}, {"time": 0.34, "name": "shake"}]},
        "hit": {"bones": hit, "events": [{"time": 0.08, "name": "fx"}]},
        "stun": {"bones": stun},
        "death": {"bones": death, "events": [{"time": 0.45, "name": "fx"}]},
    }
    if bike:
        animations["intro"] = {
            "bones": {
                "scooter": bone_anim(translate=[{"time": 0, "x": 36, "y": 10, "curve": bez}, {"time": 0.45, "x": 0, "y": 0}]),
                "torso": bone_anim(rotate=[{"time": 0, "angle": -8, "curve": bez}, {"time": 0.45, "angle": 0}]),
                "wheelF": bone_anim(rotate=[{"time": 0, "angle": 0}, {"time": 0.45, "angle": -200}]),
                "wheelR": bone_anim(rotate=[{"time": 0, "angle": 0}, {"time": 0.45, "angle": -200}]),
            },
            "events": [{"time": 0.4, "name": "shake"}],
        }

    setup_rot = {b["name"]: b.get("rotation", 0) for b in bones}
    for clip in animations.values():
        for bname, timelines in clip.get("bones", {}).items():
            base = setup_rot.get(bname, 0)
            if "rotate" in timelines:
                for key in timelines["rotate"]:
                    key["angle"] = round(base + key["angle"], 2)

    doc = {
        "skeleton": {"hash": cid, "spine": "4.1.0", "x": round(-root_xy[0], 2), "y": 0, "width": w, "height": h, "images": "./", "fps": 60},
        "bones": bones,
        "slots": slots,
        "skins": [{"name": "default", "attachments": attachments}],
        "ik": ik,
        "physics": physics,
        "events": {"hit": {}, "fx": {}, "shake": {}},
        "animations": animations,
    }
    (folder / f"{cid}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    preview = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for p in parts:
        small = p["im"].resize((p["bw"], p["bh"]), Image.Resampling.LANCZOS)
        if p["wheel"]:
            axle = p["axle"]
            sw = max(1, int(round(p["bw"] * axle["scaleX"])))
            sh = max(1, int(round(p["bh"] * axle["scaleY"])))
            small = small.resize((sw, sh), Image.Resampling.LANCZOS)
            small = small.rotate(-axle["rotationImageDeg"], expand=True, resample=Image.Resampling.BICUBIC)
        x, y, _ = world_img(p["name"])
        if p["wheel"]:
            ox = int(round(x - small.size[0] / 2))
            oy = int(round(y - small.size[1] / 2))
        else:
            ox = int(round(x - p["pivot_local"][0]))
            oy = int(round(y - p["pivot_local"][1]))
        preview.alpha_composite(small, (ox, oy))
    preview.save(f"/tmp/rig-{cid}.webp", "WEBP", quality=82)
    print("wrote", folder)


def main():
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    for char in spec["characters"]:
        build(char)


if __name__ == "__main__":
    main()
