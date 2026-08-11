"use client";

import { useState } from "react";
import {
  Alert, Box, Button, Checkbox, Container, CssBaseline, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select,
  Stack, Tab, Tabs, TextField, ThemeProvider, Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";

import { defaultCypressConfigFields, legacyReportFields } from "@/lib/configuration-mappings";
import type {
  CypressProfileInput, CypressProfileView, DashboardSettingsInput, DashboardSettingsView,
} from "@/lib/user-settings-schema";
import AppHeader from "./AppHeader";
import { appTheme } from "./app-theme";

const emptyDashboard: DashboardSettingsInput = {
  reportPortalApiUrl: "https://report-portal.example.org/api/v1",
  reportPortalApiKey: "",
  testRailBaseUrl: "",
  testRailApiUser: "",
  testRailApiKey: "",
  defaultProject: "default",
  defaultLaunchName: "nightly",
  defaultHistoryDepth: 10,
  reportFields: legacyReportFields,
  cypressConfigFields: defaultCypressConfigFields,
  launchProfileMappings: [],
};

const emptyProfile: CypressProfileInput = { name: "", baseUrl: "", variables: [], isDefault: false };

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
  const [section, setSection] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardSettingsInput>({
    ...emptyDashboard,
    ...initialDashboardSettings,
    reportPortalApiKey: "",
    testRailApiKey: "",
  });
  const [profiles, setProfiles] = useState(initialCypressProfiles);
  const [profile, setProfile] = useState<CypressProfileInput>(emptyProfile);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const openProfile = (existing?: CypressProfileView) => {
    setEditingId(existing?.id || null);
    setProfile(existing ? {
      name: existing.name,
      baseUrl: existing.baseUrl,
      isDefault: existing.isDefault,
      variables: existing.variables.map(({ key, type, value, secret }) => ({ key, type, value, secret })),
    } : emptyProfile);
    setProfileOpen(true);
  };

  const saveDashboard = async () => {
    setPending(true);
    setError("");
    try {
      const result = await jsonRequest<{ settings: DashboardSettingsView }>("/api/settings/dashboard", {
        method: "PUT",
        body: JSON.stringify(dashboard),
      });
      setDashboard((current) => ({ ...current, ...result.settings, reportPortalApiKey: "", testRailApiKey: "" }));
      setMessage("Settings saved securely.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save settings");
    } finally {
      setPending(false);
    }
  };

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <AppHeader currentPage="settings" userName={userName} />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h1" sx={{ fontSize: { xs: 34, md: 48 } }}>Settings</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Configure integrations, portal mappings, and reusable Cypress run profiles for your account.
        </Typography>
        {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" onClose={() => setMessage("")} sx={{ mb: 2 }}>{message}</Alert>}
        <Paper variant="outlined">
          <Tabs value={section} onChange={(_, value: number) => setSection(value)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Tab label="Integrations" />
            <Tab label="Configuration & mappings" />
            <Tab label="Cypress profiles" />
          </Tabs>

          {section === 0 && (
            <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
              <Box>
                <Typography variant="h5">ReportPortal</Typography>
                <Typography variant="body2" color="text.secondary">Credentials belong to your account and are encrypted in Supabase Vault.</Typography>
              </Box>
              <TextField label="ReportPortal API URL" value={dashboard.reportPortalApiUrl} onChange={(event) => setDashboard({ ...dashboard, reportPortalApiUrl: event.target.value })} required />
              <TextField label="ReportPortal API key" type="password" value={dashboard.reportPortalApiKey || ""} onChange={(event) => setDashboard({ ...dashboard, reportPortalApiKey: event.target.value })} helperText={initialDashboardSettings?.hasReportPortalApiKey ? "Configured. Leave blank to keep the existing key." : "Required."} />
              <Box sx={{ pt: 1 }}>
                <Typography variant="h5">TestRail (optional)</Typography>
              </Box>
              <TextField label="TestRail base URL" value={dashboard.testRailBaseUrl || ""} onChange={(event) => setDashboard({ ...dashboard, testRailBaseUrl: event.target.value })} />
              <TextField label="TestRail API user" value={dashboard.testRailApiUser || ""} onChange={(event) => setDashboard({ ...dashboard, testRailApiUser: event.target.value })} />
              <TextField label="TestRail API key" type="password" value={dashboard.testRailApiKey || ""} onChange={(event) => setDashboard({ ...dashboard, testRailApiKey: event.target.value })} helperText={initialDashboardSettings?.hasTestRailApiKey ? "Configured. Leave blank to keep the existing key." : "Optional."} />
              <Button startIcon={<SaveRounded />} variant="contained" loading={pending} onClick={saveDashboard} sx={{ alignSelf: "flex-start" }}>Save integrations</Button>
            </Stack>
          )}

          {section === 1 && (
            <Stack spacing={4} sx={{ p: { xs: 2, md: 3 } }}>
              <Box>
                <Typography variant="h5">Report defaults</Typography>
                <Typography variant="body2" color="text.secondary">These values initialize the Project → Launch name → Run flow.</Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr 1fr" }, gap: 2 }}>
                <TextField label="Default project" value={dashboard.defaultProject} onChange={(event) => setDashboard({ ...dashboard, defaultProject: event.target.value })} required />
                <TextField label="Default launch name" value={dashboard.defaultLaunchName} onChange={(event) => setDashboard({ ...dashboard, defaultLaunchName: event.target.value })} required />
                <TextField label="History depth" type="number" value={dashboard.defaultHistoryDepth} slotProps={{ htmlInput: { min: 1, max: 30 } }} onChange={(event) => setDashboard({ ...dashboard, defaultHistoryDepth: Number(event.target.value) })} required />
              </Box>

              <EditableList title="Report fields" description="Each field becomes a dashboard input and a ReportPortal filter parameter." addLabel="Add report field" onAdd={() => setDashboard({ ...dashboard, reportFields: [...dashboard.reportFields, { key: "", label: "", reportPortalParameter: "filter.eq.", defaultValue: "", required: false }] })}>
                {dashboard.reportFields.map((field, index) => (
                  <Box key={index} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.4fr 1.7fr 1.4fr auto auto" }, gap: 1, alignItems: "center" }}>
                    <TextField size="small" label="Field key" value={field.key} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} />
                    <TextField size="small" label="Label" value={field.label} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} />
                    <TextField size="small" label="ReportPortal parameter" value={field.reportPortalParameter} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, reportPortalParameter: event.target.value } : item) })} />
                    <TextField size="small" label="Default value" value={field.defaultValue} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: event.target.value } : item) })} />
                    <FormControlLabel control={<Checkbox checked={field.required} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item) })} />} label="Required" />
                    <IconButton aria-label="Remove report field" onClick={() => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.filter((_, itemIndex) => itemIndex !== index) })}><DeleteOutlineRounded /></IconButton>
                  </Box>
                ))}
              </EditableList>

              <EditableList title="Advanced Cypress run fields" description="Choose exactly which cypress.config.js keys users may override from the run dialog." addLabel="Add run field" onAdd={() => setDashboard({ ...dashboard, cypressConfigFields: [...dashboard.cypressConfigFields, { key: "", label: "", type: "string" }] })}>
                {dashboard.cypressConfigFields.map((field, index) => (
                  <Box key={index} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.5fr 1fr 1fr 1fr auto" }, gap: 1, alignItems: "center" }}>
                    <TextField size="small" label="Cypress key" value={field.key} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} />
                    <TextField size="small" label="Label" value={field.label} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} />
                    <TextField size="small" select label="Type" value={field.type} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as "string" | "number" | "boolean", minimum: undefined, maximum: undefined } : item) })}>{["string", "number", "boolean"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
                    <TextField size="small" label="Minimum" type="number" disabled={field.type !== "number"} value={field.minimum ?? ""} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, minimum: event.target.value === "" ? undefined : Number(event.target.value) } : item) })} />
                    <TextField size="small" label="Maximum" type="number" disabled={field.type !== "number"} value={field.maximum ?? ""} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, maximum: event.target.value === "" ? undefined : Number(event.target.value) } : item) })} />
                    <IconButton aria-label="Remove run field" onClick={() => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.filter((_, itemIndex) => itemIndex !== index) })}><DeleteOutlineRounded /></IconButton>
                  </Box>
                ))}
              </EditableList>

              <EditableList title="Launch → profile mappings" description="First matching rule wins. Use * for any text and ? for one character." addLabel="Add mapping" onAdd={() => setDashboard({ ...dashboard, launchProfileMappings: [...dashboard.launchProfileMappings, { pattern: "*", profileId: profiles[0]?.id || "" }] })}>
                {dashboard.launchProfileMappings.map((mapping, index) => (
                  <Box key={index} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 2fr auto" }, gap: 1, alignItems: "center" }}>
                    <TextField size="small" label="Launch name pattern" value={mapping.pattern} onChange={(event) => setDashboard({ ...dashboard, launchProfileMappings: dashboard.launchProfileMappings.map((item, itemIndex) => itemIndex === index ? { ...item, pattern: event.target.value } : item) })} />
                    <TextField size="small" select label="Cypress profile" value={mapping.profileId} onChange={(event) => setDashboard({ ...dashboard, launchProfileMappings: dashboard.launchProfileMappings.map((item, itemIndex) => itemIndex === index ? { ...item, profileId: event.target.value } : item) })}>{profiles.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
                    <IconButton aria-label="Remove launch mapping" onClick={() => setDashboard({ ...dashboard, launchProfileMappings: dashboard.launchProfileMappings.filter((_, itemIndex) => itemIndex !== index) })}><DeleteOutlineRounded /></IconButton>
                  </Box>
                ))}
                {!profiles.length && <Alert severity="info">Create a Cypress profile before adding launch mappings.</Alert>}
              </EditableList>
              <Button startIcon={<SaveRounded />} variant="contained" loading={pending} onClick={saveDashboard} sx={{ alignSelf: "flex-start" }}>Save configuration</Button>
            </Stack>
          )}

          {section === 2 && (
            <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>
              <Box>
                <Typography variant="h5">Cypress profiles</Typography>
                <Typography variant="body2" color="text.secondary">Profiles are generic base URLs plus typed environment variables. Mark sensitive string variables as secret.</Typography>
              </Box>
              {profiles.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                    <Box><Typography sx={{ fontWeight: 700 }}>{item.name}{item.isDefault ? " · Default" : ""}</Typography><Typography variant="caption" color="text.secondary">{item.baseUrl} · {item.variables.length} variables</Typography></Box>
                    <Stack direction="row"><IconButton aria-label={`Edit ${item.name}`} onClick={() => openProfile(item)}><EditRounded /></IconButton><IconButton aria-label={`Delete ${item.name}`} onClick={async () => { if (!window.confirm(`Delete ${item.name}?`)) return; try { await jsonRequest(`/api/settings/cypress-profiles/${item.id}`, { method: "DELETE" }); setProfiles((current) => current.filter(({ id }) => id !== item.id)); setDashboard((current) => ({ ...current, launchProfileMappings: current.launchProfileMappings.filter(({ profileId }) => profileId !== item.id) })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete profile"); } }}><DeleteOutlineRounded /></IconButton></Stack>
                  </Stack>
                </Paper>
              ))}
              {!profiles.length && <Alert severity="info">No Cypress profiles have been created yet.</Alert>}
              <Button startIcon={<AddRounded />} variant="contained" onClick={() => openProfile()} sx={{ alignSelf: "flex-start" }}>Add profile</Button>
            </Stack>
          )}
        </Paper>
      </Container>

      <Dialog open={profileOpen} onClose={() => !pending && setProfileOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingId ? "Edit Cypress profile" : "Add Cypress profile"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Profile name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required />
            <TextField label="Cypress base URL" value={profile.baseUrl} onChange={(event) => setProfile({ ...profile, baseUrl: event.target.value })} required />
            <FormControlLabel control={<Checkbox checked={profile.isDefault} onChange={(event) => setProfile({ ...profile, isDefault: event.target.checked })} />} label="Default profile" />
            <Box><Typography variant="h6">Environment variables</Typography><Typography variant="caption" color="text.secondary">Secret values are never returned to the browser. Leave an existing secret blank to keep it.</Typography></Box>
            {profile.variables.map((variable, index) => (
              <Box key={index} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr 2fr auto auto" }, gap: 1, alignItems: "center" }}>
                <TextField size="small" label="Variable key" value={variable.key} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} />
                <FormControl size="small"><InputLabel>Type</InputLabel><Select label="Type" value={variable.type} disabled={variable.secret} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as "string" | "number" | "boolean" } : item) })}>{["string", "number", "boolean"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
                {variable.type === "boolean" ? <FormControl size="small"><InputLabel>Value</InputLabel><Select label="Value" value={variable.value || ""} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })}><MenuItem value="true">true</MenuItem><MenuItem value="false">false</MenuItem></Select></FormControl> : <TextField size="small" label="Value" type={variable.secret ? "password" : variable.type === "number" ? "number" : "text"} value={variable.value || ""} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} />}
                <FormControlLabel control={<Checkbox checked={variable.secret} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, secret: event.target.checked, type: event.target.checked ? "string" : item.type } : item) })} />} label="Secret" />
                <IconButton aria-label="Remove variable" onClick={() => setProfile({ ...profile, variables: profile.variables.filter((_, itemIndex) => itemIndex !== index) })}><DeleteOutlineRounded /></IconButton>
              </Box>
            ))}
            <Button startIcon={<AddRounded />} variant="outlined" onClick={() => setProfile({ ...profile, variables: [...profile.variables, { key: "", type: "string", value: "", secret: false }] })} sx={{ alignSelf: "flex-start" }}>Add variable</Button>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setProfileOpen(false)} disabled={pending}>Cancel</Button><Button variant="contained" loading={pending} onClick={async () => { setPending(true); setError(""); try { const result = await jsonRequest<{ profile: CypressProfileView }>(editingId ? `/api/settings/cypress-profiles/${editingId}` : "/api/settings/cypress-profiles", { method: editingId ? "PUT" : "POST", body: JSON.stringify(profile) }); setProfiles((current) => editingId ? current.map((item) => item.id === editingId ? result.profile : item).map((item) => ({ ...item, isDefault: result.profile.isDefault ? item.id === result.profile.id : item.isDefault })) : [...current.map((item) => ({ ...item, isDefault: result.profile.isDefault ? false : item.isDefault })), result.profile]); setProfileOpen(false); setMessage("Cypress profile saved securely."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save profile"); } finally { setPending(false); } }}>Save profile</Button></DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}

function EditableList({ title, description, addLabel, onAdd, children }: { title: string; description: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return <Stack spacing={1.5}><Box><Typography variant="h5">{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>{children}<Button startIcon={<AddRounded />} variant="outlined" onClick={onAdd} sx={{ alignSelf: "flex-start" }}>{addLabel}</Button></Stack>;
}
