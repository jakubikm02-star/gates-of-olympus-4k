/** Subset of Spine 4.1 JSON. Extra `physics` entries use Spine's strength/damping names. */

export interface SpineBone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  length?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface SpineSlot {
  name: string;
  bone: string;
  attachment?: string;
}

export interface RegionAttach {
  type?: "region" | "mesh";
  x?: number;
  y?: number;
  rotation?: number;
  width: number;
  height: number;
  scaleX?: number;
  scaleY?: number;
}

export interface SpineDoc {
  skeleton: {
    hash?: string;
    spine?: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
    images?: string;
    fps?: number;
  };
  bones: SpineBone[];
  slots: SpineSlot[];
  skins: { name: string; attachments: Record<string, Record<string, RegionAttach>> }[];
  ik?: {
    name: string;
    order?: number;
    bones: string[];
    target: string;
    bendPositive?: boolean;
    mix?: number;
    /** Upper and lower bone lengths for the delta IK. Absent chains stay keyframed. */
    l1?: number;
    l2?: number;
  }[];
  physics?: { name: string; bone: string; strength?: number; damping?: number; mix?: number }[];
  events?: Record<string, { string?: string }>;
  animations: Record<
    string,
    {
      bones?: Record<
        string,
        {
          rotate?: { time: number; angle: number; curve?: number[] | "stepped" }[];
          translate?: { time: number; x: number; y: number; curve?: number[] | "stepped" }[];
          scale?: { time: number; x: number; y: number; curve?: number[] | "stepped" }[];
        }
      >;
      events?: { time: number; name: string }[];
    }
  >;
}

export interface AtlasRegion {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: string;
  pageW: number;
  pageH: number;
}

/** LibGDX / Spine atlas. `xy` is the bottom-left of the region. */
export function parseAtlas(text: string): { page: string; pageW: number; pageH: number; regions: AtlasRegion[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const page = lines[0]?.trim() || "page.webp";
  let pageW = 1;
  let pageH = 1;
  const regions: AtlasRegion[] = [];
  let cur: Partial<AtlasRegion> | null = null;
  const flush = () => {
    if (cur?.name && cur.x != null && cur.y != null && cur.w && cur.h) {
      const yTop = pageH - (cur.y + cur.h);
      regions.push({ name: cur.name, x: cur.x, y: yTop, w: cur.w, h: cur.h, page, pageW, pageH });
    }
    cur = null;
  };
  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (!t) continue;
    if (!cur && t.startsWith("size:")) {
      const [w, h] = t.slice(5).split(",").map((n) => Number(n.trim()));
      pageW = w || 1;
      pageH = h || 1;
      continue;
    }
    if (!line.startsWith(" ") && !t.includes(":")) {
      flush();
      cur = { name: t };
      continue;
    }
    if (!cur) continue;
    if (t.startsWith("xy:")) {
      const [x, y] = t.slice(3).split(",").map((n) => Number(n.trim()));
      cur.x = x;
      cur.y = y;
    } else if (t.startsWith("size:")) {
      const [w, h] = t.slice(5).split(",").map((n) => Number(n.trim()));
      cur.w = w;
      cur.h = h;
    }
  }
  flush();
  return { page, pageW, pageH, regions };
}
