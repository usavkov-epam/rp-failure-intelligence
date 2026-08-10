"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ScienceRounded from "@mui/icons-material/ScienceRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import type { CypressConfigOverrides } from "@/lib/cypress-run-request";
import type { DashboardData, FailureRow, ReportSelection, ReportSourceOptions, Risk } from "@/lib/types";
import AppHeader from "./AppHeader";
import { appTheme } from "./app-theme";

const riskColors: Record<Risk, "error" | "warning" | "info" | "success"> = {
  Persistent: "error",
  "High risk": "warning",
  Intermittent: "info",
  Isolated: "success",
};

interface ReportSourceChildrenResponse {
  launchName?: string;
  launches: string[];
  launchRuns: ReportSourceOptions["launchRuns"];
  error?: string;
}

interface CypressRunFormOptions {
  runs: number;
  threads: number;
  browser: "chrome" | "electron";
  timeoutSeconds: number;
  profileId: string;
  cypressConfig: CypressConfigOverrides;
}

const cypressNumberOptions: Array<{
  key: keyof Pick<CypressConfigOverrides,
    | "viewportWidth"
    | "viewportHeight"
    | "defaultCommandTimeout"
    | "pageLoadTimeout"
    | "requestTimeout"
    | "responseTimeout"
    | "retries">;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "viewportWidth", label: "Viewport width (px)", min: 320, max: 3_840 },
  { key: "viewportHeight", label: "Viewport height (px)", min: 320, max: 2_160 },
  { key: "defaultCommandTimeout", label: "Command timeout (ms)", min: 1_000, max: 300_000 },
  { key: "pageLoadTimeout", label: "Page-load timeout (ms)", min: 1_000, max: 300_000 },
  { key: "requestTimeout", label: "Request timeout (ms)", min: 1_000, max: 300_000 },
  { key: "responseTimeout", label: "Response timeout (ms)", min: 1_000, max: 300_000 },
  { key: "retries", label: "Cypress retries", min: 0, max: 5 },
];

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.25, minHeight: 122 }}>
      <Typography variant="overline" color="text.secondary">{label}</Typography>
      <Typography variant="h2" sx={{ my: 0.5, fontSize: 34 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{detail}</Typography>
    </Paper>
  );
}

