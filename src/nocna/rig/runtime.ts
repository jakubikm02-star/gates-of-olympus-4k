import { Assets, Container, Graphics, MeshPlane, MeshSimple, Rectangle, Sprite, Texture } from "pixi.js";
import { rotVec, sample, solveTwoBone } from "./math";
import { parseAtlas, type RegionAttach, type SpineDoc } from "./types";

export interface RigQuality {
  springs: boolean;
  mesh: boolean;
}

interface BoneNode {
  name: string;
  parent: string | null;
  setupX: number;
  setupY: number;
  setupRot: number;
  setupSx: number;
  setupSy: number;
  length: number;
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  view: Container;
}

interface SpringState {
  bone: string;
  stiffness: number;
  damping: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ready: boolean;
}

/**
 * In-house cut-out rig. Bones are Containers. Slots are Sprites or a mesh.
 * Animations are a Spine 4.1 subset: rotate is absolute, translate is added to setup, scale is absolute.
 */
export class Rig extends Container {
  doc: SpineDoc | null = null;
  private bones = new Map<string, BoneNode>();
  private order: string[] = [];
  private springs: SpringState[] = [];
  private regions = new Map<string, Texture>();
  private meshes: { bone: string; mesh: MeshPlane | MeshSimple; base: Float32Array }[] = [];
  private sprites: Sprite[] = [];
  private slotNodes = new Map<string, Container>();
  private phaseOn = false;
  private stunMark: Container | null = null;
  private flash: Graphics | null = null;
  private clip = "idle";
  private nextClip: string | null = null;
  private time = 0;
  private mix = 0;
  private mixDur = 0;
  private loop = true;
  private fired = new Set<string>();
  private onEvent: (name: string) => void = () => {};
  private ended: (() => void) | null = null;
  private quality: RigQuality = { springs: true, mesh: true };
  /** Phase 2 headbang runs faster. 1 is the authored timing. */
  rate = 1;

  static async loadPacked(base: string, onEvent?: (name: string) => void) {
    const [doc, atlasText] = await Promise.all([
      fetch(`${base}.json`).then((r) => r.json() as Promise<SpineDoc>),
      fetch(`${base}.atlas`).then((r) => r.text()),
    ]);
    const atlas = parseAtlas(atlasText);
    const page = await Assets.load<Texture>(`${base.replace(/\/[^/]+$/, "/")}${atlas.page}`);
    const rig = new Rig();
    if (onEvent) rig.onEvent = onEvent;
    rig.mount(doc, page, atlas.regions.map((r) => ({ ...r })));
    return rig;
  }

  static async loadBillboard(image: string, onEvent?: (name: string) => void) {
    const tex = await Assets.load<Texture>(image);
    const w = tex.width || 200;
    const h = tex.height || 400;
    const rig = new Rig();
    if (onEvent) rig.onEvent = onEvent;
    rig.mount(billboardDoc(w, h), tex, [{ name: "body", x: 0, y: 0, w, h }]);
    return rig;
  }

  setQuality(q: RigQuality) {
    this.quality = q;
  }

  /**
   * Hide every slot except `keep`. Used so the desk, body and aura can be one
   * baked texture while the head, jaw, hands and eyes stay live.
   */
  showOnly(keep: readonly string[]) {
    const allow = new Set(keep);
    for (const [name, node] of this.slotNodes) {
      node.visible = allow.has(name);
    }
  }

  showAllSlots() {
    for (const [name, node] of this.slotNodes) {
      node.visible = name !== "teeBlack" && name !== "auraHot" && name !== "eyes";
    }
    this.setPhase(this.phaseOn);
  }

  /**
   * Phase 2. The old rig swaps a black shirt. Martin's DJ already wears black,
   * so the aura thickens and the headbang clock runs faster instead.
   */
  setPhase(on: boolean) {
    this.phaseOn = on;
    this.rate = on ? 1.65 : 1;
    const dye = this.slotNodes.get("tee");
    const black = this.slotNodes.get("teeBlack");
    if (dye) dye.visible = !on;
    if (black) black.visible = on;
    const hot = this.slotNodes.get("auraHot");
    const aura = this.slotNodes.get("aura");
    if (hot) hot.visible = on;
    if (aura) aura.alpha = on ? 1 : 0.72;
  }

