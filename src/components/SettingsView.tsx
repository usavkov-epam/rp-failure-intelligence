"use client";

import { useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Container, CssBaseline, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, TextField, ThemeProvider,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";

import type { CypressProfileInput, CypressProfileView, DashboardSettingsInput, DashboardSettingsView } from "@/lib/user-settings-schema";
import AppHeader from "./AppHeader";
import { appTheme } from "./app-theme";

const emptyDashboard: DashboardSettingsInput = {
  reportPortalApiUrl: "https://report-portal.example.org/api/v1",
  reportPortalApiKey: "",
  testRailBaseUrl: "",
  testRailApiUser: "",
  testRailApiKey: "",
  defaultProject: "cypress-nightly",
  defaultLaunchName: "runNightlyEurekaReleaseTests-non-ecs",
  defaultTeam: "thunderjet",
  defaultHistoryDepth: 10,
};

const emptyProfile: CypressProfileInput = {
  name: "",
  baseUrl: "",
  okapiHost: "",
  tenant: "",
  login: "",
  password: "",
  edgeHost: "",
  edgeApiKey: "",
  rtrAuth: false,
  ecsEnabled: false,
  eureka: true,
  systemRoleName: "",
  ecsEnvironment: undefined,
  isDefault: false,
};

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result as T;
}

