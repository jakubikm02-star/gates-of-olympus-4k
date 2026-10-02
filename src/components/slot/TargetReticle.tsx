import { FS_SYMBOL, PAY_SYMBOLS } from "@/lib/slot/symbols";
import type { ChaseAim } from "@/hooks/use-chase-aim";
import { fsSymName, fsSymSrc, ZASAH, type FsSymId } from "@/lib/slot/zasah";

/** ZÁSAH HUD row: green reticle with the HACK target, red FS seal on the right. Same row height as the ticker. */
export function TargetHud({
  aim,
  strikes,
  fsSym,
  turbo,
}: {
  aim: ChaseAim;
  strikes: number;
  fsSym: FsSymId | null | undefined;
  turbo?: boolean;
}) {
  const target = aim.id ? PAY_SYMBOLS.find((p) => p.id === aim.id) : undefined;
  const hits = Math.min(ZASAH.HITS, aim.hits);
  const fsName = fsSym ? fsSymName(fsSym) : null;
  return (
    <span
      className={`zt-hud${turbo ? " is-turbo" : ""}${hits >= ZASAH.HITS - 1 ? " is-close" : ""}${target ? "" : " is-aiming"}`}
      role="status"
      aria-label={`ZÁSAH · cieľ ${target?.name ?? "zameriava sa"} · HACK ${hits}/${ZASAH.HITS} · FS ${strikes}/${ZASAH.STRIKES}`}
    >
      <span className="zt-ret" aria-hidden="true">
        <span className="zt-scope">
          <svg className="zt-cross" viewBox="0 0 100 100">
            <circle className="zt-ring" cx="50" cy="50" r="44" />
            <circle className="zt-ring2" cx="50" cy="50" r="36" />
            <path className="zt-ticks" d="M50 0 V14 M50 86 V100 M0 50 H14 M86 50 H100" />
            <path className="zt-brk" d="M18 30 V18 H30 M70 18 H82 V30 M82 70 V82 H70 M30 82 H18 V70" />
          </svg>
          {target ? (
            <img key={`i${aim.seq}`} className="zt-icon" src={target.src} alt="" draggable={false} />
          ) : (
            <b className="zt-q">?</b>
          )}
          {aim.seq > 0 ? <span key={`g${aim.seq}`} className="zt-snap" /> : null}
          {aim.hitSeq > 0 ? <span key={`h${aim.hitSeq}`} className="zt-flash" /> : null}
        </span>
      </span>
      <span className="zt-meta">
        <em>CIEĽ</em>
        <b key={`n${aim.seq}`}>{target?.name ?? "ZAMERIAVAM…"}</b>
      </span>
      <span className="zt-hits">
        <span className="zt-segs" aria-hidden="true">
          {Array.from({ length: ZASAH.HITS }, (_, i) => (
            <i
              key={i === hits - 1 ? `s${i}-${aim.hitSeq}` : `s${i}`}
              className={i < hits ? (i === hits - 1 && aim.hitSeq > 0 ? "is-on is-new" : "is-on") : ""}
            />
          ))}
        </span>
        <b>
          {hits}/{ZASAH.HITS}
        </b>
      </span>
      {fsSym ? (
        <span className={`zt-fs${fsSym === "scatter" ? " is-blocked" : ""}`} title={`FS = ${fsName}`}>
          <img className="zt-fs-src" src={fsSymSrc(fsSym)} alt="" />
          <img className="zt-fs-erb" src={FS_SYMBOL.src} alt="" />
          <span className="zt-fs-pips" aria-hidden="true">
            {Array.from({ length: ZASAH.STRIKES }, (_, i) => (
              <i key={i} className={i < strikes ? "is-on" : ""} />
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}
