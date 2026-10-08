/** Weekly contest teaser. Shown to every player; the contest itself is not live yet. */
export function ContestBanner() {
  return (
    <div className="contest-banner" role="status">
      <span className="cb-soon">Čoskoro</span>
      <span className="cb-copy">
        <b>Týždenná súťaž</b>
        <small>Vyhraj prístup na mesiac k 4KA TV službe v hodnote 29 €</small>
      </span>
    </div>
  );
}
