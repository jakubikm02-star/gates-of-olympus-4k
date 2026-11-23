/**
 * Cabinet fight scene. Pixi draws the machine, the rig and the cues.
 * DOM keeps only the settings popover and the tap bubble.
 */
import { Application, Assets, BlurFilter, Container, Graphics, RenderTexture, Sprite, Text, Texture, type Ticker } from "pixi.js";
import { FEEL } from "@/lib/revier/feel";
import type { FeelTarget } from "@/lib/revier/feel";
import { PLAY_SYMS, SYM, bgSrc } from "@/lib/revier/symbols";
import type { Cue, FightSnap, WinSnap } from "@/nocna/fight-types";
import { Rig } from "@/nocna/rig/runtime";
import { Director, type Clip } from "./director";
import { ease } from "./eases";
import { readPalette, type Palette } from "./palette";
import { ParticlePool } from "./particles";

export type { Cue, FightSnap, WinSnap };

/**
 * Cut-out atlases stay on disk for the rig editor. They are rectangle crops of a
 * flat painting, so rotated parts show hard edges and gaps. The fight uses the
 * single-bone idle until real separated part art exists.
 */
const RIGS: Record<string, string> = {};

const ENEMY_URLS = Object.keys(RIGS).concat([
  "/nocna/enemies/enemy-pokutomat.webp",
  "/nocna/enemies/enemy-uradnicka.webp",
  "/nocna/enemies/enemy-ozran.webp",
  "/nocna/enemies/enemy-zlodej-paragonov.webp",
  "/nocna/enemies/elite-krovinorez.webp",
  "/nocna/enemies/elite-motorka-smrti.webp",
  "/nocna/enemies/elite-vyberca-myta.webp",
  "/nocna/bosses/boss-2-demon-ziariviek.webp",
  "/nocna/bosses/boss-3-anjel-exekucie.webp",
  "/nocna/bosses/boss-4-general-podatelne.webp",
  "/nocna/bosses/boss-5-prednosta.webp",
]);

export const fpsProbe = { avg: 0, max: 0, samples: [] as number[] };

function urls(): string[] {
  const syms = PLAY_SYMS.map((id) => SYM[id].art);
  const bgs = [1, 2, 3, 4, 5, 6].flatMap((floor) =>
    (["port", "land", "fold-port", "fold-land"] as const).map((k) => bgSrc(floor, k)),
  );
  return [...syms, ...bgs, ...ENEMY_URLS, "/nocna/ui/ui-hp-heart.webp", "/nocna/ui/ui-coin.webp", "/nocna/ui/ui-shield.webp"];
}

let preloaded: Promise<void> | null = null;
export function preloadNocna(): Promise<void> {
  preloaded ??= Assets.load(urls()).then(() => undefined);
  return preloaded;
}

interface WinNode {
  root: Container;
  hole: Graphics;
  frame: Graphics;
  glass: Graphics;
  icon: Sprite;
  chip: Text;
  token: number;
  size: number;
}

class Quality {
  tier: "high" | "low" = "high";
  private force: boolean | null = null;
  private bad = 0;
  private good = 0;
  note(ms: number) {
    if (this.force != null) {
      this.tier = this.force ? "high" : "low";
      return;
    }
    if (ms > FEEL.budgetMs) {
      this.bad++;
      this.good = 0;
      if (this.bad >= FEEL.budgetFrames) this.tier = "low";
    } else {
      this.good++;
      this.bad = Math.max(0, this.bad - 1);
      if (this.good >= FEEL.recoverFrames) this.tier = "high";
    }
  }
  setEffects(on: boolean) {
    this.force = on;
    this.tier = on ? "high" : "low";
  }
}

export class FightStage {
  private app: Application;
  private world = new Container();
  private bg = new Sprite();
  private bgDim = new Graphics();
  private rigLayer = new Container();
  private cabinet = new Graphics();
  private light = new Graphics();
  private rig: Rig | null = null;
  private rigArt = "";
  private rigToken = 0;
  private rigClip = "";
  private introDone = new Set<string>();
  private director = new Director();
  private particles: ParticlePool;
  private quality = new Quality();
  private blur = new BlurFilter({ strength: 0 });
  private wins: WinNode[] = [];
  private flyer = new Sprite();
  private num: Text;
  private intentText: Text;
  private ehpNum: Text;
  private hpNum: Text;
  private coinNum: Text;
  private turnText: Text;
  private btn: Container;
  private btnFace: Graphics;
  private btnLabel: Text;
  private bars = new Graphics();
  private deck: Sprite[] = [];
  private pal: Palette = readPalette(null);
  private snap: FightSnap | null = null;
  private onReel: (i: number) => void = () => {};
  private onDeck: (i: number) => void = () => {};
  private onPress: () => void = () => {};
  private pace = 1;
  private reduced = false;
  private shake = 1;
  private shakeT = 0;
  private cueReel = -1;
  private foeWait: (() => void) | null = null;
  private pending: (() => void) | null = null;
  private hpShown = 100;
  private hpTrail = 100;
  private ehpShown = 1;
  private shShown = 0;
  private eshShown = 0;
  private youX = 0;
  private youY = 0;
  private coinX = 0;
  private coinY = 0;
  private foeX = 0;
  private foeY = 0;
  private phase = "";
  private destroyed = false;
  private observer: ResizeObserver | null = null;
  private btnScale = 1;
  private hpFill = new Sprite(Texture.WHITE);
  private hpGhost = new Sprite(Texture.WHITE);
  private shFill = new Sprite(Texture.WHITE);
  private ehpFill = new Sprite(Texture.WHITE);
  private heart = new Sprite();
  private shieldIcon = new Sprite();
  private coinIcon = new Sprite();
  private plates = new Graphics();
  private baked = new Sprite();
  private rt: RenderTexture | null = null;
  private builtW = 0;
  private builtH = 0;
  private builtN = 0;
  private bgUrl = "";
  private bgScaled = new Map<string, Texture>();
  private barW = 180;
  private eBarW = 140;
  private lastHp = "";
  private lastEhp = "";
  private fpsSum = 0;

