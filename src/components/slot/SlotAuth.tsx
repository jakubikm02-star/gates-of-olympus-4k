import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export function SlotAuthScreen({ pending = false }: { pending?: boolean }) {
  return (
    <div className="stage is-boot">
      <div className="stage-bg" />
      <div className="stage-glow" />
      <div className="park-lines" aria-hidden="true" />
      <div className="boot">
        <img src="/art/ramp.png" alt="" className="boot-ramp" />
        <div className="boot-card">
          <div className="logo-plate">
            <span className="logo-kicker">PORTS of</span>
            <span className="logo-main">PARKIZMUS</span>
            <span className="logo-sub">ZÓNA · LÍSTOK · RAMPA · POKUTA</span>
          </div>
          <p className="boot-max">WIN UP TO 5000× BET</p>
          {pending ? (
            <p className="boot-copy">Načítavam tvoj účet…</p>
          ) : (
            <>
              <p className="boot-copy">
                Každý hráč má vlastný kredit, pity meter a ligu. Prihlás sa, inak by sa zostatok miešal.
              </p>
              {authEnabled ? (
                <div className="auth-actions">
                  {GROK_PROVIDERS.map((p) => (
                    <button
                      key={p.providerId}
                      type="button"
                      className="cta"
                      onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                    >
                      {p.label === "X" ? "POKRAČOVAŤ CEZ X" : `POKRAČOVAŤ CEZ ${p.label.toUpperCase()}`}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="boot-copy">Prihlásenie je vypnuté.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
