"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Bug, CircleAlert, Clipboard, History, Loader2, Play, Settings2, X, Zap, type LucideIcon } from "lucide-react";
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
import HelpTip from "./HelpTip";

interface ReportSourceChildrenResponse { launchName?: string; launches: string[]; launchRuns: ReportSourceOptions["launchRuns"]; error?: string }
interface CypressRunFormOptions { runs: number; threads: number; browser: "chrome" | "electron"; timeoutSeconds: number; profileId: string; cypressConfig: CypressConfigOverrides }
const risks: Risk[] = ["Persistent", "High risk", "Intermittent", "Isolated"];

function Metric({ label, value, detail, help, icon: Icon }: { label: string; value: string; detail: string; help: string; icon: LucideIcon }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="flex items-center gap-1 text-sm font-medium">{label}<HelpTip label={`About ${label}`}>{help}</HelpTip></CardTitle><Icon className="size-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold tracking-tight">{value}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function Trend({ data }: { data: DashboardData }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-1">Current failure cohort<HelpTip label="About current failure cohort">For each historical launch, this shows the status distribution only for tests that are failing in the selected run.</HelpTip></CardTitle><CardDescription>Status history for tests failing in {data.meta.launchNumber === null ? "the selected launch" : `launch #${data.meta.launchNumber}`}.</CardDescription></CardHeader><CardContent><div className="flex h-48 items-end gap-2 overflow-x-auto border-b px-2">{!data.trend.length && <p className="self-center text-sm text-muted-foreground">No live history is available.</p>}{data.trend.map((point) => { const total = point.passed + point.failed + point.other || 1; return <div key={point.launchNumber} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end"><div className="flex h-32 w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-sm bg-muted" title={`${point.failed} failed, ${point.passed} passed`}><span className="bg-destructive" style={{ height: `${point.failed / total * 100}%` }} /><span className="bg-emerald-600" style={{ height: `${point.passed / total * 100}%` }} /></div><span className="my-2 text-[11px] text-muted-foreground">#{point.launchNumber}</span></div>; })}</div></CardContent></Card>;
}

function Distribution({ data }: { data: DashboardData }) {
  const groups = [["Persistent", data.metrics.persistent, "bg-destructive"], ["High risk", data.metrics.highRisk, "bg-amber-600"], ["Intermittent", data.metrics.intermittent, "bg-sky-600"], ["Isolated", data.metrics.isolated, "bg-emerald-600"]] as const;
  const maximum = Math.max(1, ...groups.map(([, count]) => count));
  return <Card><CardHeader><CardTitle className="flex items-center gap-1">Risk distribution<HelpTip label="About risk distribution">Groups current failures by how often they failed across the selected history window.</HelpTip></CardTitle><CardDescription>Failure frequency across returned history.</CardDescription></CardHeader><CardContent className="space-y-6">{groups.map(([label, count, color]) => <div key={label}><div className="flex justify-between text-sm"><span>{label}</span><span className="font-medium tabular-nums">{count}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${count / maximum * 100}%` }} /></div></div>)}</CardContent></Card>;
}

function FormField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={`min-w-0 space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>; }

export default function Dashboard({ initialData, reportSelection, reportSourceOptions, sourceRepository, cypressProfiles, reportFields, cypressConfigFields, suggestedProfileId, user, localMode }: {
  initialData: DashboardData;
  reportSelection: ReportSelection;
  reportSourceOptions: ReportSourceOptions;
  sourceRepository: { owner: string; repository: string; ref: string };
  cypressProfiles: ReadonlyArray<{ id: string; name: string; isDefault: boolean }>;
  reportFields: ReportFieldMapping[];
  cypressConfigFields: CypressConfigField[];
  suggestedProfileId: string;
  user: { name: string };
  localMode?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [classification, setClassification] = useState("");
  const [failureRate, setFailureRate] = useState("");
  const [streak, setStreak] = useState("");
  const [transitions, setTransitions] = useState("");
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
  const classifications = useMemo(() => [...new Set(initialData.rows.map((row) => row.defect).filter(Boolean))].sort(), [initialData.rows]);
  const failureRates = useMemo(() => [...new Set(initialData.rows.map((row) => row.failureRate))].sort((a, b) => b - a), [initialData.rows]);
  const streaks = useMemo(() => [...new Set(initialData.rows.map((row) => row.currentStreak))].sort((a, b) => b - a), [initialData.rows]);
  const transitionCounts = useMemo(() => [...new Set(initialData.rows.map((row) => row.transitions))].sort((a, b) => b - a), [initialData.rows]);
  const rows = useMemo(() => initialData.rows.filter((row) => (!deferredSearch || `${row.name} ${row.specPath}`.toLowerCase().includes(deferredSearch)) && (!risk || row.risk === risk) && (!moduleName || row.module === moduleName) && (!classification || row.defect === classification) && (!failureRate || String(row.failureRate) === failureRate) && (!streak || String(row.currentStreak) === streak) && (!transitions || String(row.transitions) === transitions)), [classification, deferredSearch, failureRate, initialData.rows, moduleName, risk, streak, transitions]);
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
    <AppHeader currentPage="analysis" userName={user.name} sourceStatus={initialData.meta.source} activeProject={initialData.meta.project} projectOptions={reportSourceOptions.projects} localMode={localMode} />
    <main className="pb-16">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><p className="text-sm text-muted-foreground">Project / {initialData.meta.project}</p><h1 className="mt-1 max-w-5xl break-words text-2xl font-bold tracking-tight md:text-3xl">{initialData.meta.launchName}</h1></div><div className="flex max-w-xl flex-wrap gap-2 md:justify-end">{initialData.meta.launchNumber !== null && <Badge>Launch #{initialData.meta.launchNumber}</Badge>}{initialData.meta.launchId !== null && <Badge variant="outline">ID {initialData.meta.launchId}</Badge>}<Badge variant={initialData.meta.launchStatus === "PASSED" ? "secondary" : "destructive"}>{initialData.meta.launchStatus}</Badge><Badge variant="outline">{initialData.meta.historyDepth}-run history</Badge>{initialData.meta.fields.filter(({ value }) => value).map(({ key, label, value }) => <Badge key={key} variant="outline">{label}: {value}</Badge>)}</div></div>
        <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-1">Report source<HelpTip label="About report source">Select the launch, run, custom ReportPortal filters, and history depth used by every analysis block below.</HelpTip></CardTitle><CardDescription className="mt-2">Project <strong>{reportSelection.project}</strong> is your global workspace context.</CardDescription></div><Button asChild variant="outline" size="sm"><Link href="/settings"><Settings2 />Configure fields</Link></Button></div></CardHeader><CardContent>
          <form action="/" method="get" className="space-y-4">
            <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_minmax(10rem,0.75fr)]">
              <FormField label="Launch name"><Select name="launchName" value={draftSource.launchName} disabled={sourceLoading === "launches"} onValueChange={(value) => void loadSourceChildren(value, "runs")}><SelectTrigger className="w-full"><SelectValue placeholder="Select launch" /></SelectTrigger><SelectContent>{draftSourceOptions.launches.map((launchName) => <SelectItem key={launchName} value={launchName}>{launchName}</SelectItem>)}</SelectContent></Select></FormField>
              <FormField label="Run"><Select name="launchId" value={draftSource.launchId === undefined ? "" : String(draftSource.launchId)} disabled={Boolean(sourceLoading) || !draftSourceOptions.launchRuns.length} onValueChange={(value) => { const selection = { ...draftSource, launchId: Number(value) }; stableSourceRef.current = { ...stableSourceRef.current, selection }; setDraftSource(selection); }}><SelectTrigger className="w-full"><SelectValue placeholder="Select run" /></SelectTrigger><SelectContent>{draftSourceOptions.launchRuns.map((run, index) => <SelectItem key={run.id} value={String(run.id)}>#{run.number} · {run.status}{index === 0 ? " · Latest" : ""}</SelectItem>)}</SelectContent></Select></FormField>
              <FormField label="History depth"><Select name="historyDepth" defaultValue={String(reportSelection.historyDepth)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[5, 10, 15, 20, 30].map((value) => <SelectItem key={value} value={String(value)}>{value} runs</SelectItem>)}</SelectContent></Select></FormField>
            </div>
            {reportFields.length > 0 && <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
              {reportFields.map((field) => <FormField key={field.key} label={field.label}>{field.type === "enum" ? <Select name={`field.${field.key}`} defaultValue={reportSelection.fields[field.key] || (field.required ? undefined : "__any")} required={field.required}><SelectTrigger className="w-full"><SelectValue placeholder={field.required ? "Select value" : "Any value"} /></SelectTrigger><SelectContent>{!field.required && <SelectItem value="__any">Any value</SelectItem>}{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select> : <Input name={`field.${field.key}`} defaultValue={reportSelection.fields[field.key] || ""} required={field.required} />}</FormField>)}
            </div>}
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">{sourceLoading && <Button type="button" variant="ghost" onClick={cancelSourceLoad}>Cancel</Button>}<Button className="w-full sm:w-auto sm:min-w-32" type="submit" disabled={Boolean(sourceLoading) || !draftSource.launchName || draftSource.launchId === undefined}>{sourceLoading ? <Loader2 className="animate-spin" /> : null}Apply</Button></div>
          </form>
          {sourceLoadError && <Alert variant="destructive" className="mt-3"><CircleAlert /><AlertTitle>Unable to load source</AlertTitle><AlertDescription>{sourceLoadError}</AlertDescription></Alert>}
        </CardContent></Card>
        {isHistoricalRun && <Alert><CircleAlert /><AlertTitle>Historical run selected</AlertTitle><AlertDescription>You are analyzing launch #{initialData.meta.launchNumber}; latest is #{reportSourceOptions.launchRuns[0]?.number}.</AlertDescription></Alert>}
        {initialData.meta.error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Failed to load ReportPortal data</AlertTitle><AlertDescription>{initialData.meta.error}</AlertDescription></Alert>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Activity} label="Current suite failure rate" help="The percentage of all filtered tests in the selected run that failed." value={`${initialData.metrics.suiteFailureRate.toFixed(1)}%`} detail={`${initialData.metrics.suiteFailed} failed of ${initialData.metrics.suiteTotal} filtered tests`} /><Metric icon={Bug} label="Failed test identities" help="The number of distinct failed test items returned for the selected run and filters." value={String(initialData.rows.length)} detail={`${new Set(initialData.rows.map((row) => row.specPath)).size} unique Cypress specs`} /><Metric icon={History} label="Historical cohort failures" help="The failure rate of the current failed-test cohort across the selected history window." value={`${initialData.metrics.cohortExecutions ? Math.round(initialData.metrics.cohortFailures / initialData.metrics.cohortExecutions * 100) : 0}%`} detail={`${initialData.metrics.cohortFailures} of ${initialData.metrics.cohortExecutions} observations`} /><Metric icon={Zap} label="Immediate regressions" help="Current failures whose immediately previous recorded execution passed." value={String(initialData.metrics.regressions)} detail="Current failures preceded by a passed run" /></div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"><Trend data={initialData} /><Distribution data={initialData} /></div>
        <section className="space-y-4"><div className="flex items-center gap-1"><h2 className="text-lg font-semibold">Failed tests</h2><HelpTip label="About failed tests">Filter every value-bearing column, sort results, select specs, copy paths, and start focused Cypress runs.</HelpTip></div><div className="flex flex-wrap items-end gap-3 border-b pb-4"><FormField label="Search" className="w-full sm:w-72"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter tests or specs..." /></FormField><FormField label="Risk"><Select value={risk || "all"} onValueChange={(value) => setRisk(value === "all" ? "" : value)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All risks</SelectItem>{risks.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Module"><Select value={moduleName || "all"} onValueChange={(value) => setModuleName(value === "all" ? "" : value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All modules</SelectItem>{modules.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Failure rate"><Select value={failureRate || "all"} onValueChange={(value) => setFailureRate(value === "all" ? "" : value)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any rate</SelectItem>{failureRates.map((value) => <SelectItem key={value} value={String(value)}>{value}%</SelectItem>)}</SelectContent></Select></FormField><FormField label="Streak"><Select value={streak || "all"} onValueChange={(value) => setStreak(value === "all" ? "" : value)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any</SelectItem>{streaks.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Transitions"><Select value={transitions || "all"} onValueChange={(value) => setTransitions(value === "all" ? "" : value)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any</SelectItem>{transitionCounts.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Classification"><Select value={classification || "all"} onValueChange={(value) => setClassification(value === "all" ? "" : value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All classifications</SelectItem>{classifications.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField>{(search || risk || moduleName || classification || failureRate || streak || transitions) && <Button variant="ghost" onClick={() => { setSearch(""); setRisk(""); setModuleName(""); setClassification(""); setFailureRate(""); setStreak(""); setTransitions(""); }}><X />Reset</Button>}<div className="ml-auto flex gap-2"><Button variant="outline" disabled={!selectedSpecs.length} onClick={async () => { await navigator.clipboard.writeText(selectedSpecs.join("\n")); toast.success(`${selectedSpecs.length} spec path${selectedSpecs.length === 1 ? "" : "s"} copied`); }}><Clipboard />Copy {selectedSpecs.length || "selected"}</Button><Button disabled={!selectedSpecs.length} onClick={() => { setRunError(""); setRunDialogOpen(true); }}><Play />Run selected</Button></div></div><FailureTable rows={rows} historyDepth={initialData.meta.historyDepth} sourceRepository={sourceRepository} onSelectedSpecs={handleSelectedSpecs} /></section>
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
