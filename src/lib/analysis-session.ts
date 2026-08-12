export const ANALYSIS_SESSION_KEY = {
  LOCATION: "failure-intelligence:analysis-location",
  TABLE_FILTERS: "failure-intelligence:analysis-table-filters",
} as const;

const ANALYSIS_SESSION_CHANGE_EVENT = "failure-intelligence:analysis-session-change";

export interface AnalysisTableFilters {
  search: string;
  risk: string;
  moduleName: string;
  classification: string;
  failureRate: string;
  streak: string;
  transitions: string;
}

export const EMPTY_ANALYSIS_TABLE_FILTERS: AnalysisTableFilters = {
  search: "",
  risk: "",
  moduleName: "",
  classification: "",
  failureRate: "",
  streak: "",
  transitions: "",
};

export function parseAnalysisTableFilters(value: string | null): AnalysisTableFilters | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AnalysisTableFilters>;
    if (Object.keys(EMPTY_ANALYSIS_TABLE_FILTERS).some((key) => typeof parsed[key as keyof AnalysisTableFilters] !== "string")) return null;
    return parsed as AnalysisTableFilters;
  } catch {
    return null;
  }
}

export function normalizeAnalysisLocation(value: string | null) {
  if (!value) return "/";
  try {
    const location = new URL(value, "https://analysis.local");
    return location.origin === "https://analysis.local" && location.pathname === "/"
      ? `${location.pathname}${location.search}`
      : "/";
  } catch {
    return "/";
  }
}

export function subscribeToAnalysisSession(change: () => void) {
  window.addEventListener(ANALYSIS_SESSION_CHANGE_EVENT, change);
  window.addEventListener("storage", change);
  return () => {
    window.removeEventListener(ANALYSIS_SESSION_CHANGE_EVENT, change);
    window.removeEventListener("storage", change);
  };
}

export function getAnalysisLocationSnapshot() {
  return sessionStorage.getItem(ANALYSIS_SESSION_KEY.LOCATION) || "";
}

export function getAnalysisTableFiltersSnapshot() {
  return sessionStorage.getItem(ANALYSIS_SESSION_KEY.TABLE_FILTERS) || "";
}

function notifyAnalysisSessionChange() {
  window.dispatchEvent(new Event(ANALYSIS_SESSION_CHANGE_EVENT));
}

export function saveAnalysisLocation(location: string) {
  sessionStorage.setItem(ANALYSIS_SESSION_KEY.LOCATION, normalizeAnalysisLocation(location));
  notifyAnalysisSessionChange();
}

export function saveAnalysisTableFilters(filters: AnalysisTableFilters) {
  sessionStorage.setItem(ANALYSIS_SESSION_KEY.TABLE_FILTERS, JSON.stringify(filters));
  notifyAnalysisSessionChange();
}
