"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Link,
  Paper,
  Snackbar,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import PendingRounded from "@mui/icons-material/PendingRounded";

import type { CypressRunRecord } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import AppHeader from "./AppHeader";
import { appTheme } from "./app-theme";

function formatRunDuration(run: CypressRunRecord) {
  if (!run.startedAt) return "Waiting to start";
  const end = run.status === "completed" && run.updatedAt ? Date.parse(run.updatedAt) : Date.now();
  const seconds = Math.max(0, Math.round((end - Date.parse(run.startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runColor(run: CypressRunRecord): "default" | "info" | "success" | "error" | "warning" {
  if (run.status !== "completed") return run.status === "in_progress" ? "info" : "default";
  if (run.conclusion === "success") return "success";
  if (run.conclusion === "failure") return "error";
  return "warning";
}

function runIcon(run: CypressRunRecord) {
  if (run.status !== "completed") return <PendingRounded fontSize="small" />;
  return run.conclusion === "success"
    ? <CheckCircleOutlineRounded fontSize="small" />
    : <ErrorOutlineRounded fontSize="small" />;
}

export default function RunsView({ initialRuns, channelName, supabaseUrl, supabaseAnonKey, userName }: {
  initialRuns: CypressRunRecord[];
  channelName: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  userName: string;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [statusError, setStatusError] = useState("");
  const [completionNotice, setCompletionNotice] = useState<CypressRunRecord | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
    let active = true;
    const refresh = async (notifyRequestId?: string) => {
      try {
        const response = await fetch("/api/runs", { cache: "no-store" });
        const result = await response.json() as { runs?: CypressRunRecord[]; error?: string };
        if (!response.ok || !result.runs) throw new Error(result.error || "Unable to load Cypress runs");
        if (!active) return;
        setRuns(result.runs);
        setStatusError("");
        const completedRun = notifyRequestId
          ? result.runs.find((run) => run.requestId === notifyRequestId && run.status === "completed")
          : undefined;
        if (completedRun) setCompletionNotice(completedRun);
      } catch (error) {
        if (active) setStatusError(error instanceof Error ? error.message : "Unable to load Cypress runs");
      }
    };
    const channel = supabase.channel(channelName)
      .on("broadcast", { event: "cypress_run_changed" }, ({ payload }) => {
        void refresh(typeof payload?.requestId === "string" ? payload.requestId : undefined);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatusError("Realtime run notifications are unavailable");
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [channelName, supabaseAnonKey, supabaseUrl]);

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <AppHeader currentPage="runs" userName={userName} />
      <Box component="main" sx={{ pb: 7 }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", background: "linear-gradient(115deg, #eef4f0 0%, #f3f1eb 55%, #f5e7df 100%)" }}>
          <Container maxWidth={false} sx={{ py: { xs: 3, md: 5 } }}>
            <Typography variant="overline" color="secondary" sx={{ fontWeight: 800 }}>GitHub Actions</Typography>
            <Typography variant="h1" sx={{ mt: 0.5, fontSize: { xs: 34, md: 52 } }}>Cypress runs</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>Durable run history with webhook-driven status and result updates.</Typography>
          </Container>
        </Box>
        <Container maxWidth={false} sx={{ mt: 3 }}>
          {statusError && <Alert severity="warning" sx={{ mb: 2 }}>{statusError}</Alert>}
          {!runs.length ? (
            <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
              <Typography variant="h6">No Cypress runs</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>Select failures on the Analysis page and start a run.</Typography>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                {runs.map((run) => (
                  <Box key={run.requestId} sx={{ px: 2.5, py: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(180px, .8fr) minmax(300px, 1.8fr) minmax(220px, 1fr) auto" }, gap: 2, alignItems: "center" }}>
                    <Box>
                      <Chip size="small" icon={runIcon(run)} color={runColor(run)} label={run.status === "completed" ? run.conclusion || "completed" : run.status.replace("_", " ")} />
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontFamily: "monospace" }}>{run.requestId.slice(0, 8)}{run.runNumber ? ` · #${run.runNumber}` : ""}</Typography>
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{run.specs.length} {run.specs.length === 1 ? "spec" : "specs"} · {run.runs} {run.runs === 1 ? "run" : "runs"} each</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={run.specs.join("\n")}>{run.specs.join(", ")}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2">{run.browser} · {run.threads} {run.threads === 1 ? "thread" : "threads"} · {formatRunDuration(run)}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {run.environment || "Configured environment"} · {Object.keys(run.cypressConfig).length ? `${Object.keys(run.cypressConfig).length} Cypress overrides` : "Default Cypress config"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{run.artifactCount ? `${run.artifactCount} result artifact${run.artifactCount === 1 ? "" : "s"}` : run.status === "completed" ? "No artifacts" : "Results pending"}</Typography>
                    </Box>
                    <Button size="small" endIcon={<LaunchRounded />} component={Link} href={run.actionsUrl} target="_blank" rel="noreferrer">Actions</Button>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}
        </Container>
      </Box>
      <Snackbar open={Boolean(completionNotice)} autoHideDuration={15000} onClose={() => setCompletionNotice(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={completionNotice?.conclusion === "success" ? "success" : "error"} variant="filled" action={<Button color="inherit" size="small" component={Link} href={completionNotice?.actionsUrl || "#"} target="_blank">View results</Button>}>
          Cypress run {completionNotice?.requestId.slice(0, 8)} {completionNotice?.conclusion || "completed"}.
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
