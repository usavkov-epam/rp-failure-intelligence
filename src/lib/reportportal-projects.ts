function projectName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as { projectName?: unknown; name?: unknown };
  const name = typeof candidate.projectName === "string"
    ? candidate.projectName
    : typeof candidate.name === "string"
      ? candidate.name
      : "";
  return name.trim() || undefined;
}

export function normalizeReportPortalProjectNames(payload: unknown): string[] {
  const values = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { content?: unknown }).content)
      ? (payload as { content: unknown[] }).content
      : [];

  return [...new Set(values.map(projectName).filter((name): name is string => Boolean(name)))]
    .sort((left, right) => left.localeCompare(right));
}
