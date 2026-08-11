import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "./config";
import type { CypressRunRequest } from "./cypress-run-request";
import { updateLocalCypressRun } from "./cypress-run-store";
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

const globalRunner = globalThis as typeof globalThis & { __failureIntelligenceRunner?: RunnerState };
const runner: RunnerState = globalRunner.__failureIntelligenceRunner ||= {
  queue: Promise.resolve(),
  executions: new Map(),
  children: new Map(),
};

function cypressEnvironment(profile: CypressProfileSecret, cypressConfig: CypressRunRequest["cypressConfig"]) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
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
      resolve({ code: 130, cancelled: true, timedOut: false });
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
    const timer = timeoutSeconds ? setTimeout(() => { timedOut = true; terminate(child); }, timeoutSeconds * 1000) : undefined;
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
      log.end(`\nExit code: ${code ?? 1}${timedOut ? " (timeout)" : execution.controller.signal.aborted ? " (cancelled)" : ""}\n`);
      resolve({ code: code ?? 1, cancelled: execution.controller.signal.aborted, timedOut });
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
  if (await exists(path.join(workspace, "yarn.lock"))) {
    command = "yarn";
    args = ["install", "--frozen-lockfile"];
  } else if (await exists(path.join(workspace, "pnpm-lock.yaml"))) {
    command = "pnpm";
    args = ["install", "--frozen-lockfile", "--store-dir", path.join(config.localStorage.dataDirectory, "runner", "cache", "pnpm-store")];
  } else if (await exists(path.join(workspace, "package-lock.json"))) {
    command = "npm";
    args = ["ci"];
  } else {
    throw new Error("The Cypress project needs yarn.lock, pnpm-lock.yaml, or package-lock.json");
  }
  const install = await runCommand(execution, command, args, workspace, setupLog);
  if (install.code !== 0) throw new Error("Unable to install Cypress project dependencies");
  return command;
}

function cypressCommand(packageManager: string, spec: string, browser: CypressRunRequest["browser"], executionIndex: number) {
  const requestedBrowser = browser === "chrome" ? "chromium" : browser;
  const outputRoot = `.local/failure-intelligence/${executionIndex}`;
  const args = ["cypress", "run", "--spec", spec, "--browser", requestedBrowser, "--config", `screenshotsFolder=${outputRoot}/screenshots,videosFolder=${outputRoot}/videos,downloadsFolder=${outputRoot}/downloads`];
  if (packageManager === "yarn") return { command: "yarn", args: ["exec", ...args] };
  if (packageManager === "pnpm") return { command: "pnpm", args: ["exec", ...args] };
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
  const roots = [".local/failure-intelligence", "allure-results", ".local/cypress-run-logs"];
  for (const root of roots) {
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
    run.status = "in_progress";
    run.startedAt = startedAt;
    run.localJobs = [];
  });

  let packageManager: string;
  try {
    packageManager = await prepareProject(execution, path.join(logsDirectory, "setup.log"));
    const activeEnvironment = execution.profileName.replaceAll(" ", "-");
    await writeFile(path.join(config.localRunner.workspaceDirectory, "environments.js"), `module.exports = ${JSON.stringify({
      activeEnvironment,
      environments: { [activeEnvironment]: execution.profile },
    }, null, 2)};\n`, { mode: 0o600 });
    for (const root of [".local/failure-intelligence", "allure-results", ".local/cypress-run-logs"]) {
      await rm(path.join(/*turbopackIgnore: true*/ config.localRunner.workspaceDirectory, root), { recursive: true, force: true });
    }
  } catch (error) {
    await rm(path.join(config.localRunner.workspaceDirectory, "environments.js"), { force: true }).catch(() => undefined);
    jobs.push({ id: 1, name: "Prepare Cypress project", status: "completed", conclusion: execution.controller.signal.aborted ? "cancelled" : "failure", startedAt, completedAt: new Date().toISOString(), steps: [] });
    const artifacts = await collectArtifacts(execution, runDirectory);
    await updateLocalCypressRun(execution.requestId, (run) => {
      run.status = "completed";
      run.conclusion = execution.controller.signal.aborted ? "cancelled" : "setup_failure";
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
      const conclusion = result.cancelled ? "cancelled" : result.timedOut ? "timed_out" : result.code === 0 ? "success" : "failure";
      jobs.push({
        id: index + 1,
        name: `${task.spec} · run ${task.repetition}`,
        status: "completed",
        conclusion,
        startedAt: jobStartedAt,
        completedAt: new Date().toISOString(),
        steps: [{ name: "Cypress CLI", number: 1, status: "completed", conclusion }],
      });
      jobs.sort((left, right) => left.id - right.id);
      await updateLocalCypressRun(execution.requestId, (run) => { run.localJobs = jobs; });
    }
  });
  await Promise.all(workers);
  await rm(path.join(config.localRunner.workspaceDirectory, "environments.js"), { force: true });
  const artifacts = await collectArtifacts(execution, runDirectory);
  const conclusion = execution.controller.signal.aborted ? "cancelled" : jobs.every((job) => job.conclusion === "success") && jobs.length === tasks.length ? "success" : "failure";
  await updateLocalCypressRun(execution.requestId, (run) => {
    run.status = "completed";
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
    else await updateLocalCypressRun(requestId, (run) => { run.status = "completed"; run.conclusion = "cancelled"; });
    runner.executions.delete(requestId);
    runner.children.delete(requestId);
  }).catch(async (error) => {
    console.error("Local Cypress execution failed", error);
    await rm(path.join(config.localRunner.workspaceDirectory, "environments.js"), { force: true }).catch(() => undefined);
    await updateLocalCypressRun(requestId, (run) => { run.status = "completed"; run.conclusion = "runner_failure"; }).catch(() => undefined);
    runner.executions.delete(requestId);
    runner.children.delete(requestId);
  });
}

export async function cancelLocalCypressRun(requestId: string) {
  const execution = runner.executions.get(requestId);
  if (!execution) return false;
  execution.controller.abort();
  for (const child of runner.children.get(requestId) || []) terminate(child);
  await updateLocalCypressRun(requestId, (run) => { run.conclusion = "cancelling"; });
  return true;
}

export async function recoverInterruptedLocalCypressRuns(runs: CypressRunRecord[]) {
  const interrupted = runs.filter((run) => run.status !== "completed" && !runner.executions.has(run.requestId));
  await Promise.all(interrupted.map((run) => updateLocalCypressRun(run.requestId, (stored) => {
    stored.status = "completed";
    stored.conclusion = "container_restarted";
  })));
  return interrupted.length > 0;
}