export default function SettingsView({ initialDashboardSettings, initialCypressProfiles, userName }: {
  initialDashboardSettings: DashboardSettingsView | null;
  initialCypressProfiles: CypressProfileView[];
  userName: string;
}) {
  const [dashboard, setDashboard] = useState<DashboardSettingsInput>({
    reportPortalApiUrl: initialDashboardSettings?.reportPortalApiUrl || emptyDashboard.reportPortalApiUrl,
    reportPortalApiKey: "",
    testRailBaseUrl: initialDashboardSettings?.testRailBaseUrl || "",
    testRailApiUser: initialDashboardSettings?.testRailApiUser || "",
    testRailApiKey: "",
    defaultProject: initialDashboardSettings?.defaultProject || emptyDashboard.defaultProject,
    defaultLaunchName: initialDashboardSettings?.defaultLaunchName || emptyDashboard.defaultLaunchName,
    defaultTeam: initialDashboardSettings?.defaultTeam || emptyDashboard.defaultTeam,
    defaultHistoryDepth: initialDashboardSettings?.defaultHistoryDepth || emptyDashboard.defaultHistoryDepth,
  });
  const [profiles, setProfiles] = useState(initialCypressProfiles);
  const [profile, setProfile] = useState<CypressProfileInput>(emptyProfile);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  const openProfile = (existing?: CypressProfileView) => {
    setEditingId(existing?.id || null);
    setProfile(existing ? {
      name: existing.name,
      baseUrl: existing.baseUrl,
      okapiHost: existing.okapiHost,
      tenant: existing.tenant,
      login: existing.login,
      password: "",
      edgeHost: existing.edgeHost,
      edgeApiKey: "",
      rtrAuth: existing.rtrAuth,
      ecsEnabled: existing.ecsEnabled,
      eureka: existing.eureka,
      systemRoleName: existing.systemRoleName,
      ecsEnvironment: existing.ecsEnvironment,
      isDefault: existing.isDefault,
    } : emptyProfile);
    setDialogOpen(true);
    setMessage(null);
  };

  return <ThemeProvider theme={appTheme}>
    <CssBaseline />
    <AppHeader currentPage="settings" userName={userName} />
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h1" sx={{ fontSize: { xs: 34, md: 48 } }}>Your configuration</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        Credentials are encrypted in Supabase Vault and are never returned after saving. Blank secret fields keep the stored value.
      </Typography>
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5">Dashboard integrations</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>ReportPortal is required. TestRail remains optional.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <TextField label="ReportPortal API URL" value={dashboard.reportPortalApiUrl} onChange={(event) => setDashboard({ ...dashboard, reportPortalApiUrl: event.target.value })} required />
          <TextField label={initialDashboardSettings?.hasReportPortalApiKey ? "ReportPortal API key (stored)" : "ReportPortal API key"} type="password" value={dashboard.reportPortalApiKey || ""} onChange={(event) => setDashboard({ ...dashboard, reportPortalApiKey: event.target.value })} required={!initialDashboardSettings?.hasReportPortalApiKey} />
          <TextField label="Default project" value={dashboard.defaultProject} onChange={(event) => setDashboard({ ...dashboard, defaultProject: event.target.value })} required />
          <TextField label="Default launch name" value={dashboard.defaultLaunchName} onChange={(event) => setDashboard({ ...dashboard, defaultLaunchName: event.target.value })} required />
          <TextField label="Default team" value={dashboard.defaultTeam} onChange={(event) => setDashboard({ ...dashboard, defaultTeam: event.target.value })} required />
          <TextField select label="Default history depth" value={dashboard.defaultHistoryDepth} onChange={(event) => setDashboard({ ...dashboard, defaultHistoryDepth: Number(event.target.value) })}>{[5, 10, 15, 20, 30].map((value) => <MenuItem key={value} value={value}>{value} runs</MenuItem>)}</TextField>
          <TextField label="TestRail base URL (optional)" value={dashboard.testRailBaseUrl || ""} onChange={(event) => setDashboard({ ...dashboard, testRailBaseUrl: event.target.value })} />
          <TextField label="TestRail API user (optional)" value={dashboard.testRailApiUser || ""} onChange={(event) => setDashboard({ ...dashboard, testRailApiUser: event.target.value })} />
          <TextField label={initialDashboardSettings?.hasTestRailApiKey ? "TestRail API key (stored)" : "TestRail API key (optional)"} type="password" value={dashboard.testRailApiKey || ""} onChange={(event) => setDashboard({ ...dashboard, testRailApiKey: event.target.value })} />
        </Box>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<SaveRounded />} disabled={pending} onClick={async () => {
          setPending(true); setMessage(null);
          try {
            await jsonRequest("/api/settings/dashboard", { method: "PUT", body: JSON.stringify(dashboard) });
            setDashboard((current) => ({ ...current, reportPortalApiKey: "", testRailApiKey: "" }));
            setMessage({ severity: "success", text: "Dashboard settings saved." });
          } catch (error) { setMessage({ severity: "error", text: error instanceof Error ? error.message : "Unable to save settings" }); }
          finally { setPending(false); }
        }}>{pending ? <CircularProgress size={20} /> : "Save dashboard settings"}</Button>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2 }}>
          <Box><Typography variant="h5">Cypress profiles</Typography><Typography variant="body2" color="text.secondary">Reusable FOLIO environment settings for selected-spec runs.</Typography></Box>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => openProfile()}>New profile</Button>
        </Stack>
        {!profiles.length && <Alert severity="info" sx={{ mt: 2 }}>Create a profile before starting Cypress runs.</Alert>}
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {profiles.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}>
              <Box><Typography sx={{ fontWeight: 800 }}>{item.name}{item.isDefault ? " · Default" : ""}</Typography><Typography variant="body2" color="text.secondary">{item.baseUrl} · {item.tenant} · {item.login}</Typography></Box>
              <Stack direction="row"><Button startIcon={<EditRounded />} onClick={() => openProfile(item)}>Edit</Button><Button color="error" startIcon={<DeleteOutlineRounded />} onClick={async () => {
                if (!window.confirm(`Delete Cypress profile "${item.name}"?`)) return;
                try { await jsonRequest(`/api/settings/cypress-profiles/${item.id}`, { method: "DELETE" }); setProfiles((current) => current.filter(({ id }) => id !== item.id)); }
                catch (error) { setMessage({ severity: "error", text: error instanceof Error ? error.message : "Unable to delete profile" }); }
              }}>Delete</Button></Stack>
            </Stack>
          </Paper>)}
        </Stack>
      </Paper>
    </Container>

    <Dialog open={dialogOpen} onClose={() => !pending && setDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{editingId ? "Edit Cypress profile" : "New Cypress profile"}</DialogTitle>
      <DialogContent><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, pt: 1 }}>
        <TextField label="Profile name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required />
        <TextField label="FOLIO base URL" value={profile.baseUrl} onChange={(event) => setProfile({ ...profile, baseUrl: event.target.value })} required />
        <TextField label="Okapi / Kong URL" value={profile.okapiHost} onChange={(event) => setProfile({ ...profile, okapiHost: event.target.value })} required />
        <TextField label="Tenant" value={profile.tenant} onChange={(event) => setProfile({ ...profile, tenant: event.target.value })} required />
        <TextField label="Login" value={profile.login} onChange={(event) => setProfile({ ...profile, login: event.target.value })} required />
        <TextField label={editingId ? "Password (stored; blank keeps it)" : "Password"} type="password" value={profile.password || ""} onChange={(event) => setProfile({ ...profile, password: event.target.value })} required={!editingId} />
        <TextField label="Edge URL (optional)" value={profile.edgeHost || ""} onChange={(event) => setProfile({ ...profile, edgeHost: event.target.value })} />
        <TextField label={editingId ? "Edge API key (blank keeps stored value)" : "Edge API key (optional)"} type="password" value={profile.edgeApiKey || ""} onChange={(event) => setProfile({ ...profile, edgeApiKey: event.target.value })} />
        <TextField label="System role (optional)" value={profile.systemRoleName || ""} onChange={(event) => setProfile({ ...profile, systemRoleName: event.target.value })} />
        <TextField select label="ECS environment" value={profile.ecsEnvironment || ""} onChange={(event) => setProfile({ ...profile, ecsEnvironment: event.target.value ? event.target.value as "snapshot" | "sprint" : undefined })}><MenuItem value="">Not set</MenuItem><MenuItem value="snapshot">Snapshot</MenuItem><MenuItem value="sprint">Sprint</MenuItem></TextField>
        <FormControlLabel control={<Checkbox checked={profile.rtrAuth} onChange={(event) => setProfile({ ...profile, rtrAuth: event.target.checked })} />} label="RTR authentication" />
        <FormControlLabel control={<Checkbox checked={profile.ecsEnabled} onChange={(event) => setProfile({ ...profile, ecsEnabled: event.target.checked })} />} label="ECS enabled" />
        <FormControlLabel control={<Checkbox checked={profile.eureka} onChange={(event) => setProfile({ ...profile, eureka: event.target.checked })} />} label="Eureka" />
        <FormControlLabel control={<Checkbox checked={profile.isDefault} onChange={(event) => setProfile({ ...profile, isDefault: event.target.checked })} />} label="Default profile" />
      </Box></DialogContent>
      <DialogActions><Button onClick={() => setDialogOpen(false)} disabled={pending}>Cancel</Button><Button variant="contained" loading={pending} onClick={async () => {
        setPending(true);
        try {
          const result = await jsonRequest<{ profile: CypressProfileView }>(editingId ? `/api/settings/cypress-profiles/${editingId}` : "/api/settings/cypress-profiles", { method: editingId ? "PUT" : "POST", body: JSON.stringify(profile) });
          setProfiles((current) => [...current.filter(({ id }) => id !== result.profile.id).map((item) => result.profile.isDefault ? { ...item, isDefault: false } : item), result.profile].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)));
          setDialogOpen(false); setMessage({ severity: "success", text: `Cypress profile ${editingId ? "updated" : "created"}.` });
        } catch (error) { setMessage({ severity: "error", text: error instanceof Error ? error.message : "Unable to save profile" }); }
        finally { setPending(false); }
      }}>Save profile</Button></DialogActions>
    </Dialog>
  </ThemeProvider>;
}
