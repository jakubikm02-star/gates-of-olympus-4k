import { Container, Sprite, Texture } from "pixi.js";

interface Puff {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  spin: number;
  trail: boolean;
}

export class ParticlePool {
  private puffs: Puff[] = [];

  constructor(parent: Container, cap: number) {
    const dot = Texture.WHITE;
    for (let i = 0; i < cap; i++) {
      const s = new Sprite(dot);
      s.anchor.set(0.5);
      s.visible = false;
      parent.addChild(s);
      this.puffs.push({ s, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, g: 0, spin: 0, trail: false });
    }
  }

  burst(o: { x: number; y: number; n: number; color: number; speed: number; life: number; g?: number; ring?: boolean; trails?: boolean }) {
    let left = o.n;
    for (const p of this.puffs) {
      if (left <= 0) break;
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.4 + Math.random());
      p.life = o.life * (0.7 + Math.random() * 0.5);
      p.max = p.life;
      p.x = o.x;
      p.y = o.y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - (o.ring ? 0.05 : 0.12);
      p.g = o.g ?? 0.0014;
      p.spin = (Math.random() - 0.5) * 0.02;
      p.trail = Boolean(o.trails) && left % 2 === 0;
      p.s.visible = true;
      p.s.tint = o.color;
      p.s.alpha = 1;
      const size = o.ring ? 10 + Math.random() * 8 : 3 + Math.random() * 4;
      p.s.scale.set(size, o.ring ? size : size * 0.6);
      left--;
    }
  }

  tick(dt: number, trails: boolean) {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.s.position.set(p.x, p.y);
      p.s.rotation += p.spin * dt;
      const u = Math.max(0, p.life / p.max);
      p.s.alpha = u;
      if (p.trail && trails) p.s.scale.x *= 0.98;
      p.s.visible = p.life > 0;
    }
  }
}
