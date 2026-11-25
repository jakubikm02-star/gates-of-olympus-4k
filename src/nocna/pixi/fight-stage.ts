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
import { CoinTray } from "./coin-tray";
import { ParticlePool } from "./particles";

export type { Cue, FightSnap, WinSnap };

/**
 * Cut-out atlases stay on disk for the rig editor. They are rectangle crops of a
 * flat painting, so rotated parts show hard edges and gaps. The fight uses the
 * single-bone idle until real separated part art exists.
 */
const RIGS: Record<string, string> = {
  "/nocna/enemies/enemy-neplatic.webp": "/nocna/rigs/neplatic/neplatic",
  "/nocna/enemies/enemy-inkasak.webp": "/nocna/rigs/inkasak/inkasak",
  "/nocna/bosses/boss-1-pekelny-kurier.webp": "/nocna/rigs/kurier/kurier",
};

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

export const fpsProbe = { avg: 0, max: 0, samples: [] as number[], reset: false };

/** Sharpest first. The cabinet walks down this ladder and only walks back up after a long calm stretch. */
const RES_LADDER = [2, 1.5, 1.25, 1] as const;

function rungFor(dpr: number): number {
  for (let i = 0; i < RES_LADDER.length; i++) if (RES_LADDER[i]! <= dpr + 0.01) return i;
  return RES_LADDER.length - 1;
}