  play(name: string, opts?: { loop?: boolean; mix?: number }) {
    this.ended?.();
    this.ended = null;
    if (!this.doc?.animations[name]) name = "idle";
    const mix = opts?.mix ?? 0.12;
    if (this.clip !== name && mix > 0 && this.doc?.animations[this.clip]) {
      this.nextClip = name;
      this.mix = 0;
      this.mixDur = mix;
    } else {
      this.clip = name;
      this.nextClip = null;
      this.time = 0;
      this.fired.clear();
    }
    this.loop = opts?.loop ?? (name === "idle" || name === "stun");
    return new Promise<void>((resolve) => {
      this.ended = resolve;
      if (!this.loop && this.duration(this.clip) <= 0) resolve();
    });
  }

  /** Editor: show one clip at a time, no crossfade. */
  seek(name: string, time: number) {
    this.clip = this.doc?.animations[name] ? name : "idle";
    this.nextClip = null;
    this.time = time;
    this.loop = false;
    this.fired.clear();
    this.pose(1);
  }

  /** Editor hot-reload. Textures stay; hierarchy is rebuilt. */
  remount(doc: SpineDoc) {
    const page = this.regions.get("__page");
    if (!page) return;
    const regions = [...this.regions.entries()]
      .filter(([k]) => k !== "__page")
      .map(([name, tex]) => ({
        name,
        x: tex.frame.x,
        y: tex.frame.y,
        w: tex.frame.width,
        h: tex.frame.height,
        page: "page",
        pageW: page.width,
        pageH: page.height,
      }));
    this.mount(doc, page, regions);
  }

  update(dt: number) {
    if (!this.doc) return;
    const dur = this.duration(this.clip);
    this.time += (dt / 1000) * this.rate;
    if (this.nextClip) {
      this.mix += dt / 1000;
      if (this.mix >= this.mixDur) {
        this.clip = this.nextClip;
        this.nextClip = null;
        this.time = 0;
        this.fired.clear();
      }
    } else if (!this.loop && dur > 0 && this.time >= dur) {
      this.time = dur;
      this.pose(0);
      const done = this.ended;
      this.ended = null;
      done?.();
      return;
    } else if (this.loop && dur > 0 && this.time >= dur) {
      this.time %= dur;
      this.fired.clear();
    }
    this.pose(dt);
  }

  override destroy() {
    this.ended?.();
    this.ended = null;
    super.destroy({ children: true });
  }

  private duration(name: string) {
    const anim = this.doc?.animations[name];
    if (!anim) return 0;
    let max = 0;
    for (const bone of Object.values(anim.bones ?? {})) {
      for (const key of [...(bone.rotate ?? []), ...(bone.translate ?? []), ...(bone.scale ?? [])]) max = Math.max(max, key.time);
    }
    for (const ev of anim.events ?? []) max = Math.max(max, ev.time);
    return max;
  }

  private mount(doc: SpineDoc, page: Texture, regions: { name: string; x: number; y: number; w: number; h: number }[]) {
    this.removeChildren();
    this.doc = doc;
    this.bones.clear();
    this.order = [];
    this.meshes = [];
    this.sprites = [];
    this.slotNodes.clear();
    this.phaseOn = false;
    this.stunMark = null;
    this.flash = null;
    this.regions.clear();
    this.regions.set("__page", page);
    for (const r of regions) {
      this.regions.set(r.name, new Texture({ source: page.source, frame: new Rectangle(r.x, r.y, r.w, r.h) }));
    }
    const skin = doc.skins[0]?.attachments ?? {};
    for (const bone of doc.bones) {
      const view = new Container();
      const node: BoneNode = {
        name: bone.name,
        parent: bone.parent ?? null,
        setupX: bone.x ?? 0,
        setupY: bone.y ?? 0,
        setupRot: bone.rotation ?? 0,
        setupSx: bone.scaleX ?? 1,
        setupSy: bone.scaleY ?? 1,
        length: bone.length ?? 20,
        x: bone.x ?? 0,
        y: bone.y ?? 0,
        rotation: bone.rotation ?? 0,
        sx: bone.scaleX ?? 1,
        sy: bone.scaleY ?? 1,
        view,
      };
      this.bones.set(bone.name, node);
    }
    const visit = (name: string) => {
      if (this.order.includes(name)) return;
      const n = this.bones.get(name);
      if (n?.parent) visit(n.parent);
      this.order.push(name);
    };
    for (const name of this.bones.keys()) visit(name);
    for (const name of this.order) {
      const n = this.bones.get(name)!;
      const parent = n.parent ? this.bones.get(n.parent)?.view : this;
      parent?.addChild(n.view);
      n.view.sortableChildren = true;
    }
    const slotAt = new Map<string, number>();
    doc.slots.forEach((slot, index) => slotAt.set(slot.bone, index));
    const earliest = (name: string): number => {
      let at = slotAt.get(name) ?? 1_000_000;
      for (const [child, node] of this.bones) {
        if (node.parent === name) at = Math.min(at, earliest(child));
      }
      return at;
    };
    for (const [name, node] of this.bones) node.view.zIndex = earliest(name);
    doc.slots.forEach((slot, index) => {
      const bone = this.bones.get(slot.bone);
      const att = slot.attachment ? skin[slot.name]?.[slot.attachment] : undefined;
      const tex = slot.attachment ? this.regions.get(slot.attachment) : undefined;
      if (!bone || !att || !tex) return;
      const wrap = this.makeSlot(slot.bone, att, tex);
      // Slot order, not tree order. A torso sprite added after its children
      // would otherwise cover the head.
      wrap.zIndex = index;
      wrap.visible = slot.name !== "teeBlack" && slot.name !== "auraHot" && slot.name !== "eyes";
      this.slotNodes.set(slot.name, wrap);
      bone.view.addChild(wrap);
    });
    this.attachMarks(skin);
    this.springs = (doc.physics ?? []).map((p) => ({
      bone: p.bone,
      stiffness: p.strength ?? 12,
      damping: p.damping ?? 0.6,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ready: false,
    }));
    this.applyLocals();
  }

