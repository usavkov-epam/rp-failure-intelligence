import { describe, expect, it } from "vitest";

import { EMPTY_ANALYSIS_TABLE_FILTERS, normalizeAnalysisLocation, parseAnalysisTableFilters } from "./analysis-session";

describe("analysis session state", () => {
  it("accepts only application-root analysis locations", () => {
    expect(normalizeAnalysisLocation("/?launchName=Nightly&historyDepth=10")).toBe("/?launchName=Nightly&historyDepth=10");
    expect(normalizeAnalysisLocation("/settings")).toBe("/");
    expect(normalizeAnalysisLocation("https://example.org/?launchName=Nightly")).toBe("/");
  });

  it("parses complete string filter state and rejects malformed values", () => {
    const filters = { ...EMPTY_ANALYSIS_TABLE_FILTERS, search: "checkout", risk: "Persistent" };
    expect(parseAnalysisTableFilters(JSON.stringify(filters))).toEqual(filters);
    expect(parseAnalysisTableFilters(JSON.stringify({ search: "incomplete" }))).toBeNull();
    expect(parseAnalysisTableFilters("not-json")).toBeNull();
  });
});
