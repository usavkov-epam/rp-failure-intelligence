"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Clipboard, Loader2, Play, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CypressConfigOverrides } from "@/lib/cypress-run-request";
import type { DashboardData, ReportSelection, ReportSourceOptions, Risk } from "@/lib/types";
import type { CypressConfigField, ReportFieldMapping } from "@/lib/user-settings-schema";
import AppHeader from "./AppHeader";
import FailureTable from "./FailureTable";

interface ReportSourceChildrenResponse { launchName?: string; launches: string[]; launchRuns: ReportSourceOptions["launchRuns"]; error?: string }
interface CypressRunFormOptions { runs: number; threads: number; browser: "chrome" | "electron"; timeoutSeconds: number; profileId: string; cypressConfig: CypressConfigOverrides }
const risks: Risk[] = ["Persistent", "High risk", "Intermittent", "Isolated"];

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="relative gap-0 overflow-hidden border-0 py-5 shadow-sm ring-1 ring-foreground/8 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary/75"><CardContent className="pl-5"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function Trend({ data }: { data: DashboardData }) {
  return <Card className="shadow-sm"><CardHeader><CardTitle>Current failure cohort</CardTitle><CardDescription>Status history for tests failing in {data.meta.launchNumber === null ? "the selected launch" : `launch #${data.meta.launchNumber}`}.</CardDescription></CardHeader><CardContent><div className="flex h-48 items-end gap-2 overflow-x-auto rounded-lg bg-muted/35 px-4 pt-5">{!data.trend.length && <p className="self-center text-sm text-muted-foreground">No live history is available.</p>}{data.trend.map((point) => { const total = point.passed + point.failed + point.other || 1; return <div key={point.launchNumber} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end"><div className="flex h-32 w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md bg-muted shadow-sm" title={`${point.failed} failed, ${point.passed} passed`}><span className="bg-destructive" style={{ height: `${point.failed / total * 100}%` }} /><span className="bg-emerald-600" style={{ height: `${point.passed / total * 100}%` }} /></div><span className="mt-2 text-[11px] text-muted-foreground">#{point.launchNumber}</span></div>; })}</div></CardContent></Card>;
}

function Distribution({ data }: { data: DashboardData }) {
  const groups = [["Persistent", data.metrics.persistent, "bg-destructive"], ["High risk", data.metrics.highRisk, "bg-amber-600"], ["Intermittent", data.metrics.intermittent, "bg-sky-600"], ["Isolated", data.metrics.isolated, "bg-emerald-600"]] as const;
  const maximum = Math.max(1, ...groups.map(([, count]) => count));
  return <Card className="shadow-sm"><CardHeader><CardTitle>Risk distribution</CardTitle><CardDescription>Failure frequency across returned history.</CardDescription></CardHeader><CardContent className="space-y-5">{groups.map(([label, count, color]) => <div key={label}><div className="flex justify-between text-sm"><span className="font-medium">{label}</span><strong className="tabular-nums">{count}</strong></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${count / maximum * 100}%` }} /></div></div>)}</CardContent></Card>;
}

function FormField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={`min-w-0 space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>; }

export default function Dashboard({ initialData, reportSelection, reportSourceOptions, sourceRepository, cypressProfiles, reportFields, cypressConfigFields, suggestedProfileId, user }: {
  initialData: DashboardData;
  reportSelection: ReportSelection;
  reportSourceOptions: ReportSourceOptions;
  sourceRepository: { owner: string; repository: string; ref: string };
  cypressProfiles: ReadonlyArray<{ id: string; name: string; isDefault: boolean }>;
  reportFields: ReportFieldMapping[];
  cypressConfigFields: CypressConfigField[];
  suggestedProfileId: string;
  user: { name: string };
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runPending, setRunPending] = useState(false);
  const [runError, setRunError] = useState("");
  const [runOptions, setRunOptions] = useState<CypressRunFormOptions>({ runs: 5, threads: 1, browser: "chrome", timeoutSeconds: 600, profileId: suggestedProfileId, cypressConfig: {} });
  const [draftSource, setDraftSource] = useState(reportSelection);
  const [draftSourceOptions, setDraftSourceOptions] = useState(reportSourceOptions);
  const [sourceLoading, setSourceLoading] = useState<"launches" | "runs" | null>(null);
  const [sourceLoadError, setSourceLoadError] = useState("");
  const sourceRequestRef = useRef<AbortController | null>(null);
  const stableSourceRef = useRef({ selection: reportSelection, options: reportSourceOptions });
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const latestLaunchId = reportSourceOptions.launchRuns[0]?.id;
  const isHistoricalRun = reportSelection.launchId !== undefined && latestLaunchId !== undefined && reportSelection.launchId !== latestLaunchId;
  const modules = useMemo(() => [...new Set(initialData.rows.map((row) => row.module))].sort(), [initialData.rows]);
  const rows = useMemo(() => initialData.rows.filter((row) => (!deferredSearch || `${row.name} ${row.specPath}`.toLowerCase().includes(deferredSearch)) && (!risk || row.risk === risk) && (!moduleName || row.module === moduleName)), [deferredSearch, initialData.rows, moduleName, risk]);
  const handleSelectedSpecs = useCallback((specs: string[]) => setSelectedSpecs(specs), []);

  useEffect(() => () => sourceRequestRef.current?.abort(), []);
  const cancelSourceLoad = () => { sourceRequestRef.current?.abort(); sourceRequestRef.current = null; setDraftSource(stableSourceRef.current.selection); setDraftSourceOptions(stableSourceRef.current.options); setSourceLoadError(""); setSourceLoading(null); };
  const loadSourceChildren = async (requestedLaunchName: string | undefined, loading: "launches" | "runs") => {
    sourceRequestRef.current?.abort();
    const controller = new AbortController(); sourceRequestRef.current = controller; setSourceLoading(loading); setSourceLoadError("");
    setDraftSource((current) => ({ ...current, launchName: requestedLaunchName || "", launchId: undefined }));
    setDraftSourceOptions((current) => ({ ...current, launches: loading === "launches" ? [] : current.launches, launchRuns: [] }));
    const query = new URLSearchParams({ project: reportSelection.project }); if (requestedLaunchName) query.set("launchName", requestedLaunchName);
    try {
      const response = await fetch(`/api/report-source?${query}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json() as ReportSourceChildrenResponse;
      if (!response.ok) throw new Error(result.error || "Unable to load report source options");
      if (sourceRequestRef.current !== controller) return;
      const nextSelection: ReportSelection = { ...stableSourceRef.current.selection, launchName: result.launchName || "", launchId: result.launchRuns[0]?.id };
      const nextOptions: ReportSourceOptions = { projects: stableSourceRef.current.options.projects, launches: result.launches, launchRuns: result.launchRuns };
      stableSourceRef.current = { selection: nextSelection, options: nextOptions }; setDraftSource(nextSelection); setDraftSourceOptions(nextOptions);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (sourceRequestRef.current !== controller) return;
      setDraftSource(stableSourceRef.current.selection); setDraftSourceOptions(stableSourceRef.current.options); setSourceLoadError(error instanceof Error ? error.message : "Unable to load report source options");
    } finally { if (sourceRequestRef.current === controller) { sourceRequestRef.current = null; setSourceLoading(null); } }
  };
  const setCypressConfig = (key: string, value: string | number | boolean | undefined) => setRunOptions((current) => { const cypressConfig = { ...current.cypressConfig }; if (value === undefined) delete cypressConfig[key]; else cypressConfig[key] = value; return { ...current, cypressConfig }; });

  return <>
    <AppHeader currentPage="analysis" userName={user.name} sourceStatus={initialData.meta.source} activeProject={initialData.meta.project} />
    <main className="pb-16">
      <section className="border-b bg-gradient-to-br from-background via-background to-destructive/5"><div className="mx-auto max-w-[1600px] px-4 py-7 lg:px-8"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{initialData.meta.project}</p><h1 className="mt-2 max-w-5xl break-words text-3xl font-semibold tracking-[-0.035em] lg:text-4xl">{initialData.meta.launchName}</h1><div className="mt-4 flex flex-wrap gap-2">{initialData.meta.launchNumber !== null && <Badge>Launch #{initialData.meta.launchNumber}</Badge>}{initialData.meta.launchId !== null && <Badge variant="outline">ID {initialData.meta.launchId}</Badge>}<Badge variant={initialData.meta.launchStatus === "PASSED" ? "secondary" : "destructive"}>{initialData.meta.launchStatus}</Badge><Badge variant="outline">{initialData.meta.historyDepth}-run history</Badge>{initialData.meta.fields.filter(({ value }) => value).map(({ key, label, value }) => <Badge key={key} variant="outline">{label}: {value}</Badge>)}</div></div></section>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 lg:px-8">
        <Card className="shadow-sm"><CardHeader className="border-b bg-muted/20"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Report source</CardTitle><CardDescription className="mt-1">Project <strong>{reportSelection.project}</strong> is your global workspace context.</CardDescription></div><Button asChild variant="outline" size="sm"><Link href="/settings"><Settings2 />Configure fields</Link></Button></div></CardHeader><CardContent>
          <form action="/" method="get" className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-12">
            <FormField label="Launch name" className="xl:col-span-4"><Select name="launchName" value={draftSource.launchName} disabled={sourceLoading === "launches"} onValueChange={(value) => void loadSourceChildren(value, "runs")}><SelectTrigger className="w-full"><SelectValue placeholder="Select launch" /></SelectTrigger><SelectContent>{draftSourceOptions.launches.map((launchName) => <SelectItem key={launchName} value={launchName}>{launchName}</SelectItem>)}</SelectContent></Select></FormField>
            <FormField label="Run" className="xl:col-span-2"><Select name="launchId" value={draftSource.launchId === undefined ? "" : String(draftSource.launchId)} disabled={Boolean(sourceLoading) || !draftSourceOptions.launchRuns.length} onValueChange={(value) => { const selection = { ...draftSource, launchId: Number(value) }; stableSourceRef.current = { ...stableSourceRef.current, selection }; setDraftSource(selection); }}><SelectTrigger className="w-full"><SelectValue placeholder="Select run" /></SelectTrigger><SelectContent>{draftSourceOptions.launchRuns.map((run, index) => <SelectItem key={run.id} value={String(run.id)}>#{run.number} · {run.status}{index === 0 ? " · Latest" : ""}</SelectItem>)}</SelectContent></Select></FormField>
            {reportFields.map((field) => <FormField key={field.key} label={field.label} className="xl:col-span-2"><Input name={`field.${field.key}`} defaultValue={reportSelection.fields[field.key] || ""} required={field.required} /></FormField>)}
            <FormField label="History depth" className="xl:col-span-2"><Select name="historyDepth" defaultValue={String(reportSelection.historyDepth)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[5, 10, 15, 20, 30].map((value) => <SelectItem key={value} value={String(value)}>{value} runs</SelectItem>)}</SelectContent></Select></FormField>
            <div className="flex gap-2 md:col-span-2 xl:col-span-2">{sourceLoading && <Button type="button" variant="ghost" onClick={cancelSourceLoad}>Cancel</Button>}<Button className="min-w-24" type="submit" disabled={Boolean(sourceLoading) || !draftSource.launchName || draftSource.launchId === undefined}>{sourceLoading ? <Loader2 className="animate-spin" /> : null}Apply</Button></div>
          </form>
          {sourceLoadError && <Alert variant="destructive" className="mt-3"><CircleAlert /><AlertTitle>Unable to load source</AlertTitle><AlertDescription>{sourceLoadError}</AlertDescription></Alert>}
        </CardContent></Card>
        {isHistoricalRun && <Alert><CircleAlert /><AlertTitle>Historical run selected</AlertTitle><AlertDescription>You are analyzing launch #{initialData.meta.launchNumber}; latest is #{reportSourceOptions.launchRuns[0]?.number}.</AlertDescription></Alert>}
        {initialData.meta.error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Failed to load ReportPortal data</AlertTitle><AlertDescription>{initialData.meta.error}</AlertDescription></Alert>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Current suite failure rate" value={`${initialData.metrics.suiteFailureRate.toFixed(1)}%`} detail={`${initialData.metrics.suiteFailed} failed of ${initialData.metrics.suiteTotal} filtered tests`} /><Metric label="Failed test identities" value={String(initialData.rows.length)} detail={`${new Set(initialData.rows.map((row) => row.specPath)).size} unique Cypress specs`} /><Metric label="Historical cohort failures" value={`${initialData.metrics.cohortExecutions ? Math.round(initialData.metrics.cohortFailures / initialData.metrics.cohortExecutions * 100) : 0}%`} detail={`${initialData.metrics.cohortFailures} of ${initialData.metrics.cohortExecutions} observations`} /><Metric label="Immediate regressions" value={String(initialData.metrics.regressions)} detail="Current failures preceded by a passed run" /></div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"><Trend data={initialData} /><Distribution data={initialData} /></div>
        <Card className="py-4 shadow-sm"><CardContent className="flex flex-wrap items-end gap-3"><FormField label="Search" className="w-full sm:w-80"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tests or specs" /></FormField><FormField label="Risk"><Select value={risk || "all"} onValueChange={(value) => setRisk(value === "all" ? "" : value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All risks</SelectItem>{risks.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Module"><Select value={moduleName || "all"} onValueChange={(value) => setModuleName(value === "all" ? "" : value)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All modules</SelectItem>{modules.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField><div className="ml-auto flex gap-2"><Button variant="outline" disabled={!selectedSpecs.length} onClick={async () => { await navigator.clipboard.writeText(selectedSpecs.join("\n")); toast.success(`${selectedSpecs.length} spec path${selectedSpecs.length === 1 ? "" : "s"} copied`); }}><Clipboard />Copy {selectedSpecs.length || "selected"}</Button><Button disabled={!selectedSpecs.length} onClick={() => { setRunError(""); setRunDialogOpen(true); }}><Play />Run selected</Button></div></CardContent></Card>
        <FailureTable rows={rows} historyDepth={initialData.meta.historyDepth} sourceRepository={sourceRepository} onSelectedSpecs={handleSelectedSpecs} />
      </div>
    </main>

    <Dialog open={runDialogOpen} onOpenChange={(open) => !runPending && setRunDialogOpen(open)}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Run selected Cypress specs</DialogTitle><DialogDescription>{selectedSpecs.length} unique {selectedSpecs.length === 1 ? "spec" : "specs"} will run in GitHub Actions.</DialogDescription></DialogHeader><div className="space-y-4">
      <FormField label="Cypress profile"><Select value={runOptions.profileId} onValueChange={(profileId) => setRunOptions((current) => ({ ...current, profileId }))}><SelectTrigger><SelectValue placeholder="Choose profile" /></SelectTrigger><SelectContent>{cypressProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}{profile.isDefault ? " · Default" : ""}</SelectItem>)}</SelectContent></Select>{!cypressProfiles.length && <p className="text-xs text-muted-foreground">Create a Cypress profile in Settings first.</p>}</FormField>
      <div className="grid gap-3 sm:grid-cols-2"><FormField label="Runs per spec"><Input type="number" min={1} max={20} value={runOptions.runs} onChange={(event) => setRunOptions((current) => ({ ...current, runs: Number(event.target.value) }))} /></FormField><FormField label="Concurrent threads"><Input type="number" min={1} max={4} value={runOptions.threads} onChange={(event) => setRunOptions((current) => ({ ...current, threads: Number(event.target.value) }))} /></FormField><FormField label="Browser"><Select value={runOptions.browser} onValueChange={(browser: "chrome" | "electron") => setRunOptions((current) => ({ ...current, browser }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="chrome">Chrome</SelectItem><SelectItem value="electron">Electron</SelectItem></SelectContent></Select></FormField><FormField label="Per-run timeout (seconds)"><Input type="number" min={60} max={1200} value={runOptions.timeoutSeconds} onChange={(event) => setRunOptions((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))} /></FormField></div>
      <Accordion type="single" collapsible><AccordionItem value="advanced"><AccordionTrigger><span><span className="block text-left">Advanced Cypress configuration</span><span className="block text-left text-xs font-normal text-muted-foreground">Blank values inherit from the profile and cypress.config.js.</span></span></AccordionTrigger><AccordionContent><div className="grid gap-3 sm:grid-cols-2">{cypressConfigFields.map((field) => field.type === "boolean" ? <FormField key={field.key} label={field.label}><Select value={runOptions.cypressConfig[field.key] === undefined ? "inherit" : String(runOptions.cypressConfig[field.key])} onValueChange={(value) => setCypressConfig(field.key, value === "inherit" ? undefined : value === "true")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Inherit default</SelectItem><SelectItem value="true">Enabled</SelectItem><SelectItem value="false">Disabled</SelectItem></SelectContent></Select></FormField> : <FormField key={field.key} label={field.label}><Input type={field.type === "number" ? "number" : "text"} min={field.minimum} max={field.maximum} value={String(runOptions.cypressConfig[field.key] ?? "")} onChange={(event) => setCypressConfig(field.key, event.target.value === "" ? undefined : field.type === "number" ? Number(event.target.value) : event.target.value)} /></FormField>)}{!cypressConfigFields.length && <p className="text-sm text-muted-foreground">No run override fields are configured.</p>}</div></AccordionContent></AccordionItem></Accordion>
      {runError && <Alert variant="destructive"><CircleAlert /><AlertTitle>Unable to start run</AlertTitle><AlertDescription>{runError}</AlertDescription></Alert>}
    </div><DialogFooter><Button variant="outline" onClick={() => setRunDialogOpen(false)} disabled={runPending}>Cancel</Button><Button disabled={!runOptions.profileId || runPending} onClick={async () => { setRunPending(true); setRunError(""); try { const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specs: selectedSpecs, ...runOptions }) }); const result = await response.json() as { requestId: string; error?: string }; if (!response.ok) throw new Error(result.error || "Unable to start Cypress run"); setRunDialogOpen(false); toast.success("Cypress run queued", { description: `Request ${result.requestId.slice(0, 8)}`, action: { label: "View runs", onClick: () => router.push("/runs") } }); } catch (error) { setRunError(error instanceof Error ? error.message : "Unable to start Cypress run"); } finally { setRunPending(false); } }}>{runPending ? <Loader2 className="animate-spin" /> : <Play />}Start run</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
