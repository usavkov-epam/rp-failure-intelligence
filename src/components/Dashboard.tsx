"use client";

import { useDeferredValue, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
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
  createTheme,
} from "@mui/material";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ScienceRounded from "@mui/icons-material/ScienceRounded";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import type { DashboardData, FailureRow, ReportSelection, ReportSourceOptions, Risk } from "@/lib/types";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#175b52" },
    secondary: { main: "#b44a35" },
    background: { default: "#f3f1eb", paper: "#fffefb" },
    text: { primary: "#17211f", secondary: "#5e6b67" },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
    h1: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, letterSpacing: 0 },
    h2: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

const riskColors: Record<Risk, "error" | "warning" | "info" | "success"> = {
  Persistent: "error",
  "High risk": "warning",
  Intermittent: "info",
  Isolated: "success",
};

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.25, minHeight: 122 }}>
      <Typography variant="overline" color="text.secondary">{label}</Typography>
      <Typography variant="h2" sx={{ my: 0.5, fontSize: 34 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{detail}</Typography>
    </Paper>
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

export default function Dashboard({ initialData, reportSelection, reportSourceOptions, sourceRepository, user }: {
  initialData: DashboardData;
  reportSelection: ReportSelection;
  reportSourceOptions: ReportSourceOptions;
  sourceRepository: { owner: string; repository: string; ref: string };
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
  const [runOptions, setRunOptions] = useState({ runs: 5, threads: 1, browser: "chrome", timeoutSeconds: 600 });
  const reportFormRef = useRef<HTMLFormElement>(null);
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

  const columns: GridColDef<FailureRow>[] = [
    { field: "risk", headerName: "Risk", width: 125, renderCell: ({ value }) => <Chip size="small" label={value} color={riskColors[value as Risk]} variant="outlined" /> },
    {
      field: "name", headerName: "Failed test", minWidth: 420, flex: 1,
      renderCell: ({ row }) => <Box sx={{ py: 1 }}><Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>{row.name}</Typography><Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><Typography variant="caption" color="primary" sx={{ fontFamily: "monospace" }}>{row.specPath}</Typography><Tooltip title="Copy spec path"><IconButton size="small" onClick={() => navigator.clipboard.writeText(row.specPath)}><ContentCopyRounded sx={{ fontSize: 15 }} /></IconButton></Tooltip></Stack></Box>,
    },
    { field: "module", headerName: "Module", width: 135 },
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Container maxWidth={false} sx={{ py: 1.25, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><Box sx={{ width: 28, height: 28, bgcolor: "secondary.main", display: "grid", placeItems: "center", color: "white", fontWeight: 900 }}>RP</Box><Typography sx={{ fontWeight: 800 }}>Failure intelligence</Typography></Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" color={initialData.meta.source === "live" ? "success" : "error"} label={initialData.meta.source === "live" ? "Live data" : "Load error"} /><Button size="small" startIcon={<RefreshRounded />} onClick={() => location.reload()}>Refresh</Button><Button size="small" onClick={() => signOut({ redirectTo: "/signin" })}>{user.name} · Sign out</Button></Stack>
        </Container>
      </AppBar>
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
                  key={reportSelection.project}
                  name="project"
                  label="Project"
                  defaultValue={reportSelection.project}
                  onChange={() => {
                    requestAnimationFrame(() => reportFormRef.current?.requestSubmit());
                  }}
                >
                  {reportSourceOptions.projects.map((project) => <MenuItem key={project} value={project}>{project}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" required>
                <InputLabel>Launch name</InputLabel>
                <Select
                  key={`${reportSelection.project}:${reportSelection.launchName}`}
                  name="launchName"
                  label="Launch name"
                  defaultValue={reportSelection.launchName}
                  onChange={() => {
                    requestAnimationFrame(() => reportFormRef.current?.requestSubmit());
                  }}
                >
                  {reportSourceOptions.launches.map((launchName) => <MenuItem key={launchName} value={launchName}>{launchName}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" required disabled={!reportSourceOptions.launchRuns.length}>
                <InputLabel>Run</InputLabel>
                <Select
                  key={`${reportSelection.project}:${reportSelection.launchName}:${reportSelection.launchId}`}
                  name="launchId"
                  label="Run"
                  defaultValue={reportSelection.launchId ?? ""}
                >
                  {reportSourceOptions.launchRuns.map((run, index) => (
                    <MenuItem key={run.id} value={run.id}>
                      #{run.number} · {run.status}{index === 0 ? " · Latest" : ""}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField name="team" label="Team" size="small" defaultValue={reportSelection.team} required />
              <FormControl size="small">
                <InputLabel>History depth</InputLabel>
                <Select name="historyDepth" label="History depth" defaultValue={reportSelection.historyDepth}>
                  {[5, 10, 15, 20, 30].map((value) => <MenuItem key={value} value={value}>{value} runs</MenuItem>)}
                </Select>
              </FormControl>
              <Button type="submit" variant="contained">Apply</Button>
            </Box>
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
          <Paper variant="outlined" sx={{ height: 690, width: "100%" }}>
            <DataGrid rows={rows} columns={columns} checkboxSelection disableRowSelectionOnClick rowSelectionModel={selected} onRowSelectionModelChange={setSelected} rowHeight={76} pageSizeOptions={[10, 25, 50]} localeText={{ noRowsLabel: "No data" }} initialState={{ pagination: { paginationModel: { pageSize: 10 } }, sorting: { sortModel: [{ field: "failureRate", sort: "desc" }] } }} sx={{ border: 0, "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 800 }, "& .MuiDataGrid-cell": { alignItems: "center" } }} />
          </Paper>
        </Container>
      </Box>
      <Snackbar open={copied} autoHideDuration={2500} onClose={() => setCopied(false)} message={`${selectedSpecs.length} unique spec ${selectedSpecs.length === 1 ? "path" : "paths"} copied`} />
      <Dialog open={runDialogOpen} onClose={() => !runPending && setRunDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Run selected Cypress specs</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">{selectedSpecs.length} unique {selectedSpecs.length === 1 ? "spec" : "specs"} will run in GitHub Actions.</Alert>
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
            {runError && <Alert severity="error">{runError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)} disabled={runPending}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<PlayArrowRounded />}
            loading={runPending}
            onClick={async () => {
              setRunPending(true);
              setRunError("");
              try {
                const response = await fetch("/api/runs", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ specs: selectedSpecs, ...runOptions }),
                });
                const result = await response.json();
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
        <Alert severity="success" variant="filled" action={<Button color="inherit" size="small" component={Link} href={runResult?.actionsUrl || "#"} target="_blank">Open Actions</Button>}>
          Cypress run queued. Request {runResult?.requestId.slice(0, 8)}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(initialData.meta.error)} autoHideDuration={8000} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="error" variant="filled" sx={{ width: "100%" }}>Failed to load ReportPortal data: {initialData.meta.error}</Alert>
      </Snackbar>
    </ThemeProvider>
  );
}