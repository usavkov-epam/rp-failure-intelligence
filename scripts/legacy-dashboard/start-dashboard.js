const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 43138);
const reportDir = __dirname;
const repoRoot = path.resolve(reportDir, '../../..');
const dashboardPath = path.join(reportDir, 'index.html');
const runsDashboardPath = path.join(reportDir, 'runs.html');
const reportPath = path.join(reportDir, 'report.md');
const runsRoot = path.join(reportDir, 'runs');
const runnerToken = crypto.randomBytes(24).toString('hex');
const runs = new Map();
let activeRunId = null;

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function parsePositiveInteger(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

function validateSpec(spec) {
  if (typeof spec !== 'string' || !/^cypress\/e2e\/[A-Za-z0-9_./-]+\.cy\.[cm]?[jt]sx?$/.test(spec)) {
    throw new Error('Spec must be a Cypress file under cypress/e2e');
  }

  const absoluteSpec = path.resolve(repoRoot, spec);
  const e2eRoot = `${path.resolve(repoRoot, 'cypress/e2e')}${path.sep}`;
  if (!absoluteSpec.startsWith(e2eRoot) || !fs.existsSync(absoluteSpec) || !fs.statSync(absoluteSpec).isFile()) {
    throw new Error('Spec does not resolve to an existing Cypress file');
  }
  return spec;
}

function parseRunRequest(body) {
  const browser = body.browser || 'chrome';
  if (!['chrome', 'electron', 'firefox'].includes(browser)) {
    throw new Error('Browser must be chrome, electron, or firefox');
  }
  const requestedSpecs = Array.isArray(body.specs) ? body.specs : body.spec ? [body.spec] : [];
  if (requestedSpecs.length < 1 || requestedSpecs.length > 50) {
    throw new Error('specs must contain from 1 to 50 Cypress files');
  }
  return {
    specs: [...new Set(requestedSpecs.map(validateSpec))],
    runs: parsePositiveInteger(body.runs, 'runs', 50),
    threads: parsePositiveInteger(body.threads, 'threads', 8),
    browser,
  };
}

function publicRun(run) {
  return {
    id: run.id,
    specs: run.specs,
    specCount: run.specs.length,
    activeSpec: run.activeSpec,
    completedSpecs: run.completedSpecs,
    runs: run.runs,
    totalRuns: run.specs.length * run.runs,
    threads: run.threads,
    browser: run.browser,
    status: run.status,
    exitCode: run.exitCode,
    completedRuns: run.completedRuns,
    outputDir: run.outputDir,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

function persistRun(run) {
  fs.mkdirSync(path.resolve(repoRoot, run.outputDir), { recursive: true });
  fs.writeFileSync(
    path.resolve(repoRoot, run.outputDir, 'job.json'),
    `${JSON.stringify(publicRun(run), null, 2)}\n`,
    'utf8',
  );
}

function updateRunProgress(run, line) {
  const specMatch = /Spec (\d+)\/(\d+): ([^\r\n]+)/.exec(line);
  if (specMatch) {
    run.completedSpecs = Number(specMatch[1]) - 1;
    run.activeSpec = specMatch[3];
    run.currentSpecCompletedRuns = 0;
  }
  const completedMatch = /\[Run (\d+)\//.exec(line);
  if (completedMatch) {
    run.currentSpecCompletedRuns = Math.max(run.currentSpecCompletedRuns || 0, Number(completedMatch[1]));
  }
  run.completedRuns = (run.completedSpecs * run.runs) + (run.currentSpecCompletedRuns || 0);
}

function loadPersistedRuns() {
  if (!fs.existsSync(runsRoot)) return;
  fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      const metadataPath = path.join(runsRoot, entry.name, 'job.json');
      if (!fs.existsSync(metadataPath)) return;
      try {
        const run = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (run.status === 'running') {
          run.status = 'interrupted';
          run.exitCode = 1;
          run.finishedAt = new Date().toISOString();
        }
        runs.set(run.id, run);
      } catch (error) {
        console.warn(`Unable to read ${metadataPath}: ${error.message}`);
      }
    });
}

function startRun(options) {
  if (activeRunId) throw new Error('Another Cypress repeat run is already active');

  const firstSpecName = path.basename(options.specs[0]).replace(/\.cy\.[^.]+$/, '');
  const id = `${Date.now()}-${firstSpecName}${options.specs.length > 1 ? `-plus-${options.specs.length - 1}` : ''}`;
  const outputDir = path.posix.join(
    '.local/reportportal/thunderjet-runNightlyEurekaReleaseTests-non-ecs-9776/runs',
    id,
  );
  const run = {
    ...options,
    id,
    outputDir,
    status: 'running',
    exitCode: null,
    activeSpec: options.specs[0],
    completedSpecs: 0,
    completedRuns: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  runs.set(id, run);
  activeRunId = id;
  persistRun(run);

  const child = spawn('yarn', [
    'cypress:repeat',
    '--spec', options.specs.join(','),
    '--runs', String(options.runs),
    '--threads', String(options.threads),
    '--browser', options.browser,
    '--out-dir', outputDir,
  ], { cwd: repoRoot, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });

  const consumeOutput = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const lines = `${run.outputBuffer || ''}${text}`.split(/\r?\n/);
    run.outputBuffer = lines.pop();
    lines.forEach((line) => updateRunProgress(run, line));
    persistRun(run);
  };
  child.stdout.on('data', consumeOutput);
  child.stderr.on('data', consumeOutput);
  child.on('error', (error) => {
    run.status = 'failed';
    run.exitCode = 1;
    run.finishedAt = new Date().toISOString();
    activeRunId = null;
    persistRun(run);
    console.error(error.message);
  });
  child.on('close', (exitCode) => {
    run.status = 'completed';
    run.exitCode = exitCode ?? 1;
    run.completedSpecs = options.specs.length;
    run.completedRuns = options.specs.length * options.runs;
    run.finishedAt = new Date().toISOString();
    activeRunId = null;
    persistRun(run);
  });
  return publicRun(run);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) reject(new Error('Request body is too large'));
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(new Error('Request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function hasValidToken(request) {
  return request.headers['x-runner-token'] === runnerToken;
}

loadPersistedRuns();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const dashboard = fs.readFileSync(dashboardPath, 'utf8').replace('__RUNNER_TOKEN__', runnerToken);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(dashboard);
    return;
  }
  if (request.method === 'GET' && (url.pathname === '/runs' || url.pathname === '/runs.html')) {
    const dashboard = fs.readFileSync(runsDashboardPath, 'utf8').replace('__RUNNER_TOKEN__', runnerToken);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(dashboard);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/report.md') {
    response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    response.end(fs.readFileSync(reportPath, 'utf8'));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ready: true, activeRunId, activeRun: activeRunId ? publicRun(runs.get(activeRunId)) : null });
    return;
  }
  if (url.pathname.startsWith('/api/') && !hasValidToken(request)) {
    sendJson(response, 403, { error: 'Invalid runner token' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/runs') {
    const jobs = [...runs.values()]
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .map(publicRun);
    sendJson(response, 200, { runs: jobs, activeRunId });
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
    const run = runs.get(decodeURIComponent(url.pathname.slice('/api/runs/'.length)));
    sendJson(response, run ? 200 : 404, run ? publicRun(run) : { error: 'Run not found' });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/run') {
    try {
      const options = parseRunRequest(await readRequestBody(request));
      sendJson(response, 202, startRun(options));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  sendJson(response, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Failure dashboard: http://${host}:${port}`);
    console.log('Cypress repeat runs require confirmation in the dashboard. Press Ctrl+C to stop.');
  });
}

module.exports = { parseRunRequest, publicRun, updateRunProgress, validateSpec };