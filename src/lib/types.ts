export type Risk = "Persistent" | "High risk" | "Intermittent" | "Isolated";

export interface FailureRow {
  id: number;
  parentId: number;
  name: string;
  caseId: string | null;
  caseNumber: string | null;
  specPath: string;
  module: string;
  defect: string;
  duration: number;
  passed: number;
  failed: number;
  other: number;
  executions: number;
  failureRate: number;
  currentStreak: number;
  transitions: number;
  regressed: boolean;
  risk: Risk;
  statuses: string[];
  launchNumbers: number[];
  reportPortalUrl: string;
  testRailUrl: string | null;
}

export interface TrendPoint {
  launchNumber: number;
  passed: number;
  failed: number;
  other: number;
}

export interface DashboardMetrics {
  suiteTotal: number;
  suitePassed: number;
  suiteFailed: number;
  suiteOther: number;
  suiteFailureRate: number;
  cohortExecutions: number;
  cohortFailures: number;
  persistent: number;
  highRisk: number;
  intermittent: number;
  isolated: number;
  regressions: number;
}

export interface DashboardData {
  rows: FailureRow[];
  trend: TrendPoint[];
  metrics: DashboardMetrics;
  meta: {
    project: string;
    launchName: string;
    launchNumber: number | null;
    launchId: number | null;
    launchStatus: string;
    fields: Array<{ key: string; label: string; value: string }>;
    historyDepth: number;
    source: "live" | "error";
    loadedAt: string;
    error?: string;
  };
}

export interface ReportSelection {
  project: string;
  launchName: string;
  launchId?: number;
  fields: Record<string, string>;
  historyDepth: number;
}

export interface LaunchRunOption {
  id: number;
  number: number;
  status: string;
  startTime: number;
}

export interface ReportSourceOptions {
  projects: string[];
  launches: string[];
  launchRuns: LaunchRunOption[];
}

export type CypressRunState = "queued" | "in_progress" | "completed";

export interface CypressRunRecord {
  requestId: string;
  actionsUrl: string;
  specs: string[];
  runs: number;
  threads: number;
  browser: string;
  timeoutSeconds: number;
  environment?: string;
  cypressConfig: Record<string, string | number | boolean>;
  requestedAt: string;
  status: CypressRunState;
  conclusion: string | null;
  runId?: number;
  runNumber?: number;
  startedAt?: string | null;
  updatedAt?: string;
  artifactCount?: number;
  artifactNames?: string[];
}

export interface CypressRunDetails {
  jobs: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    startedAt: string | null;
    completedAt: string | null;
    htmlUrl?: string;
    steps: Array<{ name: string; number: number; status: string; conclusion: string | null }>;
  }>;
  artifacts: Array<{
    id: number;
    name: string;
    sizeInBytes: number;
    createdAt: string;
    downloadUrl: string;
  }>;
}

export interface ReportPortalItem {
  id: number;
  parent?: number;
  name: string;
  status: string;
  startTime: number;
  endTime?: number;
  codeRef?: string;
  issue?: { issueType?: string };
  statistics?: { defects?: Record<string, number> };
  pathNames?: {
    itemPaths?: Array<{ name: string }>;
    launchPathName?: { number: number };
  };
}

export interface HistoryEntry {
  resources: ReportPortalItem[];
}
