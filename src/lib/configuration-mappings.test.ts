import { describe, expect, it } from "vitest";

import {
  cypressConfigEnvironmentName,
  resolveLaunchProfileId,
  resolveLaunchSourceRepository,
  validateCypressConfigValues,
} from "./configuration-mappings";

describe("configuration mappings", () => {
  it("resolves the first available launch glob mapping", () => {
    const available = new Set(["b8663d08-f48b-4d2d-8a89-4ef82ffae514"]);
    expect(resolveLaunchProfileId("Nightly Eureka ECS", [
      { pattern: "nightly *", profileId: "00000000-0000-4000-8000-000000000000" },
      { pattern: "*eureka*", profileId: "b8663d08-f48b-4d2d-8a89-4ef82ffae514" },
    ], available)).toBe("b8663d08-f48b-4d2d-8a89-4ef82ffae514");
  });

  it("overrides a source ref by launch while inheriting the default repository", () => {
    expect(resolveLaunchSourceRepository(
      "Nightly Eureka release",
      { owner: "folio-org", repository: "stripes-testing", ref: "main" },
      [
        { pattern: "*eureka*", owner: "", repository: "", ref: "release/eureka" },
        { pattern: "*", owner: "other", repository: "other-tests", ref: "develop" },
      ],
    )).toEqual({ owner: "folio-org", repository: "stripes-testing", ref: "release/eureka" });
  });

  it("can override the complete source repository for a matching launch", () => {
    expect(resolveLaunchSourceRepository(
      "Special suite",
      { owner: "default", repository: "tests", ref: "main" },
      [{ pattern: "special *", owner: "team", repository: "release-tests", ref: "v2" }],
    )).toEqual({ owner: "team", repository: "release-tests", ref: "v2" });
  });

  it("validates configured Cypress values and rejects dangerous or unknown keys", () => {
    const fields = [
      { key: "retries", label: "Retries", type: "number" as const, minimum: 0, maximum: 5 },
      { key: "video", label: "Video", type: "boolean" as const },
      { key: "baseUrl", label: "Base URL", type: "string" as const },
    ];
    expect(validateCypressConfigValues({ retries: 2, video: false }, fields)).toBe(true);
    expect(validateCypressConfigValues({ retries: 6 }, fields)).toBe(false);
    expect(validateCypressConfigValues({ baseUrl: "https://unsafe.example" }, fields)).toBe(false);
    expect(validateCypressConfigValues({ unknown: true }, fields)).toBe(false);
  });

  it("maps camel-case Cypress keys to environment variable names", () => {
    expect(cypressConfigEnvironmentName("defaultCommandTimeout")).toBe("CYPRESS_DEFAULT_COMMAND_TIMEOUT");
  });
});
