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
  });

  it.each([
    { specs: ["../../etc/passwd"] },
    { specs: ["cypress/e2e/example.js"] },
    { runs: 21 },
    { threads: 5 },
    { browser: "firefox" },
    { timeoutSeconds: 59 },
  ])("rejects unsafe or unbounded input: %o", (override) => {
    expect(cypressRunRequestSchema.safeParse({ ...validRequest, ...override }).success).toBe(false);
  });
});