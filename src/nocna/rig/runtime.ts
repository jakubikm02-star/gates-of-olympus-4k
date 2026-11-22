import { Assets, Container, MeshPlane, MeshSimple, Rectangle, Sprite, Texture } from "pixi.js";
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
    this.time += dt / 1000;
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
    }
    for (const slot of doc.slots) {
      const bone = this.bones.get(slot.bone);
      const att = slot.attachment ? skin[slot.name]?.[slot.attachment] : undefined;
      const tex = slot.attachment ? this.regions.get(slot.attachment) : undefined;
      if (!bone || !att || !tex) continue;
      bone.view.addChild(this.makeSlot(slot.bone, att, tex));
    }
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
        wrap.addChild(this.regionSprite(att, tex));
      }
    } else {
      wrap.addChild(this.regionSprite(att, tex));
    }
    return wrap;
  }

  private regionSprite(att: RegionAttach, tex: Texture) {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = att.width;
    sprite.height = att.height;
    return sprite;
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
    this.fireEvents();
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
      if ((ik.mix ?? 1) <= 0 || ik.bones.length < 2) continue;
      const targetMoved = this.bones.get(ik.target);
      if (targetMoved && Math.hypot(targetMoved.x - targetMoved.setupX, targetMoved.y - targetMoved.setupY) < 1.5) continue;
      const [aName, bName] = ik.bones;
      const A = this.bones.get(aName);
      const B = this.bones.get(bName);
      const T = this.bones.get(ik.target);
      if (!A?.parent || !B || !T) continue;
      const parent = this.world(A.parent);
      const aw = this.world(aName);
      const tw = this.world(ik.target);
      // World positions are in y-down pixels. Convert the target offset to y-up.
      const dx = tw.x - aw.x;
      const dy = -(tw.y - aw.y);
      const solved = solveTwoBone(Math.max(8, A.length), Math.max(8, B.length), dx, dy, Boolean(ik.bendPositive));
      const localA = solved.a - parent.rot;
      A.rotation = A.rotation + (localA - A.rotation) * (ik.mix ?? 1);
      B.rotation = B.rotation + (solved.b - B.rotation) * (ik.mix ?? 1);
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
