/** Weekly contest line (SMRŤ EGA). Title stays put, the live line crawls under it like a news ticker. */
export function ContestBanner({ text, onOpen }: { text?: string; onOpen?: () => void }) {
  const line = text ? `SMRŤ EGA · ${text}` : "SMRŤ EGA · výhra 4KA TV XL s archívom na 28 dní";
  return (
    <span
      className="jp-event is-ego"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) onOpen();
      }}
    >
      <span className="cb-soon">NEKONEČNO</span>
      <span className="cb-copy">
        <b>SMRŤ EGA</b>
        <span className="cb-crawl" aria-label={line}>
          <span aria-hidden="true">
            {line}
            <i> · </i>
            {line}
            <i> · </i>
          </span>
        </span>
      </span>
    </span>
  );
}
