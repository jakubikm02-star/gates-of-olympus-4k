import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHANGELOG, changeDayLabel, recentChanges } from "./changelog.ts";

const noon = (day: string) => Date.parse(`${day}T12:00:00`);

describe("update log", () => {
  it("keeps seven calendar days and groups newest first", () => {
    const groups = recentChanges(noon("2026-10-12"));
    const days = groups.map((g) => g.day);
    assert.equal(days[0], "2026-10-12");
    assert.ok(days.includes("2026-10-09"));
    assert.ok(days.includes("2026-10-07"));
    assert.ok(!days.includes("2026-10-05"));
    assert.deepEqual([...days].sort().reverse(), days);
    const newest = groups[0];
    assert.ok(newest && newest.items.length >= 1);
    const packed = groups.find((g) => g.day === "2026-10-09");
    assert.ok(packed && packed.items.length >= 2);
    assert.equal(new Set(packed.items).size, packed.items.length);
  });

  it("records the landscape reel fix", () => {
    const note = CHANGELOG.find((n) => n.text.includes("valce sa opäť vykreslia celé"));
    assert.ok(note);
    assert.equal(note.day, "2026-10-21");
  });

  it("labels today and yesterday", () => {
    const now = noon("2026-10-09");
    assert.match(changeDayLabel("2026-10-09", now), /^Dnes · 9\. 10\. 2026$/);
    assert.match(changeDayLabel("2026-10-08", now), /^Včera · 8\. 10\. 2026$/);
    assert.match(changeDayLabel("2026-10-07", now), /^streda · 7\. 10\. 2026$/);
  });
});
