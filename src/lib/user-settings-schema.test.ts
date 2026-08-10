import { describe, expect, it } from "vitest";

import { cypressProfileInputSchema, dashboardSettingsInputSchema } from "./user-settings-schema";

describe("dashboardSettingsInputSchema", () => {
  it("accepts bounded user-owned ReportPortal settings", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      reportPortalApiUrl: "https://report.example.org/api/v1",
      reportPortalApiKey: "secret",
      testRailBaseUrl: "",
      testRailApiUser: "",
      testRailApiKey: "",
      defaultProject: "nightly",
      defaultLaunchName: "nightly-eureka",
      defaultTeam: "team-a",
      defaultHistoryDepth: 10,
    }).success).toBe(true);
  });

  it("rejects non-URL integrations and excessive history", () => {
    expect(dashboardSettingsInputSchema.safeParse({
      reportPortalApiUrl: "javascript:alert(1)",
      defaultProject: "nightly",
      defaultLaunchName: "nightly-eureka",
      defaultTeam: "team-a",
      defaultHistoryDepth: 31,
    }).success).toBe(false);
  });
});

describe("cypressProfileInputSchema", () => {
  const profile = {
    name: "Snapshot ECS",
    baseUrl: "https://folio.example.org",
    okapiHost: "https://okapi.example.org",
    tenant: "diku",
    login: "admin",
    password: "secret",
    edgeHost: "",
    edgeApiKey: "",
    rtrAuth: true,
    ecsEnabled: true,
    eureka: true,
    systemRoleName: "adminRole",
    ecsEnvironment: "snapshot",
    isDefault: true,
  };

  it("accepts supported stripes-testing environment fields", () => {
    expect(cypressProfileInputSchema.safeParse(profile).success).toBe(true);
  });

  it("rejects executable profile names and invalid endpoints", () => {
    expect(cypressProfileInputSchema.safeParse({ ...profile, name: "x; rm", okapiHost: "not-a-url" }).success).toBe(false);
  });
});
