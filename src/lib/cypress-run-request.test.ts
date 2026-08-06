import { describe, expect, it } from "vitest";

import { cypressRunRequestSchema } from "./cypress-run-request";

const validRequest = {
  specs: ["cypress/e2e/invoices/example.cy.js"],
  runs: 5,
  threads: 2,
  browser: "chrome",
  timeoutSeconds: 600,
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

  it("accepts an environment profile and bounded Cypress configuration overrides", () => {
    const result = cypressRunRequestSchema.parse({
      ...validRequest,
      environment: "snapshot-ecs",
      cypressConfig: {
        viewportWidth: 1440,
        viewportHeight: 900,
        retries: 2,
        video: true,
      },
    });

    expect(result).toMatchObject({
      environment: "snapshot-ecs",
      cypressConfig: { viewportWidth: 1440, viewportHeight: 900, retries: 2, video: true },
    });
  });

  it.each([
    { specs: ["../../etc/passwd"] },
    { specs: ["cypress/e2e/example.js"] },
    { runs: 21 },
    { threads: 5 },
    { browser: "firefox" },
    { timeoutSeconds: 59 },
    { environment: "../../secret" },
    { cypressConfig: { viewportWidth: 200 } },
    { cypressConfig: { retries: 6 } },
    { cypressConfig: { baseUrl: "https://unapproved.example.org" } },
  ])("rejects unsafe or unbounded input: %o", (override) => {
    expect(cypressRunRequestSchema.safeParse({ ...validRequest, ...override }).success).toBe(false);
  });
});
