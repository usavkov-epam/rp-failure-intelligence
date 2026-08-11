"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ProjectSwitcher({ activeProject, initialProjects = [] }: { activeProject: string; initialProjects?: string[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(() => initialProjects.includes(activeProject) ? initialProjects : [activeProject, ...initialProjects]);
  const [loading, setLoading] = useState(false);

  const loadProjects = async () => {
    if (projects.length > 1 || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/report-source", { cache: "no-store" });
      const result = await response.json() as { projects?: string[]; error?: string };
      if (!response.ok || !result.projects) throw new Error(result.error || "Unable to load projects");
      setProjects(result.projects);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load projects");
    } finally {
      setLoading(false);
    }
  };

  const changeProject = async (project: string) => {
    if (project === activeProject) return;
    setLoading(true);
    try {
      const response = await fetch("/api/report-source/active-project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to change project");
      if (window.location.pathname === "/") router.refresh();
      else router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change project");
      setLoading(false);
    }
  };

  return <Select value={activeProject} disabled={loading} onOpenChange={(open) => { if (open) void loadProjects(); }} onValueChange={(project) => void changeProject(project)}>
    <SelectTrigger className="hidden h-8 w-[190px] md:flex" aria-label="Active ReportPortal project">
      {loading ? <Loader2 className="animate-spin" /> : <FolderKanban />}
      <SelectValue />
    </SelectTrigger>
    <SelectContent>{projects.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}</SelectContent>
  </Select>;
}
