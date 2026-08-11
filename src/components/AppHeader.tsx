"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { BarChart3, CirclePlay, FolderKanban, LogOut, RefreshCw, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ModeToggle from "./ModeToggle";

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
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">RP</span>
            <span className="hidden whitespace-nowrap sm:inline">Failure intelligence</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary navigation">
            {navigation.map(({ id, href, label, icon: Icon }) => (
              <Button key={id} asChild variant={currentPage === id ? "secondary" : "ghost"} size="sm">
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
        <div className="flex shrink-0 items-center gap-1">
          {sourceStatus && <Badge variant={sourceStatus === "live" ? "secondary" : "destructive"}>{sourceStatus === "live" ? "Live data" : "Load error"}</Badge>}
          <ModeToggle />
          <Button variant="ghost" size="sm" onClick={() => location.reload()}><RefreshCw data-icon="inline-start" /><span className="hidden sm:inline">Refresh</span></Button>
          <Button variant="ghost" size="sm" onClick={() => signOut({ redirectTo: "/signin" })}><LogOut data-icon="inline-start" /><span className="max-w-36 truncate">{userName}</span></Button>
        </div>
      </div>
    </header>
  );
}
