import type { CypressConfigField, LaunchProfileMapping, ReportFieldMapping } from "./user-settings-schema";

export const legacyReportFields: ReportFieldMapping[] = [{
  key: "cohort",
  label: "Test name contains",
  reportPortalParameter: "filter.cnt.name",
  type: "text",
  options: [],
  defaultValue: "",
  required: false,
}];

export const defaultCypressConfigFields: CypressConfigField[] = [
  { key: "viewportWidth", label: "Viewport width (px)", type: "number", minimum: 320, maximum: 3_840 },
  { key: "viewportHeight", label: "Viewport height (px)", type: "number", minimum: 320, maximum: 2_160 },
  { key: "defaultCommandTimeout", label: "Command timeout (ms)", type: "number", minimum: 1_000, maximum: 300_000 },
  { key: "pageLoadTimeout", label: "Page-load timeout (ms)", type: "number", minimum: 1_000, maximum: 300_000 },
  { key: "requestTimeout", label: "Request timeout (ms)", type: "number", minimum: 1_000, maximum: 300_000 },
  { key: "responseTimeout", label: "Response timeout (ms)", type: "number", minimum: 1_000, maximum: 300_000 },
  { key: "retries", label: "Cypress retries", type: "number", minimum: 0, maximum: 5 },
  { key: "video", label: "Record video", type: "boolean" },
  { key: "screenshotOnRunFailure", label: "Screenshot on failure", type: "boolean" },
];

const blockedCypressConfigKeys = new Set([
  "baseurl", "env", "specpattern", "supportfile", "fixturesfolder", "downloadsfolder",
  "screenshotsfolder", "videosfolder", "fileserverfolder", "setupnodeevents", "projectid",
]);

export function validateCypressConfigValues(
  values: Record<string, string | number | boolean>,
  fields: CypressConfigField[],
) {
  const definitions = new Map(fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(values)) {
    const field = definitions.get(key);
    if (!field || blockedCypressConfigKeys.has(key.toLowerCase()) || typeof value !== field.type) return false;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return false;
      if (field.minimum !== undefined && value < field.minimum) return false;
      if (field.maximum !== undefined && value > field.maximum) return false;
    }
    if (typeof value === "string" && (value.length > 500 || /[\r\n]/.test(value))) return false;
  }
  return true;
}

function globExpression(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`, "i");
}

export function resolveLaunchProfileId(
  launchName: string,
  mappings: LaunchProfileMapping[],
  availableProfileIds: Set<string>,
) {
  return mappings.find(({ pattern, profileId }) => (
    availableProfileIds.has(profileId) && globExpression(pattern).test(launchName)
  ))?.profileId;
}

export function cypressConfigEnvironmentName(key: string) {
  return `CYPRESS_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}
