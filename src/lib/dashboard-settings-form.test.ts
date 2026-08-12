import { describe, expect, it } from "vitest";

import { defaultCypressConfigFields, legacyReportFields } from "./configuration-mappings";
import { dashboardSettingsFormValue } from "./dashboard-settings-form";
import { dashboardSettingsInputSchema, type DashboardSettingsInput, type DashboardSettingsView } from "./user-settings-schema";

const defaults = {
  reportPortalApiUrl: "https://report.example.org/api/v1",
  reportPortalApiKey: "",
  testRailBaseUrl: "",
  testRailApiUser: "",
  testRailApiKey: "",
  defaultProject: "default",
  defaultLaunchName: "nightly",
  defaultHistoryDepth: 10,
  reportFields: legacyReportFields,
  cypressConfigFields: defaultCypressConfigFields,
  launchProfileMappings: [],
} satisfies DashboardSettingsInput;

describe("dashboardSettingsFormValue", () => {
  it("removes read-only view flags before submitting strict dashboard settings", () => {
    const view: DashboardSettingsView = {
      ...defaults,
      configured: true,
      hasReportPortalApiKey: true,
      hasTestRailApiKey: true,
      github: {
        actions: { owner: "example", repository: "runner", workflow: "cypress.yml", ref: "main" },
        source: { owner: "example", repository: "tests", ref: "develop" },
        hasToken: true,
        hasWebhookSecret: true,
      },
    };

    const form = dashboardSettingsFormValue(view, defaults);

    expect(form).not.toHaveProperty("configured");
    expect(form).not.toHaveProperty("hasReportPortalApiKey");
    expect(form).not.toHaveProperty("hasTestRailApiKey");
    expect(form.github).toMatchObject({ token: "", webhookSecret: "" });
    expect(dashboardSettingsInputSchema.safeParse(form).success).toBe(true);
  });
});
