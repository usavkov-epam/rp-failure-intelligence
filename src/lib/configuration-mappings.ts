import type { CypressConfigField, LaunchProfileMapping, ReportFieldMapping } from "./user-settings-schema";

const CYPRESS_CONFIG_LIMITS = {
  MIN_VIEWPORT: 320,
  MAX_VIEWPORT_WIDTH: 3_840,
  MAX_VIEWPORT_HEIGHT: 2_160,
  MIN_TIMEOUT_MILLISECONDS: 1_000,
  MAX_TIMEOUT_MILLISECONDS: 300_000,
  MAX_RETRIES: 5,
  MAX_STRING_LENGTH: 500,
} as const;

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
  { key: "viewportWidth", label: "Viewport width (px)", type: "number", minimum: CYPRESS_CONFIG_LIMITS.MIN_VIEWPORT, maximum: CYPRESS_CONFIG_LIMITS.MAX_VIEWPORT_WIDTH },
  { key: "viewportHeight", label: "Viewport height (px)", type: "number", minimum: CYPRESS_CONFIG_LIMITS.MIN_VIEWPORT, maximum: CYPRESS_CONFIG_LIMITS.MAX_VIEWPORT_HEIGHT },
  { key: "defaultCommandTimeout", label: "Command timeout (ms)", type: "number", minimum: CYPRESS_CONFIG_LIMITS.MIN_TIMEOUT_MILLISECONDS, maximum: CYPRESS_CONFIG_LIMITS.MAX_TIMEOUT_MILLISECONDS },
  { key: "pageLoadTimeout", label: "Page-load timeout (ms)", type: "number", minimum: CYPRESS_CONFIG_LIMITS.MIN_TIMEOUT_MILLISECONDS, maximum: CYPRESS_CONFIG_LIMITS.MAX_TIMEOUT_MILLISECONDS },
  { key: "requestTimeout", label: "Request timeout (ms)", type: "number", minimum: CYPRESS_CONFIG_LIMITS.MIN_TIMEOUT_MILLISECONDS, maximum: CYPRESS_CONFIG_LIMITS.MAX_TIMEOUT_MILLISECONDS },
  { key: "responseTimeout", label: "Response timeout (ms)", type: "number", minimum: CYPRESS_CONFIG_LIMITS.MIN_TIMEOUT_MILLISECONDS, maximum: CYPRESS_CONFIG_LIMITS.MAX_TIMEOUT_MILLISECONDS },
  { key: "retries", label: "Cypress retries", type: "number", minimum: 0, maximum: CYPRESS_CONFIG_LIMITS.MAX_RETRIES },
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
    if (typeof value === "string" && (value.length > CYPRESS_CONFIG_LIMITS.MAX_STRING_LENGTH || /[\r\n]/.test(value))) return false;
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
