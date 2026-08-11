"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultCypressConfigFields, legacyReportFields } from "@/lib/configuration-mappings";
import { dashboardSettingsFormValue } from "@/lib/dashboard-settings-form";
import type { CypressProfileInput, CypressProfileView, DashboardSettingsInput, DashboardSettingsView } from "@/lib/user-settings-schema";
import AppHeader from "./AppHeader";

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
interface ReportDefaultsOptions { projects: string[]; launches: string[] }

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result as T;
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{description && <p className="text-xs text-muted-foreground">{description}</p>}</div>;
}

function StoredSecretField({ label, configured, editing, value, optional, onEditingChange, onChange }: {
  label: string;
  configured: boolean;
  editing: boolean;
  value: string;
  optional?: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (value: string) => void;
}) {
  if (configured && !editing) {
    return <div className="space-y-1.5"><Label>{label}</Label><div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border bg-muted/25 px-3"><Badge variant="secondary" className="gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-600" />Configured securely</Badge><Button type="button" variant="ghost" size="sm" onClick={() => onEditingChange(true)}>Change</Button></div><p className="text-xs text-muted-foreground">The stored value is encrypted and never returned to the browser.</p></div>;
  }
  return <Field label={label} description={configured ? "Enter a replacement value. The current key remains active until you save." : optional ? "Optional." : "Required."}><div className="flex gap-2"><Input type="password" autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={configured ? "Enter replacement key" : "Enter API key"} />{configured && <Button type="button" variant="outline" onClick={() => { onChange(""); onEditingChange(false); }}>Cancel</Button>}</div></Field>;
}

