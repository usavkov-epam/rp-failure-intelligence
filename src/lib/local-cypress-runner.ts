import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "./config";
import type { CypressRunRequest } from "./cypress-run-request";
import { updateLocalCypressRun } from "./cypress-run-store";
import { CYPRESS_BROWSER, RUN_CONCLUSION, RUN_STATUS, TIME } from "./domain-constants";
import type { CypressRunDetails, CypressRunRecord } from "./types";
import type { CypressProfileSecret } from "./user-settings-schema";

interface LocalExecution {
  requestId: string;
  request: CypressRunRequest;
  profileName: string;
  profile: CypressProfileSecret;
  controller: AbortController;
}

interface RunnerState {
  queue: Promise<void>;
  executions: Map<string, LocalExecution>;
  children: Map<string, Set<ChildProcess>>;
}

const PACKAGE_MANAGER = {
  YARN: "yarn",
  PNPM: "pnpm",
  NPM: "npm",
} as const;

const RUNNER_FILE = {
  ENVIRONMENTS: "environments.js",
  YARN_LOCK: "yarn.lock",
  PNPM_LOCK: "pnpm-lock.yaml",
  NPM_LOCK: "package-lock.json",
} as const;

const ARTIFACT_ROOTS = [".local/failure-intelligence", "allure-results", ".local/cypress-run-logs"] as const;
const PROCESS_EXIT = { FAILURE: 1, CANCELLED: 130, SUCCESS: 0 } as const;
const FIRST_JOB_ID = 1;
const FIRST_STEP_NUMBER = 1;

const globalRunner = globalThis as typeof globalThis & { __failureIntelligenceRunner?: RunnerState };
const runner: RunnerState = globalRunner.__failureIntelligenceRunner ||= {
  queue: Promise.resolve(),
  executions: new Map(),
  children: new Map(),
};

function cypressEnvironment(profile: CypressProfileSecret, cypressConfig: CypressRunRequest["cypressConfig"]) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: String(1),
    NODE_ENV: "development",
    NO_COLOR: "1",
    CYPRESS_CACHE_FOLDER: path.join(config.localStorage.dataDirectory, "runner", "cache", "Cypress"),
    npm_config_cache: path.join(config.localStorage.dataDirectory, "runner", "cache", "npm"),
    YARN_CACHE_FOLDER: path.join(config.localStorage.dataDirectory, "runner", "cache", "yarn"),
    CYPRESS_BASE_URL: profile.baseUrl,
  };
  for (const [key, value] of Object.entries(profile.env)) environment[`CYPRESS_${key}`] = String(value);
  for (const [key, value] of Object.entries(cypressConfig)) {
    const variable = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
    environment[`CYPRESS_${variable}`] = String(value);
  }
  return environment;
}

function terminate(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}

async function runCommand(execution: LocalExecution, command: string, args: string[], cwd: string, logPath: string, timeoutSeconds?: number) {
  await mkdir(path.dirname(logPath), { recursive: true });
  const log = createWriteStream(logPath, { flags: "a", mode: 0o600 });
  log.write(`$ ${command} ${args.join(" ")}\n`);
  return new Promise<{ code: number; cancelled: boolean; timedOut: boolean }>((resolve, reject) => {
    if (execution.controller.signal.aborted) {
      log.end("Cancelled before start.\n");
      resolve({ code: PROCESS_EXIT.CANCELLED, cancelled: true, timedOut: false });
      return;
    }
    const child = spawn(command, args, {
      cwd,
      env: cypressEnvironment(execution.profile, execution.request.cypressConfig),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const children = runner.children.get(execution.requestId) || new Set<ChildProcess>();
    children.add(child);
    runner.children.set(execution.requestId, children);
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    let timedOut = false;
    const timer = timeoutSeconds ? setTimeout(() => { timedOut = true; terminate(child); }, timeoutSeconds * TIME.MILLISECONDS_PER_SECOND) : undefined;
    const abort = () => terminate(child);
    execution.controller.signal.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      if (timer) clearTimeout(timer);
      execution.controller.signal.removeEventListener("abort", abort);
      children.delete(child);
      log.end();
      reject(error);
    });
    child.once("close", (code) => {
      if (timer) clearTimeout(timer);
      execution.controller.signal.removeEventListener("abort", abort);
      children.delete(child);
      log.end(`\nExit code: ${code ?? PROCESS_EXIT.FAILURE}${timedOut ? " (timeout)" : execution.controller.signal.aborted ? " (cancelled)" : ""}\n`);
      resolve({ code: code ?? PROCESS_EXIT.FAILURE, cancelled: execution.controller.signal.aborted, timedOut });
    });
  });
}

