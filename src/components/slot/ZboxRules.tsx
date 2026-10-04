import { Crosshair, HandCoins, Magnet, Signpost, Warehouse, Zap, type LucideIcon } from "lucide-react";
import {
  CAN_TABLE,
  ZBOX_CAP_X,
  ZBOX_CELLS,
  ZBOX_FULL_MUL,
  ZBOX_MODS,
  ZBOX_START,
  ZBOX_TIERS,
  ZBOX_WINDOWS,
  type ZMod,
  type ZSize,
} from "@/lib/slot/zbox";
import { canSrc } from "@/lib/slot/symbols";

/** Special parcel pictograms (lucide), shared by the Ž-BOX wall, its banners and the rules. */
const MOD_ICON: Record<ZMod, LucideIcon> = {
  kurier: Crosshair,
  dobierka: HandCoins,
  presmer: Signpost,
  zberny: Magnet,
  expres: Zap,
  sklad: Warehouse,
};

export function ModIcon({ mod, size = 16 }: { mod: ZMod; size?: number }) {
  const I = MOD_ICON[mod];
  return <I size={size} strokeWidth={2.4} aria-hidden="true" />;
}

const num = (n: number) => String(n).replace(".", ",");

/** "0,1–0,3×" from a size tier (ZBOX_TIERS), so the rules never drift from the engine. */
function tierSpan(size: ZSize): string {
  const xs = ZBOX_TIERS[size].map((t) => t.x);
  return `${num(Math.min(...xs))}–${num(Math.max(...xs))}×`;
}

const SIZES: { size: ZSize; label: string }[] = [
  { size: "s", label: "Malá" },
  { size: "m", label: "Vysoká" },
  { size: "w", label: "Široká" },
  { size: "l", label: "Veľká" },
];

/**
 * Ž-BOX rules, one source for the in-game (i) sheet and the manual (Paytable → Ž-BOX). Every number comes
 * from lib/slot/zbox.ts.
 */
export function ZboxRules({ compact = false }: { compact?: boolean }) {
  const cans = CAN_TABLE.map((c) => `×${c.x}`).join(" / ");
  return (
    <div className={`zr ${compact ? "is-compact" : ""}`}>
      <ol className="zr-steps">
        <li>
          <b>Štart</b>
          <span>
            V stene je {ZBOX_CELLS} schránok. {ZBOX_START} balíky už čakajú. Od ranku SMART pribudne aj prioritná zásielka.
          </span>
        </li>
        <li>
          <b>Kolo</b>
          <span>
            Kuriér postupne otestuje každú zatvorenú schránku. Zlaté svetlo a otvorené dvierka znamenajú balík, sivé
            „prázdne“ znamená nič. Každá schránka má rovnakú šancu; väčšie dvierka majú vyššiu hodnotu.
          </span>
        </li>
        <li>
          <b>Doručovacie okná = pokusy</b>
          <span>
            Máš {ZBOX_WINDOWS} okná. Nový balík ich doplní na {ZBOX_WINDOWS}. Kolo bez balíka zoberie jedno okno. Pri 0 oknách
            alebo plnej stene Ž-BOX končí.
          </span>
        </li>
        <li>
          <b>Výplata</b>
          <span>
            Súčet balíkov × kuriérsky príplatok. Plná stena ({ZBOX_CELLS}/{ZBOX_CELLS}) ×{ZBOX_FULL_MUL}. Strop {ZBOX_CAP_X}× stávky.
          </span>
        </li>
      </ol>

      <h4 className="zr-h">Hodnota podľa dvierok (× stávky)</h4>
      <div className="zr-sizes">
        {SIZES.map((s) => (
          <span key={s.size} className={`zr-size is-${s.size}`}>
            <i aria-hidden="true" />
            <b>{s.label}</b>
            <em>{tierSpan(s.size)}</em>
          </span>
        ))}
      </div>

      <h4 className="zr-h">Kuriérsky príplatok</h4>
      <p className="zr-can">
        <img src={canSrc(2)} alt="" />
        <span>
          Občas pristane na streche plechovka {cans}. Plechovky sa sčítajú (×2 a ×3 = ×5) a na konci násobia súčet. Okná
          neovplyvnia.
        </span>
      </p>

      <h4 className="zr-h">Špeciálne balíky</h4>
      <ul className="zr-mods">
        {ZBOX_MODS.map((m) => (
          <li key={m.mod} className={`zr-mod mod-${m.mod}`}>
            <i>
              <ModIcon mod={m.mod} size={compact ? 15 : 17} />
            </i>
            <b>{m.name}</b>
            <span>{m.line}</span>
          </li>
        ))}
      </ul>
      <p className="zr-note">Špeciál má aj vlastnú hodnotu podľa dvierok. Pôsobí hneď, ako ho kuriér doručí.</p>
    </div>
  );
}
