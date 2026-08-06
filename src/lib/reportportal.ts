import "server-only";

import { analyzeHistory } from "./analytics";
import { config } from "./config";
import type { DashboardData, HistoryEntry, ReportPortalItem, ReportSelection, ReportSourceOptions } from "./types";

interface Page<T> {
  content: T[];
  page?: { totalElements: number; totalPages: number };
}

interface Launch {
  id: number;
  name: string;
  number: number;
  status: string;
  startTime: number;
}

interface Project {
  projectName: string;
}

function errorData(selection: ReportSelection, error: string): DashboardData {
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
      team: selection.team,
      historyDepth: selection.historyDepth,
      source: "error",
      loadedAt: new Date().toISOString(),
      error,
    },
  };
}

async function fetchPage<T>(project: string, endpoint: string, params: Record<string, string | number>): Promise<Page<T>> {
  return fetchReportPortalPage<T>(`${project}/${endpoint}`, params);
}

async function fetchReportPortalPage<T>(endpoint: string, params: Record<string, string | number>): Promise<Page<T>> {
  const { apiUrl, apiKey } = config.reportPortal;
  if (!apiUrl || !apiKey) throw new Error("ReportPortal credentials are not configured");

  const url = new URL(`${apiUrl}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: { Authorization: `bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ReportPortal ${endpoint} request failed with ${response.status}`);
  return response.json();
}

export async function resolveReportSelection(selection: ReportSelection): Promise<{
  selection: ReportSelection;
  options: ReportSourceOptions;
}> {
  let projects = [selection.project];
  try {
    const projectPage = await fetchReportPortalPage<Project>("project/list", {
      "page.size": 200,
      "page.sort": "projectName,ASC",
    });
    projects = [...new Set(projectPage.content.map(({ projectName }) => projectName).filter(Boolean))];
  } catch {
    // Keep the requested project available when discovery is unavailable.
  }

  const project = projects.includes(selection.project) ? selection.project : projects[0] ?? selection.project;
  let launches = project === selection.project ? [selection.launchName] : [];
  try {
    const launchPage = await fetchPage<Launch>(project, "launch", {
      "page.size": 200,
      "page.sort": "startTime,DESC",
    });
    launches = [...new Set(launchPage.content
      .filter(({ status }) => status !== "IN_PROGRESS")
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
    const launchPage = await fetchPage<Launch>(project, "launch", {
      "filter.eq.name": launchName,
      "page.size": 200,
      "page.sort": "startTime,DESC",
    });
    launchRuns = launchPage.content.filter((launch) => (
      launch.name === launchName && launch.status !== "IN_PROGRESS"
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

async function loadLiveData(selection: ReportSelection): Promise<DashboardData> {
  const { apiUrl } = config.reportPortal;
  const { project, launchName, launchId, team, historyDepth } = selection;
  const launchPage = await fetchPage<Launch>(project, "launch", {
    "filter.eq.name": launchName,
    "page.size": 200,
    "page.sort": "startTime,DESC",
  });
  const launch = launchPage.content.find((candidate) => (
    candidate.name === launchName
    && candidate.status !== "IN_PROGRESS"
    && (launchId === undefined || candidate.id === launchId)
  ));
  if (!launch) throw new Error(`No completed launch named ${launchName} was found`);

  const baseParams = {
    launchId: launch.id,
    providerType: "launch",
    "page.size": 1000,
    "filter.cnt.name": team,
    "filter.eq.hasStats": "true",
  };
  const [suite, failed] = await Promise.all([
    fetchPage<ReportPortalItem>(project, "item/v2", baseParams),
    fetchPage<ReportPortalItem>(project, "item/v2", { ...baseParams, "filter.in.status": "FAILED" }),
  ]);
  const history = failed.content.length
    ? await fetchPage<HistoryEntry>(project, "item/history", {
      "filter.eq.launchId": launch.id,
      "filter.in.status": "FAILED",
      "filter.cnt.name": team,
      historyDepth,
      type: "line",
      "page.size": 1000,
    })
    : { content: [] };
  if (history.content.length !== failed.content.length) {
    throw new Error("ReportPortal history did not cover every current failed test");
  }

  const reportPortalBaseUrl = new URL(apiUrl!).origin;
  return {
    ...analyzeHistory(history.content, suite.content, reportPortalBaseUrl, project, launch.id, config.testRailBaseUrl),
    meta: {
      project,
      launchName,
      launchNumber: launch.number,
      launchId: launch.id,
      launchStatus: launch.status,
      team,
      historyDepth,
      source: "live",
      loadedAt: new Date().toISOString(),
    },
  };
}

export async function getDashboardData(selection: ReportSelection): Promise<DashboardData> {
  try {
    return await loadLiveData(selection);
  } catch (error) {
    return errorData(selection, error instanceof Error ? error.message : "Unable to load live ReportPortal data");
  }
}