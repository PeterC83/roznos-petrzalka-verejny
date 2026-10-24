import { describe, expect, it } from "vitest";
import { nextReportAt } from "./reportTime";

describe("nextReportAt", () => {
  it("uses 19:00 Bratislava time in winter", () => {
    expect(nextReportAt(Date.parse("2026-01-15T17:20:00Z"))).toBe(Date.parse("2026-01-15T18:00:00Z"));
  });
  it("uses 19:00 Bratislava time in summer", () => {
    expect(nextReportAt(Date.parse("2026-07-15T16:20:00Z"))).toBe(Date.parse("2026-07-15T17:00:00Z"));
  });
  it("waits until the next day after 19:00", () => {
    expect(nextReportAt(Date.parse("2026-07-15T18:20:00Z"))).toBe(Date.parse("2026-07-16T17:00:00Z"));
  });
  it("handles the spring clock change", () => {
    expect(nextReportAt(Date.parse("2026-03-28T19:20:00Z"))).toBe(Date.parse("2026-03-29T17:00:00Z"));
  });
});
