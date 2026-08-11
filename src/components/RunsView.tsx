"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, CheckCircle2, CircleAlert, Clock3, Download, ExternalLink, Loader2, PackageOpen, Square } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { DISPLAY, MEDIA_TYPE, PUSH_MESSAGE_TYPE, RUN_CONCLUSION, RUN_STATUS, TIME } from "@/lib/domain-constants";
import type { TestRunnerDescriptor } from "@/lib/test-runners/contracts";
import type { CypressRunDetails, CypressRunRecord } from "@/lib/types";
import AppHeader from "./AppHeader";

type PushState = "unsupported" | "available" | "enabling" | "enabled" | "denied" | "error";

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const bytes = window.atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function formatRunDuration(run: CypressRunRecord) {
  if (!run.startedAt) return "Waiting to start";
  const end = run.status === RUN_STATUS.COMPLETED && run.updatedAt ? Date.parse(run.updatedAt) : Date.now();
  const seconds = Math.max(0, Math.round((end - Date.parse(run.startedAt)) / TIME.MILLISECONDS_PER_SECOND));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function statusVariant(run: CypressRunRecord): "outline" | "secondary" | "default" | "destructive" {
  if (run.status !== RUN_STATUS.COMPLETED) return run.status === RUN_STATUS.IN_PROGRESS ? "secondary" : "outline";
  return run.conclusion === RUN_CONCLUSION.SUCCESS ? "default" : "destructive";
}

export default function RunsView({ initialRuns, webPushPublicKey, runner, userName, activeProject, localMode }: {
  initialRuns: CypressRunRecord[];
  webPushPublicKey: string;
  runner: TestRunnerDescriptor;
  userName: string;
  activeProject?: string;
  localMode?: boolean;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [statusError, setStatusError] = useState("");
  const [selectedRun, setSelectedRun] = useState<CypressRunRecord | null>(null);
  const [details, setDetails] = useState<CypressRunDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [pushState, setPushState] = useState<PushState>(webPushPublicKey ? "available" : "unsupported");
  const mounted = useRef(true);

  const refresh = useCallback(async (notifyRequestId?: string) => {
    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      const result = await response.json() as { runs?: CypressRunRecord[]; error?: string };
      if (!response.ok || !result.runs) throw new Error(result.error || "Unable to load Cypress runs");
      if (!mounted.current) return;
      setRuns(result.runs);
      setStatusError("");
      const completedRun = notifyRequestId ? result.runs.find((run) => run.requestId === notifyRequestId && run.status === RUN_STATUS.COMPLETED) : undefined;
      if (completedRun) toast(completedRun.conclusion === RUN_CONCLUSION.SUCCESS ? "Cypress run passed" : "Cypress run completed", { description: `Request ${completedRun.requestId.slice(0, DISPLAY.REQUEST_ID_LENGTH)} · ${completedRun.conclusion || RUN_STATUS.COMPLETED}` });
    } catch (error) {
      if (mounted.current) setStatusError(error instanceof Error ? error.message : "Unable to load Cypress runs");
    }
  }, []);

  const savePushSubscription = useCallback(async (registration: ServiceWorkerRegistration) => {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(webPushPublicKey),
      });
    }
    const response = await fetch("/api/push-subscriptions", {
      method: "POST",
      headers: { "content-type": MEDIA_TYPE.JSON },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) throw new Error("Unable to register live run updates");
    setPushState("enabled");
  }, [webPushPublicKey]);

  const enableLiveUpdates = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    setPushState("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "available");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      await savePushSubscription(registration);
      toast("Live run updates enabled");
    } catch (error) {
      setPushState("error");
      toast.error(error instanceof Error ? error.message : "Unable to enable live run updates");
    }
  }, [savePushSubscription]);

  useEffect(() => {
    mounted.current = true;
    if (localMode) {
      const timer = window.setInterval(() => void refresh(), TIME.LOCAL_STATUS_REFRESH_MILLISECONDS);
      return () => { mounted.current = false; window.clearInterval(timer); };
    }
    if (!webPushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return () => { mounted.current = false; };
    }

    const onMessage = (event: MessageEvent<{ type?: string; requestId?: string }>) => {
      if (event.data?.type === PUSH_MESSAGE_TYPE.CYPRESS_RUN_UPDATED) void refresh(event.data.requestId);
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void refresh(); };
    navigator.serviceWorker.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void navigator.serviceWorker.register("/push-worker.js")
      .then(async (registration) => {
        if (Notification.permission === "granted") await savePushSubscription(registration);
        else setPushState(Notification.permission === "denied" ? "denied" : "available");
      })
      .catch(() => setPushState("error"));

    return () => {
      mounted.current = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [localMode, refresh, savePushSubscription, webPushPublicKey]);

  const openDetails = async (run: CypressRunRecord) => {
    setSelectedRun(run);
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/runs/${run.requestId}`, { cache: "no-store" });
      const result = await response.json() as { details?: CypressRunDetails; error?: string };
      if (!response.ok || !result.details) throw new Error(result.error || "Unable to load run details");
      setDetails(result.details);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Unable to load run details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const cancelRun = async (run: CypressRunRecord) => {
    setCancellingId(run.requestId);
    try {
      const response = await fetch(`/api/runs/${run.requestId}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to cancel Cypress run");
      setRuns((current) => current.map((item) => item.requestId === run.requestId ? { ...item, conclusion: RUN_CONCLUSION.CANCELLING } : item));
      toast("Cancellation requested", { description: `Run ${run.requestId.slice(0, 8)}` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel Cypress run");
    } finally {
      setCancellingId("");
    }
  };

  return (
    <>
      <AppHeader currentPage="runs" userName={userName} activeProject={activeProject} localMode={localMode} />
      <main className="pb-16">
        <section className="border-b bg-gradient-to-br from-muted/70 via-background to-destructive/5">
          <div className="mx-auto max-w-[1800px] px-4 py-10 lg:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{runner.label}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight lg:text-5xl">Cypress runs</h1>
            <p className="mt-2 text-muted-foreground">{runner.executionDescription} View status, job steps, configuration, and result artifacts.</p>
          </div>
        </section>
        <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-6 lg:px-6">
          {statusError && <Alert><CircleAlert /><AlertTitle>Status updates delayed</AlertTitle><AlertDescription>{statusError}</AlertDescription></Alert>}
          {localMode && <Alert><CircleAlert /><AlertTitle>Local runner</AlertTitle><AlertDescription>Cypress executes inside this container. The project checkout, dependency cache, CLI logs, artifacts, settings, and run history persist in the Docker volume.</AlertDescription></Alert>}
          {!localMode && (pushState === "available" || pushState === "error") && <Alert><BellRing /><AlertTitle>Enable live run updates</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>Get immediate status changes without polling. Browser notifications are shown only when this page is not visible.</span><Button size="sm" variant="outline" onClick={() => void enableLiveUpdates()}>{pushState === "error" ? "Try again" : "Enable"}</Button></AlertDescription></Alert>}
          {!localMode && pushState === "enabling" && <Alert><Loader2 className="animate-spin" /><AlertTitle>Enabling live updates</AlertTitle><AlertDescription>Registering this browser for run status notifications…</AlertDescription></Alert>}
          {!localMode && pushState === "denied" && <Alert><CircleAlert /><AlertTitle>Live updates are blocked</AlertTitle><AlertDescription>Allow notifications for this site in your browser settings, then reload the page. Run data still refreshes when you return to this tab.</AlertDescription></Alert>}
          {!runs.length ? (
            <Card className="py-10 text-center"><CardHeader><CardTitle>No Cypress runs</CardTitle><CardDescription>Select failures on the Analysis page and start a run.</CardDescription></CardHeader></Card>
          ) : (
            <Card className="overflow-hidden py-0">
              <CardContent className="divide-y p-0">
                {runs.map((run) => (
                  <div key={run.requestId} className="grid items-center gap-4 px-5 py-4 md:grid-cols-[minmax(170px,.7fr)_minmax(280px,1.7fr)_minmax(240px,1fr)_auto]">
                    <div>
                      <Badge variant={statusVariant(run)} className="capitalize">{run.status === RUN_STATUS.COMPLETED ? run.conclusion || RUN_STATUS.COMPLETED : run.status.replace("_", " ")}</Badge>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{run.requestId.slice(0, DISPLAY.REQUEST_ID_LENGTH)}{run.runNumber ? ` · #${run.runNumber}` : ""}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{run.specs.length} {run.specs.length === 1 ? "spec" : "specs"} · {run.runs} {run.runs === 1 ? "run" : "runs"} each</p>
                      <p className="truncate text-xs text-muted-foreground" title={run.specs.join("\n")}>{run.specs.join(", ")}</p>
                    </div>
                    <div className="text-sm">
                      <p>{run.browser} · {run.threads} {run.threads === 1 ? "thread" : "threads"} · {formatRunDuration(run)}</p>
                      <p className="text-xs text-muted-foreground">{run.environment || "Configured environment"} · {Object.keys(run.cypressConfig).length ? `${Object.keys(run.cypressConfig).length} overrides` : "Default config"}</p>
                      <p className="text-xs text-muted-foreground">{run.artifactCount ? `${run.artifactCount} result artifact${run.artifactCount === 1 ? "" : "s"}` : run.status === RUN_STATUS.COMPLETED ? "No artifacts" : "Results pending"}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => void openDetails(run)}>Details</Button>
                      {runner.supportsCancellation && run.status !== RUN_STATUS.COMPLETED && <Button variant="ghost" size="icon-sm" disabled={cancellingId === run.requestId} onClick={() => void cancelRun(run)} aria-label="Cancel run">{cancellingId === run.requestId ? <Loader2 className="animate-spin" /> : <Square />}</Button>}
                      {runner.hasExternalRunPage && <Button asChild variant="ghost" size="icon-sm"><Link href={run.runUrl} target="_blank" rel="noreferrer" aria-label={`Open ${runner.label}`}><ExternalLink /></Link></Button>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={Boolean(selectedRun)} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Run {selectedRun?.runNumber ? `#${selectedRun.runNumber}` : selectedRun?.requestId.slice(0, DISPLAY.REQUEST_ID_LENGTH)}</DialogTitle><DialogDescription>Execution summary, steps, configuration, and result artifacts.</DialogDescription></DialogHeader>
          {selectedRun && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="py-3"><CardContent><p className="text-xs text-muted-foreground">Result</p><p className="mt-1 font-semibold capitalize">{(selectedRun.conclusion || selectedRun.status).replaceAll("_", " ")}</p></CardContent></Card>
                <Card className="py-3"><CardContent><p className="text-xs text-muted-foreground">Duration</p><p className="mt-1 font-semibold">{formatRunDuration(selectedRun)}</p></CardContent></Card>
                <Card className="py-3"><CardContent><p className="text-xs text-muted-foreground">Work</p><p className="mt-1 font-semibold">{selectedRun.specs.length * selectedRun.runs} spec executions</p></CardContent></Card>
              </div>
              <div><h3 className="text-sm font-semibold">Selected specs</h3><div className="mt-2 max-h-32 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">{selectedRun.specs.map((spec) => <div key={spec}>{spec}</div>)}</div></div>
              <div><h3 className="text-sm font-semibold">Configuration</h3><div className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Profile:</span> {selectedRun.environment || "Configured environment"}</p><p><span className="text-muted-foreground">Browser:</span> {selectedRun.browser}</p><p><span className="text-muted-foreground">Threads:</span> {selectedRun.threads}</p><p><span className="text-muted-foreground">Timeout:</span> {selectedRun.timeoutSeconds}s</p></div>{Object.keys(selectedRun.cypressConfig).length > 0 && <pre className="mt-2 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">{JSON.stringify(selectedRun.cypressConfig, null, 2)}</pre>}</div>
              <Separator />
              {detailsLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading run results…</div>}
              {detailsError && <Alert variant="destructive"><CircleAlert /><AlertTitle>Details unavailable</AlertTitle><AlertDescription>{detailsError}</AlertDescription></Alert>}
              {details && (
                <>
                  <div><h3 className="text-sm font-semibold">Job results</h3><div className="mt-2 space-y-3">{details.jobs.map((job) => <Card key={job.id} className="py-3"><CardContent><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2">{job.conclusion === RUN_CONCLUSION.SUCCESS ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="size-4 shrink-0 text-destructive" />}<span className="break-all font-medium">{job.name}</span></div>{job.htmlUrl && <Button asChild variant="ghost" size="xs"><Link href={job.htmlUrl} target="_blank">Open job<ExternalLink /></Link></Button>}</div><div className="mt-3 grid gap-1 sm:grid-cols-2">{job.steps.map((step) => <div key={step.number} className="flex items-center gap-2 text-xs"><span className={step.conclusion === RUN_CONCLUSION.SUCCESS ? "text-emerald-600" : step.conclusion === RUN_CONCLUSION.FAILURE ? "text-destructive" : "text-muted-foreground"}>{step.conclusion === RUN_CONCLUSION.SUCCESS ? "✓" : step.conclusion === RUN_CONCLUSION.FAILURE ? "✕" : "•"}</span><span>{step.name}</span></div>)}</div></CardContent></Card>)}</div></div>
                  <div><h3 className="text-sm font-semibold">Result artifacts</h3>{details.artifacts.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{details.artifacts.map((artifact) => <Card key={artifact.id} className="py-3"><CardContent className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><PackageOpen className="size-4" /><p className="truncate text-sm font-medium">{artifact.name}</p></div><p className="mt-1 text-xs text-muted-foreground">{formatBytes(artifact.sizeInBytes)}</p></div><Button asChild variant="outline" size="icon-sm"><Link href={artifact.downloadUrl} aria-label={`Download ${artifact.name}`}><Download /></Link></Button></CardContent></Card>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No downloadable artifacts were published.</p>}</div>
                </>
              )}
              {!detailsLoading && !detailsError && !details && <Alert><Clock3 /><AlertTitle>Waiting for the runner</AlertTitle><AlertDescription>Job details will appear when {runner.label} makes them available.</AlertDescription></Alert>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
