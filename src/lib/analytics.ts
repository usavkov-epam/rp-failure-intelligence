import type {
  DashboardData,
  DashboardMetrics,
  FailureRow,
  HistoryEntry,
  ReportPortalItem,
  Risk,
  TrendPoint,
} from "./types";

const issueNames: Record<string, string> = {
  ti001: "To investigate",
  ab_uvbcfwkvo3e8: "Flaky",
  to_investigate: "To investigate",
  automation_bug: "Automation bug",
};

function getRisk(failed: number, executions: number): Risk {
  if (failed === executions) return "Persistent";
  if (failed >= 8) return "High risk";
  if (failed === 1) return "Isolated";
  return "Intermittent";
}

function getDefect(item: ReportPortalItem): string {
  const issueType = item.issue?.issueType;
  if (issueType) return issueNames[issueType] || issueType;
  const defect = Object.keys(item.statistics?.defects || {})[0];
  return issueNames[defect] || defect || "Unclassified";
}

function getSpecPath(codeRef?: string): string {
  const match = codeRef?.match(/^(.*?\.cy\.[cm]?[jt]sx?)(?:\/|$)/);
  return match?.[1] || "Spec path unavailable";
}

export function analyzeHistory(
  history: HistoryEntry[],
  suiteItems: ReportPortalItem[],
  reportPortalBaseUrl: string,
  project: string,
  launchId: number,
  testRailBaseUrl?: string,
): Pick<DashboardData, "rows" | "trend" | "metrics"> {
  const rows: FailureRow[] = history.map(({ resources }) => {
    const current = resources[0];
    const statuses = resources.map((resource) => resource.status);
    const passed = statuses.filter((status) => status === "PASSED").length;
    const failed = statuses.filter((status) => status === "FAILED").length;
    const firstNonFailure = statuses.findIndex((status) => status !== "FAILED");
    const caseMatch = current.name.match(/^C(\d+)/);

    return {
      id: current.id,
      parentId: current.parent || 0,
      name: current.name,
      caseId: caseMatch ? `C${caseMatch[1]}` : null,
      caseNumber: caseMatch?.[1] || null,
      specPath: getSpecPath(current.codeRef),
      module: current.pathNames?.itemPaths?.[0]?.name || "Other",
      defect: getDefect(current),
      duration: Math.max(0, Math.round(((current.endTime || current.startTime) - current.startTime) / 1000)),
      passed,
      failed,
      other: statuses.length - passed - failed,
      executions: resources.length,
      failureRate: Math.round((failed / resources.length) * 100),
      currentStreak: firstNonFailure < 0 ? statuses.length : firstNonFailure,
      transitions: statuses.slice(1).reduce(
        (count, status, index) => count + (status === statuses[index] ? 0 : 1),
        0,
      ),
      regressed: statuses[1] === "PASSED",
      risk: getRisk(failed, resources.length),
      statuses: [...statuses].reverse(),
      launchNumbers: [...resources].reverse().map((resource) => resource.pathNames?.launchPathName?.number || 0),
      reportPortalUrl: `${reportPortalBaseUrl}/ui/#${project}/launches/all/${launchId}/${current.parent}/${current.id}/log`,
      testRailUrl: caseMatch
        ? `${testRailBaseUrl || "https://example.testrail.io"}/index.php?/cases/view/${caseMatch[1]}`
        : null,
    };
  });

  const observations = new Map<number, TrendPoint>();
  history.forEach(({ resources }) => resources.forEach((resource) => {
    const launchNumber = resource.pathNames?.launchPathName?.number;
    if (!launchNumber) return;
    const point = observations.get(launchNumber) || { launchNumber, passed: 0, failed: 0, other: 0 };
    if (resource.status === "PASSED") point.passed += 1;
    else if (resource.status === "FAILED") point.failed += 1;
    else point.other += 1;
    observations.set(launchNumber, point);
  }));

  const statusCount = (status: string) => suiteItems.filter((item) => item.status === status).length;
  const suitePassed = statusCount("PASSED");
  const suiteFailed = statusCount("FAILED");
  const metrics: DashboardMetrics = {
    suiteTotal: suiteItems.length,
    suitePassed,
    suiteFailed,
    suiteOther: suiteItems.length - suitePassed - suiteFailed,
    suiteFailureRate: suiteItems.length ? (suiteFailed / suiteItems.length) * 100 : 0,
    cohortExecutions: rows.reduce((sum, row) => sum + row.executions, 0),
    cohortFailures: rows.reduce((sum, row) => sum + row.failed, 0),
    persistent: rows.filter((row) => row.risk === "Persistent").length,
    highRisk: rows.filter((row) => row.risk === "High risk").length,
    intermittent: rows.filter((row) => row.risk === "Intermittent").length,
    isolated: rows.filter((row) => row.risk === "Isolated").length,
    regressions: rows.filter((row) => row.regressed).length,
  };

  return {
    rows,
    trend: [...observations.values()].sort((left, right) => left.launchNumber - right.launchNumber),
    metrics,
  };
}