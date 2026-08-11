import { describe, expect, it } from "vitest";

import { normalizeReportPortalProjectNames } from "./reportportal-projects";

describe("ReportPortal project discovery", () => {
  it("normalizes the project names endpoint response", () => {
    expect(normalizeReportPortalProjectNames(["zeta", "alpha", "alpha", " "])).toEqual(["alpha", "zeta"]);
  });

  it("supports legacy paged project responses", () => {
    expect(normalizeReportPortalProjectNames({ content: [
      { projectName: "nightly" },
      { name: "release" },
    ] })).toEqual(["nightly", "release"]);
  });
});
