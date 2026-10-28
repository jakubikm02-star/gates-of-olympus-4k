/**
 * Name cells (Tabuľa, SMRŤ EGA, VERSUS) never break a nick letter by letter. A nick wraps only
 * at spaces or after "_", ".", "-" (a <wbr> goes there), and its font shrinks so the longest
 * unbreakable chunk fits the cell (CSS reads `--nick-len`, see ribbons.css).
 */
export interface NickFit {
  /** Text pieces; a soft break point (<wbr>) goes after every piece except the last. */
  parts: string[];
  /** Characters in the longest piece that cannot wrap (at least 4, so short nicks keep full size). */
  len: number;
}

export function nickFit(nick: string): NickFit {
  const text = nick ?? "";
  const parts = text.split(/(?<=[_.\-])(?=\S)/u);
  let len = 0;
  for (const word of text.split(/[\s]+|(?<=[_.\-])/u)) len = Math.max(len, [...word].length);
  return { parts: parts.length ? parts : [""], len: Math.max(4, len) };
}
