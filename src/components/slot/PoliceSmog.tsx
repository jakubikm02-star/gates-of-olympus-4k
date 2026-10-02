import "./police-smog.css";

/**
 * ZÁSAH police lights: red and blue haze rolling in from the screen corners, alternating, with two soft
 * beams sweeping through it. Prerendered blurred textures (public/fx, scripts/gen-police-smog.py) moved
 * only by transform/opacity, so no live blur filter runs on the device. The centre is masked down so the
 * symbols stay readable. Red/blue each peak once per cycle (≥ 0.9 s), well under 3 flashes per second.
 */
export function PoliceSmog({ danger = false, full = false, reduced = false }: { danger?: boolean; full?: boolean; reduced?: boolean }) {
  return (
    <div className={`police-smog${danger ? " is-danger" : ""}${full ? " is-full" : ""}${reduced ? " is-static" : ""}`} aria-hidden="true">
      <div className="ps-side ps-red">
        <i className="ps-fog ps-f1" />
        <i className="ps-fog ps-f2" />
        <i className="ps-beam" />
      </div>
      <div className="ps-side ps-blue">
        <i className="ps-fog ps-f1" />
        <i className="ps-fog ps-f2" />
        <i className="ps-beam" />
      </div>
    </div>
  );
}
