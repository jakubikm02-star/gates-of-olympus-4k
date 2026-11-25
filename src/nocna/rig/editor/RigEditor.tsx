import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import type { SpineDoc } from "../types";
import { Rig } from "../runtime";
import "./editor.css";

const PRESETS = [
  { id: "neplatic", label: "Neplatič" },
  { id: "inkasak", label: "Inkasák" },
  { id: "kurier", label: "Pekelný kuriér" },
  { id: "pokutomat", label: "Pokutomat", image: "/nocna/enemies/enemy-pokutomat.webp" },
] as const;

/**
 * Dev rig editor. Loaded only from /?rig=1, in its own chunk.
 * It writes the same Spine-subset JSON the fight runtime reads.
 */
export function RigEditor() {
  const host = useRef<HTMLDivElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const appRef = useRef<Application | null>(null);
  const holdRef = useRef(false);
  const [doc, setDoc] = useState<SpineDoc | null>(null);
  const [bone, setBone] = useState("torso");
  const [clip, setClip] = useState("idle");
  const [other, setOther] = useState("attack");
  const [onion, setOnion] = useState(false);
  const [time, setTime] = useState(0);
  const [preset, setPreset] = useState("neplatic");

  useEffect(() => {
    const api = {
      seek: (name: string, time: number) => rigRef.current?.seek(name, time),
      hold: (on: boolean) => {
        holdRef.current = on;
      },
    };
    (window as unknown as { __rig?: typeof api }).__rig = api;
    return () => {
      delete (window as unknown as { __rig?: typeof api }).__rig;
    };
  }, []);

  useEffect(() => {
    const wait = window.setInterval(() => {
      if (!appRef.current) return;
      window.clearInterval(wait);
      void loadPreset("neplatic");
    }, 40);
    return () => window.clearInterval(wait);
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let dead = false;
    const app = new Application();
    void app.init({ background: 0x6a7380, width: node.clientWidth || 640, height: node.clientHeight || 480, antialias: false, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true }).then(() => {
      if (dead) {
        app.destroy(true);
        return;
      }
      node.appendChild(app.canvas);
      appRef.current = app;
      const fit = () => app.renderer?.resize(Math.max(2, node.clientWidth), Math.max(2, node.clientHeight));
      const obs = new ResizeObserver(fit);
      obs.observe(node);
      app.ticker.add(() => {
        const rig = rigRef.current;
        if (!rig || holdRef.current) return;
        rig.update(app.ticker.deltaMS);
      });
    });
    return () => {
      dead = true;
      appRef.current?.destroy(true);
      appRef.current = null;
    };
  }, []);

  async function loadPreset(id: string) {
    setPreset(id);
    const preset = PRESETS.find((row) => row.id === id);
    if (preset && "image" in preset) {
      const rig = await Rig.loadBillboard(preset.image);
      swap(rig);
      setDoc(rig.doc);
      return;
    }
    const rig = await Rig.loadPacked(`/nocna/rigs/${id}/${id}`);
    swap(rig);
    const res = await fetch(`/nocna/rigs/${id}/${id}.json`);
    setDoc(await res.json());
  }

  function swap(rig: Rig) {
    const app = appRef.current;
    rigRef.current?.destroy();
    rigRef.current = rig;
    if (!app) return;
    app.stage.addChild(rig);
    const h = app.screen.height || 480;
    const sk = rig.doc?.skeleton.height || 512;
    const sheet = new URLSearchParams(window.location.search).has("sheet");
    const sc = (h * (sheet ? 0.5 : 0.78)) / sk;
    rig.scale.set(sc);
    rig.position.set((app.screen.width || 640) * (sheet ? 0.46 : 0.5), h * (sheet ? 0.62 : 0.9));
    void rig.play(clip, { loop: true, mix: 0 });
  }

  function patchBone(partial: { x?: number; y?: number; rotation?: number }) {
    if (!doc) return;
    const next: SpineDoc = {
      ...doc,
      bones: doc.bones.map((b) => (b.name === bone ? { ...b, ...partial } : b)),
    };
    setDoc(next);
    rigRef.current?.remount(next);
  }

  function addKey(channel: "rotate" | "translate" | "scale") {
    if (!doc) return;
    const anim = doc.animations[clip] ?? { bones: {} };
    const bones = { ...(anim.bones ?? {}) };
    const row = { ...(bones[bone] ?? {}) };
    if (channel === "rotate") {
      const angle = doc.bones.find((b) => b.name === bone)?.rotation ?? 0;
      row.rotate = [...(row.rotate ?? []), { time, angle }];
    } else if (channel === "translate") {
      row.translate = [...(row.translate ?? []), { time, x: 0, y: 0, curve: [0.4, 0, 0.2, 1] }];
    } else {
      row.scale = [...(row.scale ?? []), { time, x: 1, y: 1 }];
    }
    bones[bone] = row;
    const next = { ...doc, animations: { ...doc.animations, [clip]: { ...anim, bones } } };
    setDoc(next);
    rigRef.current?.remount(next);
  }

  function addEvent() {
    if (!doc) return;
    const anim = doc.animations[clip] ?? { bones: {} };
    const events = [...(anim.events ?? []), { time, name: "hit" }];
    const next = { ...doc, animations: { ...doc.animations, [clip]: { ...anim, events } } };
    setDoc(next);
  }

  function exportJson() {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${preset}.json`;
    a.click();
  }

  async function importJson(file: File) {
    const next = JSON.parse(await file.text()) as SpineDoc;
    setDoc(next);
    rigRef.current?.remount(next);
  }

  const selected = doc?.bones.find((b) => b.name === bone);
  const spring = doc?.physics?.find((p) => p.bone === bone);
  const ik = doc?.ik?.find((row) => row.bones.includes(bone));

  return (
    <div className="rig-edit">
      <header>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={preset === p.id ? "is-on" : ""} onClick={() => void loadPreset(p.id)}>
            {p.label}
          </button>
        ))}
        <label>
          JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importJson(file);
            }}
          />
        </label>
        <button type="button" onClick={exportJson}>
          Export
        </button>
        <button type="button" className={onion ? "is-on" : ""} onClick={() => setOnion((v) => !v)}>
          Cibuľa
        </button>
        <button type="button" onClick={() => void rigRef.current?.play(clip, { loop: true, mix: 0.15 })}>
          Prehrať
        </button>
        <button type="button" onClick={() => void rigRef.current?.play(other, { loop: false, mix: 0.2 })}>
          Prelínanie
        </button>
      </header>
      <aside>
        {(doc?.bones ?? []).map((b) => (
          <button key={b.name} type="button" className={bone === b.name ? "is-on" : ""} onClick={() => setBone(b.name)}>
            {b.parent ? `${b.parent} / ` : ""}
            {b.name}
          </button>
        ))}
      </aside>
      <div
        className="rig-stage"
        ref={host}
        onPointerDown={(e) => {
          if (!selected) return;
          const startX = e.clientX;
          const startRot = selected.rotation ?? 0;
          const move = (ev: PointerEvent) => patchBone({ rotation: Math.round(startRot + (ev.clientX - startX) * 0.4) });
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <aside>
        {selected ? (
          <>
            <label>
              x
              <input type="number" value={selected.x ?? 0} onChange={(e) => patchBone({ x: Number(e.target.value) })} />
            </label>
            <label>
              y
              <input type="number" value={selected.y ?? 0} onChange={(e) => patchBone({ y: Number(e.target.value) })} />
            </label>
            <label>
              uhol
              <input type="number" value={selected.rotation ?? 0} onChange={(e) => patchBone({ rotation: Number(e.target.value) })} />
            </label>
            <p>{ik ? `IK ${ik.bones.join(" → ")} cieľ ${ik.target}` : "Bez IK"}</p>
            <p>{spring ? `Pružina ${spring.strength ?? 0} / ${spring.damping ?? 0}` : "Bez pružiny"}</p>
            <button type="button" onClick={() => addKey("rotate")}>Kľúč otočenia</button>
            <button type="button" onClick={() => addKey("translate")}>Kľúč posunu</button>
            <button type="button" onClick={() => addKey("scale")}>Kľúč mierky</button>
            <button type="button" onClick={addEvent}>Udalosť hit</button>
          </>
        ) : (
          <p>Načítaj postavu.</p>
        )}
      </aside>
      <div className="rig-time">
        <label>
          klip
          <select value={clip} onChange={(e) => { setClip(e.target.value); rigRef.current?.seek(e.target.value, time); }}>
            {Object.keys(doc?.animations ?? { idle: {} }).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          druhý
          <select value={other} onChange={(e) => setOther(e.target.value)}>
            {Object.keys(doc?.animations ?? { attack: {} }).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          čas
          <input
            type="number"
            step="0.05"
            value={time}
            onChange={(e) => {
              const t = Number(e.target.value);
              setTime(t);
              rigRef.current?.seek(clip, t);
            }}
          />
        </label>
        <p>{onion ? "Cibuľa drží predchádzajúcu pózu v prelínaní." : "Potiahni javisko a otočíš vybranú kosť."}</p>
        <p>Dráha: {(doc?.animations[clip]?.events ?? []).map((ev) => `${ev.name}@${ev.time}`).join(" ") || "bez udalostí"}</p>
      </div>
    </div>
  );
}
