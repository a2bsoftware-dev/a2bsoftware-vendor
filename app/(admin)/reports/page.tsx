"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileBarChart2,
  Search,
  Loader2,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { useModulePermission } from "@/hooks/use-module-permission";
import { TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Matches the "Projects" entry in ACCESS_RIGHTS_MODULES - the report is a
// project-scoped view of the same data the Projects screen manages, and
// there's no separate "Reports" access-right module.
const PROJECTS_MODULE_ID = 6;
const PAGE_SIZE = 20;

// Raw snake_case shape from VendorPortalController's /projects
// (VendorDashboardRepository.findProjectsWithCounts - only ever lists
// projects this vendor has at least one hit on, since there'd be nothing to
// report on otherwise).
interface VendorProjectRow {
  id: string;
  project_name: string;
}

interface ProjectOption {
  id: string;
  projectName: string;
}

interface FilterOption {
  value: string;
  label: string;
}

interface CountryOption {
  id: string;
  name: string;
}

// Last 24 months, newest first, as {value: "yyyy-MM", label: "Jul 2026"} -
// generated client-side rather than fetched, since "every month that could
// possibly have data" isn't worth a round trip - the survey-details query
// itself already comes back empty for a month with nothing in it.
function buildMonthOptions(): FilterOption[] {
  const options: FilterOption[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

function monthBounds(yearMonth: string): { fromDate: string; toDate: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { fromDate: fmt(from), toDate: fmt(to) };
}

// Row shape returned by GET /api/vendor/projects/{id}/survey-details - this
// app only ever sees the vendor's own raw uid, never the hashedUid forwarded
// to the client's survey (see ProjectService.redactHashedUid).
interface SurveyDetailRow {
  id: string;
  pid: string;
  gid: string | null;
  vendorName: string;
  projectName: string;
  clientName: string;
  startIpAddress: string;
  endIpAddress: string;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  refId: string;
  uid: string | null;
  loi: string;
  status: string;
  countryName: string;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "Complete":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400";
    case "Disqualify":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400";
    case "quotaFull":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400";
    case "securityTerm":
      return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400";
    case "Reconcile":
      return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/20 dark:text-violet-400";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400";
  }
}

// An approved reconcile upload that touched at least one of this vendor's
// own hits - see ReconcileService.listApprovedForVendor. Pending/rejected
// uploads never reach this app at all; there's nothing to review here, only
// to see after the fact.
interface ReconcileUploadRow {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string | null;
  fileName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  uploadedAt: string;
  uploadedByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  totalRows: number | null;
  matchedRows: number | null;
  rejectionReason: string | null;
}

export default function ReportsPage() {
  const { permission } = useModulePermission(PROJECTS_MODULE_ID);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  // null means "All Projects" - a real, default, always-loaded state (not
  // "nothing selected yet"). The right pane loads immediately on mount.
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [rows, setRows] = useState<SurveyDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRows, setLoadingRows] = useState(false);
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUploads, setHistoryUploads] = useState<ReconcileUploadRow[]>([]);
  const [historyCount, setHistoryCount] = useState(0);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<SurveyDetailRow[]>([]);
  const [previewTitle, setPreviewTitle] = useState("");

  // Filter bar state - "" means "no filter" for every one of these. Month is
  // just a shortcut that fills fromDate/toDate with that whole calendar
  // month's bounds; picking a raw date directly clears it back to "" so the
  // dropdown never shows a stale month label next to a manually-edited range.
  const [statusOptions, setStatusOptions] = useState<FilterOption[]>([]);
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCountryId, setFilterCountryId] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const hasActiveFilters = Boolean(filterStatus || filterCountryId || filterFromDate || filterToDate);

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/vendor/survey-filter-options`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          setStatusOptions(data.surveyStatusOptions || []);
          setCountryOptions(data.countries || []);
        }
      })
      .catch((err) => console.error("Error loading survey filter options", err));
  }, []);

  const filterQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterCountryId) params.set("countryId", filterCountryId);
    if (filterFromDate) params.set("fromDate", filterFromDate);
    if (filterToDate) params.set("toDate", filterToDate);
    return params.toString();
  }, [filterStatus, filterCountryId, filterFromDate, filterToDate]);

  // Every filter control calls this directly (rather than a useEffect
  // watching filter state) so the reload reflects the value being set RIGHT
  // NOW, not whatever the state was before this render - setState is async,
  // so reading filterStatus/etc. straight after calling their setters here
  // would still see the OLD value. overrides only replaces what's actually
  // changing; "" is a valid override (clearing a filter), so this merges with
  // ?? (nullish-coalescing), never ||.
  const reloadWithFilters = (overrides: {
    status?: string;
    countryId?: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    const merged = {
      status: overrides.status ?? filterStatus,
      countryId: overrides.countryId ?? filterCountryId,
      fromDate: overrides.fromDate ?? filterFromDate,
      toDate: overrides.toDate ?? filterToDate,
    };
    const params = new URLSearchParams();
    if (merged.status) params.set("status", merged.status);
    if (merged.countryId) params.set("countryId", merged.countryId);
    if (merged.fromDate) params.set("fromDate", merged.fromDate);
    if (merged.toDate) params.set("toDate", merged.toDate);
    setPage(1);
    loadSurveyDetails(selectedProject?.id, 1, params.toString());
  };

  const handleStatusFilterChange = (value: string | null) => {
    const status = value === "all" || !value ? "" : value;
    setFilterStatus(status);
    reloadWithFilters({ status });
  };

  const handleCountryFilterChange = (value: string | null) => {
    const countryId = value === "all" || !value ? "" : value;
    setFilterCountryId(countryId);
    reloadWithFilters({ countryId });
  };

  const applyMonth = (value: string) => {
    setFilterMonth(value);
    if (value === "all" || !value) {
      setFilterFromDate("");
      setFilterToDate("");
      reloadWithFilters({ fromDate: "", toDate: "" });
    } else {
      const { fromDate, toDate } = monthBounds(value);
      setFilterFromDate(fromDate);
      setFilterToDate(toDate);
      reloadWithFilters({ fromDate, toDate });
    }
  };

  const handleFromDateChange = (value: string) => {
    setFilterFromDate(value);
    setFilterMonth("");
    reloadWithFilters({ fromDate: value });
  };

  const handleToDateChange = (value: string) => {
    setFilterToDate(value);
    setFilterMonth("");
    reloadWithFilters({ toDate: value });
  };

  const clearFilters = () => {
    setFilterStatus("");
    setFilterCountryId("");
    setFilterMonth("");
    setFilterFromDate("");
    setFilterToDate("");
    reloadWithFilters({ status: "", countryId: "", fromDate: "", toDate: "" });
  };

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/vendor/reconcile/uploads`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setHistoryCount((data.uploads || []).length);
      })
      .catch((err) => console.error("Error loading reconcile history count", err));
  }, []);

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/reconcile/uploads`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setHistoryUploads(data.uploads || []);
      } else {
        toast.error("Failed to load reconcile history");
      }
    } catch (err) {
      console.error("Error loading reconcile history", err);
      toast.error("Error connecting to server");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reads the file server-side (via the backend, scoped to just this
  // vendor's own rows) and shows it in-app - no browser download, and no
  // hashed uid column at all (see ReconcileService.previewForVendor).
  const handleViewUpload = async (upload: ReconcileUploadRow) => {
    setPreviewTitle(`${upload.projectName} — ${upload.fileName}`);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/reconcile/uploads/${upload.id}/preview`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPreviewRows(data.rows || []);
        } else {
          toast.error("Failed to read the uploaded file");
        }
      } else {
        toast.error("Failed to read the uploaded file");
      }
    } catch (err) {
      console.error("Error previewing reconcile upload", err);
      toast.error("Error connecting to server");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/vendor/projects`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          const items: ProjectOption[] = (data.projects || []).map((p: VendorProjectRow) => ({
            id: p.id,
            projectName: p.project_name,
          }));
          setProjects(items);
        }
      })
      .catch((err) => console.error("Error loading projects", err))
      .finally(() => setLoadingProjects(false));
  }, []);

  // extraOverride lets a filter-change handler pass the query string for the
  // value it's setting RIGHT NOW (see reloadWithFilters above) instead of
  // this reading current-render filter state, which would still be stale the
  // instant a setState call above it hasn't flushed yet. Pagination
  // (goToPage) omits it and falls back to filterQueryParams() - by then
  // state has long since settled, so reading it fresh is fine.
  const loadSurveyDetails = useCallback(async (projectId: string | undefined, targetPage: number, extraOverride?: string) => {
    setLoadingRows(true);
    try {
      const extra = extraOverride !== undefined ? extraOverride : filterQueryParams();
      const projectParam = projectId ? `&projectId=${projectId}` : "";
      const res = await apiFetch(
        `${API_BASE_URL}/api/vendor/survey-details?pageNo=${targetPage}&maxPerPage=${PAGE_SIZE}${projectParam}${extra ? `&${extra}` : ""}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRows(data.surveyInformations || []);
          setTotal(data.total || 0);
        } else {
          toast.error("Failed to load survey details");
        }
      } else {
        toast.error("Failed to load survey details");
      }
    } catch (err) {
      console.error("Error loading survey details", err);
      toast.error("Error connecting to server");
    } finally {
      setLoadingRows(false);
    }
  }, [filterQueryParams]);

  // Runs once on mount to load the default "All Projects" view immediately -
  // deliberately NOT depending on loadSurveyDetails (which changes identity
  // whenever a filter changes), since re-running this on every filter change
  // would incorrectly reset the query back to "all projects", racing against
  // whatever project/filter the user has since selected.
  useEffect(() => {
    loadSurveyDetails(undefined, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProject = (project: ProjectOption | null) => {
    setSelectedProject(project);
    setPage(1);
    loadSurveyDetails(project?.id, 1);
  };

  const goToPage = (targetPage: number) => {
    setPage(targetPage);
    loadSurveyDetails(selectedProject?.id, targetPage);
  };

  const handleDownload = async (format: "csv" | "xlsx") => {
    setDownloading(format);
    try {
      const extra = filterQueryParams();
      const projectParam = selectedProject ? `&projectId=${selectedProject.id}` : "";
      const res = await apiFetch(
        `${API_BASE_URL}/api/vendor/survey-details/export?format=${format}${projectParam}${extra ? `&${extra}` : ""}`
      );
      if (!res.ok) {
        toast.error("Failed to download report");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `survey_details_${selectedProject ? selectedProject.projectName.replace(/[^a-zA-Z0-9_-]+/g, "_") : "all_projects"}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      console.error("Error downloading report", err);
      toast.error("Error connecting to server");
    } finally {
      setDownloading(null);
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.projectName.toLowerCase().includes(projectSearch.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!permission.read) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-2">
        <span className="text-sm font-bold text-zinc-600">You don&apos;t have access to Reports.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-zinc-500" />
            Reports
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Browse survey activity across all projects, or select one on the left, and download a CSV or Excel report.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openHistory} className="h-8 flex items-center gap-1.5">
          <ClipboardList size={13} />
          <span>Reconcile History</span>
          {historyCount > 0 && (
            <Badge variant="secondary" className="ml-1">{historyCount}</Badge>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
        {/* Left pane: project picker */}
        <Card className="border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
          <CardHeader className="py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <Input
                placeholder="Search projects..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[65vh] overflow-y-auto">
            <button
              onClick={() => selectProject(null)}
              className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors border-b border-zinc-100 dark:border-zinc-800 ${
                selectedProject === null
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
              }`}
            >
              All Projects
            </button>
            {loadingProjects ? (
              <div className="space-y-1.5 p-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400">No projects found.</div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectProject(p)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedProject?.id === p.id
                        ? "bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950/30 dark:text-indigo-400"
                        : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    {p.projectName}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right pane: survey data for the selected project */}
        <Card className="border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
          <CardHeader className="py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
              {selectedProject ? selectedProject.projectName : "All Projects"}
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={downloading !== null}
                    className="h-8 flex items-center gap-1.5"
                  />
                }
              >
                {downloading !== null ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>Download</span>
                <ChevronDown size={13} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDownload("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <Select
              items={[{ value: "all", label: "All Statuses" }, ...statusOptions]}
              value={filterStatus || "all"}
              onValueChange={(v) => handleStatusFilterChange(v)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Filter by status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={[{ value: "all", label: "All Countries" }, ...countryOptions.map((c) => ({ value: c.id, label: c.name }))]}
              value={filterCountryId || "all"}
              onValueChange={(v) => handleCountryFilterChange(v)}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Filter by country">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={[{ value: "all", label: "All Months" }, ...monthOptions]}
              value={filterMonth || "all"}
              onValueChange={(v) => applyMonth(v ?? "all")}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Filter by month">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filterFromDate}
                onChange={(e) => handleFromDateChange(e.target.value)}
                className="h-8 w-[135px] text-xs"
                aria-label="From date"
              />
              <span className="text-xs text-zinc-400">to</span>
              <Input
                type="date"
                value={filterToDate}
                onChange={(e) => handleToDateChange(e.target.value)}
                className="h-8 w-[135px] text-xs"
                aria-label="To date"
              />
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-500" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
          <CardContent className="pt-4">
            {loadingRows ? (
              <TableSkeleton rows={8} columns={9} />
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="text-sm text-zinc-400">
                  {selectedProject ? "No survey activity recorded for this project yet." : "No survey activity recorded yet."}
                </span>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        {!selectedProject && <TableHead className="text-xs">Project</TableHead>}
                        <TableHead className="text-xs">Vendor</TableHead>
                        <TableHead className="text-xs">Start IP</TableHead>
                        <TableHead className="text-xs">End IP</TableHead>
                        <TableHead className="text-xs">Start Time</TableHead>
                        <TableHead className="text-xs">End Time</TableHead>
                        <TableHead className="text-xs">Ref ID</TableHead>
                        <TableHead className="text-xs">UID</TableHead>
                        <TableHead className="text-xs text-center">LOI</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                        <TableHead className="text-xs">Country</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, idx) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-zinc-500 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</TableCell>
                          {!selectedProject && (
                            <TableCell className="text-xs max-w-[160px] truncate" title={row.projectName}>{row.projectName}</TableCell>
                          )}
                          <TableCell className="text-xs">{row.vendorName}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-500">{row.startIpAddress}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-500">{row.endIpAddress}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-600">{row.startDate} {row.startTime}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-600">{row.endDate} {row.endTime}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-500 max-w-[120px] truncate" title={row.refId}>{row.refId}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-500 max-w-[160px] truncate" title={row.uid || ""}>{row.uid || "-"}</TableCell>
                          <TableCell className="text-center font-mono font-bold text-xs text-zinc-700 dark:text-zinc-300">{row.loi}</TableCell>
                          <TableCell className="text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass(row.status)}`}>
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-zinc-600">{row.countryName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500">
                    Page {page} of {totalPages} &middot; {total} total
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={page <= 1}
                      onClick={() => goToPage(page - 1)}
                    >
                      <ChevronLeft size={14} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={page >= totalPages}
                      onClick={() => goToPage(page + 1)}
                    >
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reconcile History</DialogTitle>
            <DialogDescription>
              Files a client uploaded and an admin approved, that affected at least one of your own hits.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto">
            {historyLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            ) : historyUploads.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400">No reconcile history yet.</div>
            ) : (
              <div className="space-y-2">
                {historyUploads.map((u) => (
                  <div key={u.id} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{u.projectName}</div>
                      <div className="text-xs text-zinc-500 truncate" title={u.fileName}>{u.fileName}</div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        Uploaded {new Date(u.uploadedAt).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                        {u.matchedRows} of {u.totalRows} UIDs reconciled
                        {u.reviewedByName ? ` · approved by ${u.reviewedByName}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => handleViewUpload(u)}
                    >
                      <Eye size={12} />
                      <span className="ml-1">View</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>
              Read directly from the reconciled data - no download involved. Only your own hits are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto">
            {previewLoading ? (
              <TableSkeleton rows={6} columns={8} />
            ) : previewRows.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400">No matching rows found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Start IP</TableHead>
                    <TableHead className="text-xs">End IP</TableHead>
                    <TableHead className="text-xs">Start Time</TableHead>
                    <TableHead className="text-xs">End Time</TableHead>
                    <TableHead className="text-xs">Ref ID</TableHead>
                    <TableHead className="text-xs">UID</TableHead>
                    <TableHead className="text-xs text-center">LOI</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs">Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow key={row.id || idx}>
                      <TableCell className="text-zinc-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500">{row.startIpAddress || "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500">{row.endIpAddress || "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-600">{row.startDate} {row.startTime}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-600">{row.endDate} {row.endTime}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500 max-w-[120px] truncate" title={row.refId}>{row.refId || "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500 max-w-[160px] truncate" title={row.uid || ""}>{row.uid || "-"}</TableCell>
                      <TableCell className="text-center font-mono font-bold text-xs text-zinc-700 dark:text-zinc-300">{row.loi || "-"}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass(row.status)}`}>
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600">{row.countryName || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