  private makeSlot(bone: string, att: RegionAttach, tex: Texture) {
    const wrap = new Container();
    wrap.position.set(att.x ?? 0, -(att.y ?? 0));
    wrap.rotation = -((att.rotation ?? 0) * Math.PI) / 180;
    if (att.type === "mesh") {
      try {
        const plane = new MeshPlane({ texture: tex, verticesX: 4, verticesY: 4 });
        plane.position.set(-(att.width / 2), -(att.height / 2));
        plane.scale.set(att.width / Math.max(1, tex.width), att.height / Math.max(1, tex.height));
        const buf = plane.geometry.getAttribute("aPosition").buffer;
        const base = new Float32Array(buf.data.length);
        base.set(buf.data as Float32Array);
        this.meshes.push({ bone, mesh: plane, base });
        wrap.addChild(plane);
      } catch (err) {
        console.error(err);
        wrap.addChild(this.regionSprite(att, tex, bone));
      }
    } else {
      wrap.addChild(this.regionSprite(att, tex, bone));
    }
    return wrap;
  }

  private regionSprite(att: RegionAttach, tex: Texture, bone?: string) {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    if (bone === "eyes") sprite.alpha = 0.9;
    sprite.width = att.width;
    sprite.height = att.height;
    this.sprites.push(sprite);
    return sprite;
  }

