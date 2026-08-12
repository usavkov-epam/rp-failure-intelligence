import { describe, expect, it } from "vitest";

import { SPEC_PATH_COPY_FORMAT } from "./domain-constants";
import { formatSpecPaths } from "./spec-path-copy";

const paths = ["cypress/e2e/first.cy.ts", "cypress/e2e/second.cy.ts"];

describe("formatSpecPaths", () => {
  it("formats paths as a comma-separated list", () => {
    expect(formatSpecPaths(paths, SPEC_PATH_COPY_FORMAT.COMMA_SEPARATED)).toBe(paths.join(","));
  });

  it("formats paths with one path per line", () => {
    expect(formatSpecPaths(paths, SPEC_PATH_COPY_FORMAT.NEW_LINE_SEPARATED)).toBe(paths.join("\n"));
  });
});
