import "server-only";

import { analyzeHistory, mergeCurrentFailuresWithHistory } from "./analytics";
import { collectAllPages, type PageResult } from "./pagination";
import { normalizeReportPortalProjectNames } from "./reportportal-projects";
import type { DashboardData, HistoryEntry, ReportPortalItem, ReportSelection, ReportSourceOptions } from "./types";
import { REPORT_PORTAL, REPORT_STATUS } from "./domain-constants";
import type { ReportFieldMapping } from "./user-settings-schema";

type Page<T> = PageResult<T>;

interface Launch {
  id: number;
  name: string;
  number: number;
  status: string;
  startTime: number;
}

export interface ReportPortalConnection {
  apiUrl: string;
  apiKey: string;
  testRailBaseUrl?: string;
}

export async function loadReportPortalProjects(connection: ReportPortalConnection) {
  try {
    const payload = await fetchReportPortalJson<unknown>(connection, "project/names", {});
    const projects = normalizeReportPortalProjectNames(payload);
    if (projects.length) return projects;
  } catch {
    // ReportPortal versions before project/names used the paged project/list endpoint.
  }

  const projectPage = await fetchAllReportPortalPages<unknown>(connection, "project/list", {
    "page.size": REPORT_PORTAL.API_PAGE_SIZE,
  });
  return normalizeReportPortalProjectNames(projectPage);
}

function selectedFields(selection: ReportSelection, fields: ReportFieldMapping[]) {
  return fields.map(({ key, label }) => ({ key, label, value: selection.fields[key] || "" }));
}

export function buildReportPortalFilters(selection: ReportSelection, fields: ReportFieldMapping[]) {
  return Object.fromEntries(fields.flatMap(({ key, reportPortalParameter }) => {
    const value = selection.fields[key]?.trim();
    return value ? [[reportPortalParameter, value]] : [];
  }));
}

function errorData(selection: ReportSelection, fields: ReportFieldMapping[], error: string): DashboardData {
  return {
    rows: [],
    trend: [],
    metrics: {
      suiteTotal: 0,
      suitePassed: 0,
      suiteFailed: 0,
      suiteOther: 0,
      suiteFailureRate: 0,
      cohortExecutions: 0,
      cohortFailures: 0,
      persistent: 0,
      highRisk: 0,
      intermittent: 0,
      isolated: 0,
      regressions: 0,
    },
    meta: {
      project: selection.project,
      launchName: selection.launchName,
      launchNumber: null,
      launchId: null,
      launchStatus: "UNAVAILABLE",
      fields: selectedFields(selection, fields),
      historyDepth: selection.historyDepth,
      source: "error",
      loadedAt: new Date().toISOString(),
      error,
    },
  };
}

async function fetchAllPages<T>(connection: ReportPortalConnection, project: string, endpoint: string, params: Record<string, string | number>): Promise<Page<T>> {
  return fetchAllReportPortalPages<T>(connection, `${project}/${endpoint}`, params);
}

async function fetchReportPortalJson<T>(connection: ReportPortalConnection, endpoint: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${connection.apiUrl}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: { Authorization: `bearer ${connection.apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ReportPortal ${endpoint} request failed with ${response.status}`);
  return response.json();
}

async function fetchReportPortalPage<T>(connection: ReportPortalConnection, endpoint: string, params: Record<string, string | number>): Promise<Page<T>> {
  return fetchReportPortalJson<Page<T>>(connection, endpoint, params);
}

async function fetchAllReportPortalPages<T>(
  connection: ReportPortalConnection,
  endpoint: string,
  params: Record<string, string | number>,
): Promise<Page<T>> {
  // Keep concurrency bounded so large ReportPortal projects do not create an API request spike.
  return collectAllPages((page) => (
    fetchReportPortalPage<T>(connection, endpoint, { ...params, "page.page": page })
  ));
}

export async function resolveReportSelection(connection: ReportPortalConnection, selection: ReportSelection): Promise<{
  selection: ReportSelection;
  options: ReportSourceOptions;
}> {
  let projects = [selection.project];
  try {
    projects = await loadReportPortalProjects(connection);
  } catch {
    // Keep the requested project available when discovery is unavailable.
  }

  const project = projects.includes(selection.project) ? selection.project : projects[0] ?? selection.project;
  let launches = [selection.launchName];
  try {
    const launchPage = await fetchAllPages<Launch>(connection, project, "launch", {
      "page.size": REPORT_PORTAL.API_PAGE_SIZE,
      "page.sort": "startTime,DESC",
    });
    launches = [...new Set(launchPage.content
      .filter(({ status }) => status !== REPORT_STATUS.IN_PROGRESS)
      .map(({ name }) => name)
      .filter(Boolean))];
  } catch {
    // Keep the requested launch available when discovery is unavailable.
  }

  const launchName = launches.includes(selection.launchName)
    ? selection.launchName
    : launches[0] ?? selection.launchName;

  let launchRuns: Launch[] = [];
  try {
    const launchPage = await fetchAllPages<Launch>(connection, project, "launch", {
      "filter.eq.name": launchName,
      "page.size": REPORT_PORTAL.API_PAGE_SIZE,
      "page.sort": "startTime,DESC",
    });
    launchRuns = launchPage.content.filter((launch) => (
      launch.name === launchName && launch.status !== REPORT_STATUS.IN_PROGRESS
    ));
  } catch {
    // Data loading will expose the integration error after selection resolution.
  }

  const launchId = launchRuns.some(({ id }) => id === selection.launchId)
    ? selection.launchId
    : launchRuns[0]?.id;

  if (!projects.includes(project)) projects.unshift(project);
  if (!launches.includes(launchName)) launches.unshift(launchName);

  return {
    selection: { ...selection, project, launchName, launchId },
    options: {
      projects,
      launches,
      launchRuns: launchRuns.map(({ id, number, status, startTime }) => ({ id, number, status, startTime })),
    },
  };
}