function EditableSection({ title, description, addLabel, onAdd, children }: { title: string; description: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="space-y-3"><div><h3 className="text-lg font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>{children}<Button variant="outline" size="sm" onClick={onAdd}><Plus />{addLabel}</Button></section>;
}

export default function SettingsView({ initialDashboardSettings, initialCypressProfiles, userName, activeProject }: {
  initialDashboardSettings: DashboardSettingsView | null;
  initialCypressProfiles: CypressProfileView[];
  userName: string;
  activeProject?: string;
}) {
  const [dashboard, setDashboard] = useState<DashboardSettingsInput>(() => dashboardSettingsFormValue(initialDashboardSettings, emptyDashboard));
  const [profiles, setProfiles] = useState(initialCypressProfiles);
  const [profile, setProfile] = useState<CypressProfileInput>(emptyProfile);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hasReportPortalKey, setHasReportPortalKey] = useState(Boolean(initialDashboardSettings?.hasReportPortalApiKey));
  const [hasTestRailKey, setHasTestRailKey] = useState(Boolean(initialDashboardSettings?.hasTestRailApiKey));
  const [changingReportPortalKey, setChangingReportPortalKey] = useState(!initialDashboardSettings?.hasReportPortalApiKey);
  const [changingTestRailKey, setChangingTestRailKey] = useState(!initialDashboardSettings?.hasTestRailApiKey);
  const [reportOptions, setReportOptions] = useState<ReportDefaultsOptions>({ projects: [], launches: [] });
  const [reportOptionsLoading, setReportOptionsLoading] = useState(false);
  const [reportOptionsError, setReportOptionsError] = useState("");
  const reportOptionsRequest = useRef<AbortController | null>(null);
  const initialReportDefaults = useRef({
    project: initialDashboardSettings?.defaultProject || emptyDashboard.defaultProject,
    launchName: initialDashboardSettings?.defaultLaunchName || emptyDashboard.defaultLaunchName,
  });

  const loadReportDefaults = useCallback(async (preferredProject: string, preferredLaunch: string) => {
    reportOptionsRequest.current?.abort();
    const controller = new AbortController();
    reportOptionsRequest.current = controller;
    setReportOptionsLoading(true);
    setReportOptionsError("");
    try {
      const projectsResult = await jsonRequest<{ projects: string[] }>("/api/report-source", { method: "GET", signal: controller.signal });
      const project = projectsResult.projects.includes(preferredProject) ? preferredProject : projectsResult.projects[0] || "";
      if (!project) throw new Error("No ReportPortal projects are available for this account");
      const launchesResult = await jsonRequest<{ launches: string[] }>(`/api/report-source?project=${encodeURIComponent(project)}`, { method: "GET", signal: controller.signal });
      const launchName = launchesResult.launches.includes(preferredLaunch) ? preferredLaunch : launchesResult.launches[0] || "";
      setReportOptions({ projects: projectsResult.projects, launches: launchesResult.launches });
      setDashboard((current) => ({ ...current, defaultProject: project, defaultLaunchName: launchName }));
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setReportOptionsError(reason instanceof Error ? reason.message : "Unable to load ReportPortal projects");
    } finally {
      if (reportOptionsRequest.current === controller) {
        reportOptionsRequest.current = null;
        setReportOptionsLoading(false);
      }
    }
  }, []);

  const changeDefaultProject = async (project: string) => {
    reportOptionsRequest.current?.abort();
    const controller = new AbortController();
    reportOptionsRequest.current = controller;
    setDashboard((current) => ({ ...current, defaultProject: project, defaultLaunchName: "" }));
    setReportOptions((current) => ({ ...current, launches: [] }));
    setReportOptionsLoading(true);
    setReportOptionsError("");
    try {
      const result = await jsonRequest<{ launches: string[] }>(`/api/report-source?project=${encodeURIComponent(project)}`, { method: "GET", signal: controller.signal });
      setReportOptions((current) => ({ ...current, launches: result.launches }));
      setDashboard((current) => ({ ...current, defaultLaunchName: result.launches[0] || "" }));
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setReportOptionsError(reason instanceof Error ? reason.message : "Unable to load ReportPortal launches");
    } finally {
      if (reportOptionsRequest.current === controller) {
        reportOptionsRequest.current = null;
        setReportOptionsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (hasReportPortalKey) void loadReportDefaults(initialReportDefaults.current.project, initialReportDefaults.current.launchName);
    return () => reportOptionsRequest.current?.abort();
  }, [hasReportPortalKey, loadReportDefaults]);

  const openProfile = (existing?: CypressProfileView) => {
    setEditingId(existing?.id || null);
    setProfile(existing ? { name: existing.name, baseUrl: existing.baseUrl, isDefault: existing.isDefault, variables: existing.variables.map(({ key, type, value, secret }) => ({ key, type, value, secret })) } : emptyProfile);
    setProfileOpen(true);
  };
  const saveDashboard = async () => {
    setPending(true); setError("");
    try {
      const result = await jsonRequest<{ settings: DashboardSettingsView }>("/api/settings/dashboard", { method: "PUT", body: JSON.stringify(dashboard) });
      setDashboard(dashboardSettingsFormValue(result.settings, emptyDashboard));
      setHasReportPortalKey(result.settings.hasReportPortalApiKey);
      setHasTestRailKey(result.settings.hasTestRailApiKey);
      setChangingReportPortalKey(!result.settings.hasReportPortalApiKey);
      setChangingTestRailKey(!result.settings.hasTestRailApiKey);
      if (result.settings.hasReportPortalApiKey) void loadReportDefaults(result.settings.defaultProject, result.settings.defaultLaunchName);
      setMessage("Settings saved securely.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save settings"); }
    finally { setPending(false); }
  };

  return (
    <>
      <AppHeader currentPage="settings" userName={userName} activeProject={hasReportPortalKey ? activeProject : undefined} />
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <div className="mb-6"><h1 className="text-4xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-muted-foreground">Integrations, global ReportPortal context, configurable fields, and reusable Cypress profiles.</p></div>
        {error && <Alert variant="destructive" className="mb-4"><CircleAlert /><AlertTitle>Unable to save</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {message && <Alert className="mb-4"><AlertTitle>Saved</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
        <Tabs defaultValue="integrations">
          <TabsList className="mb-4"><TabsTrigger value="integrations">Integrations</TabsTrigger><TabsTrigger value="configuration">Configuration & mappings</TabsTrigger><TabsTrigger value="profiles">Cypress profiles</TabsTrigger></TabsList>

          <TabsContent value="integrations">
            <Card><CardHeader><CardTitle>Integrations</CardTitle><CardDescription>Credentials are scoped to your account and encrypted in Supabase Vault.</CardDescription></CardHeader><CardContent className="space-y-6">
              <section className="space-y-4"><div><h3 className="text-lg font-semibold">ReportPortal</h3></div>
                <Field label="ReportPortal API URL"><Input value={dashboard.reportPortalApiUrl} onChange={(event) => setDashboard({ ...dashboard, reportPortalApiUrl: event.target.value })} /></Field>
                <StoredSecretField label="ReportPortal API key" configured={hasReportPortalKey} editing={changingReportPortalKey} value={dashboard.reportPortalApiKey || ""} onEditingChange={setChangingReportPortalKey} onChange={(reportPortalApiKey) => setDashboard({ ...dashboard, reportPortalApiKey })} />
              </section>
              <section className="space-y-4"><div><h3 className="text-lg font-semibold">TestRail <span className="font-normal text-muted-foreground">(optional)</span></h3></div>
                <Field label="TestRail base URL"><Input value={dashboard.testRailBaseUrl || ""} onChange={(event) => setDashboard({ ...dashboard, testRailBaseUrl: event.target.value })} /></Field>
                <Field label="TestRail API user"><Input value={dashboard.testRailApiUser || ""} onChange={(event) => setDashboard({ ...dashboard, testRailApiUser: event.target.value })} /></Field>
                <StoredSecretField label="TestRail API key" configured={hasTestRailKey} editing={changingTestRailKey} value={dashboard.testRailApiKey || ""} optional onEditingChange={setChangingTestRailKey} onChange={(testRailApiKey) => setDashboard({ ...dashboard, testRailApiKey })} />
              </section>
              <Button onClick={saveDashboard} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save integrations</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="configuration">
            <Card><CardHeader><CardTitle>Report source configuration</CardTitle><CardDescription>Choose saved defaults from live ReportPortal data. The active project is switched from the application header.</CardDescription></CardHeader><CardContent className="space-y-8">
              {!hasReportPortalKey ? <Alert><CircleAlert /><AlertTitle>ReportPortal integration required</AlertTitle><AlertDescription>Save a ReportPortal API URL and API key in Integrations before configuring project and launch defaults.</AlertDescription></Alert> : <>
                {reportOptionsError && <Alert variant="destructive"><CircleAlert /><AlertTitle>Unable to load ReportPortal options</AlertTitle><AlertDescription className="flex items-center justify-between gap-3"><span>{reportOptionsError}</span><Button variant="outline" size="sm" onClick={() => void loadReportDefaults(dashboard.defaultProject, dashboard.defaultLaunchName)}>Retry</Button></AlertDescription></Alert>}
                <div className="grid gap-4 md:grid-cols-[1fr_2fr_1fr]">
                  <Field label="Default project" description="Used when no active project has been selected from the header."><Select value={dashboard.defaultProject} disabled={reportOptionsLoading || !reportOptions.projects.length} onValueChange={(project) => void changeDefaultProject(project)}><SelectTrigger className="w-full"><SelectValue placeholder={reportOptionsLoading ? "Loading projects..." : "Select project"} /></SelectTrigger><SelectContent>{reportOptions.projects.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="Default launch name"><Select value={dashboard.defaultLaunchName} disabled={reportOptionsLoading || !reportOptions.launches.length} onValueChange={(defaultLaunchName) => setDashboard({ ...dashboard, defaultLaunchName })}><SelectTrigger className="w-full"><SelectValue placeholder={reportOptionsLoading ? "Loading launches..." : "Select launch"} /></SelectTrigger><SelectContent>{reportOptions.launches.map((launchName) => <SelectItem key={launchName} value={launchName}>{launchName}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="Default history depth"><Input type="number" min={1} max={30} value={dashboard.defaultHistoryDepth} onChange={(event) => setDashboard({ ...dashboard, defaultHistoryDepth: Number(event.target.value) })} /></Field>
                </div>
              </>}
              <EditableSection title="ReportPortal custom fields" description="Every row becomes a typed filter in Report Source. Enum fields render as selections with your configured values." addLabel="Add report field" onAdd={() => setDashboard({ ...dashboard, reportFields: [...dashboard.reportFields, { key: "", label: "", reportPortalParameter: "filter.eq.", type: "text", options: [], defaultValue: "", required: false }] })}>
                {dashboard.reportFields.map((field, index) => <Card key={index}><CardContent className="space-y-4">
                  <div className="grid items-end gap-3 md:grid-cols-[1fr_1.4fr_1fr_auto_auto]">
                    <Field label="Key"><Input value={field.key} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} /></Field>
                    <Field label="Label"><Input value={field.label} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></Field>
                    <Field label="Type"><Select value={field.type} onValueChange={(type: "text" | "enum") => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, type, options: type === "text" ? [] : item.options, defaultValue: type === "enum" && !item.options.includes(item.defaultValue) ? "" : item.defaultValue } : item) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="enum">Enum selection</SelectItem></SelectContent></Select></Field>
                    <label className="flex h-9 items-center gap-2 text-sm"><Checkbox checked={field.required} onCheckedChange={(checked) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, required: checked === true } : item) })} />Required</label>
                    <Button variant="ghost" size="icon" aria-label="Remove report field" onClick={() => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></Button>
                  </div>
                  <div className="grid items-start gap-3 md:grid-cols-3">
                    <Field label="ReportPortal parameter"><Input value={field.reportPortalParameter} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, reportPortalParameter: event.target.value } : item) })} /></Field>
                    {field.type === "enum" ? <Field label="Options" description="One value per line."><Textarea rows={4} value={field.options.join("\n")} onChange={(event) => { const options = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean); setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, options, defaultValue: options.includes(item.defaultValue) ? item.defaultValue : "" } : item) }); }} /></Field> : <div />}
                    <Field label="Default value">{field.type === "enum" ? <Select value={field.defaultValue || "__none"} disabled={!field.options.length} onValueChange={(value) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: value === "__none" ? "" : value } : item) })}><SelectTrigger className="w-full"><SelectValue placeholder="No default" /></SelectTrigger><SelectContent><SelectItem value="__none">No default</SelectItem>{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select> : <Input value={field.defaultValue} onChange={(event) => setDashboard({ ...dashboard, reportFields: dashboard.reportFields.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: event.target.value } : item) })} />}</Field>
                  </div>
                </CardContent></Card>)}
              </EditableSection>
              <EditableSection title="Advanced Cypress run fields" description="Allowlisted cypress.config.js values available in the Run dialog." addLabel="Add run field" onAdd={() => setDashboard({ ...dashboard, cypressConfigFields: [...dashboard.cypressConfigFields, { key: "", label: "", type: "string" }] })}>
                {dashboard.cypressConfigFields.map((field, index) => <Card key={index} className="py-3"><CardContent className="grid items-end gap-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_auto]">
                  <Field label="Cypress key"><Input value={field.key} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} /></Field>
                  <Field label="Label"><Input value={field.label} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></Field>
                  <Field label="Type"><Select value={field.type} onValueChange={(value: "string" | "number" | "boolean") => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, type: value, minimum: undefined, maximum: undefined } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["string", "number", "boolean"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="Minimum"><Input type="number" disabled={field.type !== "number"} value={field.minimum ?? ""} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, minimum: event.target.value === "" ? undefined : Number(event.target.value) } : item) })} /></Field>
                  <Field label="Maximum"><Input type="number" disabled={field.type !== "number"} value={field.maximum ?? ""} onChange={(event) => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.map((item, itemIndex) => itemIndex === index ? { ...item, maximum: event.target.value === "" ? undefined : Number(event.target.value) } : item) })} /></Field>
                  <Button variant="ghost" size="icon" aria-label="Remove run field" onClick={() => setDashboard({ ...dashboard, cypressConfigFields: dashboard.cypressConfigFields.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></Button>
                </CardContent></Card>)}
              </EditableSection>
              <EditableSection title="Launch → profile mappings" description="First matching glob wins. Use * for any text and ? for one character." addLabel="Add mapping" onAdd={() => setDashboard({ ...dashboard, launchProfileMappings: [...dashboard.launchProfileMappings, { pattern: "*", profileId: profiles[0]?.id || "" }] })}>
                {dashboard.launchProfileMappings.map((mapping, index) => <Card key={index} className="py-3"><CardContent className="grid items-end gap-3 md:grid-cols-[2fr_2fr_auto]">
                  <Field label="Launch pattern"><Input value={mapping.pattern} onChange={(event) => setDashboard({ ...dashboard, launchProfileMappings: dashboard.launchProfileMappings.map((item, itemIndex) => itemIndex === index ? { ...item, pattern: event.target.value } : item) })} /></Field>
                  <Field label="Cypress profile"><Select value={mapping.profileId} onValueChange={(profileId) => setDashboard({ ...dashboard, launchProfileMappings: dashboard.launchProfileMappings.map((item, itemIndex) => itemIndex === index ? { ...item, profileId } : item) })}><SelectTrigger><SelectValue placeholder="Choose profile" /></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
                  <Button variant="ghost" size="icon" aria-label="Remove launch mapping" onClick={() => setDashboard({ ...dashboard, launchProfileMappings: dashboard.launchProfileMappings.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></Button>
                </CardContent></Card>)}
                {!profiles.length && <Alert><AlertTitle>No profiles yet</AlertTitle><AlertDescription>Create a Cypress profile before adding mappings.</AlertDescription></Alert>}
              </EditableSection>
              <Button onClick={saveDashboard} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save configuration</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="profiles">
            <Card><CardHeader><CardTitle>Cypress profiles</CardTitle><CardDescription>Generic base URLs and typed environment variables. Sensitive string variables are write-only.</CardDescription></CardHeader><CardContent className="space-y-3">
              {profiles.map((item) => <Card key={item.id} className="py-3"><CardContent className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{item.name}{item.isDefault ? " · Default" : ""}</p><p className="truncate text-xs text-muted-foreground">{item.baseUrl} · {item.variables.length} variables</p></div><div className="flex gap-1"><Button variant="ghost" size="icon-sm" onClick={() => openProfile(item)} aria-label={`Edit ${item.name}`}><Pencil /></Button><Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.name}`} onClick={async () => { if (!window.confirm(`Delete ${item.name}?`)) return; try { await jsonRequest(`/api/settings/cypress-profiles/${item.id}`, { method: "DELETE" }); setProfiles((current) => current.filter(({ id }) => id !== item.id)); setDashboard((current) => ({ ...current, launchProfileMappings: current.launchProfileMappings.filter(({ profileId }) => profileId !== item.id) })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete profile"); } }}><Trash2 /></Button></div></CardContent></Card>)}
              {!profiles.length && <Alert><AlertTitle>No Cypress profiles</AlertTitle><AlertDescription>Create one to run selected specs.</AlertDescription></Alert>}
              <Button onClick={() => openProfile()}><Plus />Add profile</Button>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={profileOpen} onOpenChange={(open) => !pending && setProfileOpen(open)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editingId ? "Edit Cypress profile" : "Add Cypress profile"}</DialogTitle><DialogDescription>Values are used to produce the environment override selected by a run.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <Field label="Profile name"><Input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></Field>
            <Field label="Cypress base URL"><Input value={profile.baseUrl} onChange={(event) => setProfile({ ...profile, baseUrl: event.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={profile.isDefault} onCheckedChange={(checked) => setProfile({ ...profile, isDefault: checked === true })} />Default profile</label>
            <div><h3 className="font-semibold">Environment variables</h3><p className="text-xs text-muted-foreground">Secret values never return to the browser. Leave an existing secret blank to preserve it.</p></div>
            {profile.variables.map((variable, index) => <Card key={index} className="py-3"><CardContent className="grid items-end gap-3 md:grid-cols-[1.2fr_1fr_1.7fr_auto_auto]">
              <Field label="Variable key"><Input value={variable.key} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) })} /></Field>
              <Field label="Type"><Select value={variable.type} disabled={variable.secret} onValueChange={(type: "string" | "number" | "boolean") => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, type } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["string", "number", "boolean"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Value">{variable.type === "boolean" ? <Select value={variable.value || ""} onValueChange={(value) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item) })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent></Select> : <Input type={variable.secret ? "password" : variable.type === "number" ? "number" : "text"} value={variable.value || ""} onChange={(event) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} />}</Field>
              <label className="flex h-8 items-center gap-2 text-sm"><Checkbox checked={variable.secret} onCheckedChange={(checked) => setProfile({ ...profile, variables: profile.variables.map((item, itemIndex) => itemIndex === index ? { ...item, secret: checked === true, type: checked === true ? "string" : item.type } : item) })} />Secret</label>
              <Button variant="ghost" size="icon" onClick={() => setProfile({ ...profile, variables: profile.variables.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></Button>
            </CardContent></Card>)}
            <Button variant="outline" size="sm" onClick={() => setProfile({ ...profile, variables: [...profile.variables, { key: "", type: "string", value: "", secret: false }] })}><Plus />Add variable</Button>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setProfileOpen(false)} disabled={pending}>Cancel</Button><Button disabled={pending} onClick={async () => { setPending(true); setError(""); try { const result = await jsonRequest<{ profile: CypressProfileView }>(editingId ? `/api/settings/cypress-profiles/${editingId}` : "/api/settings/cypress-profiles", { method: editingId ? "PUT" : "POST", body: JSON.stringify(profile) }); setProfiles((current) => editingId ? current.map((item) => item.id === editingId ? result.profile : item).map((item) => ({ ...item, isDefault: result.profile.isDefault ? item.id === result.profile.id : item.isDefault })) : [...current.map((item) => ({ ...item, isDefault: result.profile.isDefault ? false : item.isDefault })), result.profile]); setProfileOpen(false); setMessage("Cypress profile saved securely."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save profile"); } finally { setPending(false); } }}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save profile</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
