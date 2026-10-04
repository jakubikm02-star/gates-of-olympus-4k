/**
 * PETER MARCIPÁN: the game-show host of KOLESO NEŠŤASTIA, drawn as illustrated poses (webp with alpha, cut from
 * the host character sheet). All poses share one square canvas (one scale, feet on one baseline), so a pose
 * change is a short crossfade in place. The win pose gets a CSS coin burst on top. Art swap = overwrite src/assets/koleso/marcipan-{welcome,point,clap,shock,win,shrug}-{512,768}.webp
 * (or rebuild them: `python3 scripts/art/build-art.py marcipan <dir with the 6 PNGs>`); no code change.
 */
import welcome512 from "@/assets/koleso/marcipan-welcome-512.webp";
import welcome768 from "@/assets/koleso/marcipan-welcome-768.webp";
import point512 from "@/assets/koleso/marcipan-point-512.webp";
import point768 from "@/assets/koleso/marcipan-point-768.webp";
import clap512 from "@/assets/koleso/marcipan-clap-512.webp";
import clap768 from "@/assets/koleso/marcipan-clap-768.webp";
import shock512 from "@/assets/koleso/marcipan-shock-512.webp";
import shock768 from "@/assets/koleso/marcipan-shock-768.webp";
import win512 from "@/assets/koleso/marcipan-win-512.webp";
import win768 from "@/assets/koleso/marcipan-win-768.webp";
import shrug512 from "@/assets/koleso/marcipan-shrug-512.webp";
import shrug768 from "@/assets/koleso/marcipan-shrug-768.webp";

export type HostPose = "idle" | "welcome" | "point" | "shock" | "cheer" | "sad";

/** Game event pose -> illustration. idle = clapping (waiting for the spin), point = presenting the wheel,
 * cheer = win (open arms + coin burst), sad = shrug palms up. */
const HOST_ART: Record<HostPose, { name: string; s: string; l: string }> = {
  welcome: { name: "welcome", s: welcome512, l: welcome768 },
  idle: { name: "clap", s: clap512, l: clap768 },
  point: { name: "point", s: point512, l: point768 },
  shock: { name: "shock", s: shock512, l: shock768 },
  cheer: { name: "win", s: win512, l: win768 },
  sad: { name: "shrug", s: shrug512, l: shrug768 },
};

/** Coin burst for the win pose: end offset (% of the box), delay, spin. */
const COINS: [number, number, number, number][] = [
  [-34, -30, 0, 200], [30, -36, 40, -160], [-22, -48, 90, 280], [18, -52, 60, -240], [-40, -8, 120, 140],
  [40, -12, 30, -200], [-8, -58, 150, 320], [6, -40, 20, -120], [-28, -20, 180, 220], [26, -24, 110, -300],
];

const ORDER: HostPose[] = ["welcome", "idle", "point", "shock", "cheer", "sad"];
/** Rendered width of the square host box: phones ~190px, desktop up to ~720px. */
const SIZES = "(orientation: portrait) 200px, min(66vh, 720px)";

export function KolesoHost({ pose, className }: { pose: HostPose; className?: string }) {
  return (
    <span className={`kh ${className ?? ""} is-${pose}`} role="img" aria-label="Peter Marcipán, moderátor">
      {ORDER.map((p) => {
        const a = HOST_ART[p];
        return (
          <img
            key={p}
            className={`kh-pose kh-${a.name} ${p === pose ? "is-on" : ""}`}
            src={a.s}
            srcSet={`${a.s} 512w, ${a.l} 768w`}
            sizes={SIZES}
            width={512}
            height={512}
            alt=""
            decoding="async"
            loading="eager"
            draggable={false}
          />
        );
      })}
      {pose === "cheer" ? (
        <span className="kh-coins" aria-hidden="true">
          {COINS.map(([x, y, d, r], i) => (
            <i key={i} style={{ ["--x" as string]: x, ["--y" as string]: y, ["--d" as string]: `${d}ms`, ["--r" as string]: `${r}deg` }} />
          ))}
        </span>
      ) : null}
    </span>
  );
}
