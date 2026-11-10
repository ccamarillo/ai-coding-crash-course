import { describe, it, expect } from "vitest";
import { parseDashboardRange } from "./dashboard-range";

describe("parseDashboardRange", () => {
  it("accepts each preset range", () => {
    for (const value of ["7d", "30d", "90d", "1y", "all"]) {
      expect(parseDashboardRange(value)).toBe(value);
    }
  });

  it("falls back to 30 days for missing or unknown values", () => {
    expect(parseDashboardRange(null)).toBe("30d");
    expect(parseDashboardRange("14d")).toBe("30d");
  });
});
