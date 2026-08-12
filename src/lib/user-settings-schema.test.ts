import { describe, expect, it } from "vitest";

import { cypressProfileInputSchema, dashboardSettingsInputSchema } from "./user-settings-schema";
import { SPEC_PATH_COPY_FORMAT } from "./domain-constants";

const dashboard = {
  reportPortalApiUrl: "https://report.example.org/api/v1",
  reportPortalApiKey: "secret",
  testRailBaseUrl: "",
  testRailApiUser: "",
  testRailApiKey: "",
  testRailCaseIdPattern: "CASE-{id}",
  defaultProject: "nightly",
  defaultLaunchName: "nightly-ui",
  defaultHistoryDepth: 10,
  specPathCopyFormat: SPEC_PATH_COPY_FORMAT.COMMA_SEPARATED,
  reportFields: [{ key: "component", label: "Component", reportPortalParameter: "filter.eq.attributes.component", defaultValue: "ui", required: false }],
  classificationMappings: [{ value: "product_defect", label: "Product defect" }],
  cypressConfigFields: [{ key: "viewportWidth", label: "Viewport width", type: "number", minimum: 320, maximum: 3840 }],
  launchProfileMappings: [{ pattern: "*ui*", profileId: "bd05cf5b-e26d-4aa7-9d96-f4e647481e13" }],
  launchSourceMappings: [{ pattern: "*ui*", owner: "", repository: "", ref: "release/ui" }],
} as const;

describe("dashboardSettingsInputSchema", () => {
  it("accepts configurable report fields, run fields, and launch mappings", () => {
    expect(dashboardSettingsInputSchema.safeParse(dashboard).success).toBe(true);
  });

  it("accepts independent GitHub Actions and source repositories", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      github: {
        token: "github-token",
        webhookSecret: "a-secure-webhook-secret-with-32-chars",
        actions: { owner: "example", repository: "runner", workflow: "cypress.yml", ref: "main" },
        source: { owner: "example-tests", repository: "cypress-suite", ref: "release/2026.08" },
      },
    }).success).toBe(true);
  });

  it("rejects invalid GitHub workflow names and repository values", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      github: {
        token: "github-token",
        webhookSecret: "a-secure-webhook-secret-with-32-chars",
        actions: { owner: "example", repository: "runner;invalid", workflow: "script.sh", ref: "main" },
        source: { owner: "example", repository: "tests", ref: "main" },
      },
    }).success).toBe(false);
  });

  it("requires source mapping owner and repository overrides together", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      launchSourceMappings: [{ pattern: "*release*", owner: "example", repository: "", ref: "release" }],
    }).success).toBe(false);
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

  it("accepts unique classification labels and rejects duplicate raw values", () => {
    expect(dashboardSettingsInputSchema.safeParse(dashboard).success).toBe(true);
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      classificationMappings: [
        { value: "product_defect", label: "Product defect" },
        { value: "product_defect", label: "Duplicate" },
      ],
    }).success).toBe(false);
  });

  it("requires one ID placeholder in the optional TestRail case pattern", () => {
    expect(dashboardSettingsInputSchema.safeParse({ ...dashboard, testRailCaseIdPattern: "CASE-{id}" }).success).toBe(true);
    expect(dashboardSettingsInputSchema.safeParse({ ...dashboard, testRailCaseIdPattern: "CASE" }).success).toBe(false);
    expect(dashboardSettingsInputSchema.safeParse({ ...dashboard, testRailCaseIdPattern: "{id}-{id}" }).success).toBe(false);
  });

  it("accepts enum report fields with a valid default", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      reportFields: [{ key: "team", label: "Team", reportPortalParameter: "filter.eq.attributes.team", type: "enum", options: ["Platform", "Payments"], defaultValue: "Platform", required: false }],
    }).success).toBe(true);
  });

  it("rejects enum report fields without unique options or with an invalid default", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      reportFields: [{ key: "team", label: "Team", reportPortalParameter: "filter.eq.attributes.team", type: "enum", options: ["Platform", "platform"], defaultValue: "Other", required: false }],
    }).success).toBe(false);
  });

  it("rejects execution-sensitive Cypress config keys", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      cypressConfigFields: [{ key: "setupNodeEvents", label: "Plugin hook", type: "string" }],
    }).success).toBe(false);
  });

  it("accepts Cypress configuration keys containing underscores", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      ...dashboard,
      cypressConfigFields: [{ key: "default_command_timeout", label: "Command timeout", type: "number", minimum: 1000 }],
    }).success).toBe(true);
  });

  it("rejects plaintext HTTP integration URLs", () => {
    expect(dashboardSettingsInputSchema.safeParse({ ...dashboard, reportPortalApiUrl: "http://report.example.org/api/v1" }).success).toBe(false);
  });
});

describe("cypressProfileInputSchema", () => {
  const profile = {
    name: "Snapshot ECS",
    baseUrl: "https://application.example.org",
    variables: [
      { key: "API_HOST", type: "string", value: "https://api.example.org", secret: false },
      { key: "USER_PASSWORD", type: "string", value: "secret", secret: true },
      { key: "FEATURE_AUTH", type: "boolean", value: "true", secret: false },
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
    expect(cypressProfileInputSchema.safeParse({ ...profile, baseUrl: "http://application.example.org" }).success).toBe(false);
  });
});