  /** Dizzy stars over the head, and a hit flash on the root. Both follow the bones. */
  private attachMarks(skin: SpineDoc["skins"][number]["attachments"]) {
    const head = this.bones.get("head");
    const headAtt = skin.head?.head;
    if (head && headAtt) {
      const mark = new Container();
      const g = new Graphics();
      const gold = 0xf0c419;
      for (const [x, y, r] of [[-22, -4, 9], [0, -18, 11], [22, -2, 8]] as const) {
        g.circle(x, y, r).fill({ color: gold });
        g.circle(x - 1, y - 1, r * 0.35).fill({ color: 0xfff6c8 });
      }
      mark.addChild(g);
      mark.position.set(headAtt.x ?? 0, -(headAtt.y ?? 0) - headAtt.height / 2 - 14);
      mark.zIndex = 10_000;
      mark.visible = false;
      head.view.addChild(mark);
      this.stunMark = mark;
    }
    const torso = this.bones.get("torso");
    if (torso) {
      const flash = new Graphics();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI;
        flash.moveTo(Math.cos(a) * 3, Math.sin(a) * 3).lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
      }
      flash.stroke({ color: 0xfff3c4, width: 2, alpha: 0.95 });
      flash.blendMode = "add";
      flash.visible = false;
      flash.zIndex = 10_000;
      const head = this.bones.get("head");
      flash.position.set((head?.setupX ?? 0) * 0.3, -((head?.setupY ?? 80) * 0.55));
      torso.view.addChild(flash);
      this.flash = flash;
    }
  }

  private pose(dtMs: number) {
    if (!this.doc) return;
    const mixU = this.nextClip && this.mixDur > 0 ? Math.min(1, this.mix / this.mixDur) : 1;
    for (const name of this.order) {
      const node = this.bones.get(name)!;
      const a = this.sampleBone(this.clip, name, this.time);
      const b = this.nextClip ? this.sampleBone(this.nextClip, name, 0) : a;
      node.x = a.x + (b.x - a.x) * mixU;
      node.y = a.y + (b.y - a.y) * mixU;
      node.rotation = lerpAngle(a.rotation, b.rotation, mixU);
      node.sx = a.sx + (b.sx - a.sx) * mixU;
      node.sy = a.sy + (b.sy - a.sy) * mixU;
    }
    this.applyIk();
    if (this.quality.springs) this.applySprings(dtMs / 1000);
    this.applyLocals();
    if (this.quality.mesh) this.deform(this.time);
    this.applyRead();
    this.fireEvents();
  }

  /** Knockback flash, death fade, and the stun stars. Cheap: no filters. */
  private applyRead() {
    const hitFlash = this.clip === "hit" && this.time >= 0.04 && this.time <= 0.14;
    const tint = hitFlash ? 0xfff0d2 : 0xffffff;
    for (const sprite of this.sprites) sprite.tint = tint;
    if (this.flash) this.flash.visible = hitFlash;
    if (this.stunMark) {
      const on = this.clip === "stun";
      this.stunMark.visible = on;
      if (on) {
        this.stunMark.rotation = this.time * 5;
        const s = 0.82 + Math.abs(Math.sin(this.time * 16)) * 0.28;
        this.stunMark.scale.set(s);
      }
    }
    if (this.clip === "death") {
      const dur = Math.max(0.2, this.duration("death"));
      const u = Math.min(1, this.time / dur);
      this.alpha = 1 - u * 0.78;
    } else {
      this.alpha = 1;
    }
  }

  private sampleBone(clip: string, name: string, time: number) {
    const node = this.bones.get(name)!;
    const anim = this.doc?.animations[clip]?.bones?.[name];
    const rot = anim?.rotate
      ? sample(anim.rotate.map((k) => ({ time: k.time, value: k.angle, curve: k.curve })), time, node.setupRot)
      : node.setupRot;
    const tx = anim?.translate
      ? sample(anim.translate.map((k) => ({ time: k.time, value: k.x, curve: k.curve })), time, 0)
      : 0;
    const ty = anim?.translate
      ? sample(anim.translate.map((k) => ({ time: k.time, value: k.y, curve: k.curve })), time, 0)
      : 0;
    const sx = anim?.scale
      ? sample(anim.scale.map((k) => ({ time: k.time, value: k.x, curve: k.curve })), time, node.setupSx)
      : node.setupSx;
    const sy = anim?.scale
      ? sample(anim.scale.map((k) => ({ time: k.time, value: k.y, curve: k.curve })), time, node.setupSy)
      : node.setupSy;
    return { x: node.setupX + tx, y: node.setupY + ty, rotation: rot, sx, sy };
  }

  private world(name: string): { x: number; y: number; rot: number } {
    const n = this.bones.get(name)!;
    if (!n.parent) return { x: 0, y: 0, rot: 0 };
    const p = this.world(n.parent);
    const pixi = -p.rot;
    const lx = n.x;
    const ly = -n.y;
    const r = rotVec(lx, ly, pixi);
    return { x: p.x + r.x, y: p.y + r.y, rot: p.rot + n.rotation };
  }

  private applyIk() {
    const list = [...(this.doc?.ik ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const ik of list) {
      if ((ik.mix ?? 1) <= 0 || ik.bones.length < 2 || !ik.l1 || !ik.l2) continue;
      const T = this.bones.get(ik.target);
      const A = this.bones.get(ik.bones[0]!);
      const B = this.bones.get(ik.bones[1]!);
      if (!A || !B || !T || T.parent !== A.parent) continue;
      if (Math.hypot(T.x - T.setupX, T.y - T.setupY) < 1.5) continue;
      const bend = Boolean(ik.bendPositive);
      const solve = (tx: number, ty: number) => solveTwoBone(ik.l1!, ik.l2!, tx, ty, bend);
      const rest = solve(T.setupX - A.setupX, T.setupY - A.setupY);
      const now = solve(T.x - A.x, T.y - A.y);
      const mix = ik.mix ?? 1;
      A.rotation = A.setupRot + (now.a - rest.a) * mix;
      B.rotation = B.setupRot + (now.b - rest.b) * mix;
    }
  }

  private applySprings(dt: number) {
    const step = Math.min(0.033, Math.max(0.001, dt));
    for (const s of this.springs) {
      const bone = this.bones.get(s.bone);
      if (!bone?.parent) continue;
      const parent = this.world(bone.parent);
      const aim = bone.rotation;
      const pixi = -(parent.rot + aim);
      const tip = rotVec(bone.length, 0, pixi);
      const tx = parent.x + tip.x;
      const ty = parent.y + tip.y;
      if (!s.ready) {
        s.x = tx;
        s.y = ty;
        s.ready = true;
      }
      const ax = (tx - s.x) * s.stiffness;
      const ay = (ty - s.y) * s.stiffness;
      s.vx = (s.vx + ax * step) * (1 - s.damping * step);
      s.vy = (s.vy + ay * step) * (1 - s.damping * step);
      s.x += s.vx * step;
      s.y += s.vy * step;
      const wdx = s.x - parent.x;
      const wdy = s.y - parent.y;
      // World pixi angle of the lagged tip, then spine rotation, then local.
      const worldPixi = (Math.atan2(wdy, wdx) * 180) / Math.PI;
      const worldSpine = -worldPixi;
      bone.rotation = worldSpine - parent.rot;
    }
  }

  private applyLocals() {
    for (const name of this.order) {
      const n = this.bones.get(name)!;
      n.view.position.set(n.x, -n.y);
      n.view.rotation = -(n.rotation * Math.PI) / 180;
      n.view.scale.set(n.sx, n.sy);
    }
  }

  private deform(time: number) {
    const wave = Math.sin(time * 6);
    for (const entry of this.meshes) {
      const buf = entry.mesh.geometry.getAttribute("aPosition").buffer;
      const data = buf.data as Float32Array;
      data.set(entry.base);
      const cols = 4;
      for (let i = 0; i < data.length; i += 2) {
        const col = (i / 2) % cols;
        if (col === 0 || col === cols - 1) data[i] += wave * (2 + col);
      }
      buf.update();
    }
  }

  private fireEvents() {
    const evs = this.doc?.animations[this.clip]?.events ?? [];
    for (const ev of evs) {
      const id = `${this.clip}:${ev.time}:${ev.name}`;
      if (this.time >= ev.time && !this.fired.has(id)) {
        this.fired.add(id);
        this.onEvent(ev.name);
      }
    }
  }
}

