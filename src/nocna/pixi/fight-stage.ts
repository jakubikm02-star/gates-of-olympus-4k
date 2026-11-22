/**
 * WebGL fight scene (PixiJS 8). One ticker, pooled sprites, DPR capped.
 * HUD buttons stay in React. Mounts into a plain element so a Capacitor
 * WebView can host the same stage later — no APK here.
 */
import { Application, Assets, Container, Graphics, Sprite, Text, Texture, type Ticker } from "pixi.js";
import { FEEL } from "@/lib/revier/feel";
import type { FeelTarget } from "@/lib/revier/feel";
import { PLAY_SYMS, SYM, bgSrc } from "@/lib/revier/symbols";
import type { Cue, FightSnap, WinSnap } from "@/nocna/fight-types";

export type { Cue, FightSnap, WinSnap };

const ENEMY_URLS = [
  "/nocna/enemies/enemy-neplatic.webp",
  "/nocna/enemies/enemy-inkasak.webp",
  "/nocna/enemies/enemy-zlodej-paragonov.webp",
  "/nocna/enemies/enemy-pokutomat.webp",
  "/nocna/enemies/enemy-uradnicka.webp",
  "/nocna/enemies/enemy-ozran.webp",
  "/nocna/enemies/elite-krovinorez.webp",
  "/nocna/enemies/elite-motorka-smrti.webp",
  "/nocna/enemies/elite-vyberca-myta.webp",
  "/nocna/bosses/boss-1-pekelny-kurier.webp",
  "/nocna/bosses/boss-2-demon-ziariviek.webp",
  "/nocna/bosses/boss-3-anjel-exekucie.webp",
  "/nocna/bosses/boss-4-general-podatelne.webp",
  "/nocna/bosses/boss-5-prednosta.webp",
];

const UI_URLS = [
  "/nocna/ui/ui-hp-heart.webp",
  "/nocna/ui/ui-shield.webp",
  "/nocna/ui/ui-coin.webp",
  "/nocna/fx/fx-hit.webp",
  "/nocna/fx/fx-crit.webp",
  "/nocna/fx/fx-heal.webp",
  "/nocna/fx/fx-block.webp",
];

export const fpsProbe = { avg: 0, max: 0, samples: [] as number[] };

function urls(): string[] {
  const syms = PLAY_SYMS.map((id) => SYM[id].art);
  const bgs = [1, 2, 3, 4, 5, 6].flatMap((floor) =>
    (["port", "land", "fold-port", "fold-land"] as const).map((k) => bgSrc(floor, k)),
  );
  return [...syms, ...bgs, ...ENEMY_URLS, ...UI_URLS];
}

let preloaded: Promise<void> | null = null;

/** Starts the Pixi chunk + decodes textures. Safe to call as soon as the mode opens. */
export function preloadNocna(): Promise<void> {
  preloaded ??= Assets.load(urls()).then(() => undefined);
  return preloaded;
}

interface WinNode {
  root: Container;
  hole: Graphics;
  glow: Graphics;
  flick: Graphics;
  icon: Sprite;
  chip: Text;
  token: number;
  dropT: number;
  dropping: boolean;
  size: number;
}

interface Puff {
  s: Sprite;
  life: number;
  max: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

interface CueRun {
  cue: Cue;
  t: number;
  phase: "travel" | "hold" | "self" | "rewind" | "tell";
  impacted: boolean;
  onImpact: () => void;
  resolve: () => void;
}

export class FightStage {
  private app: Application;
  private world = new Container();
  private bg = new Sprite();
  private foe = new Sprite();
  private foeBaseY = 0;
  private foeBaseX = 0;
  private knock = 0;
  private glitch = 0;
  private shake = 0;
  private shakeT = 0;
  private wins: WinNode[] = [];
  private flyer = new Sprite();
  private num: Text;
  private hpFill: Sprite;
  private hpTrail: Sprite;
  private shFill: Sprite;
  private ehpFill: Sprite;
  private ehpTrail: Sprite;
  private eshFill: Sprite;
  private heart: Sprite;
  private coinIcon: Sprite;
  private stunMark: Text;
  private dotMark: Text;
  private poisMark: Text;
  private puffs: Puff[] = [];
  private snap: FightSnap | null = null;
  private cue: CueRun | null = null;
  private foeLine: CueRun | null = null;
  private hpShown = 100;
  private hpTrailN = 100;
  private shShown = 0;
  private ehpShown = 1;
  private ehpTrailN = 1;
  private eshShown = 0;
  private youX = 0;
  private youY = 0;
  private coinX = 0;
  private coinY = 0;
  private reduced = false;
  private pace = 1;
  private destroyed = false;
  private observer: ResizeObserver | null = null;
  private intentText: Text;
  private intentPlate: Graphics;
  private ehpNum: Text;
  private hpNum: Text;
  private onReel: (i: number) => void = () => {};
  private onDeck: (i: number) => void = () => {};
  private deck: Sprite[] = [];
  private lit = false;

