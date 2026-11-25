import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

interface Body {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  va: number;
  r: number;
  value: number;
  settled: boolean;
  sweeping: boolean;
  tx: number;
  ty: number;
}

/**
 * RJ coins with a tiny custom solver. Gravity, spin, bounce, friction.
 * A low tier just stacks them. Too many bodies merge into a larger coin.
 */
export class CoinTray {
  readonly view = new Container();
  private readonly pan = new Graphics();
  private readonly tag = new Text({
    text: "RJ",
    style: { fill: 0xf0c419, fontSize: 14, fontWeight: "700", fontFamily: "Oswald, sans-serif" },
  });
  private readonly bodies: Body[] = [];
  private readonly pool: Sprite[] = [];
  private tex: Texture | null = null;
  private left = 0;
  private right = 0;
  private floor = 0;
  private top = 0;
  shown = 0;
  physics = true;

  constructor() {
    this.tag.anchor.set(0, 0.5);
    this.view.addChild(this.pan, this.tag);
  }

  place(x: number, y: number, w: number, h: number) {
    this.left = x + 8;
    this.right = x + w - 8;
    this.top = y + 6;
    this.floor = y + h - 10;
    this.pan.clear();
    this.pan.roundRect(x, y, w, h, 10).fill({ color: 0x120e0a, alpha: 0.88 }).stroke({ color: 0xd7c4a0, width: 2 });
    this.pan.roundRect(x + 4, y + 4, w - 8, h - 8, 8).stroke({ color: 0x6a5434, width: 1 });
    this.tag.position.set(x + 10, y + h / 2);
  }

  setTexture(tex: Texture) {
    this.tex = tex;
  }

  /** Spawn `count` worth of RJ. Larger gaps become fewer, heavier coins. */
  burst(count: number, fromX: number, fromY: number) {
    let left = Math.max(0, Math.round(count));
    const dens = [10, 5, 1];
    for (const value of dens) {
      while (left >= value && this.bodies.length < 28) {
        this.spawn(value, fromX, fromY, true);
        left -= value;
      }
    }
    this.merge();
  }

  /** Pull `count` worth of coins toward a point. The rest stay in the tray. */
  sweep(count: number, toX: number, toY: number) {
    let left = Math.max(0, Math.round(count));
    const order = this.bodies.slice().sort((a, b) => a.value - b.value);
    for (const body of order) {
      if (left <= 0) break;
      if (body.sweeping) continue;
      body.sweeping = true;
      body.settled = false;
      body.tx = toX;
      body.ty = toY;
      left -= body.value;
    }
  }

  update(dtMs: number) {
    const dt = Math.min(0.033, dtMs / 1000);
    if (!this.physics) {
      this.stackStill();
      return;
    }
    const g = 2200;
    for (const body of this.bodies) {
      if (body.sweeping) {
        body.x += (body.tx - body.x) * Math.min(1, dt * 8);
        body.y += (body.ty - body.y) * Math.min(1, dt * 8);
        body.ang += dt * 12;
        if (Math.hypot(body.tx - body.x, body.ty - body.y) < 8) body.value = 0;
      } else {
        body.vy += g * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.ang += body.va * dt;
        if (body.x < this.left + body.r) {
          body.x = this.left + body.r;
          body.vx = Math.abs(body.vx) * 0.35;
        } else if (body.x > this.right - body.r) {
          body.x = this.right - body.r;
          body.vx = -Math.abs(body.vx) * 0.35;
        }
        if (body.y > this.floor - body.r) {
          body.y = this.floor - body.r;
          body.vy = -Math.abs(body.vy) * 0.28;
          body.vx *= 0.82;
          body.va *= 0.8;
          if (Math.abs(body.vy) < 40 && Math.abs(body.vx) < 30) {
            body.settled = true;
            body.vy = 0;
            body.vx *= 0.5;
          }
        }
        if (body.y < this.top + body.r && body.vy < 0) body.vy *= -0.2;
        this.separate(body);
      }
      body.sprite.position.set(body.x, body.y);
      body.sprite.rotation = body.ang;
    }
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      if (this.bodies[i]!.value <= 0) this.retire(i);
    }
  }

  private stackStill() {
    let x = this.left + 12;
    const y = this.floor - 12;
    for (const body of this.bodies) {
      body.x = x;
      body.y = y;
      body.sprite.position.set(x, y);
      body.sprite.rotation = 0;
      x += body.r * 1.6;
      if (x > this.right - 12) x = this.left + 12;
    }
  }

  private separate(body: Body) {
    for (const other of this.bodies) {
      if (other === body || other.sweeping) continue;
      const dx = body.x - other.x;
      const dy = body.y - other.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const need = body.r + other.r;
      if (dist >= need) continue;
      const push = (need - dist) / dist;
      body.x += dx * push * 0.5;
      body.y += dy * push * 0.45;
      if (body.settled && other.settled) body.vy = Math.min(body.vy, 0);
    }
  }

  private merge() {
    if (this.bodies.length < 24) return;
    const ones = this.bodies.filter((b) => b.value === 1 && b.settled && !b.sweeping);
    while (ones.length >= 5 && this.bodies.length > 18) {
      const group = ones.splice(0, 5);
      const host = group[0]!;
      host.value = 5;
      host.r = 11;
      host.sprite.scale.set(0.42);
      host.sprite.tint = 0xffe29a;
      for (const extra of group.slice(1)) extra.value = 0;
    }
  }

  private spawn(value: number, fromX: number, fromY: number, kick: boolean) {
    const sprite = this.pool.pop() ?? new Sprite(this.tex ?? Texture.WHITE);
    sprite.texture = this.tex ?? Texture.WHITE;
    sprite.anchor.set(0.5);
    const r = value >= 10 ? 14 : value >= 5 ? 11 : 8;
    sprite.scale.set(r / 28);
    sprite.tint = value >= 10 ? 0xfff6d0 : value >= 5 ? 0xffe29a : 0xffffff;
    sprite.visible = true;
    this.view.addChild(sprite);
    this.bodies.push({
      sprite,
      x: fromX + (Math.random() - 0.5) * 16,
      y: fromY,
      vx: kick ? (Math.random() - 0.5) * 280 : 0,
      vy: kick ? -180 - Math.random() * 260 : 0,
      ang: Math.random() * 6,
      va: (Math.random() - 0.5) * 10,
      r,
      value,
      settled: !kick,
      sweeping: false,
      tx: 0,
      ty: 0,
    });
  }

  private retire(index: number) {
    const body = this.bodies[index]!;
    body.sprite.visible = false;
    body.sprite.removeFromParent();
    this.pool.push(body.sprite);
    this.bodies.splice(index, 1);
  }
}