function urls(): string[] {
  const syms = Object.values(SYM).map((def) => def.art);
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
  slip: Sprite;
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
  private foeWins: WinNode[] = [];
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
  private readonly tray = new CoinTray();
  private knownCoins = -1;
  private foeIcon = new Sprite(Texture.WHITE);
  private foeRoll = -1;
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
  private builtF = 0;
  private ePlateX = 28;
  private ePlateY = 80;
  private vignette = new Graphics();
  private chargeFill = new Sprite(Texture.WHITE);
  private cueFoe = false;
  private rung = 0;
  private resCool = 0;
  private ceilingUntil = 0;
  private slowStreak = 0;
  private fastStreak = 0;
  private recentMax = 0;
  private bandY = 80;
  private foeCell = 56;
  private frameN = 0;
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
    this.intentText = new Text({
      text: "",
      style: { fill: 0xfff4c8, fontSize: 22, fontWeight: "700", fontFamily: "Oswald, sans-serif", stroke: { color: 0x140e08, width: 4 } },
    });
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
    this.foeIcon.anchor.set(0.5);
    this.foeIcon.width = 36;
    this.foeIcon.height = 36;
    this.foeIcon.visible = false;
    this.chargeFill.tint = 0xffb020;
    this.chargeFill.scale.y = 4;
    this.vignette.alpha = 0;
    const res = Math.max(1, Math.round(this.app.renderer.resolution || 1));
    for (const text of [this.num, this.intentText, this.ehpNum, this.hpNum, this.coinNum, this.turnText, this.btnLabel]) text.resolution = res;
    this.world.addChild(this.baked, this.bg, this.bgDim, this.rigLayer, this.light, this.cabinet, this.plates, this.tray.view, this.hpGhost, this.hpFill, this.shFill, this.ehpFill, this.chargeFill, this.heart, this.shieldIcon, this.coinIcon, this.bars, this.flyer, this.num, this.intentText, this.foeIcon, this.ehpNum, this.hpNum, this.coinNum, this.turnText, this.vignette, this.btn);
    app.stage.addChild(this.world);
    app.ticker.add(this.tick);
  }

  static async mount(host: HTMLElement): Promise<FightStage> {
    await preloadNocna();
    const app = new Application();
    const raw = window.devicePixelRatio || 1;
    const rung = rungFor(Math.min(FEEL.dprCap, raw));
    const dpr = RES_LADDER[rung] ?? 1;
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
    stage.rung = rung;
    const fit = () => {
      if (stage.destroyed || !app.renderer) return;
      try {
        app.renderer.resize(Math.max(2, host.clientWidth), Math.max(2, host.clientHeight), RES_LADDER[stage.rung] ?? 1);
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
    const fn = snap.foeWindows?.length ?? 0;
    if (w !== this.builtW || h !== this.builtH || n !== this.builtN || fn !== this.builtF || snap.bg !== this.bgUrl) this.layout();
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
    const motion = SYM[cue.sym as keyof typeof SYM]?.motion ?? "strike";
    const local = motion === "guard" || motion === "sip" || motion === "coin" || motion === "stamp" || motion === "venom" || motion === "wild";
    const hold = cue.sym === "exekucia" || cue.sym === "natural" || motion === "burst" || cue.slow ? FEEL.bigHoldMs : FEEL.resultHoldMs;
    const k = (this.reduced ? 0.35 : 1) * (cue.slow ? 1.8 : 1);
    this.cueReel = cue.reel;
    this.cueFoe = cue.row === "foe";
    const row = cue.row === "foe" ? this.foeWins : this.wins;
    let impacted = false;
    const hit = () => {
      if (impacted) return;
      impacted = true;
      onImpact();
      this.popNumber(cue.proc ? `PROC +${cue.proc}` : cue.chip, Boolean(cue.proc) || cue.crit);
      if (cue.proc) {
        const win = (cue.row === "foe" ? this.foeWins : this.wins)[cue.reel];
        if (win) win.root.scale.set(1.12);
        this.particles.burst({ x: this.foeX, y: this.foeY - 20, n: 12, color: this.pal.glow, speed: 0.4, life: 380, g: FEEL.gravity, ring: true, trails: this.quality.tier === "high" });
      }
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
            const win = row[cue.reel];
            if (win) win.root.scale.set(1 + u * (cue.slow ? 0.1 : 0.06));
          },
        },
        {
          duration: FEEL.travelMs * k,
          ease: ease.outCubic,
          update: (u) => {
            const win = row[cue.reel];
            const from = win ? { x: win.root.x + win.size / 2, y: win.root.y + win.size / 2 } : { x: 40, y: 40 };
            if (local && win) {
              const hop = motion === "sip" ? -u * 18 : motion === "venom" ? u * 10 : motion === "stamp" ? Math.sin(u * Math.PI) * 8 : Math.sin(u * Math.PI) * 12;
              win.icon.position.set(win.size / 2, win.size / 2 + hop);
              const squash = motion === "stamp" ? 1 - u * 0.25 : motion === "guard" ? 1 + u * 0.18 : 1 + Math.sin(u * Math.PI) * 0.12;
              win.icon.scale.set(squash, motion === "stamp" ? 1 + u * 0.2 : squash);
              win.icon.rotation = motion === "wild" ? u * 4 : 0;
              this.flyer.visible = false;
              return;
            }
            const to = this.targetPoint(cue.target);
            const arc = Math.sin(u * Math.PI) * (cue.crit || motion === "burst" ? 28 : 14);
            this.flyer.visible = true;
            const art = SYM[cue.sym as keyof typeof SYM]?.art;
            if (art) this.flyer.texture = Texture.from(art);
            this.flyer.position.set(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u - arc);
            this.flyer.scale.set(cue.crit || motion === "pierce" ? 0.62 : 0.4);
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
        for (const win of this.foeWins) win.root.scale.set(1);
        this.cueFoe = false;
        this.num.visible = false;
        if (this.pending === resolve) this.pending = null;
        resolve();
      });
    });
  }

  playFoe(text: string, _kind: "hit" | "block" | "miss" | "heal", at: "you" | "foe" = "you", slow = false): Promise<void> {
    const k = (this.reduced ? 0.4 : 1) * (slow ? 1.65 : 1);
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
      if (text === "shake" || crit || slow) this.kick(FEEL.shakeCritMs);
      if (slow && this.shake > 0) this.world.scale.set(1.045);
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
          if (this.world.scale.x !== 1) this.world.scale.set(1);
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
      rig.setQuality({ springs: !this.reduced && this.quality.tier === "high", mesh: false });
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
    this.builtF = snap.foeWindows?.length ?? 0;
    this.useBg(snap.bg);
    this.bg.position.set(w / 2, h / 2);
    const L = FEEL.layout;
    const inset = 28;
    const frameOut = 10;
    const foeCount = Math.max(1, snap.foeWindows?.length || 3);
    const foeCell = Math.min(68, Math.max(46, (w - 56 - (foeCount - 1) * 8) / foeCount));
    this.foeCell = foeCell;
    let foeX = w * 0.5;
    let foeH = land ? h * 0.4 : h * 0.26;
    let foeY = (land ? h * 0.06 : 28) + foeH;
    let reelY = h * (1 - L.reelBottom - L.reelH);
    let reelX = Math.max(w * L.gap, inset + frameOut);
    let reelW = w - reelX - (inset + frameOut);
    if (land) {
      foeX = Math.max(inset + 80, w * L.landEnemyW * 0.55);
      foeH = h * 0.4;
      foeY = h * 0.08 + foeH;
      reelX = Math.max(w * (L.landEnemyW + 0.02), inset + frameOut);
      reelW = w - reelX - (inset + frameOut);
      reelY = h * 0.22;
    }
    this.foeX = foeX;
    this.foeY = foeY;
    this.bandY = foeY + 14;
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
    this.placeDeck(snap, foeX, foeY, foeH, w, inset);
    const btnH = Math.min(64, h * 0.09);
    const btnTop = h - btnH - 14;
    const plateH = 50;
    let gaugeTop = (land ? foeY + 18 : reelY - plateH - 12);
    gaugeTop = Math.max(inset, Math.min(gaugeTop, btnTop - plateH - 8));
    const numW = 40;
    const iconCol = 22;
    const barW = Math.max(64, Math.min(210, w - inset * 2 - iconCol - numW - 48));
    const plateW = 12 + iconCol + 8 + barW + 8 + numW + 8;
    this.paintBars(inset, gaugeTop, plateW, barW, foeX, foeY, w, h, pal);
    this.coinX = w - 72;
    this.coinY = 36;
    this.coinNum.text = String(snap.coins);
    this.coinNum.anchor.set(1, 0.5);
    this.coinNum.position.set(w - 86, 36);
    this.turnText.text = snap.hint || snap.turn;
    this.turnText.position.set(w / 2, 64);
    this.intentText.text = snap.shop ? "" : snap.intent;
    this.btnLabel.text = snap.button;
    const bw = Math.min(w - inset * 2, 420);
    const bh = Math.min(64, h * 0.09);
    const bx = (w - bw) / 2;
    const by = h - bh - 12;
    this.btn.position.set(bx + bw / 2, by + bh / 2);
    const trayW = Math.min(bw, 280);
    const trayH = 46;
    const trayX = (w - trayW) / 2;
    const trayY = Math.max(gaugeTop + plateH + 6, by - trayH - 8);
    this.tray.place(trayX, trayY, trayW, trayH);
    this.tray.setTexture(this.coinIcon.texture);
    this.tray.physics = this.quality.tier === "high" && !this.reduced;
    this.syncCoins(snap);
    this.placeFoe(snap);
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
      this.vignette, this.chargeFill,
    ];
    const was = hide.map((node) => node.visible);
    for (const node of hide) node.visible = false;
    const iconWas = this.wins.map((win) => win.icon.visible);
    const chipWas = this.wins.map((win) => win.chip.visible);
    const foeIconWas = this.foeWins.map((win) => win.icon.visible);
    const foeChipWas = this.foeWins.map((win) => win.chip.visible);
    const deckWas = this.deck.map((s) => s.visible);
    for (const win of [...this.wins, ...this.foeWins]) {
      win.icon.visible = false;
      win.slip.visible = false;
      win.chip.visible = false;
    }
    for (const s of this.deck) s.visible = false;
    this.bg.visible = true;
    this.cabinet.visible = true;
    this.plates.visible = true;
    for (const win of [...this.wins, ...this.foeWins]) {
      win.frame.visible = true;
      win.hole.visible = true;
      win.glass.visible = true;
    }
    this.app.renderer.render({ container: this.world, target: this.rt, clear: true });
    this.bg.visible = false;
    this.cabinet.visible = false;
    this.plates.visible = false;
    this.bgDim.visible = false;
    for (const win of [...this.wins, ...this.foeWins]) {
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
    this.foeWins.forEach((win, i) => {
      win.icon.visible = foeIconWas[i];
      win.chip.visible = foeChipWas[i];
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
    this.syncCoins(snap);
    this.placeFoe(snap);
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
    this.placeDeck(snap, this.foeX, this.foeY, this.app.screen.height * FEEL.layout.enemyH, this.app.screen.width, 28);
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
        const maxEdge = (window.devicePixelRatio || 1) >= 1.5 ? 1440 : 960;
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

  private paintBars(plateX: number, plateY: number, plateW: number, barW: number, foeX: number, foeY: number, w: number, h: number, pal: Palette) {
    const inset = 28;
    this.barW = barW;
    this.eBarW = Math.max(48, Math.min(barW * 0.75, w - inset * 2 - 96));
    const ePlateW = this.eBarW + 88;
    let ePlateX = foeX - ePlateW / 2;
    ePlateX = Math.max(inset, Math.min(w - inset - ePlateW, ePlateX));
    const ePlateY = Math.max(inset + 8, Math.min(this.bandY + this.foeCell + 10, h - inset - 80));
    this.ePlateX = ePlateX;
    this.ePlateY = ePlateY;
    this.chargeFill.position.set(ePlateX + 10, ePlateY + 28);
    const showEnemy = !this.snap?.shop;
    this.plates.clear();
    this.plates.roundRect(plateX, plateY, plateW, 50, 12).fill({ color: 0x16120e, alpha: 0.92 }).stroke({ color: pal.metal, width: 2 });
    if (showEnemy) this.plates.roundRect(ePlateX, ePlateY, ePlateW, 32, 10).fill({ color: 0x16120e, alpha: 0.92 }).stroke({ color: pal.metal, width: 2 });
    this.ehpFill.visible = showEnemy;
    this.ehpNum.visible = showEnemy;
    this.chargeFill.visible = showEnemy && (this.snap?.charge ?? 0) > 0;
    const barX = plateX + 42;
    this.hpGhost.position.set(barX, plateY + 12);
    this.hpFill.position.set(barX, plateY + 12);
    this.shFill.position.set(barX, plateY + 28);
    this.ehpFill.position.set(ePlateX + 10, ePlateY + 12);
    this.hpGhost.scale.y = 10;
    this.hpFill.scale.y = 10;
    this.shFill.scale.y = 6;
    this.ehpFill.scale.y = 8;
    this.heart.position.set(plateX + 20, plateY + 16);
    this.heart.width = 18;
    this.heart.height = 18;
    this.shieldIcon.position.set(plateX + 20, plateY + 34);
    this.shieldIcon.width = 16;
    this.shieldIcon.height = 16;
    this.youX = barX;
    this.youY = plateY + 16;
    this.ehpNum.anchor.set(1, 0.5);
    this.ehpNum.position.set(ePlateX + ePlateW - 10, ePlateY + 16);
    this.hpNum.anchor.set(1, 0);
    this.hpNum.position.set(plateX + plateW - 8, plateY + 8);
    this.intentText.anchor.set(1, 0.5);
    this.intentText.position.set(w - 16, this.bandY + this.foeCell / 2);
    this.hpFill.tint = pal.hp;
    this.shFill.tint = pal.shield;
    this.ehpFill.tint = pal.hp;
    this.vignette.clear();
    this.vignette.rect(0, 0, w, 16).fill({ color: 0xff2a2a });
    this.vignette.rect(0, h - 16, w, 16).fill({ color: 0xff2a2a });
    this.vignette.rect(0, 0, 12, h).fill({ color: 0xff2a2a });
    this.vignette.rect(w - 12, 0, 12, h).fill({ color: 0xff2a2a });
  }

  private placeFoeRow(snap: FightSnap) {
    const n = snap.shop ? 0 : (snap.foeWindows?.length ?? 0);
    while (this.foeWins.length < Math.max(n, 1)) this.foeWins.push(this.makeWin());
    const cell = this.foeCell;
    const gap = 8;
    const rowW = cell * n + gap * Math.max(0, n - 1);
    const x0 = Math.max(16, (this.app.screen.width - rowW) / 2 - 18);
    const y = this.bandY;
    this.foeWins.forEach((win, i) => {
      const spec = snap.foeWindows?.[i];
      win.root.visible = i < n;
      if (i >= n || !spec) return;
      win.size = cell;
      win.root.position.set(x0 + i * (cell + gap), y);
      this.paintWindow(win, cell, this.pal, Boolean(spec.crit) || Boolean(snap.enraged));
      const prev = win.token;
      win.token = spec.token ?? 0;
      if (spec.mode === "sit" && spec.sym && spec.token !== prev) this.dropIn(win, spec, cell);
      else if (spec.mode !== "flicker") this.sit(win, spec, cell);
      win.chip.text = spec.mode === "sit" ? spec.chip : "";
      win.chip.position.set(cell / 2, cell - 2);
      win.chip.style.fill = 0xfff6d2;
    });
  }

  private placeDeck(snap: FightSnap, foeX: number, foeY: number, foeH: number, w = 0, inset = 28) {
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
      const size = 48;
      const cols = Math.min(5, deck.length);
      const rowW = (cols - 1) * 56;
      let x = foeX - rowW / 2 + (i % 5) * 56;
      x = Math.max(inset + size / 2, Math.min((w || foeX * 2) - inset - size / 2, x));
      const y = Math.max(inset + size / 2, foeY - foeH * 0.45 + Math.floor(i / 5) * 56);
      s.position.set(x, y);
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
    const slip = new Sprite();
    slip.anchor.set(0.5);
    slip.visible = false;
    const chip = new Text({
      text: "",
      style: { fill: 0xfff6d2, fontSize: 16, fontWeight: "700", fontFamily: "Oswald, sans-serif", stroke: { color: 0x140e08, width: 3 } },
    });
    chip.resolution = Math.max(1, Math.round(this.app.renderer.resolution || 1));
    chip.anchor.set(0.5, 1);
    root.addChild(frame, hole, glass, slip, icon, chip);
    this.world.addChild(root);
    return { root, hole, frame, glass, icon, slip, chip, token: -1, size: 80 };
  }

  private sit(win: WinNode, spec: WinSnap | undefined, cell: number) {
    win.slip.visible = false;
    win.icon.scale.set(1);
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
    win.slip.visible = false;
    win.icon.scale.set(1);
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

  private syncCoins(snap: FightSnap) {
    if (this.knownCoins < 0) {
      this.knownCoins = snap.coins;
      if (snap.coins > 0) this.tray.burst(snap.coins, this.coinX, this.coinY);
      return;
    }
    const delta = snap.coins - this.knownCoins;
    if (delta > 0) {
      const win = this.wins[this.cueReel];
      const from = win ? { x: win.root.x + win.size / 2, y: win.root.y } : { x: this.foeX, y: this.foeY };
      this.tray.burst(delta, from.x, from.y);
    } else if (delta < 0) {
      this.tray.sweep(-delta, this.btn.x, this.btn.y);
    }
    this.knownCoins = snap.coins;
  }

  private foeSpinUntil = 0;

  private placeFoe(snap: FightSnap) {
    this.placeFoeRow(snap);
    if (snap.foeWindows?.length || !snap.foeArt || snap.shop) {
      this.foeIcon.visible = false;
      return;
    }
    this.foeIcon.visible = true;
    this.foeIcon.texture = Texture.from(snap.foeArt);
    this.foeIcon.width = 34;
    this.foeIcon.height = 34;
    this.foeIcon.position.set(this.ehpFill.x + 18, this.ehpFill.y - 28);
    if (snap.foeRoll !== this.foeRoll) {
      this.foeRoll = snap.foeRoll;
      this.foeSpinUntil = performance.now() + 480;
    }
  }

  private targetPoint(target: FeelTarget) {
    if (target === "you") return { x: this.youX, y: this.youY };
    if (target === "coin") return { x: this.coinX, y: this.coinY };
    return { x: this.foeX, y: this.foeY - 80 };
  }

  private applyRung(next: number, now: number, cool: number) {
    const down = next > this.rung;
    this.rung = next;
    this.slowStreak = 0;
    this.fastStreak = 0;
    this.recentMax = 0;
    this.resCool = now + cool;
    if (down) this.ceilingUntil = now + 15000;
    fpsProbe.reset = true;
    fpsProbe.max = 0;
    const res = RES_LADDER[this.rung] ?? 1;
    this.app.renderer.resize(this.app.screen.width, this.app.screen.height, res);
    for (const text of [this.num, this.intentText, this.ehpNum, this.hpNum, this.coinNum, this.turnText, this.btnLabel]) text.resolution = res;
  }

  /** Walk 2 → 1.5 → 1.25 → 1 when the average stays under 55. Climb back only after a long stretch above 62. */
  private tuneResolution(now: number, raw: number) {
    if (now < this.resCool || fpsProbe.samples.length < 16 || fpsProbe.avg <= 0) return;
    const avg = fpsProbe.avg;
    this.recentMax = Math.max(raw, this.recentMax * 0.98);
    if (avg < 55) {
      this.slowStreak += 1;
      this.fastStreak = 0;
    } else if (avg >= 64 && this.recentMax < 28) {
      this.fastStreak += 1;
      this.slowStreak = 0;
    } else {
      this.slowStreak = 0;
      this.fastStreak = 0;
    }
    const cap = Math.min(FEEL.dprCap, window.devicePixelRatio || 1);
    if (this.slowStreak >= 8 && this.rung < RES_LADDER.length - 1) {
      this.applyRung(this.rung + 1, now, 700);
      return;
    }
    const higher = RES_LADDER[this.rung - 1] ?? 2;
    if (now >= this.ceilingUntil && this.fastStreak >= 240 && this.rung > 0 && higher <= cap + 0.01) {
      this.applyRung(this.rung - 1, now, 3000);
    }
  }

  private tick = (ticker: Ticker) => {
    const raw = ticker.deltaMS;
    this.quality.note(raw);
    if (fpsProbe.reset) {
      fpsProbe.reset = false;
      fpsProbe.samples.length = 0;
      fpsProbe.max = 0;
      this.fpsSum = 0;
    }
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
    this.tray.physics = this.quality.tier === "high" && !this.reduced;
    this.tray.update(dt);
    if (this.foeIcon.visible) {
      const left = this.foeSpinUntil - performance.now();
      this.foeIcon.rotation = left > 0 ? Math.sin(left / 36) * 0.6 : 0;
    }
    const lively = this.quality.tier === "high" && !this.reduced;
    this.particles.tick(dt, lively);
    this.frameN += 1;
    const stride = lively ? 1 : 3;
    if (this.frameN % stride === 0) this.rig?.update(dt * stride);
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
      this.ehpFill.tint = snap.enraged ? 0xff7a2a : this.pal.hp;
      this.vignette.alpha = snap.danger ? 0.28 + Math.sin(now / 260) * 0.16 : 0;
      const charge = snap.shop ? 0 : Math.max(0, snap.charge) / 3;
      this.chargeFill.visible = charge > 0;
      this.chargeFill.scale.x = Math.max(0.01, this.eBarW * charge);
      this.tuneResolution(now, raw);
      }
    const spinBag = PLAY_SYMS;
    for (let i = 0; i < this.foeWins.length; i++) {
      const win = this.foeWins[i];
      const spec = snap?.foeWindows[i];
      if (!win.root.visible || !spec || spec.mode !== "flicker") {
        if (win.slip.visible) win.slip.visible = false;
        continue;
      }
      const period = 90;
      const phase = (now / period + i * 0.41) % 1;
      const idx = (Math.floor(now / period) + i * 3) % spinBag.length;
      const cur = spinBag[idx]!;
      const nxt = spinBag[(idx + 1) % spinBag.length]!;
      const w = win.size * 0.62;
      const h = win.size * 0.95;
      const travel = win.size * 0.9;
      win.chip.text = "";
      win.icon.visible = true;
      win.slip.visible = true;
      win.icon.texture = Texture.from(SYM[cur].art);
      win.slip.texture = Texture.from(SYM[nxt].art);
      win.icon.width = w;
      win.icon.height = h;
      win.slip.width = w;
      win.slip.height = h;
      win.icon.position.set(win.size / 2, win.size / 2 + (phase - 0.15) * travel);
      win.slip.position.set(win.size / 2, win.size / 2 + (phase - 1.15) * travel);
      win.icon.alpha = 0.55 + phase * 0.4;
      win.slip.alpha = 0.9 - phase * 0.45;
      win.glass.visible = true;
      win.glass.alpha = 0.35;
    }
    for (let i = 0; i < this.wins.length; i++) {
      const win = this.wins[i];
      if (!win.root.visible) continue;
      const hot = !this.cueFoe && this.cueReel === i;
      const suspense = Boolean(snap?.suspense && snap.active === i);
      const alpha = this.cueReel >= 0 && !this.cueFoe && !hot ? 0.45 : 1;
      if (win.root.alpha !== alpha) win.root.alpha = alpha;
      if (win.frame.visible !== (hot || suspense)) win.frame.visible = hot || suspense;
      if (suspense) win.root.scale.set(1 + Math.sin(now / 160) * 0.035);
      const spec = this.snap?.windows[i];
      if (spec?.mode === "flicker") {
        win.glass.visible = true;
        win.glass.alpha = suspense ? 0.7 + Math.abs(Math.sin(now / 90)) * 0.3 : 0.35 + Math.abs(Math.sin(now / 55));
      } else if (win.glass.visible) win.glass.visible = false;
    }
  };
}
