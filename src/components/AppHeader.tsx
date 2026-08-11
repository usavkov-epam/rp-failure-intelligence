"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { BarChart3, CirclePlay, FolderKanban, LogOut, RefreshCw, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { id: "analysis", href: "/", label: "Analysis", icon: BarChart3 },
  { id: "runs", href: "/runs", label: "Runs", icon: CirclePlay },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings },
] as const;

export default function AppHeader({ currentPage, userName, sourceStatus, activeProject }: {
  currentPage: "analysis" | "runs" | "settings";
  userName: string;
  sourceStatus?: "live" | "error";
  activeProject?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2 lg:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-xs font-black text-primary-foreground shadow-sm">RP</span>
            <span className="hidden text-[15px] sm:inline">Failure intelligence</span>
          </Link>
          <nav className="flex items-center gap-1 rounded-xl bg-muted/70 p-1" aria-label="Primary navigation">
            {navigation.map(({ id, href, label, icon: Icon }) => (
              <Button key={id} asChild variant={currentPage === id ? "outline" : "ghost"} size="sm" className={cn("rounded-lg", currentPage === id && "bg-background shadow-sm")}>
                <Link href={href} className={cn(currentPage === id && "font-semibold")}><Icon data-icon="inline-start" />{label}</Link>
              </Button>
            ))}
          </nav>
          {activeProject && (
            <Badge variant="outline" className="hidden gap-1.5 font-normal md:inline-flex" title="Active ReportPortal project">
              <FolderKanban className="size-3.5" />{activeProject}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {sourceStatus && <Badge variant={sourceStatus === "live" ? "secondary" : "destructive"}>{sourceStatus === "live" ? "Live data" : "Load error"}</Badge>}
          <Button variant="ghost" size="sm" onClick={() => location.reload()}><RefreshCw data-icon="inline-start" /><span className="hidden sm:inline">Refresh</span></Button>
          <Button variant="ghost" size="sm" onClick={() => signOut({ redirectTo: "/signin" })}><LogOut data-icon="inline-start" /><span className="max-w-36 truncate">{userName}</span></Button>
        </div>
      </div>
    </header>
  );
}