export async function loadReportSourceChildren(connection: ReportPortalConnection, project: string, requestedLaunchName?: string): Promise<{
  launchName: string | undefined;
  launches: string[];
  launchRuns: ReportSourceOptions["launchRuns"];
}> {
  const launchPage = await fetchAllPages<Launch>(connection, project, "launch", {
    "page.size": REPORT_PORTAL.API_PAGE_SIZE,
    "page.sort": "startTime,DESC",
  });
  const completedLaunches = launchPage.content.filter(({ status }) => status !== REPORT_PORTAL.IN_PROGRESS_STATUS);
  const launches = [...new Set(completedLaunches.map(({ name }) => name).filter(Boolean))];
  const launchName = requestedLaunchName && launches.includes(requestedLaunchName)
    ? requestedLaunchName
    : launches[0];

  if (!launchName) return { launchName: undefined, launches, launchRuns: [] };

  const runPage = await fetchAllPages<Launch>(connection, project, "launch", {
    "filter.eq.name": launchName,
    "page.size": REPORT_PORTAL.API_PAGE_SIZE,
    "page.sort": "startTime,DESC",
  });
  const launchRuns = runPage.content
    .filter((launch) => launch.name === launchName)
    .filter(({ status }) => status !== REPORT_STATUS.IN_PROGRESS)
    .map(({ id, number, status, startTime }) => ({ id, number, status, startTime }));

  return { launchName, launches, launchRuns };
}

async function loadLiveData(connection: ReportPortalConnection, selection: ReportSelection, fields: ReportFieldMapping[]): Promise<DashboardData> {
  const { project, launchName, launchId, historyDepth } = selection;
  const launchPage = await fetchAllPages<Launch>(connection, project, "launch", {
    "filter.eq.name": launchName,
    "page.size": REPORT_PORTAL.API_PAGE_SIZE,
    "page.sort": "startTime,DESC",
  });
  const launch = launchPage.content.find((candidate) => (
    candidate.name === launchName
    && candidate.status !== REPORT_STATUS.IN_PROGRESS
    && (launchId === undefined || candidate.id === launchId)
  ));
  if (!launch) throw new Error(`No completed launch named ${launchName} was found`);

  const baseParams = {
    launchId: launch.id,
    providerType: "launch",
    "page.size": REPORT_PORTAL.HISTORY_API_PAGE_SIZE,
    "filter.eq.hasStats": "true",
    ...buildReportPortalFilters(selection, fields),
  };
  const [suite, failed] = await Promise.all([
    fetchAllPages<ReportPortalItem>(connection, project, "item/v2", baseParams),
    fetchAllPages<ReportPortalItem>(connection, project, "item/v2", { ...baseParams, "filter.in.status": REPORT_STATUS.FAILED }),
  ]);
  const history = failed.content.length
    ? await fetchAllPages<HistoryEntry>(connection, project, "item/history", {
      "filter.eq.launchId": launch.id,
      "filter.in.status": REPORT_STATUS.FAILED,
      ...buildReportPortalFilters(selection, fields),
      historyDepth,
      type: "line",
      "page.size": REPORT_PORTAL.HISTORY_API_PAGE_SIZE,
    })
    : { content: [] };
  const failureHistory = mergeCurrentFailuresWithHistory(failed.content, history.content);

  const reportPortalBaseUrl = new URL(connection.apiUrl).origin;
  return {
    ...analyzeHistory(failureHistory, suite.content, reportPortalBaseUrl, project, launch.id, connection.testRailBaseUrl),
    meta: {
      project,
      launchName,
      launchNumber: launch.number,
      launchId: launch.id,
      launchStatus: launch.status,
      fields: selectedFields(selection, fields),
      historyDepth,
      source: "live",
      loadedAt: new Date().toISOString(),
    },
  };
}

export async function getDashboardData(connection: ReportPortalConnection, selection: ReportSelection, fields: ReportFieldMapping[]): Promise<DashboardData> {
  try {
    return await loadLiveData(connection, selection, fields);
  } catch (error) {
    return errorData(selection, fields, error instanceof Error ? error.message : "Unable to load live ReportPortal data");
  }
}
