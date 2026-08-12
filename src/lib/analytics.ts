import type {
  DashboardData,
  DashboardMetrics,
  FailureRow,
  HistoryEntry,
  ReportPortalItem,
  Risk,
  TrendPoint,
} from "./types";
import { ANALYTICS, REPORT_STATUS, RISK, TIME } from "./domain-constants";
import type { ClassificationMapping } from "./user-settings-schema";

interface AnalysisConfiguration {
  classificationMappings: ClassificationMapping[];
  testRailBaseUrl?: string;
  testRailCaseIdPattern?: string;
}

function getRisk(failed: number, executions: number): Risk {
  if (failed === executions) return RISK.PERSISTENT;
  if (failed >= ANALYTICS.HIGH_RISK_FAILURE_COUNT) return RISK.HIGH;
  if (failed === ANALYTICS.ISOLATED_FAILURE_COUNT) return RISK.ISOLATED;
  return RISK.INTERMITTENT;
}

function getClassification(item: ReportPortalItem, mappings: ClassificationMapping[]): string {
  const issueType = item.issue?.issueType;
  const value = issueType || Object.keys(item.statistics?.defects || {})[0];
  if (!value) return "Unclassified";
  return mappings.find((mapping) => mapping.value === value)?.label || value;
}

function getSpecPath(codeRef?: string): string {
  const match = codeRef?.match(/^(.*?\.cy\.[cm]?[jt]sx?)(?:\/|$)/);
  return match?.[1] || "Spec path unavailable";
}

function extractTestRailCase(itemName: string, pattern?: string) {
  if (!pattern) return null;
  const expression = pattern
    .split("{id}")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("(\\d+)");
  const match = new RegExp(expression).exec(itemName);
  return match?.[1] ? { id: match[0], number: match[1] } : null;
}

export function mergeCurrentFailuresWithHistory(
  currentFailures: ReportPortalItem[],
  history: HistoryEntry[],
): HistoryEntry[] {
  const currentFailureIds = new Set(currentFailures.map(({ id }) => id));
  const historyByResourceId = new Map<number, HistoryEntry>();

  history.forEach((entry) => {
    entry.resources.forEach(({ id }) => historyByResourceId.set(id, entry));
  });

  return currentFailures.map((current) => {
    const matched = historyByResourceId.get(current.id);
    if (!matched) return { resources: [current] };

    return {
      resources: [
        current,
        ...matched.resources.filter((resource) => (
          resource.id !== current.id && !currentFailureIds.has(resource.id)
        )),
      ],
    };
  });
}

export function analyzeHistory(
  history: HistoryEntry[],
  suiteItems: ReportPortalItem[],
  reportPortalBaseUrl: string,
  project: string,
  launchId: number,
  configuration: AnalysisConfiguration,
): Pick<DashboardData, "rows" | "trend" | "metrics"> {
  const rows: FailureRow[] = history.map(({ resources }) => {
    const current = resources[0];
    const statuses = resources.map((resource) => resource.status);
    const passed = statuses.filter((status) => status === REPORT_STATUS.PASSED).length;
    const failed = statuses.filter((status) => status === REPORT_STATUS.FAILED).length;
    const firstNonFailure = statuses.findIndex((status) => status !== REPORT_STATUS.FAILED);
    const testRailCase = extractTestRailCase(current.name, configuration.testRailCaseIdPattern);

    return {
      id: current.id,
      parentId: current.parent || 0,
      name: current.name,
      caseId: testRailCase?.id || null,
      caseNumber: testRailCase?.number || null,
      specPath: getSpecPath(current.codeRef),
      module: current.pathNames?.itemPaths?.[0]?.name || "Other",
      defect: getClassification(current, configuration.classificationMappings),
      duration: Math.max(0, Math.round(((current.endTime || current.startTime) - current.startTime) / TIME.MILLISECONDS_PER_SECOND)),
      passed,
      failed,
      other: statuses.length - passed - failed,
      executions: resources.length,
      failureRate: Math.round((failed / resources.length) * ANALYTICS.PERCENT_MULTIPLIER),
      currentStreak: firstNonFailure < 0 ? statuses.length : firstNonFailure,
      transitions: statuses.slice(1).reduce(
        (count, status, index) => count + (status === statuses[index] ? 0 : 1),
        0,
      ),
      regressed: statuses[1] === REPORT_STATUS.PASSED,
      risk: getRisk(failed, resources.length),
      statuses: [...statuses].reverse(),
      launchNumbers: [...resources].reverse().map((resource) => resource.pathNames?.launchPathName?.number || 0),
      reportPortalUrl: `${reportPortalBaseUrl}/ui/#${project}/launches/all/${launchId}/${current.parent}/${current.id}/log`,
      testRailUrl: testRailCase && configuration.testRailBaseUrl
        ? `${configuration.testRailBaseUrl}/index.php?/cases/view/${encodeURIComponent(testRailCase.number)}`
        : null,
    };
  });

  const observations = new Map<number, TrendPoint>();
  history.forEach(({ resources }) => resources.forEach((resource) => {
    const launchNumber = resource.pathNames?.launchPathName?.number;
    if (!launchNumber) return;
    const point = observations.get(launchNumber) || { launchNumber, passed: 0, failed: 0, other: 0 };
    if (resource.status === REPORT_STATUS.PASSED) point.passed += 1;
    else if (resource.status === REPORT_STATUS.FAILED) point.failed += 1;
    else point.other += 1;
    observations.set(launchNumber, point);
  }));

  const statusCount = (status: string) => suiteItems.filter((item) => item.status === status).length;
  const suitePassed = statusCount(REPORT_STATUS.PASSED);
  const suiteFailed = statusCount(REPORT_STATUS.FAILED);
  const metrics: DashboardMetrics = {
    suiteTotal: suiteItems.length,
    suitePassed,
    suiteFailed,
    suiteOther: suiteItems.length - suitePassed - suiteFailed,
    suiteFailureRate: suiteItems.length ? (suiteFailed / suiteItems.length) * ANALYTICS.PERCENT_MULTIPLIER : 0,
    cohortExecutions: rows.reduce((sum, row) => sum + row.executions, 0),
    cohortFailures: rows.reduce((sum, row) => sum + row.failed, 0),
    persistent: rows.filter((row) => row.risk === RISK.PERSISTENT).length,
    highRisk: rows.filter((row) => row.risk === RISK.HIGH).length,
    intermittent: rows.filter((row) => row.risk === RISK.INTERMITTENT).length,
    isolated: rows.filter((row) => row.risk === RISK.ISOLATED).length,
    regressions: rows.filter((row) => row.regressed).length,
  };

  return {
    rows,
    trend: [...observations.values()].sort((left, right) => left.launchNumber - right.launchNumber),
    metrics,
  };
}