  private constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.pal = readPalette(host.closest(".ns") ?? host);
    this.flyer.anchor.set(0.5);
    this.flyer.visible = false;
    this.num = new Text({ text: "", style: { fill: this.pal.glow, fontSize: 40, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.num.anchor.set(0.5);
    this.num.visible = false;
    this.intentText = new Text({ text: "", style: { fill: this.pal.glow, fontSize: 28, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.ehpNum = new Text({ text: "", style: { fill: this.pal.text, fontSize: 18, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.hpNum = new Text({ text: "", style: { fill: this.pal.text, fontSize: 18, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.coinNum = new Text({ text: "", style: { fill: this.pal.glow, fontSize: 20, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.turnText = new Text({ text: "", style: { fill: this.pal.accent, fontSize: 18, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.turnText.anchor.set(0.5, 0);
    this.btn = new Container();
    this.btnFace = new Graphics();
    this.btnLabel = new Text({ text: "", style: { fill: this.pal.ink, fontSize: 28, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.btnLabel.anchor.set(0.5);
    this.btn.addChild(this.btnFace, this.btnLabel);
    this.btn.eventMode = "static";
    this.btn.cursor = "pointer";
    this.btn.on("pointertap", () => {
      this.pump();
      this.onPress();
    });
    this.bg.anchor.set(0.5);
    this.hpGhost.tint = 0x5a201c;
    this.hpFill.tint = this.pal.hp;
    this.shFill.tint = this.pal.shield;
    this.ehpFill.tint = this.pal.hp;
    for (const s of [this.hpGhost, this.hpFill, this.shFill, this.ehpFill]) s.scale.y = 8;
    this.heart.anchor.set(0.5);
    this.shieldIcon.anchor.set(0.5);
    this.coinIcon.anchor.set(0.5);
    this.particles = new ParticlePool(this.world, FEEL.particles);
    this.baked.visible = false;
    this.world.addChild(this.baked, this.bg, this.bgDim, this.rigLayer, this.light, this.cabinet, this.plates, this.hpGhost, this.hpFill, this.shFill, this.ehpFill, this.heart, this.shieldIcon, this.coinIcon, this.bars, this.flyer, this.num, this.intentText, this.ehpNum, this.hpNum, this.coinNum, this.turnText, this.btn);
    app.stage.addChild(this.world);
    app.ticker.add(this.tick);
  }

  static async mount(host: HTMLElement): Promise<FightStage> {
    await preloadNocna();
    const app = new Application();
    const dpr = Math.min(FEEL.dprCap, window.devicePixelRatio || 1);
    await app.init({
      backgroundAlpha: 0,
      antialias: false,
      resolution: dpr,
      autoDensity: true,
      width: Math.max(2, host.clientWidth),
      height: Math.max(2, host.clientHeight),
      preference: "webgl",
      powerPreference: "high-performance",
    });
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.touchAction = "none";
    host.appendChild(app.canvas);
    const stage = new FightStage(app, host);
    const fit = () => {
      if (stage.destroyed || !app.renderer) return;
      try {
        app.renderer.resize(Math.max(2, host.clientWidth), Math.max(2, host.clientHeight));
        stage.layout();
      } catch {
        /* renderer already gone */
      }
    };
    stage.observer = new ResizeObserver(fit);
    stage.observer.observe(host);
    fit();
    host.dataset.pixi = "1";
    return stage;
  }

  setHooks(hooks: { onReel: (i: number) => void; onDeck?: (i: number) => void; onPress?: () => void }) {
    this.onReel = hooks.onReel;
    this.onDeck = hooks.onDeck ?? (() => {});
    this.onPress = hooks.onPress ?? (() => {});
  }

  setSnap(snap: FightSnap) {
    const prev = this.phase;
    this.snap = snap;
    this.reduced = snap.reduced;
    this.shake = snap.shake;
    this.phase = snap.phase;
    this.syncRig(snap);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const n = Math.max(1, snap.windows.length || 3);
    if (w !== this.builtW || h !== this.builtH || n !== this.builtN || snap.bg !== this.bgUrl) this.layout();
    else this.patch(snap);
    if (prev && prev !== snap.phase && !this.reduced) this.shutter();
  }

  setEffects(on: boolean) {
    this.quality.setEffects(on);
  }

  pump() {
    this.btnScale = 0.92;
    void this.director.play({
      duration: FEEL.buttonSquashMs,
      ease: ease.outCubic,
      update: (u) => {
        this.btnScale = 0.92 + 0.08 * u;
      },
    });
  }

  setPace(pace: number) {
    this.pace = pace;
  }

  skip() {
    this.director.clear();
    this.foeWait?.();
    this.foeWait = null;
    this.pending?.();
    this.pending = null;
    this.flyer.visible = false;
    this.num.visible = false;
    this.cueReel = -1;
  }

  playCue(cue: Cue, onImpact: () => void): Promise<void> {
    const hold = cue.sym === "exekucia" || cue.sym === "natural" ? FEEL.bigHoldMs : FEEL.resultHoldMs;
    const k = this.reduced ? 0.35 : 1;
    this.cueReel = cue.reel;
    let impacted = false;
    const hit = () => {
      if (impacted) return;
      impacted = true;
      onImpact();
      this.popNumber(cue.chip, cue.crit);
      if (cue.target === "foe" && cue.sym !== "restart") void this.rig?.play(this.snap && this.snap.ehp <= 0 ? "death" : "hit", { loop: false, mix: FEEL.rigMix });
      if (!this.reduced && this.quality.tier === "high" && cue.crit) this.flashBlur();
      this.kick(cue.crit ? FEEL.shakeCritMs : FEEL.shakeHitMs);
      const at = this.targetPoint(cue.target);
      this.particles.burst({
        x: at.x,
        y: at.y,
        n: cue.crit ? 16 : 8,
        color: cue.crit ? this.pal.glow : this.pal.danger,
        speed: cue.crit ? 0.45 : 0.28,
        life: 420,
        g: FEEL.gravity,
        ring: cue.crit,
        trails: this.quality.tier === "high",
      });
    };
    const clip: Clip = {
      seq: [
        {
          duration: FEEL.chargeMs * k,
          ease: ease.outCubic,
          update: (u) => {
            const win = this.wins[cue.reel];
            if (win) win.root.scale.set(1 + u * 0.06);
          },
        },
        {
          duration: FEEL.travelMs * k,
          ease: ease.outCubic,
          update: (u) => {
            const win = this.wins[cue.reel];
            const from = win ? { x: win.root.x + win.size / 2, y: win.root.y + win.size / 2 } : { x: 40, y: 40 };
            const to = this.targetPoint(cue.target);
            const arc = Math.sin(u * Math.PI) * (cue.crit ? 28 : 14);
            this.flyer.visible = true;
            const art = SYM[cue.sym as keyof typeof SYM]?.art;
            if (art) this.flyer.texture = Texture.from(art);
            this.flyer.position.set(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u - arc);
            this.flyer.scale.set(cue.crit ? 0.62 : 0.4);
            if (this.quality.tier === "high" && u > 0.15 && Math.random() < 0.7) {
              this.particles.burst({ x: this.flyer.x, y: this.flyer.y, n: 1, color: this.pal.accent, speed: 0.08, life: 180, g: 0, trails: true });
            }
          },
          onComplete: () => {
            this.flyer.visible = false;
            hit();
          },
        },
        { wait: hold * k },
      ],
    };
    return new Promise((resolve) => {
      this.pending = resolve;
      void this.director.play(clip).then(() => {
        this.cueReel = -1;
        for (const win of this.wins) win.root.scale.set(1);
        this.num.visible = false;
        if (this.pending === resolve) this.pending = null;
        resolve();
      });
    });
  }

  playFoe(text: string, _kind: "hit" | "block" | "miss" | "heal", at: "you" | "foe" = "you"): Promise<void> {
    const k = this.reduced ? 0.4 : 1;
    const crit = text === "KRIT" || text === "MEGA";
    if (crit) void this.rig?.play("attack", { loop: false, mix: FEEL.rigMix });
    else if (at === "you") void this.rig?.play("attack", { loop: false, mix: FEEL.rigMix });
    const show = () => {
      this.num.text = text;
      this.num.visible = true;
      this.num.scale.set(0.4);
      this.num.position.set(at === "foe" ? this.foeX : this.youX, (at === "foe" ? this.foeY : this.youY) - 36);
      void this.director.play({
        duration: FEEL.numberPopMs,
        ease: ease.outBack,
        update: (u) => this.num.scale.set(0.4 + u * 0.8),
      });
      if (text === "shake" || crit) this.kick(FEEL.shakeCritMs);
    };
    return new Promise((resolve) => {
      this.pending = resolve;
      this.foeWait = () => {
        show();
      };
      const tell = crit ? FEEL.critLinkMs : FEEL.foeTellMs;
      void this.director
        .play({
          seq: [
            {
              duration: tell * k,
              ease: ease.outCubic,
              update: (u) => {
                if (this.rig) this.rig.alpha = 0.75 + 0.25 * Math.abs(Math.sin(u * 12));
              },
              onComplete: () => {
                this.foeWait?.();
                this.foeWait = null;
                if (this.rig) this.rig.alpha = 1;
              },
            },
            { wait: (crit ? 700 : FEEL.foeHoldMs) * k },
          ],
        })
        .then(() => {
          this.num.visible = false;
          if (!crit) void this.rig?.play(this.snap?.stunned ? "stun" : "idle", { loop: true, mix: FEEL.rigMix });
          if (this.pending === resolve) this.pending = null;
          resolve();
        });
    });
  }

  destroy() {
    this.destroyed = true;
    this.skip();
    this.observer?.disconnect();
    this.rig?.destroy();
    this.app.destroy(true);
  }

  private onRigEvent = (name: string) => {
    if (name === "hit") this.foeWait?.();
    if (name === "shake") this.kick(FEEL.shakeHitMs);
    if (name === "fx") this.particles.burst({ x: this.foeX, y: this.foeY - 40, n: 10, color: this.pal.danger, speed: 0.3, life: 360, g: FEEL.gravity, trails: this.quality.tier === "high" });
  };

  private syncRig(snap: FightSnap) {
    const art = snap.enemyArt || this.rigArt;
    if (!art) return;
    if (art === this.rigArt && this.rig) {
      this.rig.setQuality({ springs: false, mesh: false });
      if (snap.shop && this.rigClip !== "idle") {
        this.rigClip = "idle";
        void this.rig.play("idle", { loop: true, mix: FEEL.rigMix });
      } else if (snap.stunned && this.rigClip !== "stun" && !snap.shop) {
        this.rigClip = "stun";
        void this.rig.play("stun", { loop: true, mix: FEEL.rigMix });
      }
      return;
    }
    const token = ++this.rigToken;
    this.rigArt = art;
    const packed = RIGS[art];
    const load = packed ? Rig.loadPacked(packed, this.onRigEvent) : Rig.loadBillboard(art, this.onRigEvent);
    void load.then((rig) => {
      if (this.destroyed || token !== this.rigToken) {
        rig.destroy();
        return;
      }
      this.rig?.destroy();
      this.rig = rig;
      this.rigLayer.addChild(rig);
      rig.setQuality({ springs: !this.reduced && this.quality.tier === "high", mesh: this.quality.tier === "high" });
      const boss = art.includes("kurier");
      if (boss && !this.introDone.has(art)) {
        this.introDone.add(art);
        this.rigClip = "intro";
        void rig.play("intro", { loop: false, mix: 0 }).then(() => {
          if (this.rig === rig) void rig.play("idle", { loop: true, mix: FEEL.rigMix });
        });
      } else {
        this.rigClip = "idle";
        void rig.play("idle", { loop: true, mix: 0 });
      }
      this.layout();
    });
  }

  private layout() {
    const snap = this.snap;
    if (!snap) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const land = w > h * 1.05;
    const pal = (this.pal = readPalette(this.app.canvas.parentElement));
    this.builtW = w;
    this.builtH = h;
    this.builtN = Math.max(1, snap.windows.length || 3);
    this.useBg(snap.bg);
    this.bg.position.set(w / 2, h / 2);
    const L = FEEL.layout;
    let foeX = w * 0.5;
    let foeY = h * (L.enemyTop + L.enemyH);
    let foeH = h * L.enemyH;
    let reelY = h * (1 - L.reelBottom - L.reelH);
    let reelX = w * L.gap;
    let reelW = w * (1 - L.gap * 2);
    if (land) {
      foeX = w * L.landEnemyW * 0.55;
      foeY = h * 0.78;
      foeH = h * 0.7;
      reelX = w * (L.landEnemyW + 0.02);
      reelW = w * (1 - L.landEnemyW - 0.08);
      reelY = h * 0.28;
    }
    this.foeX = foeX;
    this.foeY = foeY;
    if (this.rig?.doc) {
      const sk = this.rig.doc.skeleton.height || 512;
      const sc = (foeH * 0.9) / sk;
      this.rig.scale.set(sc);
      this.rig.position.set(foeX, foeY);
      this.rig.visible = true;
    }
    this.paintCabinet(w, h, pal, land);
    const n = Math.max(1, snap.windows.length || 3);
    const gap = 10;
    const cell = Math.min((reelW - gap * (n - 1)) / n, h * L.reelH);
    const rowW = cell * n + gap * (n - 1);
    const x0 = reelX + (reelW - rowW) / 2;
    while (this.wins.length < n) this.wins.push(this.makeWin());
    this.wins.forEach((win, i) => {
      win.root.visible = i < n;
      if (i >= n) return;
      const spec = snap.windows[i];
      win.size = cell;
      win.root.position.set(x0 + i * (cell + gap), reelY);
      this.paintWindow(win, cell, pal, Boolean(spec?.crit));
      const prev = win.token;
      win.token = spec?.token ?? 0;
      if (spec && spec.mode === "sit" && spec.sym && spec.token !== prev) this.dropIn(win, spec, cell);
      else if (!win.icon.visible || spec?.mode !== "sit") this.sit(win, spec, cell);
      win.chip.text = spec?.mode === "sit" ? spec.chip : "";
      win.chip.position.set(cell / 2, cell - 4);
      win.root.removeAllListeners();
      win.root.eventMode = "static";
      win.root.on("pointertap", () => this.onReel(i));
    });
    this.placeDeck(snap, foeX, foeY, foeH);
    const barW = Math.min(220, w * 0.46);
    const barX = land ? 16 : 18;
    const barY = land ? h * 0.86 : reelY - 28;
    this.youX = barX + 28;
    this.youY = barY;
    this.paintBars(barX, barY, barW, foeX, foeY, pal, snap);
    this.coinX = w - 36;
    this.coinY = 28;
    this.coinNum.text = String(snap.coins);
    this.coinNum.position.set(w - 52, 16);
    this.turnText.text = snap.hint || snap.turn;
    this.turnText.position.set(w / 2, 8);
    this.intentText.text = snap.shop ? "" : snap.intent;
    this.btnLabel.text = snap.button;
    const bw = Math.min(w * 0.84, 420);
    const bh = Math.min(64, h * 0.09);
    const bx = (w - bw) / 2;
    const by = h - bh - 12;
    this.btn.position.set(bx + bw / 2, by + bh / 2);
    this.paintButton(bw, bh, pal);
    this.btnLabel.style.fill = pal.ink;
    this.heart.texture = Texture.from("/nocna/ui/ui-hp-heart.webp");
    this.shieldIcon.texture = Texture.from("/nocna/ui/ui-shield.webp");
    this.coinIcon.texture = Texture.from("/nocna/ui/ui-coin.webp");
    this.coinIcon.position.set(this.coinX, this.coinY);
    this.coinIcon.width = 22;
    this.coinIcon.height = 22;
    this.bake();
  }

  /** One screen texture for the background and metal, so the frame is a single quad. */
  private bake() {
    const w = Math.max(2, Math.round(this.app.screen.width));
    const h = Math.max(2, Math.round(this.app.screen.height));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.destroy(true);
      this.rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
      this.baked.texture = this.rt;
    }
    const hide = [
      this.baked, this.rigLayer, this.btn, this.flyer, this.num, this.hpFill, this.hpGhost, this.shFill, this.ehpFill,
      this.heart, this.shieldIcon, this.coinIcon, this.intentText, this.ehpNum, this.hpNum, this.coinNum, this.turnText,
    ];
    const was = hide.map((node) => node.visible);
    for (const node of hide) node.visible = false;
    const iconWas = this.wins.map((win) => win.icon.visible);
    const chipWas = this.wins.map((win) => win.chip.visible);
    const deckWas = this.deck.map((s) => s.visible);
    for (const win of this.wins) {
      win.icon.visible = false;
      win.chip.visible = false;
    }
    for (const s of this.deck) s.visible = false;
    this.bg.visible = true;
    this.cabinet.visible = true;
    this.plates.visible = true;
    for (const win of this.wins) {
      win.frame.visible = true;
      win.hole.visible = true;
      win.glass.visible = true;
    }
    this.app.renderer.render({ container: this.world, target: this.rt, clear: true });
    this.bg.visible = false;
    this.cabinet.visible = false;
    this.plates.visible = false;
    this.bgDim.visible = false;
    for (const win of this.wins) {
      win.frame.visible = false;
      win.hole.visible = false;
      win.glass.visible = false;
    }
    hide.forEach((node, i) => {
      node.visible = was[i];
    });
    this.baked.visible = true;
    this.wins.forEach((win, i) => {
      win.icon.visible = iconWas[i];
      win.chip.visible = chipWas[i];
    });
    this.deck.forEach((s, i) => {
      s.visible = deckWas[i];
    });
  }

  /** Numbers and symbols only. Geometry stays cached. */
  private patch(snap: FightSnap) {
    this.btnLabel.text = snap.button;
    this.turnText.text = snap.hint || snap.turn;
    this.coinNum.text = String(snap.coins);
    this.intentText.text = snap.shop ? "" : snap.intent;
    const cell = this.wins[0]?.size || 80;
    this.wins.forEach((win, i) => {
      const spec = snap.windows[i];
      if (!spec) return;
      const prev = win.token;
      win.token = spec.token ?? 0;
      if (spec.mode === "sit" && spec.sym && spec.token !== prev) this.dropIn(win, spec, cell);
      else if (spec.mode !== "sit") this.sit(win, spec, cell);
      win.chip.text = spec.mode === "sit" ? spec.chip : "";
    });
    this.placeDeck(snap, this.foeX, this.foeY, this.app.screen.height * FEEL.layout.enemyH);
  }

  private paintButton(bw: number, bh: number, pal: Palette) {
    const g = this.btnFace;
    g.clear();
    g.roundRect(-bw / 2 + 3, -bh / 2 + 6, bw, bh, bh / 2).fill({ color: 0x3a2a08, alpha: 0.9 });
    g.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2).fill({ color: 0x8a5a04 });
    g.roundRect(-bw / 2, -bh / 2, bw, bh * 0.55, bh / 2).fill({ color: pal.btn });
    g.roundRect(-bw / 2 + 10, -bh / 2 + 4, bw - 20, bh * 0.28, bh / 2).fill({ color: 0xfff6c8, alpha: 0.55 });
    g.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2).stroke({ color: pal.metal, width: 4 });
    g.roundRect(-bw / 2 - 3, -bh / 2 - 3, bw + 6, bh + 6, bh / 2).stroke({ color: pal.glow, width: 2, alpha: 0.45 });
  }

  private paintCabinet(w: number, h: number, pal: Palette, _land: boolean) {
    this.cabinet.clear();
    this.cabinet.roundRect(6, 6, w - 12, h - 12, 26).fill({ color: 0x1a140c, alpha: 0.35 });
    this.cabinet.roundRect(6, 6, w - 12, h - 12, 26).stroke({ color: 0x4a4034, width: 10 });
    this.cabinet.roundRect(10, 10, w - 20, 18, 8).stroke({ color: 0xd9d0c2, width: 3, alpha: 0.55 });
    this.cabinet.roundRect(12, 12, w - 24, h - 24, 20).stroke({ color: pal.metal, width: 3, alpha: 0.9 });
    this.cabinet.roundRect(16, 16, w - 32, h - 32, 16).stroke({ color: 0x120e0a, width: 4, alpha: 0.85 });
    for (const [x, y] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]] as const) {
      this.cabinet.circle(x, y, 5).fill({ color: 0x2a241c }).stroke({ color: 0xe7d7b0, width: 1.5 });
    }
    this.light.visible = false;
    this.bgDim.visible = false;
  }

  private useBg(url: string) {
    const cached = this.bgScaled.get(url);
    this.bgUrl = url;
    if (cached) {
      this.bg.texture = cached;
      this.fitBg();
      return;
    }
    void this.shrinkBg(url).then((tex) => {
      this.bgScaled.set(url, tex);
      if (this.bgUrl === url) {
        this.bg.texture = tex;
        this.fitBg();
        this.bake();
      }
    });
  }

  private fitBg() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const tw = Math.max(1, this.bg.texture.width);
    const th = Math.max(1, this.bg.texture.height);
    this.bg.scale.set(Math.max(w / tw, h / th));
    this.bg.position.set(w / 2, h / 2);
  }

  private shrinkBg(url: string): Promise<Texture> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxEdge = 960;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        if (scale >= 0.99) {
          resolve(Texture.from(url));
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(2, Math.round(img.width * scale));
        canvas.height = Math.max(2, Math.round(img.height * scale));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(Texture.from(canvas));
      };
      img.onerror = () => resolve(Texture.from(url));
      img.src = url;
    });
  }

  private paintWindow(win: WinNode, cell: number, pal: Palette, crit: boolean) {
    win.hole.clear().roundRect(6, 6, cell - 12, cell - 12, 10).fill({ color: 0x07080c, alpha: 0.92 });
    win.frame.clear();
    win.frame.roundRect(-6, -6, cell + 12, cell + 12, 16).fill({ color: 0x3a3228 });
    win.frame.roundRect(-6, -6, cell + 12, cell + 12, 16).stroke({ color: 0xc8bba4, width: 2, alpha: 0.7 });
    win.frame.roundRect(-2, -2, cell + 4, cell + 4, 12).stroke({ color: 0x1a140e, width: 4 });
    win.frame.roundRect(0, 0, cell, 8, 4).fill({ color: 0xfff4d4, alpha: 0.18 });
    win.frame.circle(4, 4, 3).fill({ color: 0xe6d3a8 });
    win.frame.circle(cell - 4, 4, 3).fill({ color: 0xe6d3a8 });
    win.frame.circle(4, cell - 4, 3).fill({ color: 0x6a5a44 });
    win.frame.circle(cell - 4, cell - 4, 3).fill({ color: 0x6a5a44 });
    if (crit) win.frame.roundRect(-8, -8, cell + 16, cell + 16, 18).stroke({ color: pal.glow, width: 4, alpha: 0.95 });
    win.glass.clear();
    win.glass.roundRect(10, 8, cell - 20, cell * 0.34, 8).fill({ color: 0xffffff, alpha: 0.16 });
    win.glass.roundRect(8, cell * 0.55, cell - 16, cell * 0.28, 8).fill({ color: pal.accent, alpha: 0.08 });
    }

  private paintBars(x: number, y: number, barW: number, foeX: number, foeY: number, pal: Palette, _snap: FightSnap) {
    this.barW = barW;
    this.eBarW = barW * 0.8;
    this.plates.clear();
    this.plates.roundRect(x - 28, y - 16, barW + 78, 48, 12).fill({ color: 0x16120e, alpha: 0.88 }).stroke({ color: pal.metal, width: 2 });
    this.plates.roundRect(foeX - this.eBarW / 2 - 36, foeY - 6, this.eBarW + 78, 32, 10).fill({ color: 0x16120e, alpha: 0.88 }).stroke({ color: pal.metal, width: 2 });
    this.hpGhost.position.set(x, y);
    this.hpFill.position.set(x, y);
    this.shFill.position.set(x, y + 14);
    this.ehpFill.position.set(foeX - this.eBarW / 2, foeY + 6);
    this.hpGhost.scale.y = 10;
    this.hpFill.scale.y = 10;
    this.shFill.scale.y = 6;
    this.ehpFill.scale.y = 8;
    this.heart.position.set(x - 14, y + 8);
    this.heart.width = 20;
    this.heart.height = 20;
    this.shieldIcon.position.set(x - 14, y + 18);
    this.shieldIcon.width = 16;
    this.shieldIcon.height = 16;
    this.ehpNum.anchor.set(0, 1);
    this.ehpNum.position.set(foeX - this.eBarW / 2, foeY - 2);
    this.hpNum.position.set(x + barW + 8, y - 4);
    this.intentText.position.set(foeX + this.eBarW / 2 + 12, foeY + 2);
    this.hpFill.tint = pal.hp;
    this.shFill.tint = pal.shield;
    this.ehpFill.tint = pal.hp;
  }

  private placeDeck(snap: FightSnap, foeX: number, foeY: number, foeH: number) {
    const deck = snap.shop ? snap.deck : [];
    while (this.deck.length < deck.length) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.eventMode = "static";
      const idx = this.deck.length;
      s.on("pointertap", () => this.onDeck(idx));
      this.world.addChild(s);
      this.deck.push(s);
    }
    this.deck.forEach((s, i) => {
      const id = deck[i];
      if (!id) {
        s.visible = false;
        return;
      }
      const art = SYM[id as keyof typeof SYM]?.art;
      if (art) s.texture = Texture.from(art);
      s.visible = true;
      const size = 56;
      s.position.set(foeX - ((Math.min(5, deck.length) - 1) * 64) / 2 + (i % 5) * 64, foeY - foeH * 0.55 + Math.floor(i / 5) * 64);
      s.width = size;
      s.height = size;
    });
  }

  private makeWin(): WinNode {
    const root = new Container();
    const frame = new Graphics();
    const hole = new Graphics();
    const glass = new Graphics();
    const icon = new Sprite();
    icon.anchor.set(0.5);
    const chip = new Text({ text: "", style: { fill: 0xffe9a0, fontSize: 16, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    chip.anchor.set(0.5, 1);
    root.addChild(frame, hole, glass, icon, chip);
    this.world.addChild(root);
    return { root, hole, frame, glass, icon, chip, token: -1, size: 80 };
  }

  private sit(win: WinNode, spec: WinSnap | undefined, cell: number) {
    if (!spec || spec.mode === "empty" || !spec.sym) {
      win.icon.visible = false;
      return;
    }
    if (spec.mode === "flicker") {
      win.icon.visible = false;
      return;
    }
    const art = SYM[spec.sym as keyof typeof SYM]?.art;
    if (art) win.icon.texture = Texture.from(art);
    win.icon.visible = true;
    win.icon.position.set(cell / 2, cell / 2);
    win.icon.width = cell * 0.82;
    win.icon.height = cell * 0.82;
  }

  private dropIn(win: WinNode, spec: WinSnap, cell: number) {
    const art = spec.sym ? SYM[spec.sym as keyof typeof SYM]?.art : "";
    if (art) win.icon.texture = Texture.from(art);
    win.icon.visible = true;
    win.icon.width = cell * 0.82;
    win.icon.height = cell * 0.82;
    const base = win.icon.scale.x || 1;
    void this.director.play({
      duration: this.reduced ? 80 : FEEL.dropMs,
      ease: ease.outBack,
      update: (u) => {
        win.icon.position.set(cell / 2, -cell * 0.2 + u * (cell * 0.7));
        const squash = u > 0.78 ? 0.84 + (u - 0.78) * 0.7 : 1.08 - u * 0.08;
        win.icon.scale.set(base * (2 - squash), base * squash);
      },
      onComplete: () => {
        win.icon.position.set(cell / 2, cell / 2);
        win.icon.scale.set(base);
        this.particles.burst({ x: win.root.x + cell / 2, y: win.root.y + cell, n: 6, color: this.pal.glow, speed: 0.2, life: 260, g: FEEL.gravity });
      },
    });
  }

  private popNumber(text: string, crit: boolean) {
    if (!text) return;
    this.num.text = text;
    this.num.visible = true;
    this.num.style.fill = crit ? this.pal.glow : this.pal.text;
  }

  private shutter() {
    void this.director.play({
      duration: FEEL.shutterMs,
      ease: ease.outCubic,
      update: (u) => {
        this.light.alpha = u < 0.5 ? u * 2 : (1 - u) * 2;
      },
    });
  }

  private flashBlur() {
    this.rig && (this.rig.filters = [this.blur]);
    void this.director.play({
      duration: 160,
      ease: ease.outCubic,
      update: (u) => {
        this.blur.strength = (1 - u) * 6;
      },
      onComplete: () => {
        this.blur.strength = 0;
        if (this.rig) this.rig.filters = [];
      },
    });
  }

  private kick(ms: number) {
    this.shakeT = ms * this.shake;
  }

  private targetPoint(target: FeelTarget) {
    if (target === "you") return { x: this.youX, y: this.youY };
    if (target === "coin") return { x: this.coinX, y: this.coinY };
    return { x: this.foeX, y: this.foeY - 80 };
  }

  private tick = (ticker: Ticker) => {
    const raw = ticker.deltaMS;
    this.quality.note(raw);
    fpsProbe.samples.push(raw);
    this.fpsSum += raw;
    if (fpsProbe.samples.length > 240) this.fpsSum -= fpsProbe.samples.shift() ?? 0;
    fpsProbe.avg = 1000 / Math.max(1, this.fpsSum / Math.max(1, fpsProbe.samples.length));
    if (raw > fpsProbe.max) fpsProbe.max = raw;
    (globalThis as { __nsFps?: typeof fpsProbe }).__nsFps = fpsProbe;
    const dt = Math.min(34, raw) * this.pace * (this.reduced ? 1.8 : 1);
    const snap = this.snap;
    if (snap) {
      this.hpShown += (snap.hp - this.hpShown) * Math.min(1, dt / 160);
      this.hpTrail += (this.hpShown - this.hpTrail) * Math.min(1, dt / 380);
      this.ehpShown += (Math.max(0, snap.ehp) - this.ehpShown) * Math.min(1, dt / 160);
      this.shShown += (snap.shield - this.shShown) * Math.min(1, dt / 140);
      this.eshShown += (snap.eshield - this.eshShown) * Math.min(1, dt / 140);
      if (snap.ehp <= 0 && this.rig && this.rigClip !== "death" && !snap.shop) {
        this.rigClip = "death";
        void this.rig.play("death", { loop: false, mix: FEEL.rigMix });
      }
    }
    this.director.tick(dt);
    this.particles.tick(dt, this.quality.tier === "high" && !this.reduced);
    this.rig?.update(dt);
    const now = performance.now();
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const mag = (this.shakeT / FEEL.shakeCritMs) * 8 * this.shake;
      this.world.position.set(Math.sin(now / 16) * mag, Math.cos(now / 18) * mag * 0.6);
    } else if (this.world.position.x !== 0 || this.world.position.y !== 0) this.world.position.set(0, 0);
    const pulse = this.snap?.pulse && !this.reduced ? 1 + Math.sin(now / 280) * 0.03 : 1;
    const nextScale = this.btnScale * pulse;
    if (Math.abs(this.btn.scale.x - nextScale) > 0.002) this.btn.scale.set(nextScale);
    if (snap) {
      const maxHp = Math.max(1, snap.maxHp);
      const hp = Math.max(0, this.hpShown) / maxHp;
      this.hpFill.scale.x = Math.max(0.01, this.barW * hp);
      this.hpGhost.scale.x = Math.max(0.01, this.barW * (Math.max(0, this.hpTrail) / maxHp));
      this.shFill.scale.x = Math.max(0.01, this.barW * Math.min(1, this.shShown / 48));
      const eh = snap.shop ? 0 : Math.max(0, this.ehpShown) / Math.max(1, snap.emax);
      this.ehpFill.scale.x = Math.max(0.01, this.eBarW * eh);
      const hpLabel = String(Math.max(0, Math.round(this.hpShown)));
      if (hpLabel !== this.lastHp) {
        this.lastHp = hpLabel;
        this.hpNum.text = hpLabel;
      }
      const ehpLabel = snap.shop ? "" : String(Math.max(0, Math.round(this.ehpShown)));
      if (ehpLabel !== this.lastEhp) {
        this.lastEhp = ehpLabel;
        this.ehpNum.text = ehpLabel;
      }
      }
    for (let i = 0; i < this.wins.length; i++) {
      const win = this.wins[i];
      if (!win.root.visible) continue;
      const hot = this.cueReel === i;
      const alpha = this.cueReel >= 0 && !hot ? 0.45 : 1;
      if (win.root.alpha !== alpha) win.root.alpha = alpha;
      if (win.frame.visible !== hot) win.frame.visible = hot;
      const spec = this.snap?.windows[i];
      if (spec?.mode === "flicker") {
        win.glass.visible = true;
        win.glass.alpha = 0.35 + Math.abs(Math.sin(now / 55));
      } else if (win.glass.visible) win.glass.visible = false;
    }
  };
}
