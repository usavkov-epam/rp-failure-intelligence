import { describe, expect, it } from "vitest";

import { defaultCypressConfigFields } from "./configuration-mappings";
import { SPEC_PATH_COPY_FORMAT } from "./domain-constants";
import { dashboardSettingsFormValue } from "./dashboard-settings-form";
import { dashboardSettingsInputSchema, type DashboardSettingsInput, type DashboardSettingsView } from "./user-settings-schema";

const defaults = {
  reportPortalApiUrl: "https://report.example.org/api/v1",
  reportPortalApiKey: "",
  testRailBaseUrl: "",
  testRailApiUser: "",
  testRailApiKey: "",
  testRailCaseIdPattern: "",
  defaultProject: "default",
  defaultLaunchName: "nightly",
  defaultHistoryDepth: 10,
  specPathCopyFormat: SPEC_PATH_COPY_FORMAT.COMMA_SEPARATED,
  reportFields: [],
  classificationMappings: [],
  cypressConfigFields: defaultCypressConfigFields,
  launchProfileMappings: [],
  launchSourceMappings: [],
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