async function exists(target: string) {
  try { await access(target); return true; } catch { return false; }
}

async function prepareProject(execution: LocalExecution, setupLog: string) {
  const workspace = config.localRunner.workspaceDirectory;
  await mkdir(path.dirname(workspace), { recursive: true });
  if (!await exists(path.join(workspace, ".git"))) {
    await rm(workspace, { recursive: true, force: true });
    const clone = await runCommand(execution, "git", ["clone", "--depth", "1", "--branch", config.localRunner.ref, config.localRunner.repositoryUrl, workspace], path.dirname(workspace), setupLog);
    if (clone.code !== 0) throw new Error("Unable to clone the Cypress project");
  } else {
    const fetch = await runCommand(execution, "git", ["fetch", "origin", config.localRunner.ref, "--depth", "1"], workspace, setupLog);
    if (fetch.code !== 0) throw new Error("Unable to update the Cypress project");
    const reset = await runCommand(execution, "git", ["reset", "--hard", "FETCH_HEAD"], workspace, setupLog);
    if (reset.code !== 0) throw new Error("Unable to select the configured Cypress ref");
  }

  let command: string;
  let args: string[];
  if (await exists(path.join(/*turbopackIgnore: true*/ workspace, RUNNER_FILE.YARN_LOCK))) {
    command = PACKAGE_MANAGER.YARN;
    args = ["install", "--frozen-lockfile"];
  } else if (await exists(path.join(/*turbopackIgnore: true*/ workspace, RUNNER_FILE.PNPM_LOCK))) {
    command = PACKAGE_MANAGER.PNPM;
    args = ["install", "--frozen-lockfile", "--store-dir", path.join(config.localStorage.dataDirectory, "runner", "cache", "pnpm-store")];
  } else if (await exists(path.join(/*turbopackIgnore: true*/ workspace, RUNNER_FILE.NPM_LOCK))) {
    command = PACKAGE_MANAGER.NPM;
    args = ["ci"];
  } else {
    throw new Error("The Cypress project needs yarn.lock, pnpm-lock.yaml, or package-lock.json");
  }
  const install = await runCommand(execution, command, args, workspace, setupLog);
  if (install.code !== 0) throw new Error("Unable to install Cypress project dependencies");
  return command;
}

function cypressCommand(packageManager: string, spec: string, browser: CypressRunRequest["browser"], executionIndex: number) {
  const requestedBrowser = browser === CYPRESS_BROWSER.CHROME ? "chromium" : browser;
  const outputRoot = `.local/failure-intelligence/${executionIndex}`;
  const args = ["cypress", "run", "--spec", spec, "--browser", requestedBrowser, "--config", `screenshotsFolder=${outputRoot}/screenshots,videosFolder=${outputRoot}/videos,downloadsFolder=${outputRoot}/downloads`];
  if (packageManager === PACKAGE_MANAGER.YARN) return { command: PACKAGE_MANAGER.YARN, args: ["exec", ...args] };
  if (packageManager === PACKAGE_MANAGER.PNPM) return { command: PACKAGE_MANAGER.PNPM, args: ["exec", ...args] };
  return { command: "npx", args: ["--no-install", ...args] };
}

