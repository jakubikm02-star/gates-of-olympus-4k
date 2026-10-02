import type { CSSProperties } from "react";
import { FS_SYMBOL } from "@/lib/slot/symbols";
import { fsSymName, fsSymSrc, type FsSymId } from "@/lib/slot/zasah";

/**
 * Chase-start notice. The drawn symbol card glitches, flips and lands as the FS seal.
 * Transform / opacity only. Reduced motion shows the end state at once.
 */
export function FsReveal({ sym, onClose }: { sym: FsSymId; onClose: () => void }) {
  const blocked = sym === "scatter";
  const name = fsSymName(sym);
  return (
    <div className={`fs-reveal${blocked ? " is-blocked" : ""}`} onClick={onClose} role="presentation">
      <div className="fsr-card" role="dialog" aria-live="assertive" aria-label={blocked ? `Finančná správa: ${name}, bonus zablokovaný` : `Finančná správa sleduje: ${name}`}>
        <svg className="fsr-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M8 1 H60 L64 4 H92 L99 11 V62 L97 65 V92 L92 99 H36 L32 96 H8 L1 89 V36 L3 33 V8 Z" />
          <path className="fsr-tick" d="M68 4 H86 M14 96 H28 M99 22 V40 M1 60 V78" />
        </svg>
        <p className="fsr-kicker">ZÁSAH · NOVÝ PRÍKAZ</p>
        <div className="fsr-stage" aria-hidden="true">
          <span className="fsr-scan" />
          <div className="fsr-flip">
            <span className="fsr-face fsr-front">
              <img src={fsSymSrc(sym)} alt="" draggable={false} />
              <b className="fsr-glitch" style={{ ["--src" as string]: `url(${fsSymSrc(sym)})` } as CSSProperties} />
            </span>
            <span className="fsr-face fsr-back">
              <img src={FS_SYMBOL.src} alt="" draggable={false} />
            </span>
          </div>
          <span className="fsr-ring" />
        </div>
        <p className="fsr-title">{blocked ? "BONUS ZABLOKOVANÝ" : "FINANČNÁ SPRÁVA SLEDUJE"}</p>
        <strong className="fsr-name">
          <img src={fsSymSrc(sym)} alt="" />
          {name}
          <i aria-hidden="true">→</i>
          <img src={FS_SYMBOL.src} alt="" />
          <span>FS</span>
        </strong>
        <p className="fsr-rule">
          {blocked
            ? "4KA TV je počas ZÁSAHU pod pečaťou FS. Voľné točenia sa nespustia, FS ťa však nájde najťažšie."
            : "Okno na tomto symbole = zásah FS. 3× FS = DAŇOVÝ ÚNIK."}
        </p>
        <button type="button" className="fsr-ok" onClick={onClose}>
          ROZUMIEM
        </button>
      </div>
    </div>
  );
}