function RecentRuns({ row }: { row: FailureRow }) {
  return (
    <Box
      role="img"
      aria-label={`Run history, oldest to newest: ${row.statuses.join(", ")}`}
      sx={{ display: "flex", alignItems: "center", gap: "3px", width: "100%", height: 30 }}
    >
      {row.statuses.map((status, index) => {
        const launchNumber = row.launchNumbers[index];
        const isLatest = index === row.statuses.length - 1;
        const color = status === "PASSED"
          ? "primary.main"
          : status === "FAILED"
            ? "secondary.main"
            : "action.disabled";

        return (
          <Tooltip
            key={`${launchNumber}:${index}`}
            title={`${launchNumber ? `Launch #${launchNumber}` : `Run ${index + 1}`}: ${status.toLowerCase()}`}
          >
            <Box
              component="span"
              sx={{
                flex: "1 1 0",
                minWidth: 4,
                maxWidth: 16,
                height: 24,
                bgcolor: color,
                borderRadius: "2px",
                outline: isLatest ? "2px solid" : "none",
                outlineColor: isLatest ? "text.primary" : "transparent",
                outlineOffset: 1,
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}

function Trend({ data }: { data: DashboardData }) {
  const launchLabel = data.meta.launchNumber === null ? "the selected launch" : `launch #${data.meta.launchNumber}`;
  return (
    <Paper variant="outlined" sx={{ p: 2.25, minWidth: 0 }}>
      <Typography variant="h6">Current failure cohort</Typography>
      <Typography variant="caption" color="text.secondary">
        Status history for the tests failing in {launchLabel}, not the whole suite.
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-end", height: 180, mt: 2, overflowX: "auto" }}>
        {!data.trend.length && <Typography color="text.secondary">No live history is available.</Typography>}
        {data.trend.map((point) => {
          const total = point.passed + point.failed + point.other;
          return (
            <Stack key={point.launchNumber} sx={{ alignItems: "center", minWidth: 38, height: "100%", justifyContent: "flex-end" }}>
              <Tooltip title={`${point.failed} failed, ${point.passed} passed`}>
                <Box sx={{ display: "flex", flexDirection: "column-reverse", width: 28, height: 132, bgcolor: "#e7e3d9" }}>
                  <Box sx={{ height: `${(point.failed / total) * 100}%`, bgcolor: "secondary.main" }} />
                  <Box sx={{ height: `${(point.passed / total) * 100}%`, bgcolor: "primary.main" }} />
                </Box>
              </Tooltip>
              <Typography variant="caption" sx={{ mt: 0.75 }}>#{point.launchNumber}</Typography>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

function Distribution({ data }: { data: DashboardData }) {
  const groups = [
    ["Persistent", data.metrics.persistent, "#b44a35"],
    ["High risk", data.metrics.highRisk, "#c5822a"],
    ["Intermittent", data.metrics.intermittent, "#39778d"],
    ["Isolated", data.metrics.isolated, "#28745a"],
  ] as const;
  const maximum = Math.max(1, ...groups.map(([, count]) => count));
  return (
    <Paper variant="outlined" sx={{ p: 2.25 }}>
      <Typography variant="h6">Risk distribution</Typography>
      <Typography variant="caption" color="text.secondary">Based on failure frequency across returned history.</Typography>
      <Stack spacing={2} sx={{ mt: 3 }}>
        {groups.map(([label, count, color]) => (
          <Box key={label}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography variant="body2">{label}</Typography><strong>{count}</strong></Stack>
            <Box sx={{ height: 9, bgcolor: "#e7e3d9", mt: 0.75 }}><Box sx={{ width: `${(count / maximum) * 100}%`, height: "100%", bgcolor: color }} /></Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export default function Dashboard({ initialData, reportSelection, reportSourceOptions, sourceRepository, cypressProfiles, user }: {
  initialData: DashboardData;
  reportSelection: ReportSelection;
  reportSourceOptions: ReportSourceOptions;
  sourceRepository: { owner: string; repository: string; ref: string };
  cypressProfiles: ReadonlyArray<{ id: string; name: string; isDefault: boolean }>;
  user: { name: string };
}) {
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [selected, setSelected] = useState<GridRowSelectionModel>({ type: "include", ids: new Set() });
  const [copied, setCopied] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runPending, setRunPending] = useState(false);
  const [runError, setRunError] = useState("");
  const [runResult, setRunResult] = useState<{ requestId: string; actionsUrl: string } | null>(null);
  const [runOptions, setRunOptions] = useState<CypressRunFormOptions>({
    runs: 5,
    threads: 1,
    browser: "chrome",
    timeoutSeconds: 600,
    profileId: cypressProfiles.find(({ isDefault }) => isDefault)?.id || cypressProfiles[0]?.id || "",
    cypressConfig: {},
  });
  const [draftSource, setDraftSource] = useState(reportSelection);
  const [draftSourceOptions, setDraftSourceOptions] = useState(reportSourceOptions);
  const [sourceLoading, setSourceLoading] = useState<"launches" | "runs" | null>(null);
  const [sourceLoadError, setSourceLoadError] = useState("");
  const reportFormRef = useRef<HTMLFormElement>(null);
  const sourceRequestRef = useRef<AbortController | null>(null);
  const stableSourceRef = useRef({ selection: reportSelection, options: reportSourceOptions });
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const latestLaunchId = reportSourceOptions.launchRuns[0]?.id;
  const isHistoricalRun = reportSelection.launchId !== undefined
    && latestLaunchId !== undefined
    && reportSelection.launchId !== latestLaunchId;
  const modules = [...new Set(initialData.rows.map((row) => row.module))].sort();
  const rows = initialData.rows.filter((row) =>
    (!deferredSearch || `${row.name} ${row.specPath}`.toLowerCase().includes(deferredSearch))
    && (!risk || row.risk === risk)
    && (!moduleName || row.module === moduleName));
  const selectedSpecs = [...new Set(initialData.rows
    .filter((row) => selected.ids.has(row.id))
    .map((row) => row.specPath))];

  useEffect(() => () => sourceRequestRef.current?.abort(), []);

  const cancelSourceLoad = () => {
    sourceRequestRef.current?.abort();
    sourceRequestRef.current = null;
    setDraftSource(stableSourceRef.current.selection);
    setDraftSourceOptions(stableSourceRef.current.options);
    setSourceLoadError("");
    setSourceLoading(null);
  };

  const loadSourceChildren = async (
    project: string,
    requestedLaunchName: string | undefined,
    loading: "launches" | "runs",
  ) => {
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    setSourceLoading(loading);
    setSourceLoadError("");
    setDraftSource((current) => ({
      ...current,
      project,
      launchName: requestedLaunchName || "",
      launchId: undefined,
    }));
    setDraftSourceOptions((current) => ({
      ...current,
      launches: loading === "launches" ? [] : current.launches,
      launchRuns: [],
    }));

    const query = new URLSearchParams({ project });
    if (requestedLaunchName) query.set("launchName", requestedLaunchName);

    try {
      const response = await fetch(`/api/report-source?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json() as ReportSourceChildrenResponse;
      if (!response.ok) throw new Error(result.error || "Unable to load report source options");
      if (sourceRequestRef.current !== controller) return;

      const nextSelection: ReportSelection = {
        ...stableSourceRef.current.selection,
        project,
        launchName: result.launchName || "",
        launchId: result.launchRuns[0]?.id,
      };
      const nextOptions: ReportSourceOptions = {
        projects: stableSourceRef.current.options.projects,
        launches: result.launches,
        launchRuns: result.launchRuns,
      };
      stableSourceRef.current = { selection: nextSelection, options: nextOptions };
      setDraftSource(nextSelection);
      setDraftSourceOptions(nextOptions);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (sourceRequestRef.current !== controller) return;
      setDraftSource(stableSourceRef.current.selection);
      setDraftSourceOptions(stableSourceRef.current.options);
      setSourceLoadError(error instanceof Error ? error.message : "Unable to load report source options");
    } finally {
      if (sourceRequestRef.current === controller) {
        sourceRequestRef.current = null;
        setSourceLoading(null);
      }
    }
  };

  const setCypressConfig = <Key extends keyof CypressConfigOverrides>(
    key: Key,
    value: CypressConfigOverrides[Key],
  ) => {
    setRunOptions((current) => {
      const cypressConfig = { ...current.cypressConfig };
      if (value === undefined) delete cypressConfig[key];
      else cypressConfig[key] = value;
      return { ...current, cypressConfig };
    });
  };

  const columns: GridColDef<FailureRow>[] = [
    { field: "risk", headerName: "Risk", width: 125, renderCell: ({ value }) => <Chip size="small" label={value} color={riskColors[value as Risk]} variant="outlined" /> },
    {
      field: "name", headerName: "Failed test", minWidth: 420, flex: 1,
      renderCell: ({ row }) => <Box sx={{ py: 1 }}><Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>{row.name}</Typography><Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><Typography variant="caption" color="primary" sx={{ fontFamily: "monospace" }}>{row.specPath}</Typography><Tooltip title="Copy spec path"><IconButton size="small" onClick={() => navigator.clipboard.writeText(row.specPath)}><ContentCopyRounded sx={{ fontSize: 15 }} /></IconButton></Tooltip></Stack></Box>,
    },
    { field: "module", headerName: "Module", width: 135 },
    {
      field: "statuses",
      headerName: `Last ${initialData.meta.historyDepth} runs`,
      description: "Oldest run on the left, newest run on the right. Green passed; red failed.",
      width: Math.min(260, Math.max(170, initialData.meta.historyDepth * 7 + 40)),
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => <RecentRuns row={row} />,
    },
    { field: "failureRate", headerName: "Failure rate", width: 125, type: "number", valueFormatter: (value) => `${value}%` },
    { field: "currentStreak", headerName: "Streak", width: 90, type: "number" },
    { field: "transitions", headerName: "Transitions", width: 105, type: "number" },
    { field: "defect", headerName: "Classification", width: 145 },
    {
      field: "links", headerName: "Links", width: 150, sortable: false, filterable: false,
      renderCell: ({ row }) => <Stack direction="row"><Tooltip title="Open source spec"><IconButton component={Link} href={`https://github.com/${sourceRepository.owner}/${sourceRepository.repository}/blob/${sourceRepository.ref}/${row.specPath}`} target="_blank" rel="noreferrer"><ContentCopyRounded fontSize="small" /></IconButton></Tooltip><Tooltip title="Open ReportPortal log"><IconButton component={Link} href={row.reportPortalUrl} target="_blank"><LaunchRounded fontSize="small" /></IconButton></Tooltip>{row.testRailUrl && <Tooltip title="Open TestRail case"><IconButton component={Link} href={row.testRailUrl} target="_blank"><ScienceRounded fontSize="small" /></IconButton></Tooltip>}</Stack>,
    },
  ];

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <AppHeader currentPage="analysis" userName={user.name} sourceStatus={initialData.meta.source} />
      <Box component="main" sx={{ pb: 7 }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", background: "linear-gradient(115deg, #eef4f0 0%, #f3f1eb 55%, #f5e7df 100%)" }}>
          <Container maxWidth={false} sx={{ py: { xs: 3, md: 5 } }}>
            <Typography variant="overline" color="secondary" sx={{ fontWeight: 800 }}>{initialData.meta.team} · {initialData.meta.project}</Typography>
            <Typography variant="h1" sx={{ mt: 0.5, fontSize: { xs: 34, md: 52 }, overflowWrap: "anywhere" }}>{initialData.meta.launchName}</Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mt: 2 }}>{initialData.meta.launchNumber !== null && <Chip label={`Launch #${initialData.meta.launchNumber}`} />}{initialData.meta.launchId !== null && <Chip label={`ID ${initialData.meta.launchId}`} />}<Chip color="error" variant="outlined" label={initialData.meta.launchStatus} /><Chip variant="outlined" label={`${initialData.meta.historyDepth}-run history`} /></Stack>
          </Container>
        </Box>
        <Container maxWidth={false} sx={{ mt: 3 }}>
          <Paper ref={reportFormRef} component="form" action="/" method="get" variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Report source</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr 180px 1fr 160px auto" }, gap: 1.25, alignItems: "center" }}>
              <FormControl size="small" required>
                <InputLabel>Project</InputLabel>
                <Select
                  name="project"
                  label="Project"
                  value={draftSource.project}
                  onChange={(event) => {
                    void loadSourceChildren(event.target.value, undefined, "launches");
                  }}
                >
                  {draftSourceOptions.projects.map((project) => <MenuItem key={project} value={project}>{project}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ position: "relative" }}>
                <FormControl size="small" required fullWidth disabled={sourceLoading === "launches"}>
                  <InputLabel>Launch name</InputLabel>
                  <Select
                    name="launchName"
                    label="Launch name"
                    value={draftSource.launchName}
                    onChange={(event) => {
                      void loadSourceChildren(draftSource.project, event.target.value, "runs");
                    }}
                  >
                    {draftSourceOptions.launches.map((launchName) => <MenuItem key={launchName} value={launchName}>{launchName}</MenuItem>)}
                  </Select>
                </FormControl>
                {sourceLoading === "launches" && <CircularProgress aria-label="Loading launch names" size={18} sx={{ position: "absolute", right: 36, top: 11 }} />}
              </Box>
              <Box sx={{ position: "relative" }}>
                <FormControl size="small" required fullWidth disabled={Boolean(sourceLoading) || !draftSourceOptions.launchRuns.length}>
                  <InputLabel>Run</InputLabel>
                  <Select
                    name="launchId"
                    label="Run"
                    value={draftSource.launchId ?? ""}
                    onChange={(event) => {
                      const selection = { ...draftSource, launchId: Number(event.target.value) };
                      stableSourceRef.current = { ...stableSourceRef.current, selection };
                      setDraftSource(selection);
                    }}
                  >
                    {draftSourceOptions.launchRuns.map((run, index) => (
                      <MenuItem key={run.id} value={run.id}>
                        #{run.number} · {run.status}{index === 0 ? " · Latest" : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {sourceLoading && <CircularProgress aria-label="Loading runs" size={18} sx={{ position: "absolute", right: 36, top: 11 }} />}
              </Box>
              <TextField name="team" label="Team" size="small" defaultValue={reportSelection.team} required />
              <FormControl size="small">
                <InputLabel>History depth</InputLabel>
                <Select name="historyDepth" label="History depth" defaultValue={reportSelection.historyDepth}>
                  {[5, 10, 15, 20, 30].map((value) => <MenuItem key={value} value={value}>{value} runs</MenuItem>)}
                </Select>
              </FormControl>
              <Stack direction="row" spacing={0.75}>
                {sourceLoading && <Button type="button" variant="text" onClick={cancelSourceLoad}>Cancel</Button>}
                <Button
                  type="submit"
                  variant="contained"
                  disabled={Boolean(sourceLoading) || !draftSource.launchName || draftSource.launchId === undefined}
                >
                  Apply
                </Button>
              </Stack>
            </Box>
            {sourceLoadError && <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setSourceLoadError("")}>{sourceLoadError}</Alert>}
          </Paper>
          {isHistoricalRun && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
              You are analyzing historical launch #{initialData.meta.launchNumber}. The latest completed run for this launch name is #{reportSourceOptions.launchRuns[0]?.number}.
            </Alert>
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <Metric label="Current suite failure rate" value={`${initialData.metrics.suiteFailureRate.toFixed(1)}%`} detail={`${initialData.metrics.suiteFailed} failed of ${initialData.metrics.suiteTotal} team tests`} />
            <Metric label="Failed test identities" value={String(initialData.rows.length)} detail={`${new Set(initialData.rows.map((row) => row.specPath)).size} unique Cypress specs`} />
            <Metric label="Historical cohort failures" value={`${initialData.metrics.cohortExecutions ? Math.round((initialData.metrics.cohortFailures / initialData.metrics.cohortExecutions) * 100) : 0}%`} detail={`${initialData.metrics.cohortFailures} of ${initialData.metrics.cohortExecutions} observations`} />
            <Metric label="Immediate regressions" value={String(initialData.metrics.regressions)} detail="Current failures preceded by a passed run" />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 1.5, mt: 1.5 }}><Trend data={initialData} /><Distribution data={initialData} /></Box>
          <Stack sx={{ flexDirection: { xs: "column", md: "row" }, gap: 1, my: 2.5 }}>
            <TextField size="small" label="Search tests or specs" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: { md: 320 }, flex: 1 }} />
            <FormControl size="small" sx={{ minWidth: 170 }}><InputLabel>Risk</InputLabel><Select label="Risk" value={risk} onChange={(event) => setRisk(event.target.value)}><MenuItem value="">All risks</MenuItem>{Object.keys(riskColors).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}><InputLabel>Module</InputLabel><Select label="Module" value={moduleName} onChange={(event) => setModuleName(event.target.value)}><MenuItem value="">All modules</MenuItem>{modules.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
            <Button
              variant="outlined"
              startIcon={<ContentCopyRounded />}
              disabled={!selectedSpecs.length}
              onClick={async () => {
                await navigator.clipboard.writeText(selectedSpecs.join("\n"));
                setCopied(true);
              }}
            >
              Copy {selectedSpecs.length || "selected"} {selectedSpecs.length === 1 ? "spec" : "specs"}
            </Button>
            <Button
              variant="contained"
              startIcon={<PlayArrowRounded />}
              disabled={!selectedSpecs.length}
              onClick={() => {
                setRunError("");
                setRunDialogOpen(true);
              }}
            >
              Run selected
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {rows.length} of {initialData.rows.length} failures match the active filters. Sorting and column filters apply to all matching rows before pagination.
          </Typography>
          <Paper variant="outlined" sx={{ height: 690, width: "100%" }}>
            <DataGrid rows={rows} columns={columns} sortingMode="client" filterMode="client" paginationMode="client" checkboxSelection disableRowSelectionOnClick rowSelectionModel={selected} onRowSelectionModelChange={setSelected} rowHeight={76} pageSizeOptions={[10, 25, 50, 100]} localeText={{ noRowsLabel: "No data" }} initialState={{ pagination: { paginationModel: { pageSize: 10 } }, sorting: { sortModel: [{ field: "failureRate", sort: "desc" }] } }} sx={{ border: 0, "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 800 }, "& .MuiDataGrid-cell": { alignItems: "center" } }} />
          </Paper>
        </Container>
      </Box>
      <Snackbar open={copied} autoHideDuration={2500} onClose={() => setCopied(false)} message={`${selectedSpecs.length} unique spec ${selectedSpecs.length === 1 ? "path" : "paths"} copied`} />
      <Dialog open={runDialogOpen} onClose={() => !runPending && setRunDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Run selected Cypress specs</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">{selectedSpecs.length} unique {selectedSpecs.length === 1 ? "spec" : "specs"} will run in GitHub Actions.</Alert>
            <FormControl>
              <InputLabel>Cypress profile</InputLabel>
              <Select
                label="Cypress profile"
                value={runOptions.profileId}
                onChange={(event) => setRunOptions((current) => ({ ...current, profileId: event.target.value }))}
                required
              >
                {cypressProfiles.map((profile) => <MenuItem key={profile.id} value={profile.id}>{profile.name}{profile.isDefault ? " · Default" : ""}</MenuItem>)}
              </Select>
            </FormControl>
            {!cypressProfiles.length && (
              <Typography variant="caption" color="text.secondary">
                No Cypress profiles are configured. Create one in Settings before starting a run.
              </Typography>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              <TextField label="Runs per spec" type="number" value={runOptions.runs} slotProps={{ htmlInput: { min: 1, max: 20 } }} onChange={(event) => setRunOptions((current) => ({ ...current, runs: Number(event.target.value) }))} />
              <TextField label="Concurrent threads" type="number" value={runOptions.threads} slotProps={{ htmlInput: { min: 1, max: 4 } }} onChange={(event) => setRunOptions((current) => ({ ...current, threads: Number(event.target.value) }))} />
              <FormControl>
                <InputLabel>Browser</InputLabel>
                <Select label="Browser" value={runOptions.browser} onChange={(event) => setRunOptions((current) => ({ ...current, browser: event.target.value }))}>
                  <MenuItem value="chrome">Chrome</MenuItem>
                  <MenuItem value="electron">Electron</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Per-run timeout (seconds)" type="number" value={runOptions.timeoutSeconds} slotProps={{ htmlInput: { min: 60, max: 1200 } }} onChange={(event) => setRunOptions((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))} />
            </Box>
            <Accordion variant="outlined" disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>Advanced Cypress configuration</Typography>
                  <Typography variant="caption" color="text.secondary">Blank values inherit from the selected environment and cypress.config.js.</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                  {cypressNumberOptions.map(({ key, label, min, max }) => (
                    <TextField
                      key={key}
                      label={label}
                      type="number"
                      value={runOptions.cypressConfig[key] ?? ""}
                      slotProps={{ htmlInput: { min, max } }}
                      onChange={(event) => setCypressConfig(
                        key,
                        event.target.value === "" ? undefined : Number(event.target.value),
                      )}
                    />
                  ))}
                  {(["video", "screenshotOnRunFailure"] as const).map((key) => (
                    <FormControl key={key}>
                      <InputLabel>{key === "video" ? "Record video" : "Screenshot on failure"}</InputLabel>
                      <Select
                        label={key === "video" ? "Record video" : "Screenshot on failure"}
                        value={runOptions.cypressConfig[key] === undefined ? "" : String(runOptions.cypressConfig[key])}
                        onChange={(event) => setCypressConfig(
                          key,
                          event.target.value === "" ? undefined : event.target.value === "true",
                        )}
                      >
                        <MenuItem value="">Inherit default</MenuItem>
                        <MenuItem value="true">Enabled</MenuItem>
                        <MenuItem value="false">Disabled</MenuItem>
                      </Select>
                    </FormControl>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
            {runError && <Alert severity="error">{runError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)} disabled={runPending}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<PlayArrowRounded />}
            loading={runPending}
            disabled={!runOptions.profileId}
            onClick={async () => {
              setRunPending(true);
              setRunError("");
              try {
                const response = await fetch("/api/runs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    specs: selectedSpecs,
                    ...runOptions,
                  }),
                });
                const result = await response.json() as { requestId: string; actionsUrl: string; error?: string };
                if (!response.ok) throw new Error(result.error || "Unable to start Cypress run");
                setRunResult(result);
                setRunDialogOpen(false);
              } catch (error) {
                setRunError(error instanceof Error ? error.message : "Unable to start Cypress run");
              } finally {
                setRunPending(false);
              }
            }}
          >
            Start run
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(runResult)} autoHideDuration={12000} onClose={() => setRunResult(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="success" variant="filled" action={<Button color="inherit" size="small" component={Link} href="/runs">View runs</Button>}>
          Cypress run queued. Request {runResult?.requestId.slice(0, 8)}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(initialData.meta.error)} autoHideDuration={8000} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="error" variant="filled" sx={{ width: "100%" }}>Failed to load ReportPortal data: {initialData.meta.error}</Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
