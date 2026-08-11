import { describe, expect, it } from "vitest";

import { cypressProfileInputSchema, dashboardSettingsInputSchema } from "./user-settings-schema";

const dashboard = {
  reportPortalApiUrl: "https://report.example.org/api/v1",
  reportPortalApiKey: "secret",
  testRailBaseUrl: "",
  testRailApiUser: "",
  testRailApiKey: "",
  defaultProject: "nightly",
  defaultLaunchName: "nightly-eureka",
  defaultHistoryDepth: 10,
  reportFields: [{ key: "component", label: "Component", reportPortalParameter: "filter.eq.attributes.component", defaultValue: "ui", required: false }],
  cypressConfigFields: [{ key: "viewportWidth", label: "Viewport width", type: "number", minimum: 320, maximum: 3840 }],
  launchProfileMappings: [{ pattern: "*eureka*", profileId: "bd05cf5b-e26d-4aa7-9d96-f4e647481e13" }],
} as const;

describe("dashboardSettingsInputSchema", () => {
  it("accepts configurable report fields, run fields, and launch mappings", () => {
    expect(dashboardSettingsInputSchema.safeParse(dashboard).success).toBe(true);
  });

  it("rejects unsafe ReportPortal parameters and duplicate field keys", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      reportFields: [
        ...dashboard.reportFields,
        { key: "COMPONENT", label: "Other", reportPortalParameter: "page.size", defaultValue: "", required: false },
      ],
    }).success).toBe(false);
  });

  it("rejects ReportPortal parameters controlled by the dashboard", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      reportFields: [{ key: "launch", label: "Launch", reportPortalParameter: "filter.eq.launchId", defaultValue: "1", required: true }],
    }).success).toBe(false);
  });

  it("rejects execution-sensitive Cypress config keys", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      cypressConfigFields: [{ key: "setupNodeEvents", label: "Plugin hook", type: "string" }],
    }).success).toBe(false);
  });

  it("rejects plaintext HTTP integration URLs", () => {
    expect(dashboardSettingsInputSchema.safeParse({ ...dashboard, reportPortalApiUrl: "http://report.example.org/api/v1" }).success).toBe(false);
  });
});

describe("cypressProfileInputSchema", () => {
  const profile = {
    name: "Snapshot ECS",
    baseUrl: "https://folio.example.org",
    variables: [
      { key: "OKAPI_HOST", type: "string", value: "https://okapi.example.org", secret: false },
      { key: "diku_password", type: "string", value: "secret", secret: true },
      { key: "RTR_AUTH", type: "boolean", value: "true", secret: false },
    ],
    isDefault: true,
  } as const;

  it("accepts generic typed environment variables", () => {
    expect(cypressProfileInputSchema.safeParse(profile).success).toBe(true);
  });

  it("rejects duplicate variables and non-string secrets", () => {
    expect(cypressProfileInputSchema.safeParse({ ...profile, variables: [
      { key: "TOKEN", type: "number", value: "1", secret: true },
      { key: "token", type: "string", value: "x", secret: false },
    ] }).success).toBe(false);
  });

  it("rejects executable names and plaintext HTTP base URLs", () => {
    expect(cypressProfileInputSchema.safeParse({ ...profile, name: "x; rm" }).success).toBe(false);
    expect(cypressProfileInputSchema.safeParse({ ...profile, baseUrl: "http://folio.example.org" }).success).toBe(false);
  });
});