async function listFiles(directory: string): Promise<string[]> {
  if (!await exists(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

async function collectArtifacts(execution: LocalExecution, runDirectory: string) {
  const workspace = config.localRunner.workspaceDirectory;
  const artifactDirectory = path.join(runDirectory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  for (const root of ARTIFACT_ROOTS) {
    const source = path.join(/*turbopackIgnore: true*/ workspace, root);
    if (await exists(source)) await cp(source, path.join(artifactDirectory, root), { recursive: true, force: true });
  }
  const files = [
    ...(await listFiles(path.join(runDirectory, "logs"))),
    ...(await listFiles(artifactDirectory)),
  ];
  return Promise.all(files.map(async (file, index) => {
    const metadata = await stat(file);
    return {
      id: index + 1,
      name: path.relative(runDirectory, file),
      sizeInBytes: metadata.size,
      createdAt: metadata.mtime.toISOString(),
      downloadUrl: `/api/runs/${execution.requestId}/artifacts/${index + 1}`,
      path: file,
    };
  }));
}

async function execute(execution: LocalExecution) {
  const startedAt = new Date().toISOString();
  const runDirectory = path.join(config.localRunner.runsDirectory, execution.requestId);
  const logsDirectory = path.join(runDirectory, "logs");
  const jobs: CypressRunDetails["jobs"] = [];
  await mkdir(logsDirectory, { recursive: true });
  await updateLocalCypressRun(execution.requestId, (run) => {
    run.status = RUN_STATUS.IN_PROGRESS;
    run.startedAt = startedAt;
    run.localJobs = [];
  });

  let packageManager: string;
  try {
    packageManager = await prepareProject(execution, path.join(logsDirectory, "setup.log"));
    const activeEnvironment = execution.profileName.replaceAll(" ", "-");
    await writeFile(path.join(/*turbopackIgnore: true*/ config.localRunner.workspaceDirectory, RUNNER_FILE.ENVIRONMENTS), `module.exports = ${JSON.stringify({
      activeEnvironment,
      environments: { [activeEnvironment]: execution.profile },
    }, null, 2)};\n`, { mode: 0o600 });
    for (const root of ARTIFACT_ROOTS) {
      await rm(path.join(/*turbopackIgnore: true*/ config.localRunner.workspaceDirectory, root), { recursive: true, force: true });
    }
  } catch (error) {
    await rm(path.join(/*turbopackIgnore: true*/ config.localRunner.workspaceDirectory, RUNNER_FILE.ENVIRONMENTS), { force: true }).catch(() => undefined);
    jobs.push({ id: FIRST_JOB_ID, name: "Prepare Cypress project", status: RUN_STATUS.COMPLETED, conclusion: execution.controller.signal.aborted ? RUN_CONCLUSION.CANCELLED : RUN_CONCLUSION.FAILURE, startedAt, completedAt: new Date().toISOString(), steps: [] });
    const artifacts = await collectArtifacts(execution, runDirectory);
    await updateLocalCypressRun(execution.requestId, (run) => {
      run.status = RUN_STATUS.COMPLETED;
      run.conclusion = execution.controller.signal.aborted ? RUN_CONCLUSION.CANCELLED : RUN_CONCLUSION.SETUP_FAILURE;
      run.localJobs = jobs;
      run.localArtifacts = artifacts;
      run.artifactNames = artifacts.map(({ name }) => name);
      run.artifactCount = artifacts.length;
    });
    console.error("Local Cypress setup failed", error);
    return;
  }

  const tasks = execution.request.specs.flatMap((spec) => Array.from({ length: execution.request.runs }, (_, index) => ({ spec, repetition: index + 1 })));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(execution.request.threads, tasks.length) }, async () => {
    while (!execution.controller.signal.aborted) {
      const index = cursor++;
      const task = tasks[index];
      if (!task) return;
      const jobStartedAt = new Date().toISOString();
      const cli = cypressCommand(packageManager, task.spec, execution.request.browser, index + 1);
      const result = await runCommand(execution, cli.command, cli.args, config.localRunner.workspaceDirectory, path.join(logsDirectory, `${index + 1}.log`), execution.request.timeoutSeconds);
      const conclusion = result.cancelled ? RUN_CONCLUSION.CANCELLED : result.timedOut ? RUN_CONCLUSION.TIMED_OUT : result.code === PROCESS_EXIT.SUCCESS ? RUN_CONCLUSION.SUCCESS : RUN_CONCLUSION.FAILURE;
      jobs.push({
        id: index + 1,
        name: `${task.spec} · run ${task.repetition}`,
        status: RUN_STATUS.COMPLETED,
        conclusion,
        startedAt: jobStartedAt,
        completedAt: new Date().toISOString(),
        steps: [{ name: "Cypress CLI", number: FIRST_STEP_NUMBER, status: RUN_STATUS.COMPLETED, conclusion }],
      });
      jobs.sort((left, right) => left.id - right.id);
      await updateLocalCypressRun(execution.requestId, (run) => { run.localJobs = jobs; });
    }
  });
  await Promise.all(workers);
  await rm(path.join(/*turbopackIgnore: true*/ config.localRunner.workspaceDirectory, RUNNER_FILE.ENVIRONMENTS), { force: true });
  const artifacts = await collectArtifacts(execution, runDirectory);
  const conclusion = execution.controller.signal.aborted ? RUN_CONCLUSION.CANCELLED : jobs.every((job) => job.conclusion === RUN_CONCLUSION.SUCCESS) && jobs.length === tasks.length ? RUN_CONCLUSION.SUCCESS : RUN_CONCLUSION.FAILURE;
  await updateLocalCypressRun(execution.requestId, (run) => {
    run.status = RUN_STATUS.COMPLETED;
    run.conclusion = conclusion;
    run.localJobs = jobs;
    run.localArtifacts = artifacts;
    run.artifactNames = artifacts.map(({ name }) => name);
    run.artifactCount = artifacts.length;
  });
}

export function enqueueLocalCypressRun(requestId: string, request: CypressRunRequest, profileName: string, profile: CypressProfileSecret) {
  if (!config.isLocal) throw new Error("Local Cypress execution is not enabled");
  const execution: LocalExecution = { requestId, request, profileName, profile, controller: new AbortController() };
  runner.executions.set(requestId, execution);
  runner.queue = runner.queue.catch(() => undefined).then(async () => {
    if (!execution.controller.signal.aborted) await execute(execution);
    else await updateLocalCypressRun(requestId, (run) => { run.status = RUN_STATUS.COMPLETED; run.conclusion = RUN_CONCLUSION.CANCELLED; });
    runner.executions.delete(requestId);
    runner.children.delete(requestId);
  }).catch(async (error) => {
    console.error("Local Cypress execution failed", error);
    await rm(path.join(/*turbopackIgnore: true*/ config.localRunner.workspaceDirectory, RUNNER_FILE.ENVIRONMENTS), { force: true }).catch(() => undefined);
    await updateLocalCypressRun(requestId, (run) => { run.status = RUN_STATUS.COMPLETED; run.conclusion = RUN_CONCLUSION.RUNNER_FAILURE; }).catch(() => undefined);
    runner.executions.delete(requestId);
    runner.children.delete(requestId);
  });
}

export async function cancelLocalCypressRun(requestId: string) {
  const execution = runner.executions.get(requestId);
  if (!execution) return false;
  execution.controller.abort();
  for (const child of runner.children.get(requestId) || []) terminate(child);
  await updateLocalCypressRun(requestId, (run) => { run.conclusion = RUN_CONCLUSION.CANCELLING; });
  return true;
}

export async function recoverInterruptedLocalCypressRuns(runs: CypressRunRecord[]) {
  const interrupted = runs.filter((run) => run.status !== RUN_STATUS.COMPLETED && !runner.executions.has(run.requestId));
  await Promise.all(interrupted.map((run) => updateLocalCypressRun(run.requestId, (stored) => {
    stored.status = RUN_STATUS.COMPLETED;
    stored.conclusion = RUN_CONCLUSION.CONTAINER_RESTARTED;
  })));
  return interrupted.length > 0;
}
