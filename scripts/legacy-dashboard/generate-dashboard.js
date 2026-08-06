const fs = require('fs');
const path = require('path');

const [historyPath, outputPath, ...suitePagePaths] = process.argv.slice(2);

if (!historyPath || !outputPath || suitePagePaths.length === 0) {
  throw new Error('Usage: node generate-reportportal-dashboard.js <history-response> <output.html> <suite-page>...');
}

function parseMcpResponse(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const start = source.indexOf('{');
  const wrappedEnd = source.lastIndexOf('}: Time.UnmarshalJSON');
  const end = wrappedEnd < 0 ? source.length : wrappedEnd + 1;

  return JSON.parse(source.slice(start, end));
}

function getDefect(item) {
  const defect = Object.keys(item.statistics?.defects || {})[0] || 'unclassified';

  return defect === 'to_investigate' ? 'To investigate' : defect === 'automation_bug' ? 'Automation bug' : defect;
}

function getRisk(failed, executions) {
  if (failed === executions) return 'Persistent';
  if (failed >= 8) return 'High risk';
  if (failed === 1) return 'Isolated';
  return 'Intermittent';
}

const history = parseMcpResponse(historyPath);
const suiteItems = suitePagePaths.flatMap((filePath) => parseMcpResponse(filePath).content);
const suiteStatuses = suiteItems.reduce((counts, item) => {
  counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
}, {});

const rows = history.content.map(({ resources }) => {
  const current = resources[0];
  const statuses = resources.map((resource) => resource.status);
  const passed = statuses.filter((status) => status === 'PASSED').length;
  const failed = statuses.filter((status) => status === 'FAILED').length;
  const other = statuses.length - passed - failed;
  const firstNonFailure = statuses.findIndex((status) => status !== 'FAILED');
  const currentStreak = firstNonFailure < 0 ? statuses.length : firstNonFailure;
  const transitions = statuses.slice(1).reduce(
    (count, status, index) => count + (status === statuses[index] ? 0 : 1),
    0,
  );
  const caseMatch = current.name.match(/^C(\d+)/);
  const module = current.pathNames?.itemPaths?.[0]?.name || 'Other';
  const specMatch = current.codeRef?.match(/^(.*?\.cy\.[cm]?[jt]sx?)(?:\/|$)/);

  if (!specMatch) {
    throw new Error(`Unable to extract a Cypress spec from codeRef: ${current.codeRef}`);
  }

  return {
    id: current.id,
    parentId: current.parent,
    name: current.name,
    caseId: caseMatch ? `C${caseMatch[1]}` : null,
    caseNumber: caseMatch?.[1] || null,
    specPath: specMatch[1],
    module,
    defect: getDefect(current),
    duration: Math.max(0, Math.round((current.endTime - current.startTime) / 1000)),
    passed,
    failed,
    other,
    executions: resources.length,
    failureRate: Math.round((failed / resources.length) * 100),
    currentStreak,
    transitions,
    regressed: statuses[1] === 'PASSED',
    risk: getRisk(failed, resources.length),
    statuses: [...statuses].reverse(),
    launchNumbers: [...resources].reverse().map((resource) => resource.pathNames.launchPathName.number),
    reportPortalUrl: `https://report-portal.ci.folio.org/ui/#cypress-nightly/launches/all/9776/${current.parent}/${current.id}/log`,
    testRailUrl: caseMatch ? `https://foliotest.testrail.io/index.php?/cases/view/${caseMatch[1]}` : null,
  };
});

const launchObservations = {};
history.content.forEach(({ resources }) => {
  resources.forEach((resource) => {
    const launchNumber = resource.pathNames.launchPathName.number;
    const observation = launchObservations[launchNumber] || { launchNumber, passed: 0, failed: 0, other: 0 };
    const status = resource.status.toLowerCase();
    observation[status in observation ? status : 'other'] += 1;
    launchObservations[launchNumber] = observation;
  });
});

const trend = Object.values(launchObservations)
  .filter(({ passed, failed, other }) => passed + failed + other >= 20)
  .sort((left, right) => left.launchNumber - right.launchNumber);

const launch = rows[0];
const metrics = {
  suiteTotal: suiteItems.length,
  suitePassed: suiteStatuses.PASSED || 0,
  suiteFailed: suiteStatuses.FAILED || 0,
  suiteOther: suiteItems.length - (suiteStatuses.PASSED || 0) - (suiteStatuses.FAILED || 0),
  suiteFailureRate: ((suiteStatuses.FAILED || 0) / suiteItems.length) * 100,
  cohortExecutions: rows.reduce((sum, row) => sum + row.executions, 0),
  cohortFailures: rows.reduce((sum, row) => sum + row.failed, 0),
  persistent: rows.filter((row) => row.risk === 'Persistent').length,
  highRisk: rows.filter((row) => row.risk === 'High risk').length,
  intermittent: rows.filter((row) => row.risk === 'Intermittent').length,
  isolated: rows.filter((row) => row.risk === 'Isolated').length,
  regressions: rows.filter((row) => row.regressed).length,
};

