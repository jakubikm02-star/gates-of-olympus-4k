const LINE = "Vyhraj prístup na mesiac k 4KA TV službe v hodnote 29 €";

/** Weekly contest line. Title stays put, the prize crawls under it like a news ticker. */
export function ContestBanner() {
  return (
    <span className="jp-event">
      <span className="cb-soon">Čoskoro</span>
      <span className="cb-copy">
        <b>Týždenná súťaž</b>
        <span className="cb-crawl" aria-label={LINE}>
          <span aria-hidden="true">
            {LINE}
            <i> · </i>
            {LINE}
            <i> · </i>
          </span>
        </span>
      </span>
    </span>
  );
}
