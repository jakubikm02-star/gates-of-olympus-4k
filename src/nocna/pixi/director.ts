import { ease } from "./eases";

export interface Tween {
  duration: number;
  ease?: (t: number) => number;
  update: (u: number) => void;
  onComplete?: () => void;
}

export type Clip = Tween | { seq: Clip[] } | { par: Clip[] } | { wait: number };

interface Live {
  clip: Clip;
  t: number;
  done: boolean;
  kids?: Live[];
  resolve?: () => void;
}

/** Timeline of tweens. Sequential and parallel groups. One tick from the stage. */
export class Director {
  private jobs: Live[] = [];

  play(clip: Clip): Promise<void> {
    return new Promise((resolve) => {
      this.jobs.push({ clip, t: 0, done: false, resolve });
    });
  }

  clear() {
    for (const job of this.jobs) job.resolve?.();
    this.jobs = [];
  }

  tick(dt: number) {
    for (const job of this.jobs) this.step(job, dt);
    this.jobs = this.jobs.filter((job) => !job.done);
  }

  private step(live: Live, dt: number) {
    if (live.done) return;
    const clip = live.clip;
    if ("wait" in clip) {
      live.t += dt;
      if (live.t >= clip.wait) this.finish(live);
      return;
    }
    if ("seq" in clip) {
      live.kids ??= clip.seq.map((item) => ({ clip: item, t: 0, done: false }));
      const current = live.kids.find((kid) => !kid.done);
      if (!current) this.finish(live);
      else this.step(current, dt);
      if (live.kids.every((kid) => kid.done)) this.finish(live);
      return;
    }
    if ("par" in clip) {
      live.kids ??= clip.par.map((item) => ({ clip: item, t: 0, done: false }));
      for (const kid of live.kids) this.step(kid, dt);
      if (live.kids.every((kid) => kid.done)) this.finish(live);
      return;
    }
    live.t += dt;
    const u = Math.min(1, live.t / Math.max(1, clip.duration));
    clip.update((clip.ease ?? ease.linear)(u));
    if (u >= 1) {
      clip.onComplete?.();
      this.finish(live);
    }
  }

  private finish(live: Live) {
    if (live.done) return;
    live.done = true;
    live.resolve?.();
    live.resolve = undefined;
  }
}