function lerpAngle(a: number, b: number, u: number) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * u;
}

function billboardDoc(w: number, h: number): SpineDoc {
  const bez = [0.45, 0, 0.2, 1];
  return {
    skeleton: { hash: "billboard", spine: "4.1.0", x: -w / 2, y: 0, width: w, height: h, fps: 60 },
    bones: [
      { name: "root" },
      { name: "body", parent: "root", x: 0, y: 0, rotation: 0, length: h * 0.5 },
    ],
    slots: [{ name: "body", bone: "body", attachment: "body" }],
    skins: [
      {
        name: "default",
        attachments: { body: { body: { x: 0, y: h / 2, rotation: 0, width: w, height: h } } },
      },
    ],
    events: { hit: {}, fx: {}, shake: {} },
    animations: {
      idle: {
        bones: {
          body: {
            rotate: [
              { time: 0, angle: -1.6, curve: bez },
              { time: 0.8, angle: 1.6, curve: bez },
              { time: 1.6, angle: -1.6 },
            ],
            scale: [
              { time: 0, x: 1, y: 1, curve: bez },
              { time: 0.8, x: 1.02, y: 0.98, curve: bez },
              { time: 1.6, x: 1, y: 1 },
            ],
          },
        },
      },
      attack: {
        bones: {
          body: {
            rotate: [
              { time: 0, angle: 0 },
              { time: 0.16, angle: -8 },
              { time: 0.32, angle: 10 },
              { time: 0.5, angle: 0 },
            ],
          },
        },
        events: [
          { time: 0.32, name: "hit" },
          { time: 0.32, name: "shake" },
        ],
      },
      hit: {
        bones: {
          body: {
            rotate: [
              { time: 0, angle: 0 },
              { time: 0.1, angle: 8 },
              { time: 0.28, angle: 0 },
            ],
            translate: [
              { time: 0, x: 0, y: 0 },
              { time: 0.1, x: 14, y: 0 },
              { time: 0.28, x: 0, y: 0 },
            ],
          },
        },
      },
      stun: {
        bones: {
          body: {
            rotate: [
              { time: 0, angle: -4 },
              { time: 0.18, angle: 4 },
              { time: 0.36, angle: -4 },
            ],
          },
        },
      },
      death: {
        bones: {
          body: {
            rotate: [
              { time: 0, angle: 0 },
              { time: 0.45, angle: 80 },
            ],
            translate: [
              { time: 0, x: 0, y: 0 },
              { time: 0.45, x: 10, y: -40 },
            ],
          },
        },
      },
    },
  };
}