  private constructor(app: Application) {
    this.app = app;
    const white = Texture.WHITE;
    this.hpFill = new Sprite(white);
    this.hpTrail = new Sprite(white);
    this.shFill = new Sprite(white);
    this.ehpFill = new Sprite(white);
    this.ehpTrail = new Sprite(white);
    this.eshFill = new Sprite(white);
    this.heart = new Sprite();
    this.coinIcon = new Sprite();
    this.num = new Text({ text: "", style: { fill: 0xfff6d0, fontSize: 40, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.stunMark = new Text({ text: "", style: { fill: 0xd7c4ff, fontSize: 28, fontWeight: "700" } });
    this.dotMark = new Text({ text: "", style: { fill: 0xc6f57a, fontSize: 22, fontWeight: "700" } });
    this.poisMark = new Text({ text: "", style: { fill: 0xff8d7a, fontSize: 22, fontWeight: "700" } });
    this.num.anchor.set(0.5);
    this.num.visible = false;
    this.intentPlate = new Graphics();
    this.intentText = new Text({ text: "", style: { fill: 0xffe56a, fontSize: 28, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.ehpNum = new Text({ text: "", style: { fill: 0xffd0c8, fontSize: 18, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.hpNum = new Text({ text: "", style: { fill: 0xffd0c8, fontSize: 18, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    this.ehpNum.anchor.set(1, 0.5);
    this.hpNum.anchor.set(0, 0.5);
    this.flyer.anchor.set(0.5);
    this.flyer.visible = false;
    this.foe.anchor.set(0.5, 1);
    this.bg.anchor.set(0.5);
    const dot = new Graphics().circle(0, 0, 6).fill({ color: 0xffffff });
    const puffTex = app.renderer.generateTexture(dot);
    for (let i = 0; i < FEEL.particles; i++) {
      const s = new Sprite(puffTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, x: 0, y: 0 });
      this.world.addChild(s);
    }
    app.stage.addChild(this.world);
    this.world.addChild(this.bg, this.foe, this.flyer, this.num, this.stunMark, this.dotMark, this.poisMark);
    this.bar(this.ehpTrail, 0x5a201c);
    this.bar(this.ehpFill, 0xe23b3b);
    this.bar(this.eshFill, 0x3ec6e0);
    this.bar(this.hpTrail, 0x5a201c);
    this.bar(this.hpFill, 0xff4d4d);
    this.bar(this.shFill, 0x3ec6e0);
    this.heart.anchor.set(0.5);
    this.coinIcon.anchor.set(0.5);
    this.world.addChild(this.heart, this.coinIcon, this.intentPlate, this.intentText, this.ehpNum, this.hpNum);
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
    const stage = new FightStage(app);
    const fitStage = () => {
      if (stage.destroyed || !app.renderer) return;
      try {
        app.renderer.resize(Math.max(2, host.clientWidth), Math.max(2, host.clientHeight));
        stage.layout();
      } catch {
        /* renderer already gone */
      }
    };
    stage.observer = new ResizeObserver(fitStage);
    stage.observer.observe(host);
    fitStage();
    host.dataset.pixi = "1";
    return stage;
  }

  setHooks(hooks: { onReel: (i: number) => void; onDeck?: (i: number) => void }) {
    this.onReel = hooks.onReel;
    this.onDeck = hooks.onDeck ?? (() => {});
  }

  setSnap(snap: FightSnap) {
    this.snap = snap;
    this.reduced = snap.reduced;
    this.hpShown = this.hpShown || snap.hp;
    this.layout();
  }

  playCue(cue: Cue, onImpact: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.cue = { cue, t: 0, phase: cue.rewind ? "rewind" : cue.selfChip ? "self" : "travel", impacted: false, onImpact, resolve };
      this.num.visible = false;
    });
  }

  playFoe(text: string, kind: "hit" | "block" | "miss" | "heal", at: "you" | "foe" = "you"): Promise<void> {
    return new Promise((resolve) => {
      this.foeLine = {
        cue: { reel: -1, sym: "blocek", crit: false, rewind: false, chip: text, target: at === "foe" ? "foe" : "you" },
        t: 0,
        phase: "tell",
        impacted: true,
        onImpact: () => {},
        resolve,
      };
      this.num.text = text;
      this.num.visible = false;
      this.num.style.fill = kind === "block" ? 0x7ee7ff : kind === "heal" ? 0xb6f27c : at === "foe" ? 0xffe56a : 0xff8d7a;
      this.placeNum(at === "foe" ? this.foeBaseX : this.youX, (at === "foe" ? this.foeBaseY : this.youY) - 28);
      if (kind === "hit" && at === "you") this.kick(FEEL.shakeHitMs);
      if (at === "foe") this.kick(FEEL.shakeCritMs);
    });
  }

  setPace(pace: number) {
    this.pace = Math.max(1, pace);
  }

  skip() {
    const run = this.cue ?? this.foeLine;
    if (!run) return;
    if (!run.impacted) {
      run.impacted = true;
      run.onImpact();
    }
    this.num.visible = false;
    this.flyer.visible = false;
    this.cue = null;
    this.foeLine = null;
    run.resolve();
  }

  destroy() {
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;
    try {
      this.app.destroy(true, { children: true });
    } catch {
      /* already destroyed */
    }
  }

  private bar(s: Sprite, color: number) {
    s.texture = Texture.WHITE;
    s.tint = color;
    s.anchor.set(0, 0.5);
    this.world.addChild(s);
  }

  private tex(url: string): Texture {
    return Texture.from(url);
  }

  private layout() {
    const snap = this.snap;
    if (!snap) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const land = w > h * 1.05;
    this.bg.texture = this.tex(snap.bg);
    this.bg.position.set(w / 2, h / 2);
    const cover = Math.max(w / Math.max(1, this.bg.texture.width), h / Math.max(1, this.bg.texture.height));
    this.bg.scale.set(cover);

    const L = FEEL.layout;
    let foeX = w * 0.5;
    let foeY = h * (L.enemyTop + L.enemyH);
    let foeH = h * L.enemyH;
    let reelY = h * (1 - L.reelBottom - L.reelH);
    let reelX = w * L.gap;
    let reelW = w * (1 - L.gap * 2);
    if (land) {
      foeX = w * L.landEnemyW * 0.5;
      foeY = h * 0.78;
      foeH = h * 0.62;
      reelX = w * (L.landEnemyW + 0.02);
      reelW = w * (1 - L.landEnemyW - 0.06);
      reelY = h * 0.34;
    }
    if (snap.enemyArt && !snap.shop) {
      this.foe.texture = this.tex(snap.enemyArt);
      this.foe.visible = true;
      const s = foeH / Math.max(1, this.foe.texture.height);
      this.foe.scale.set(s);
      this.foeBaseX = foeX;
      this.foeBaseY = foeY;
      this.foe.position.set(foeX, foeY);
    } else this.foe.visible = false;

    const n = Math.max(1, snap.windows.length);
    const gap = 8;
    const cell = Math.min((reelW - gap * (n - 1)) / n, h * L.reelH);
    const rowW = cell * n + gap * (n - 1);
    const x0 = reelX + (reelW - rowW) / 2;
    while (this.wins.length < n) this.wins.push(this.makeWin());
    this.wins.forEach((win, i) => {
      const on = i < n;
      win.root.visible = on;
      if (!on) return;
      const x = x0 + i * (cell + gap);
      win.size = cell;
      win.root.position.set(x, reelY);
      win.hole.clear().roundRect(0, 0, cell, cell, 12).fill({ color: 0x07080c, alpha: 0.92 });
      const mask = win.hole;
      win.icon.mask = mask;
      win.flick.clear().rect(0, 0, cell, cell).fill({ color: 0x9dff6a, alpha: 0.35 });
      win.icon.anchor.set(0.5);
      const prev = win.token;
      const spec = snap.windows[i];
      this.paint(win, Boolean(spec?.crit) && !this.cue);
      win.token = spec?.token ?? 0;
      if (spec && spec.mode === "sit" && spec.sym && spec.token !== prev) {
        win.dropping = true;
        win.dropT = 0;
        const art = SYM[spec.sym as keyof typeof SYM]?.art;
        if (art) win.icon.texture = this.tex(art);
        win.icon.visible = true;
      }
      if (win.dropping) {
        win.flick.visible = false;
        win.chip.text = "";
        return;
      }
      if (!spec || spec.mode === "empty" || !spec.sym) {
        win.icon.visible = false;
        win.dropping = false;
        win.chip.text = "";
      } else if (spec.mode === "sit") {
        const art = SYM[spec.sym as keyof typeof SYM]?.art;
        if (art) win.icon.texture = this.tex(art);
        win.icon.visible = true;
        win.icon.position.set(cell / 2, cell / 2);
        win.icon.width = cell * 0.86;
        win.icon.height = cell * 0.86;
      }
      win.flick.visible = spec?.mode === "flicker";
      win.chip.text = spec?.mode === "sit" ? spec.chip : "";
      win.chip.position.set(cell / 2, cell - 6);
      win.chip.anchor.set(0.5, 1);
      win.glow.alpha = spec?.crit ? 1 : 0.75;
      win.root.eventMode = "static";
      win.root.cursor = "pointer";
      win.root.removeAllListeners();
      const reel = i;
      win.root.on("pointertap", () => this.onReel(reel));
    });

    const barW = Math.min(220, w * 0.42);
    const barY = land ? h * 0.9 : reelY - 28;
    const barX = land ? w * 0.04 : 16;
    this.placeBar(this.hpTrail, barX, barY, barW);
    this.placeBar(this.hpFill, barX, barY, barW);
    this.placeBar(this.shFill, barX, barY + 10, barW);
    this.heart.texture = this.tex("/nocna/ui/ui-hp-heart.webp");
    this.heart.position.set(barX - 4, barY);
    this.heart.width = 22;
    this.heart.height = 22;
    this.youX = barX + 30;
    this.youY = barY;
    const eBarX = land ? foeX - 70 : w * 0.18;
    const eBarY = land ? foeY + 8 : foeY + 6;
    this.placeBar(this.ehpTrail, eBarX, eBarY, barW * 0.8);
    this.placeBar(this.ehpFill, eBarX, eBarY, barW * 0.8);
    this.placeBar(this.eshFill, eBarX, eBarY + 8, barW * 0.8);
    const intent = snap.shop ? "" : snap.intent;
    this.intentText.text = intent;
    const ix = eBarX + barW * 0.8 + 12;
    const iy = eBarY - 6;
    this.intentText.position.set(ix, iy);
    this.intentPlate.clear();
    if (intent) {
      const tw = Math.max(36, this.intentText.width + 16);
      this.intentPlate.roundRect(ix - 8, iy - 4, tw, 34, 8).fill({ color: 0x07080c, alpha: 0.88 });
    }
    this.ehpNum.position.set(eBarX - 6, eBarY + 4);
    this.hpNum.position.set(barX + barW + 8, barY + 4);
    this.world.addChild(this.intentPlate, this.intentText, this.ehpNum, this.hpNum);
    this.placeDeck(snap, foeX, foeY, foeH, w);
    this.coinIcon.texture = this.tex("/nocna/ui/ui-coin.webp");
    this.coinIcon.position.set(w - 28, 22);
    this.coinIcon.width = 22;
    this.coinIcon.height = 22;
    this.coinX = w - 28;
    this.coinY = 22;
    this.stunMark.position.set(foeX - 20, foeY - foeH * 0.15);
    this.dotMark.position.set(foeX + 16, foeY - foeH * 0.15);
    this.poisMark.position.set(barX + 40, barY - 22);
  }

  private paint(win: WinNode, hot: boolean) {
    const cell = win.size || 80;
    win.glow.clear().roundRect(-3, -3, cell + 6, cell + 6, 14).stroke({ color: hot ? 0xffd24a : 0x8a8478, width: hot ? 5 : 2, alpha: hot ? 1 : 0.7 });
  }

  private placeDeck(snap: FightSnap, foeX: number, foeY: number, foeH: number, w: number) {
    const deck = snap.shop ? snap.deck : [];
    while (this.deck.length < deck.length) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.eventMode = "static";
      s.cursor = "pointer";
      const idx = this.deck.length;
      s.on("pointertap", () => this.onDeck(idx));
      this.world.addChild(s);
      this.deck.push(s);
    }
    const cols = Math.min(5, Math.max(1, deck.length));
    this.deck.forEach((s, i) => {
      const id = deck[i];
      if (!id) {
        s.visible = false;
        return;
      }
      const art = SYM[id as keyof typeof SYM]?.art;
      if (art) s.texture = this.tex(art);
      s.visible = true;
      const size = Math.min(64, (w * 0.62) / cols);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, deck.length - row * cols);
      s.position.set(foeX - ((inRow - 1) * (size + 8)) / 2 + col * (size + 8), foeY - foeH * 0.62 + row * (size + 10));
      s.width = size;
      s.height = size;
    });
  }

  private placeBar(s: Sprite, x: number, y: number, w: number) {
    (s as Sprite & { __w?: number }).__w = w;
    s.position.set(x, y);
    s.scale.y = 6;
    s.scale.x = w;
  }

  private makeWin(): WinNode {
    const root = new Container();
    const hole = new Graphics();
    const glow = new Graphics();
    const flick = new Graphics();
    const icon = new Sprite();
    const chip = new Text({ text: "", style: { fill: 0xffe9a0, fontSize: 16, fontWeight: "700", fontFamily: "Oswald, sans-serif" } });
    root.addChild(glow, hole, flick, icon, chip);
    this.world.addChild(root);
    return { root, hole, glow, flick, icon, chip, token: -1, dropT: 0, dropping: false, size: 80 };
  }

  private tick = (ticker: Ticker) => {
    const raw = ticker.deltaMS;
    const dt = Math.min(34, raw) * this.pace;
    fpsProbe.samples.push(raw);
    if (fpsProbe.samples.length > 240) fpsProbe.samples.shift();
    const avg = fpsProbe.samples.reduce((a, b) => a + b, 0) / Math.max(1, fpsProbe.samples.length);
    fpsProbe.avg = 1000 / Math.max(1, avg);
    fpsProbe.max = Math.max(fpsProbe.max * 0.98, dt);
    (globalThis as { __nsFps?: typeof fpsProbe }).__nsFps = fpsProbe;
    const now = performance.now();
    if (!this.reduced && this.foe.visible) {
      this.foe.y = this.foeBaseY + Math.sin(now / 620) * 5 + this.knock;
      this.foe.rotation = Math.sin(now / 900) * 0.03;
    }
    if (this.knock > 0) this.knock = Math.max(0, this.knock - dt * 0.08);
    if (this.glitch > 0) {
      this.glitch -= dt;
      this.foe.alpha = Math.sin(now / 30) > 0 ? 1 : 0.35;
    } else this.foe.alpha = 1;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const mag = this.shake * (this.shakeT / FEEL.shakeCritMs);
      this.world.position.set(Math.sin(now / 16) * mag, Math.cos(now / 18) * mag * 0.6);
    } else this.world.position.set(0, 0);
    const snap = this.snap;
    if (snap) {
      this.hpShown += (snap.hp - this.hpShown) * Math.min(1, dt / 160);
      this.hpTrailN += (this.hpShown - this.hpTrailN) * Math.min(1, dt / 380);
      this.shShown += (snap.shield - this.shShown) * Math.min(1, dt / 140);
      this.ehpShown += (Math.max(0, snap.ehp) - this.ehpShown) * Math.min(1, dt / 160);
      this.ehpTrailN += (this.ehpShown - this.ehpTrailN) * Math.min(1, dt / 380);
      this.eshShown += (snap.eshield - this.eshShown) * Math.min(1, dt / 140);
      const max = Math.max(1, snap.maxHp);
      const emax = Math.max(1, snap.emax);
      this.applyScale(this.hpFill, this.hpShown / max);
      this.applyScale(this.hpTrail, this.hpTrailN / max);
      this.applyScale(this.shFill, Math.min(1, this.shShown / 48));
      this.applyScale(this.ehpFill, Math.max(0, this.ehpShown) / emax);
      this.applyScale(this.ehpTrail, Math.max(0, this.ehpTrailN) / emax);
      this.applyScale(this.eshFill, Math.min(1, this.eshShown / 90));
      this.ehpNum.text = snap.shop ? "" : String(Math.max(0, Math.round(this.ehpShown)));
      this.hpNum.text = String(Math.max(0, Math.round(this.hpShown)));
      this.stunMark.text = snap.stunned ? "✦" : "";
      this.dotMark.text = snap.dot > 0 ? `◉${snap.dot}` : "";
      this.poisMark.text = snap.poison > 0 ? `☠${snap.poison}` : "";
      for (const win of this.wins) {
        if (win.flick.visible) win.flick.alpha = 0.25 + 0.55 * Math.abs(Math.sin(now / 45));
        if (win.dropping) {
          win.dropT += dt;
          const u = Math.min(1, win.dropT / FEEL.dropMs);
          const cell = win.size || 80;
          const ease = u < 0.72 ? u / 0.72 : 1;
          const y = -cell + ease * cell;
          const squash = u > 0.72 && u < 0.88 ? 0.82 : u < 1 ? 1.06 : 1;
          win.icon.position.set((win.hole.width || cell) / 2, y);
          win.icon.scale.set((cell * 0.86) / Math.max(1, win.icon.texture.width), ((cell * 0.86) / Math.max(1, win.icon.texture.height)) * squash);
          if (u >= 1) {
            win.dropping = false;
            win.icon.position.set((win.hole.width || cell) / 2, (win.hole.height || cell) / 2);
            this.burst(win.root.x + cell / 2, win.root.y + cell, 0xffe08a, 6);
          }
        }
      }
    }
    this.stepCue(dt);
    this.stepFoe(dt);
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.s.position.set(p.x, p.y);
      p.s.alpha = Math.max(0, p.life / p.max);
      p.s.visible = p.life > 0;
    }
  };

  private applyScale(s: Sprite, frac: number) {
    const w = (s as Sprite & { __w?: number }).__w ?? 1;
    s.scale.x = Math.max(0.001, w * Math.max(0, frac));
    s.scale.y = 6;
  }

  private stepCue(dt: number) {
    const run = this.cue;
    if (!run) {
      if (this.lit) {
        this.lit = false;
        this.wins.forEach((win, i) => {
          win.root.alpha = 1;
          this.paint(win, Boolean(this.snap?.windows[i]?.crit));
        });
      }
      return;
    }
    this.lit = true;
    this.wins.forEach((win, i) => {
      const on = i === run.cue.reel;
      win.root.alpha = on ? 1 : 0.45;
      this.paint(win, on);
    });
    const dur = run.phase === "rewind" ? FEEL.rewindMs : run.phase === "hold" ? FEEL.resultHoldMs : FEEL.travelMs;
    run.t += dt;
    const win = this.wins[run.cue.reel];
    if (run.phase === "rewind" && win) {
      win.icon.rotation = run.t / 40;
      win.flick.visible = true;
      win.flick.alpha = 0.4;
      if (run.t >= dur) {
        win.icon.rotation = 0;
        win.flick.visible = false;
        this.finishCue(run);
      }
      return;
    }
    if (run.phase === "self" || run.phase === "travel") {
      const u = Math.min(1, run.t / dur);
      const from = win ? { x: win.root.x + (win.hole.width || 40) / 2, y: win.root.y + (win.hole.height || 40) / 2 } : { x: 40, y: 40 };
      const to = run.phase === "self" ? { x: this.youX, y: this.youY } : this.targetPoint(run.cue.target);
      const arc = run.cue.sym === "krimp" ? Math.sin(u * Math.PI) * 18 : 0;
      this.flyer.visible = true;
      const art = SYM[run.cue.sym as keyof typeof SYM]?.art;
      if (art) this.flyer.texture = this.tex(art);
      this.flyer.position.set(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u - arc);
      const sc = (run.cue.crit ? 0.55 : 0.38) * (run.cue.sym === "exekucia" ? 1.4 - u * 0.5 : 1);
      this.flyer.scale.set(sc);
      this.flyer.rotation = run.cue.sym === "boticka" ? u * 4 : run.cue.sym === "blocek" ? -0.2 + u * 0.6 : 0;
      if (u >= 1 && !run.impacted) this.impact(run);
      if (u >= 1) {
        this.flyer.visible = false;
        run.phase = "hold";
        run.t = 0;
      }
      return;
    }
    if (run.t >= dur) this.finishCue(run);
  }

  private stepFoe(dt: number) {
    const run = this.foeLine;
    if (!run) return;
    run.t += dt;
    if (run.phase === "tell") {
      this.foe.alpha = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 40));
      if (run.t >= FEEL.foeTellMs) {
        run.phase = "hold";
        run.t = 0;
        this.num.visible = true;
        this.foe.alpha = 1;
        const at = run.cue.target === "foe" ? { x: this.foeBaseX, y: this.foeBaseY - 36 } : { x: this.youX, y: this.youY - 20 };
        this.placeNum(at.x, at.y);
        this.burst(at.x, at.y, 0xff5d4a, 8);
      }
      return;
    }
    this.num.alpha = 1;
    if (run.t >= FEEL.foeHoldMs) {
      this.num.visible = false;
      this.foeLine = null;
      run.resolve();
    }
  }

  private impact(run: CueRun) {
    run.impacted = true;
    run.onImpact();
    const to = run.phase === "self" ? { x: this.youX, y: this.youY } : this.targetPoint(run.cue.target);
    this.num.text = run.phase === "self" ? run.cue.selfChip ?? "" : run.cue.chip;
    this.num.visible = Boolean(this.num.text);
    this.num.style.fill = run.cue.crit ? 0xffe56a : run.cue.target === "you" ? 0xb6f27c : 0xff5d4a;
    this.placeNum(to.x, to.y - 24);
    if (run.cue.crit) this.kick(FEEL.shakeCritMs);
    else if (run.cue.target === "foe") this.kick(FEEL.shakeHitMs);
    if (run.cue.target === "foe") {
      this.knock = 10;
      this.burst(to.x, to.y, run.cue.crit ? 0xffe56a : 0xff5d4a, run.cue.crit ? 14 : 8);
    }
    if (run.cue.sym === "data") this.glitch = 280;
    if (run.cue.sym === "exekucia") this.burst(to.x, to.y, 0x7ee7ff, 10);
    if (run.cue.target === "coin") this.burst(this.coinX, this.coinY, 0xffd76a, 10);
    if (run.cue.target === "you") this.burst(this.youX, this.youY, 0xb6f27c, 8);
  }

  private finishCue(run: CueRun) {
    if (run.phase === "self" && run.cue.chip) {
      run.phase = "travel";
      run.t = 0;
      run.impacted = false;
      return;
    }
    if (!run.impacted && !run.cue.rewind) this.impact(run);
    this.num.visible = false;
    this.flyer.visible = false;
    this.cue = null;
    run.resolve();
  }

  private targetPoint(target: FeelTarget) {
    if (target === "you") return { x: this.youX, y: this.youY };
    if (target === "coin") return { x: this.coinX, y: this.coinY };
    return { x: this.foeBaseX, y: this.foeBaseY - 40 };
  }

  private placeNum(x: number, y: number) {
    this.num.position.set(x, y);
  }

  private kick(ms: number) {
    const amt = this.snap?.shake ?? 1;
    if (this.reduced || amt <= 0) return;
    this.shake = (ms > 180 ? 8 : 4) * amt;
    this.shakeT = ms;
  }

  private burst(x: number, y: number, color: number, n: number) {
    let left = n;
    for (const p of this.puffs) {
      if (left <= 0) break;
      if (p.life > 0) continue;
      p.life = p.max = 420 + Math.random() * 200;
      p.x = x;
      p.y = y;
      const a = Math.random() * Math.PI * 2;
      const sp = 0.08 + Math.random() * 0.18;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.s.visible = true;
      p.s.tint = color;
      p.s.scale.set(0.6 + Math.random() * 0.8);
      left--;
    }
  }
}

