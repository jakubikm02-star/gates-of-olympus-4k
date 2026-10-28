import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nickFit } from "./nick-fit";

test("nickFit: longest unbreakable chunk and soft break points", () => {
  assert.deepEqual(nickFit("PALICA360"), { parts: ["PALICA360"], len: 9 });
  assert.deepEqual(nickFit("MARTIN_Z_PARKOVISKA"), { parts: ["MARTIN_", "Z_", "PARKOVISKA"], len: 10 });
  assert.deepEqual(nickFit("Jožo"), { parts: ["Jožo"], len: 4 });
  assert.equal(nickFit("AB").len, 4);
  assert.equal(nickFit("ŽIVÁ VODA KOLESO").len, 6);
  assert.equal(nickFit("XXXXXXXXXXXXXXXXXX").len, 18);
  assert.deepEqual(nickFit("a-b").parts, ["a-", "b"]);
  assert.deepEqual(nickFit("trail_").parts, ["trail_"]);
});

test("name cells never allow letter-by-letter breaks and the LED never stretches", () => {
  const css = readFileSync(new URL("../../components/slot/ribbons.css", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  // overflow-wrap:anywhere lowers min-content to one letter, which let the grid squeeze the name to a sliver.
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /word-break:\s*break-all/);
  assert.match(css, /\.rib-who\s*\{[^}]*container-type:\s*inline-size/);
  // The row layout follows the list width (container), not only the viewport.
  assert.match(styles, /\.fb-list\s*\{[^}]*container:\s*fblist\s*\/\s*inline-size/);
  assert.match(styles, /@container fblist/);
  assert.match(styles, /\.fb-price\s*\{[^}]*align-self:\s*(start|center)/);
});
