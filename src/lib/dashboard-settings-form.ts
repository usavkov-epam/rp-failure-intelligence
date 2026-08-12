import type { DashboardSettingsInput, DashboardSettingsView } from "./user-settings-schema";

export function dashboardSettingsFormValue(
  settings: DashboardSettingsView | null,
  defaults: DashboardSettingsInput,
): DashboardSettingsInput {
  return {
    reportPortalApiUrl: settings?.reportPortalApiUrl ?? defaults.reportPortalApiUrl,
    reportPortalApiKey: "",
    testRailBaseUrl: settings?.testRailBaseUrl ?? defaults.testRailBaseUrl,
    testRailApiUser: settings?.testRailApiUser ?? defaults.testRailApiUser,
    testRailApiKey: "",
    github: settings?.github ? {
      actions: settings.github.actions,
      source: settings.github.source,
      token: "",
      webhookSecret: "",
    } : defaults.github,
    defaultProject: settings?.defaultProject ?? defaults.defaultProject,
    defaultLaunchName: settings?.defaultLaunchName ?? defaults.defaultLaunchName,
    defaultHistoryDepth: settings?.defaultHistoryDepth ?? defaults.defaultHistoryDepth,
    reportFields: settings?.reportFields ?? defaults.reportFields,
    cypressConfigFields: settings?.cypressConfigFields ?? defaults.cypressConfigFields,
    launchProfileMappings: settings?.launchProfileMappings ?? defaults.launchProfileMappings,
    launchSourceMappings: settings?.launchSourceMappings ?? defaults.launchSourceMappings,
  };
}
