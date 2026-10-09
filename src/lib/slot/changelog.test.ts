import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeDayLabel, recentChanges } from "./changelog.ts";

const noon = (day: string) => Date.parse(`${day}T12:00:00`);

describe("update log", () => {
  it("keeps seven calendar days and groups newest first", () => {
    const groups = recentChanges(noon("2026-10-10"));
    const days = groups.map((g) => g.day);
    assert.equal(days[0], "2026-10-09");
    assert.ok(days.includes("2026-10-04"));
    assert.ok(!days.includes("2026-10-03"));
    assert.deepEqual([...days].sort().reverse(), days);
    const today = groups[0];
    assert.ok(today && today.items.length >= 2);
    assert.equal(new Set(today.items).size, today.items.length);
  });

  it("labels today and yesterday", () => {
    const now = noon("2026-10-09");
    assert.match(changeDayLabel("2026-10-09", now), /^Dnes · 9\. 10\. 2026$/);
    assert.match(changeDayLabel("2026-10-08", now), /^Včera · 8\. 10\. 2026$/);
    assert.match(changeDayLabel("2026-10-07", now), /^streda · 7\. 10\. 2026$/);
  });
});
