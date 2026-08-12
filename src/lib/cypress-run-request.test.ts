import { describe, expect, it } from "vitest";

import { cypressRunRequestSchema } from "./cypress-run-request";

const validRequest = {
  launchName: "Nightly UI",
  specs: ["cypress/e2e/invoices/example.cy.js"],
  runs: 5,
  threads: 2,
  browser: "chrome",
  timeoutSeconds: 600,
  profileId: "b8663d08-f48b-4d2d-8a89-4ef82ffae514",
};

describe("cypressRunRequestSchema", () => {
  it("accepts bounded spec requests and removes duplicate paths", () => {
    const result = cypressRunRequestSchema.parse({
      ...validRequest,
      specs: [...validRequest.specs, ...validRequest.specs],
    });

    expect(result.specs).toEqual(validRequest.specs);
    expect(result.cypressConfig).toEqual({});
  });

  it("accepts a user Cypress profile and bounded configuration overrides", () => {
    const result = cypressRunRequestSchema.parse({
      ...validRequest,
      cypressConfig: {
        viewportWidth: 1440,
        custom_option: "enabled",
        viewportHeight: 900,
        retries: 2,
        video: true,
      },
    });

    expect(result).toMatchObject({
      profileId: validRequest.profileId,
      cypressConfig: { viewportWidth: 1440, custom_option: "enabled", viewportHeight: 900, retries: 2, video: true },
    });
  });

  it.each([
    { specs: ["../../etc/passwd"] },
    { specs: ["cypress/e2e/example.js"] },
    { runs: 21 },
    { threads: 5 },
    { browser: "firefox" },
    { timeoutSeconds: 59 },
    { profileId: "../../secret" },
    { cypressConfig: { "invalid-key": true } },
    { cypressConfig: { customValue: "line 1\nline 2" } },
  ])("rejects unsafe or unbounded input: %o", (override) => {
    expect(cypressRunRequestSchema.safeParse({ ...validRequest, ...override }).success).toBe(false);
  });
});