const dashboardData = JSON.stringify({ rows, trend, metrics }).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thunderjet failure analytics · Launch 38</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18201e;
      --muted: #63706b;
      --paper: #f4f1e9;
      --surface: #fffdf8;
      --line: #d8d7cf;
      --red: #b83b35;
      --red-soft: #f3d8d2;
      --amber: #b16a12;
      --amber-soft: #f4e2be;
      --green: #28745a;
      --green-soft: #d5e8dd;
      --blue: #315f7d;
      --shadow: 0 12px 32px rgba(44, 48, 42, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(rgba(24, 32, 30, 0.035) 1px, transparent 1px),
        var(--paper);
      background-size: 100% 28px;
      font-family: "Avenir Next", "Trebuchet MS", sans-serif;
      letter-spacing: 0;
    }
    a { color: var(--blue); text-underline-offset: 3px; }
    button, input, select { font: inherit; letter-spacing: 0; }
    .shell { width: min(1480px, calc(100% - 32px)); margin: 0 auto; }
    header {
      padding: 34px 0 26px;
      border-bottom: 1px solid rgba(24, 32, 30, 0.2);
      background: rgba(244, 241, 233, 0.92);
    }
    .eyebrow { margin: 0 0 8px; color: var(--red); font-size: 12px; font-weight: 800; text-transform: uppercase; }
    h1 { margin: 0; max-width: 1000px; overflow-wrap: break-word; font-family: Georgia, serif; font-size: clamp(30px, 4vw, 56px); font-weight: 500; line-height: 1.05; }
    .launch-meta { display: flex; flex-wrap: wrap; gap: 10px 20px; margin-top: 16px; color: var(--muted); font-size: 14px; }
    main { padding: 24px 0 56px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .kpi { min-height: 126px; padding: 18px; border: 1px solid var(--line); background: var(--surface); box-shadow: var(--shadow); }
    .kpi strong { display: block; margin: 8px 0 4px; font-family: Georgia, serif; font-size: 34px; font-weight: 500; }
    .kpi span, .kpi small { color: var(--muted); font-size: 12px; }
    .section-title { margin: 34px 0 12px; font-family: Georgia, serif; font-size: 24px; font-weight: 500; }
    .analytics-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px; }
    .panel { min-width: 0; padding: 18px; border: 1px solid var(--line); background: var(--surface); }
    .panel h2 { margin: 0 0 4px; font-size: 16px; }
    .panel-note { margin: 0 0 18px; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .trend { display: flex; align-items: end; gap: 8px; min-height: 185px; padding-top: 12px; overflow-x: auto; }
    .trend-column { display: grid; grid-template-rows: 140px 18px; gap: 6px; flex: 1 0 34px; min-width: 34px; text-align: center; }
    .trend-bar { display: flex; flex-direction: column-reverse; align-self: end; height: 140px; border: 1px solid var(--line); background: #ebe8df; }
    .trend-failed { background: var(--red); }
    .trend-passed { background: var(--green); }
    .trend-label { color: var(--muted); font-size: 11px; }
    .bar-list { display: grid; gap: 13px; }
    .bar-row { display: grid; grid-template-columns: minmax(86px, 1fr) 2fr 28px; align-items: center; gap: 8px; font-size: 12px; }
    .bar-track { height: 9px; background: #e7e3da; }
    .bar-fill { height: 100%; background: var(--blue); }
    .bar-fill.red { background: var(--red); }
    .bar-fill.amber { background: var(--amber); }
    .bar-fill.green { background: var(--green); }
    .scope { margin-top: 12px; padding: 16px 18px; border-left: 4px solid var(--amber); background: #fff9ec; color: #51483a; font-size: 13px; line-height: 1.55; }
    .controls { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)); gap: 8px; margin: 12px 0; }
    .controls input, .controls select { width: 100%; min-height: 42px; padding: 8px 10px; border: 1px solid #bfc3bc; border-radius: 3px; background: var(--surface); color: var(--ink); }
    .table-wrap { overflow: auto; border: 1px solid var(--line); background: var(--surface); }
    table { width: 100%; min-width: 1190px; border-collapse: collapse; }
    th { position: sticky; top: 0; z-index: 1; padding: 11px 12px; background: #e9e7df; color: #4d5854; font-size: 11px; text-align: left; text-transform: uppercase; }
    th:first-child, td:first-child { width: 42px; text-align: center; }
    .sort-button { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; color: inherit; background: transparent; font-size: inherit; font-weight: 750; text-transform: inherit; cursor: pointer; }
    .sort-indicator { min-width: 10px; color: var(--red); }
    td { padding: 13px 12px; border-top: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
    tbody tr:hover { background: #faf7ef; }
    .test-name { max-width: 440px; font-weight: 650; line-height: 1.35; }
    .test-title { margin-bottom: 7px; }
    .spec-row { display: flex; align-items: center; gap: 6px; max-width: 440px; }
    .spec-link { min-width: 0; padding: 0; border: 0; color: var(--blue); background: transparent; font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; line-height: 1.35; text-align: left; text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; cursor: pointer; }
    .copy-spec { flex: 0 0 auto; width: 28px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 3px; color: var(--blue); background: var(--surface); font-size: 14px; cursor: pointer; }
    .copy-spec:hover, .spec-link:hover { color: var(--red); }
    .badge { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 750; white-space: nowrap; }
    .badge-persistent { color: #7e211e; background: var(--red-soft); }
    .badge-high-risk { color: #78480a; background: var(--amber-soft); }
    .badge-intermittent { color: #1f526a; background: #dbe9ef; }
    .badge-isolated { color: #1f6049; background: var(--green-soft); }
    .history { display: flex; gap: 3px; }
    .history-dot { width: 10px; height: 18px; border-radius: 2px; background: #bbb; }
    .history-dot.failed { background: var(--red); }
    .history-dot.passed { background: var(--green); }
    .links { display: flex; gap: 10px; white-space: nowrap; }
    .empty { padding: 36px; color: var(--muted); text-align: center; }
    .legend { display: flex; gap: 14px; margin-top: 12px; color: var(--muted); font-size: 11px; }
    .legend i { display: inline-block; width: 9px; height: 9px; margin-right: 5px; }
    .result-count { color: var(--muted); font-size: 13px; }
    .runner-status { display: flex; align-items: center; gap: 9px; min-height: 42px; margin: 12px 0; padding: 10px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12px; }
    .runner-status strong { color: var(--ink); }
    .runner-status[data-state="running"] { border-color: var(--amber); background: #fff9ec; }
    .runner-status[data-state="completed"] { border-color: var(--green); background: #f1f8f4; }
    .runner-status[data-state="failed"] { border-color: var(--red); background: #fff4f2; }
    .selection-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 46px; margin: 12px 0; padding: 8px 12px; border: 1px solid var(--line); background: #e9e7df; }
    .selection-bar span { color: var(--muted); font-size: 12px; }
    .selection-bar button { min-height: 34px; padding: 6px 12px; border: 1px solid var(--red); border-radius: 3px; color: white; background: var(--red); font-weight: 750; cursor: pointer; }
    .selection-bar button:disabled { border-color: #afb3ad; background: #afb3ad; cursor: default; }
    dialog { width: min(560px, calc(100% - 24px)); padding: 0; border: 1px solid var(--line); border-radius: 4px; color: var(--ink); background: var(--surface); box-shadow: 0 24px 70px rgba(24, 32, 30, 0.28); }
    dialog::backdrop { background: rgba(24, 32, 30, 0.48); }
    .dialog-body { padding: 20px; }
    .dialog-body h2 { margin: 0 0 6px; font-family: Georgia, serif; font-size: 24px; font-weight: 500; }
    .dialog-spec { max-height: 180px; margin: 12px 0; padding: 10px; overflow: auto; background: #efede6; font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .run-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .run-options label { display: grid; gap: 5px; color: var(--muted); font-size: 11px; }
    .run-options input, .run-options select { width: 100%; min-height: 38px; padding: 7px 9px; border: 1px solid #bfc3bc; background: white; }
    .run-command { margin: 14px 0 0; color: var(--muted); font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--line); background: #efede6; }
    .dialog-actions button { min-height: 38px; padding: 7px 14px; border: 1px solid #aeb3ac; border-radius: 3px; background: var(--surface); cursor: pointer; }
    .dialog-actions .run-button { border-color: var(--red); color: white; background: var(--red); font-weight: 750; }
    .dialog-actions button:disabled { opacity: 0.55; cursor: wait; }
    @media (max-width: 980px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .analytics-grid { grid-template-columns: 1fr 1fr; }
      .analytics-grid .panel:first-child { grid-column: 1 / -1; }
      .controls { grid-template-columns: 1fr 1fr; }
      .controls input { grid-column: 1 / -1; }
    }
    @media (max-width: 620px) {
      .shell { width: min(100% - 20px, 1480px); }
      header { padding-top: 24px; }
      .kpis, .analytics-grid, .controls { grid-template-columns: 1fr; }
      .analytics-grid .panel:first-child, .controls input { grid-column: auto; }
      .kpi { min-height: 108px; }
      .run-options { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="shell">
      <p class="eyebrow">Thunderjet · failure analytics</p>
      <h1>runNightly<wbr>Eureka<wbr>Release<wbr>Tests-<wbr>non-ecs</h1>
      <div class="launch-meta">
        <span>Launch #38</span><span>ReportPortal ID 9776</span><span>Status: Failed</span><span>History depth: 10 executions</span><a href="report.md">Markdown report</a><a href="/runs">Runs</a>
      </div>
    </div>
  </header>
  <main class="shell">
    <section class="kpis" aria-label="Key metrics">
      <article class="kpi"><span>Current team failure rate</span><strong>${metrics.suiteFailureRate.toFixed(1)}%</strong><small>${metrics.suiteFailed} failed of ${metrics.suiteTotal} test steps</small></article>
      <article class="kpi"><span>Failed-cohort history</span><strong>${((metrics.cohortFailures / metrics.cohortExecutions) * 100).toFixed(0)}%</strong><small>${metrics.cohortFailures} failures across ${metrics.cohortExecutions} executions</small></article>
      <article class="kpi"><span>Persistent failures</span><strong>${metrics.persistent}</strong><small>Failed in all 10 observed executions</small></article>
      <article class="kpi"><span>Immediate regressions</span><strong>${metrics.regressions}</strong><small>Passed previously, failed in launch #38</small></article>
    </section>

    <h2 class="section-title">Failure shape</h2>
    <section class="analytics-grid">
      <article class="panel">
        <h2>Current-failure cohort by launch</h2>
        <p class="panel-note">Pass/fail observations for today’s 40 failures. Launches with fewer than 20 cohort observations are omitted.</p>
        <div class="trend" id="trend"></div>
        <div class="legend"><span><i style="background:var(--green)"></i>Passed</span><span><i style="background:var(--red)"></i>Failed</span></div>
      </article>
      <article class="panel">
        <h2>Risk profile</h2>
        <p class="panel-note">Mutually exclusive groups based on failures in the last 10 executions.</p>
        <div class="bar-list" id="risk-bars"></div>
      </article>
      <article class="panel">
        <h2>Module concentration</h2>
        <p class="panel-note">Current failed identities grouped by their top ReportPortal suite.</p>
        <div class="bar-list" id="module-bars"></div>
      </article>
    </section>
    <aside class="scope"><strong>Read the scope carefully.</strong> The 5.2% metric uses all 767 current Thunderjet test steps. Historical metrics and the launch chart intentionally follow only the 40 identities that failed in launch #38; they measure persistence and flakiness of today’s failures, not the historical failure rate of the whole suite.</aside>

    <h2 class="section-title">Test-level evidence</h2>
    <div class="controls" aria-label="Failure filters">
      <input id="search" type="search" placeholder="Search test name or case ID" aria-label="Search tests">
      <select id="risk-filter" aria-label="Filter by risk"><option value="">All risk levels</option></select>
      <select id="module-filter" aria-label="Filter by module"><option value="">All modules</option></select>
      <select id="defect-filter" aria-label="Filter by defect"><option value="">All classifications</option></select>
    </div>
    <div class="runner-status" id="runner-status" data-state="idle"><strong>Repeater:</strong><span>Checking local runner…</span></div>
    <div class="selection-bar"><span id="selection-count">No specs selected</span><button id="run-selected" type="button" disabled>Run selected</button></div>
    <p class="result-count" id="result-count"></p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th><input id="select-visible" type="checkbox" aria-label="Select all visible specs"></th>
          <th data-sort-column="risk"><button class="sort-button" type="button" data-sort="risk">Risk <span class="sort-indicator"></span></button></th>
          <th data-sort-column="name"><button class="sort-button" type="button" data-sort="name">Test <span class="sort-indicator"></span></button></th>
          <th data-sort-column="module"><button class="sort-button" type="button" data-sort="module">Module <span class="sort-indicator"></span></button></th>
          <th data-sort-column="failureRate"><button class="sort-button" type="button" data-sort="failureRate">Failure rate <span class="sort-indicator"></span></button></th>
          <th data-sort-column="currentStreak"><button class="sort-button" type="button" data-sort="currentStreak">Current streak <span class="sort-indicator"></span></button></th>
          <th data-sort-column="transitions"><button class="sort-button" type="button" data-sort="transitions">Transitions <span class="sort-indicator"></span></button></th>
          <th>Oldest → current</th>
          <th data-sort-column="defect"><button class="sort-button" type="button" data-sort="defect">Classification <span class="sort-indicator"></span></button></th>
          <th>Evidence</th>
        </tr></thead>
        <tbody id="results"></tbody>
      </table>
      <div class="empty" id="empty" hidden>No failures match these filters.</div>
    </div>
  </main>
  <dialog id="run-dialog">
    <div class="dialog-body">
      <h2 id="run-dialog-title">Run spec with Cypress repeater</h2>
      <p class="panel-note">Confirm the local execution settings. Selected specs run in order; threads apply to repetitions of the active spec.</p>
      <div class="dialog-spec" id="dialog-spec"></div>
      <div class="run-options">
        <label>Runs<input id="run-count" type="number" min="1" max="50" value="10"></label>
        <label>Threads<input id="thread-count" type="number" min="1" max="8" value="1"></label>
        <label>Browser<select id="run-browser"><option value="chrome">Chrome</option><option value="electron">Electron</option><option value="firefox">Firefox</option></select></label>
      </div>
      <p class="run-command" id="run-command"></p>
    </div>
    <div class="dialog-actions"><button id="cancel-run" type="button">Cancel</button><button class="run-button" id="confirm-run" type="button">Run spec</button></div>
  </dialog>
  <script>
    const data = ${dashboardData};
    const runnerToken = '__RUNNER_TOKEN__';
    const riskOrder = { Persistent: 4, 'High risk': 3, Intermittent: 2, Isolated: 1 };
    const state = { search: '', risk: '', module: '', defect: '', sortKey: 'risk', sortDirection: 'desc', selectedSpecs: new Set() };
    let dialogSpecs = [];

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    }

    function renderTrend() {
      const container = document.querySelector('#trend');
      container.innerHTML = data.trend.map((item) => {
        const total = item.passed + item.failed + item.other;
        const passedHeight = (item.passed / total) * 140;
        const failedHeight = (item.failed / total) * 140;
        return '<div class="trend-column" title="Launch #' + item.launchNumber + ': ' + item.failed + ' failed, ' + item.passed + ' passed, ' + total + ' observations">' +
          '<div class="trend-bar"><div class="trend-failed" style="height:' + failedHeight + 'px"></div><div class="trend-passed" style="height:' + passedHeight + 'px"></div></div>' +
          '<span class="trend-label">#' + item.launchNumber + '</span></div>';
      }).join('');
    }

    function renderBars(selector, entries, colorClass = '') {
      const maximum = Math.max(...entries.map((entry) => entry[1]));
      document.querySelector(selector).innerHTML = entries.map(([label, count]) =>
        '<div class="bar-row"><span>' + escapeHtml(label) + '</span><div class="bar-track"><div class="bar-fill ' + colorClass + '" style="width:' + ((count / maximum) * 100) + '%"></div></div><strong>' + count + '</strong></div>',
      ).join('');
    }

    function optionsFor(key) {
      return [...new Set(data.rows.map((row) => row[key]))].sort();
    }

    function populateFilter(selector, values) {
      const select = document.querySelector(selector);
      values.forEach((value) => select.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>'));
    }

    function compareRows(left, right) {
      const key = state.sortKey;
      const leftValue = key === 'risk' ? riskOrder[left.risk] : left[key];
      const rightValue = key === 'risk' ? riskOrder[right.risk] : right[key];
      const comparison = typeof leftValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      const directed = state.sortDirection === 'asc' ? comparison : -comparison;
      return directed || left.name.localeCompare(right.name);
    }

    function filteredRows() {
      const search = state.search.toLowerCase();
      return data.rows.filter((row) =>
        (!search || row.name.toLowerCase().includes(search) || row.specPath.toLowerCase().includes(search) || (row.caseId || '').toLowerCase().includes(search)) &&
        (!state.risk || row.risk === state.risk) &&
        (!state.module || row.module === state.module) &&
        (!state.defect || row.defect === state.defect),
      );
    }

    function renderSortHeaders() {
      document.querySelectorAll('[data-sort-column]').forEach((header) => {
        const active = header.dataset.sortColumn === state.sortKey;
        header.setAttribute('aria-sort', active ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
        header.querySelector('.sort-indicator').textContent = active ? (state.sortDirection === 'asc' ? '↑' : '↓') : '';
      });
    }

    function updateSelection() {
      const selectedCount = state.selectedSpecs.size;
      document.querySelector('#selection-count').textContent = selectedCount ? selectedCount + ' unique spec' + (selectedCount === 1 ? '' : 's') + ' selected' : 'No specs selected';
      document.querySelector('#run-selected').disabled = selectedCount === 0;
      const visibleSpecs = [...new Set(filteredRows().map((row) => row.specPath))];
      const selectedVisible = visibleSpecs.filter((spec) => state.selectedSpecs.has(spec)).length;
      const selectVisible = document.querySelector('#select-visible');
      selectVisible.checked = visibleSpecs.length > 0 && selectedVisible === visibleSpecs.length;
      selectVisible.indeterminate = selectedVisible > 0 && selectedVisible < visibleSpecs.length;
    }

    function renderRows() {
      const rows = filteredRows().sort(compareRows);
      document.querySelector('#result-count').textContent = rows.length + ' of ' + data.rows.length + ' failed test identities';
      document.querySelector('#empty').hidden = rows.length > 0;
      document.querySelector('#results').innerHTML = rows.map((row) => {
        const history = row.statuses.map((status, index) => '<span class="history-dot ' + status.toLowerCase() + '" title="Launch #' + row.launchNumbers[index] + ': ' + status + '"></span>').join('');
        const testRail = row.testRailUrl ? '<a href="' + row.testRailUrl + '" target="_blank" rel="noreferrer">TestRail</a>' : '';
        const checked = state.selectedSpecs.has(row.specPath) ? ' checked' : '';
        return '<tr><td><input type="checkbox" data-select-spec="' + escapeHtml(row.specPath) + '" aria-label="Select ' + escapeHtml(row.specPath) + '"' + checked + '></td><td><span class="badge badge-' + row.risk.toLowerCase().replace(' ', '-') + '">' + row.risk + '</span></td>' +
          '<td class="test-name"><div class="test-title">' + escapeHtml(row.name) + '</div><div class="spec-row"><button class="spec-link" type="button" data-run-spec="' + escapeHtml(row.specPath) + '" title="Run this spec with the Cypress repeater">' + escapeHtml(row.specPath) + '</button><button class="copy-spec" type="button" data-copy-spec="' + escapeHtml(row.specPath) + '" aria-label="Copy spec path" title="Copy spec path">⧉</button></div></td><td>' + escapeHtml(row.module) + '</td>' +
          '<td><strong>' + row.failureRate + '%</strong><br><small>' + row.failed + ' / ' + row.executions + '</small></td>' +
          '<td>' + row.currentStreak + '</td><td>' + row.transitions + '</td><td><div class="history">' + history + '</div></td>' +
          '<td>' + escapeHtml(row.defect) + '</td><td><div class="links"><a href="' + row.reportPortalUrl + '" target="_blank" rel="noreferrer">RP log</a>' + testRail + '</div></td></tr>';
      }).join('');
      renderSortHeaders();
      updateSelection();
    }

    function setRunnerStatus(message, state = 'idle') {
      const status = document.querySelector('#runner-status');
      status.dataset.state = state;
      status.innerHTML = '<strong>Repeater:</strong><span>' + escapeHtml(message) + '</span><a href="/runs">Open Runs</a>';
    }

    async function copySpec(spec, button) {
      try {
        await navigator.clipboard.writeText(spec);
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = spec;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      const previous = button.textContent;
      button.textContent = '✓';
      button.title = 'Copied';
      window.setTimeout(() => { button.textContent = previous; button.title = 'Copy spec path'; }, 1400);
    }

    function updateRunCommand() {
      const runs = document.querySelector('#run-count').value;
      const threads = document.querySelector('#thread-count').value;
      const browser = document.querySelector('#run-browser').value;
      document.querySelector('#run-command').textContent = 'yarn cypress:repeat --spec ' + dialogSpecs.join(',') + ' --runs ' + runs + ' --threads ' + threads + ' --browser ' + browser;
    }

    function openRunDialog(specs) {
      if (location.protocol === 'file:') {
        setRunnerStatus('Copy works from this file, but running requires start-dashboard.js on localhost.', 'failed');
        return;
      }
      const dialog = document.querySelector('#run-dialog');
      dialogSpecs = [...new Set(Array.isArray(specs) ? specs : [specs])];
      document.querySelector('#run-dialog-title').textContent = dialogSpecs.length === 1 ? 'Run spec with Cypress repeater' : 'Run ' + dialogSpecs.length + ' specs with Cypress repeater';
      document.querySelector('#dialog-spec').textContent = dialogSpecs.join('\\n');
      updateRunCommand();
      dialog.showModal();
    }

    async function pollRun(runId) {
      const response = await fetch('/api/runs/' + encodeURIComponent(runId), { headers: { 'X-Runner-Token': runnerToken } });
      const run = await response.json();
      if (run.status === 'running') {
        setRunnerStatus('Running ' + run.specCount + ' spec' + (run.specCount === 1 ? '' : 's') + ' · ' + run.completedRuns + '/' + run.totalRuns + ' repetitions · active: ' + run.activeSpec, 'running');
        window.setTimeout(() => pollRun(runId), 2000);
        return;
      }
      const state = run.status === 'completed' && run.exitCode === 0 ? 'completed' : 'failed';
      setRunnerStatus((state === 'completed' ? 'Completed ' : 'Finished with failures: ') + run.specCount + ' spec' + (run.specCount === 1 ? '' : 's') + ' · logs: ' + run.outputDir, state);
    }

    async function startRun() {
      const dialog = document.querySelector('#run-dialog');
      const button = document.querySelector('#confirm-run');
      button.disabled = true;
      try {
        const response = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Runner-Token': runnerToken },
          body: JSON.stringify({
            specs: dialogSpecs,
            runs: Number(document.querySelector('#run-count').value),
            threads: Number(document.querySelector('#thread-count').value),
            browser: document.querySelector('#run-browser').value,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to start Cypress repeater');
        dialog.close();
        setRunnerStatus('Starting ' + dialogSpecs.length + ' spec' + (dialogSpecs.length === 1 ? '' : 's') + '…', 'running');
        pollRun(result.id);
      } catch (error) {
        setRunnerStatus(error.message, 'failed');
      } finally {
        button.disabled = false;
      }
    }

    async function checkRunner() {
      if (location.protocol === 'file:') {
        setRunnerStatus('Copy is available. Start start-dashboard.js to enable repeat runs.');
        return;
      }
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error();
        const health = await response.json();
        if (health.activeRun) {
          const run = health.activeRun;
          setRunnerStatus('Running ' + run.specCount + ' spec' + (run.specCount === 1 ? '' : 's') + ' · ' + run.completedRuns + '/' + run.totalRuns + ' repetitions · active: ' + run.activeSpec, 'running');
          pollRun(run.id);
        } else {
          setRunnerStatus('Ready. Select one or more specs to configure a repeat run.', 'completed');
        }
      } catch (error) {
        setRunnerStatus('Local runner is unavailable.', 'failed');
      }
    }

    renderTrend();
    renderBars('#risk-bars', [['Persistent', data.metrics.persistent], ['High risk', data.metrics.highRisk], ['Intermittent', data.metrics.intermittent], ['Isolated', data.metrics.isolated]], 'red');
    const moduleCounts = Object.entries(data.rows.reduce((counts, row) => ({ ...counts, [row.module]: (counts[row.module] || 0) + 1 }), {})).sort((left, right) => right[1] - left[1]);
    renderBars('#module-bars', moduleCounts.slice(0, 6));
    populateFilter('#risk-filter', ['Persistent', 'High risk', 'Intermittent', 'Isolated']);
    populateFilter('#module-filter', optionsFor('module'));
    populateFilter('#defect-filter', optionsFor('defect'));
    document.querySelector('#search').addEventListener('input', (event) => { state.search = event.target.value; renderRows(); });
    document.querySelector('#risk-filter').addEventListener('change', (event) => { state.risk = event.target.value; renderRows(); });
    document.querySelector('#module-filter').addEventListener('change', (event) => { state.module = event.target.value; renderRows(); });
    document.querySelector('#defect-filter').addEventListener('change', (event) => { state.defect = event.target.value; renderRows(); });
    document.querySelector('thead').addEventListener('click', (event) => {
      const button = event.target.closest('[data-sort]');
      if (!button) return;
      const key = button.dataset.sort;
      if (state.sortKey === key) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      else {
        state.sortKey = key;
        state.sortDirection = ['name', 'module', 'defect'].includes(key) ? 'asc' : 'desc';
      }
      renderRows();
    });
    document.querySelector('#select-visible').addEventListener('change', (event) => {
      const specs = [...new Set(filteredRows().map((row) => row.specPath))];
      specs.forEach((spec) => event.target.checked ? state.selectedSpecs.add(spec) : state.selectedSpecs.delete(spec));
      renderRows();
    });
    document.querySelector('#results').addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-select-spec]');
      if (!checkbox) return;
      if (checkbox.checked) state.selectedSpecs.add(checkbox.dataset.selectSpec);
      else state.selectedSpecs.delete(checkbox.dataset.selectSpec);
      renderRows();
    });
    document.querySelector('#results').addEventListener('click', (event) => {
      const copyButton = event.target.closest('[data-copy-spec]');
      const runButton = event.target.closest('[data-run-spec]');
      if (copyButton) copySpec(copyButton.dataset.copySpec, copyButton);
      if (runButton) openRunDialog([runButton.dataset.runSpec]);
    });
    document.querySelector('#run-selected').addEventListener('click', () => openRunDialog([...state.selectedSpecs]));
    document.querySelector('#cancel-run').addEventListener('click', () => document.querySelector('#run-dialog').close());
    document.querySelector('#confirm-run').addEventListener('click', startRun);
    document.querySelectorAll('#run-count, #thread-count, #run-browser').forEach((control) => control.addEventListener('input', updateRunCommand));
    renderRows();
    checkRunner();
  </script>
</body>
</html>`;

const runsHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cypress repeat runs · Launch 38</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18201e;
      --muted: #63706b;
      --paper: #f4f1e9;
      --surface: #fffdf8;
      --line: #d8d7cf;
      --red: #b83b35;
      --amber: #b16a12;
      --green: #28745a;
      --blue: #315f7d;
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: linear-gradient(rgba(24, 32, 30, 0.035) 1px, transparent 1px), var(--paper); background-size: 100% 28px; font-family: "Avenir Next", "Trebuchet MS", sans-serif; letter-spacing: 0; }
    a { color: var(--blue); text-underline-offset: 3px; }
    button { font: inherit; letter-spacing: 0; }
    .shell { width: min(1320px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 34px 0 26px; border-bottom: 1px solid rgba(24, 32, 30, 0.2); background: rgba(244, 241, 233, 0.92); }
    .eyebrow { margin: 0 0 8px; color: var(--red); font-size: 12px; font-weight: 800; text-transform: uppercase; }
    h1 { margin: 0; font-family: Georgia, serif; font-size: clamp(32px, 4vw, 54px); font-weight: 500; line-height: 1.05; }
    .nav { display: flex; gap: 18px; margin-top: 14px; font-size: 13px; }
    main { padding: 24px 0 56px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .kpi { min-height: 108px; padding: 16px; border: 1px solid var(--line); background: var(--surface); }
    .kpi span { color: var(--muted); font-size: 12px; }
    .kpi strong { display: block; margin-top: 8px; font-family: Georgia, serif; font-size: 30px; font-weight: 500; }
    .section-title { margin: 30px 0 12px; font-family: Georgia, serif; font-size: 24px; font-weight: 500; }
    .active-job { padding: 18px; border: 1px solid var(--amber); background: #fff9ec; }
    .active-job.empty { border-color: var(--line); color: var(--muted); background: var(--surface); }
    .active-head { display: flex; justify-content: space-between; gap: 16px; }
    .active-head h2 { margin: 0 0 5px; font-size: 17px; }
    .active-spec { margin: 10px 0; font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .progress-track { height: 12px; border: 1px solid #d0c7b8; background: white; }
    .progress-fill { height: 100%; background: var(--amber); }
    .progress-label { margin-top: 7px; color: var(--muted); font-size: 12px; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); background: var(--surface); }
    table { width: 100%; min-width: 1050px; border-collapse: collapse; }
    th { padding: 11px 12px; background: #e9e7df; color: #4d5854; font-size: 11px; text-align: left; text-transform: uppercase; }
    td { padding: 13px 12px; border-top: 1px solid var(--line); font-size: 12px; vertical-align: top; }
    .badge { display: inline-flex; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 750; }
    .badge-running { color: #75470d; background: #f4e2be; }
    .badge-completed { color: #1f6049; background: #d5e8dd; }
    .badge-failed, .badge-interrupted { color: #7e211e; background: #f3d8d2; }
    details { max-width: 430px; }
    summary { color: var(--blue); cursor: pointer; }
    .spec-list { display: grid; gap: 5px; margin-top: 8px; }
    code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
    .output { display: flex; align-items: start; gap: 6px; max-width: 330px; }
    .copy-output { flex: 0 0 auto; width: 28px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 3px; color: var(--blue); background: white; cursor: pointer; }
    .updated { margin: 10px 0 0; color: var(--muted); font-size: 11px; }
    @media (max-width: 760px) {
      .shell { width: min(100% - 20px, 1320px); }
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .active-head { display: block; }
    }
  </style>
</head>
<body>
  <header><div class="shell"><p class="eyebrow">Thunderjet · Cypress repeater</p><h1>Runs</h1><nav class="nav"><a href="/">Failure dashboard</a><a href="report.md">Markdown report</a></nav></div></header>
  <main class="shell">
    <section class="kpis" aria-label="Run metrics">
      <article class="kpi"><span>Active jobs</span><strong id="active-count">0</strong></article>
      <article class="kpi"><span>Total jobs</span><strong id="total-count">0</strong></article>
      <article class="kpi"><span>Completed successfully</span><strong id="completed-count">0</strong></article>
      <article class="kpi"><span>Failed or interrupted</span><strong id="failed-count">0</strong></article>
    </section>
    <h2 class="section-title">Running now</h2>
    <section class="active-job empty" id="active-job">No Cypress repeat job is running.</section>
    <p class="updated" id="updated"></p>
    <h2 class="section-title">Job history</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Status</th><th>Specs</th><th>Progress</th><th>Settings</th><th>Started</th><th>Finished</th><th>Output</th></tr></thead>
        <tbody id="jobs"></tbody>
      </table>
    </div>
  </main>
  <script>
    const runnerToken = '__RUNNER_TOKEN__';

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    }

    function displayStatus(run) {
      if (run.status === 'completed' && run.exitCode !== 0) return 'failed';
      return run.status;
    }

    function formatDate(value) {
      return value ? new Date(value).toLocaleString() : '—';
    }

    function progress(run) {
      return run.totalRuns ? Math.min(100, Math.round((run.completedRuns / run.totalRuns) * 100)) : 0;
    }

    function specsMarkup(run) {
      return '<details><summary>' + run.specCount + ' spec' + (run.specCount === 1 ? '' : 's') + '</summary><div class="spec-list">' + run.specs.map((spec) => '<code>' + escapeHtml(spec) + '</code>').join('') + '</div></details>';
    }

    function renderActive(run) {
      const container = document.querySelector('#active-job');
      if (!run) {
        container.className = 'active-job empty';
        container.textContent = 'No Cypress repeat job is running.';
        return;
      }
      container.className = 'active-job';
      container.innerHTML = '<div class="active-head"><div><h2>' + run.specCount + ' selected spec' + (run.specCount === 1 ? '' : 's') + '</h2><span>' + run.runs + ' runs each · ' + run.threads + ' thread' + (run.threads === 1 ? '' : 's') + ' · ' + escapeHtml(run.browser) + '</span></div><span class="badge badge-running">Running</span></div>' +
        '<div class="active-spec">' + escapeHtml(run.activeSpec) + '</div><div class="progress-track"><div class="progress-fill" style="width:' + progress(run) + '%"></div></div>' +
        '<div class="progress-label">' + run.completedRuns + ' / ' + run.totalRuns + ' repetitions · ' + run.completedSpecs + ' / ' + run.specCount + ' specs completed</div>';
    }

    function renderJobs(runs) {
      document.querySelector('#jobs').innerHTML = runs.map((run) => {
        const status = displayStatus(run);
        return '<tr><td><span class="badge badge-' + status + '">' + escapeHtml(status) + '</span></td><td>' + specsMarkup(run) + '</td>' +
          '<td><strong>' + run.completedRuns + ' / ' + run.totalRuns + '</strong><br><small>' + progress(run) + '%</small></td>' +
          '<td>' + run.runs + ' runs<br>' + run.threads + ' threads<br>' + escapeHtml(run.browser) + '</td><td>' + formatDate(run.startedAt) + '</td><td>' + formatDate(run.finishedAt) + '</td>' +
          '<td><div class="output"><code>' + escapeHtml(run.outputDir) + '</code><button class="copy-output" type="button" data-copy="' + escapeHtml(run.outputDir) + '" aria-label="Copy output directory" title="Copy output directory">⧉</button></div></td></tr>';
      }).join('');
    }

    async function refresh() {
      try {
        const response = await fetch('/api/runs', { headers: { 'X-Runner-Token': runnerToken } });
        if (!response.ok) throw new Error('Unable to load jobs');
        const data = await response.json();
        const active = data.runs.find((run) => run.id === data.activeRunId) || null;
        document.querySelector('#active-count').textContent = active ? '1' : '0';
        document.querySelector('#total-count').textContent = data.runs.length;
        document.querySelector('#completed-count').textContent = data.runs.filter((run) => displayStatus(run) === 'completed').length;
        document.querySelector('#failed-count').textContent = data.runs.filter((run) => ['failed', 'interrupted'].includes(displayStatus(run))).length;
        renderActive(active);
        renderJobs(data.runs);
        document.querySelector('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
      } catch (error) {
        document.querySelector('#active-job').className = 'active-job empty';
        document.querySelector('#active-job').textContent = error.message;
      }
    }

    document.querySelector('#jobs').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = '✓';
      window.setTimeout(() => { button.textContent = '⧉'; }, 1200);
    });
    refresh();
    window.setInterval(refresh, 2000);
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html);
fs.writeFileSync(path.join(path.dirname(outputPath), 'runs.html'), runsHtml);
console.log(`Wrote ${outputPath} and runs.html with ${rows.length} failures and ${suiteItems.length} suite test steps.`);