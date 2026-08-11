"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState } from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Clipboard, ExternalLink, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FailureRow, Risk } from "@/lib/types";

const riskVariants: Record<Risk, "destructive" | "secondary" | "outline" | "default"> = { Persistent: "destructive", "High risk": "secondary", Intermittent: "outline", Isolated: "default" };

function RecentRuns({ row }: { row: FailureRow }) {
  return <div className="flex h-7 min-w-36 items-center gap-[3px]" aria-label={`Run history, oldest to newest: ${row.statuses.join(", ")}`}>{row.statuses.map((status, index) => <Tooltip key={`${row.launchNumbers[index]}:${index}`}><TooltipTrigger asChild><span className={`h-5 min-w-1 flex-1 rounded-[2px] ${status === "PASSED" ? "bg-emerald-600" : status === "FAILED" ? "bg-destructive" : "bg-muted-foreground/30"} ${index === row.statuses.length - 1 ? "ring-2 ring-foreground ring-offset-1" : ""}`} /></TooltipTrigger><TooltipContent>{row.launchNumbers[index] ? `Launch #${row.launchNumbers[index]}` : `Run ${index + 1}`}: {status.toLowerCase()}</TooltipContent></Tooltip>)}</div>;
}

export default function FailureTable({ rows, historyDepth, sourceRepository, onSelectedSpecs }: {
  rows: FailureRow[];
  historyDepth: number;
  sourceRepository: { owner: string; repository: string; ref: string };
  onSelectedSpecs: (specs: string[]) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "failureRate", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const columns = useMemo<ColumnDef<FailureRow>[]>(() => [
    { id: "select", header: ({ table }) => <Checkbox aria-label="Select all visible failures" checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false} onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))} />, cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.name}`} checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(Boolean(value))} />, enableSorting: false },
    { accessorKey: "risk", header: "Risk", cell: ({ row }) => <Badge variant={riskVariants[row.original.risk]}>{row.original.risk}</Badge> },
    { accessorKey: "name", header: "Failed test", cell: ({ row }) => <div className="min-w-[330px] max-w-[580px] py-1"><p className="text-sm font-semibold leading-snug">{row.original.name}</p><div className="mt-1 flex min-w-0 items-center gap-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" onClick={() => navigator.clipboard.writeText(row.original.specPath)} aria-label="Copy spec path"><Clipboard /></Button></TooltipTrigger><TooltipContent>Copy spec path</TooltipContent></Tooltip><span className="truncate font-mono text-xs text-primary" title={row.original.specPath}>{row.original.specPath}</span></div></div> },
    { accessorKey: "module", header: "Module" },
    { accessorKey: "statuses", header: `Last ${historyDepth} runs`, cell: ({ row }) => <RecentRuns row={row.original} />, enableSorting: false },
    { accessorKey: "failureRate", header: ({ column }) => <Button variant="ghost" size="xs" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Failure rate<ArrowUpDown /></Button>, cell: ({ row }) => <span className="tabular-nums">{row.original.failureRate}%</span> },
    { accessorKey: "currentStreak", header: "Streak" },
    { accessorKey: "transitions", header: "Transitions" },
    { accessorKey: "defect", header: "Classification" },
    { id: "links", header: "Links", enableSorting: false, cell: ({ row }) => <div className="flex"><Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon-sm"><Link href={`https://github.com/${sourceRepository.owner}/${sourceRepository.repository}/blob/${sourceRepository.ref}/${row.original.specPath}`} target="_blank" aria-label="Open source spec"><Clipboard /></Link></Button></TooltipTrigger><TooltipContent>Open source spec</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon-sm"><Link href={row.original.reportPortalUrl} target="_blank" aria-label="Open ReportPortal log"><ExternalLink /></Link></Button></TooltipTrigger><TooltipContent>Open ReportPortal log</TooltipContent></Tooltip>{row.original.testRailUrl && <Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon-sm"><Link href={row.original.testRailUrl} target="_blank" aria-label="Open TestRail case"><FlaskConical /></Link></Button></TooltipTrigger><TooltipContent>Open TestRail case</TooltipContent></Tooltip>}</div> },
  ], [historyDepth, sourceRepository]);
  // TanStack Table is the headless engine recommended by shadcn; React Compiler intentionally skips this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, getRowId: (row) => String(row.id), state: { sorting, rowSelection }, onSortingChange: setSorting, onRowSelectionChange: setRowSelection, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 10 } } });

  useEffect(() => {
    const selectedIds = new Set(Object.entries(rowSelection).filter(([, selected]) => selected).map(([id]) => Number(id)));
    onSelectedSpecs([...new Set(rows.filter(({ id }) => selectedIds.has(id)).map(({ specPath }) => specPath))]);
  }, [onSelectedSpecs, rowSelection, rows]);

  return <div className="space-y-3"><div className="overflow-hidden rounded-xl border bg-card"><div className="overflow-x-auto"><Table><TableHeader>{table.getHeaderGroups().map((headerGroup) => <TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="h-28 text-center text-muted-foreground">No matching failures.</TableCell></TableRow>}</TableBody></Table></div></div><div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{table.getSelectedRowModel().rows.length} selected · {rows.length} matching failures</span><div className="flex items-center gap-2"><Select value={String(table.getState().pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} rows</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon-sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button><span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><Button variant="outline" size="icon-sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button></div></div></div>;
}
