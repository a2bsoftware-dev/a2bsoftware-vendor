"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FolderKanban, ArrowLeft, Loader2, Search,
  RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { API_BASE_URL, apiFetch } from "@/lib/api";

// Row shape returned by /api/vendor/projects/{projectId}/survey-details - no
// pid/gid/vendorName columns shown (always this vendor's own project/self,
// no point displaying raw internal IDs) and no cpi/profit fields exist on
// this shape at all (see SurveyDetailRowDto on the backend, reused as-is).
interface SurveyDetailRow {
  id: number | string;
  projectName: string;
  clientName?: string;
  startIpAddress?: string;
  endIpAddress?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  refId?: string;
  userId?: string;
  loi?: number | string;
  status: string;
  countryName?: string;
}

interface SurveyStatusOption {
  value: string;
  label: string;
}

interface CountryFilterOption {
  id: string | number;
  name: string;
}

interface SurveyFilterOptions {
  countries: CountryFilterOption[];
  surveyStatusOptions: SurveyStatusOption[];
}

export default function ViewProjectSurveyDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug;

  const project_id = Array.isArray(slug) && slug.length > 0 ? slug[0] : "";
  const initial_status = Array.isArray(slug) && slug.length > 1 ? slug[1] : "";

  const [loading, setLoading] = useState(true);
  const [dataset, setDataset] = useState<SurveyDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [filterOptions, setFilterOptions] = useState<SurveyFilterOptions>({
    countries: [],
    surveyStatusOptions: [],
  });

  // No gid filter here (unlike the admin equivalent this page was forked
  // from) - /api/vendor/projects/{id}/survey-details locks gid to the caller
  // server-side regardless, so exposing that input would just be misleading.
  const [filters, setFilters] = useState({
    status: initial_status,
  });

  const loadFilterOptions = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/projects/survey-filter-options`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFilterOptions(data);
        }
      }
    } catch (err) {
      console.error("Error loading survey details filters", err);
    }
  };

  const loadSurveyDetails = useCallback(
    async (targetPage: number, targetLimit: number, targetFilters: typeof filters) => {
      if (!project_id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          pageNo: String(targetPage),
          maxPerPage: String(targetLimit),
        });
        if (targetFilters.status !== "") params.set("status", targetFilters.status);

        const res = await apiFetch(
          `${API_BASE_URL}/api/vendor/projects/${project_id}/survey-details?${params.toString()}`
        );

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.surveyInformations) {
            setDataset(data.surveyInformations);
            setTotal(data.total);
          }
        }
      } catch (err) {
        console.error("Error loading survey details", err);
        toast.error("Failed to load survey details list");
      } finally {
        setLoading(false);
      }
    },
    [project_id]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFilterOptions();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSurveyDetails(page, limit, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, project_id, loadSurveyDetails]);

  const handleSearch = () => {
    setPage(1);
    loadSurveyDetails(1, limit, filters);
  };

  const handleRefresh = () => {
    const resetFilters = { status: "" };
    setFilters(resetFilters);
    setPage(1);
    loadSurveyDetails(1, limit, resetFilters);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-zinc-500" />
            Project Survey Clicks Details
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Your own respondent activity for this project: IP, response status, and interview length.
          </p>
        </div>
        <Button
          onClick={() => router.push("/projects")}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 border-zinc-200 text-zinc-600 shadow-sm"
        >
          <ArrowLeft size={14} />
          <span>Back to Projects</span>
        </Button>
      </div>

      <Card className="border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-zinc-500">Status</Label>
              <NativeSelect
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="h-9"
              >
                <option value="">Select Status</option>
                {filterOptions.surveyStatusOptions.map((opt: SurveyStatusOption) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="flex items-center gap-1 border-zinc-200 hover:bg-zinc-50 text-zinc-600 shadow-sm"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </Button>
            <Button
              onClick={handleSearch}
              size="sm"
              className="flex items-center gap-1 shadow-sm"
            >
              <Search size={13} />
              <span>Search</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm overflow-hidden bg-white dark:bg-zinc-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
              <span className="text-sm font-medium text-zinc-500">Querying project click logs...</span>
            </div>
          ) : dataset.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
              <span className="text-sm font-bold text-zinc-600">No Click Logs Found</span>
              <span className="text-xs text-zinc-400">There are no records matching the selected parameters.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="border-collapse text-xs">
                <TableHeader className="bg-zinc-50/70 dark:bg-zinc-900">
                  <TableRow className="border-b border-zinc-200">
                    <TableHead className="font-semibold text-zinc-600 h-10 w-10 text-center">SN</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Project</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Client</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Start IP</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">End IP</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Start Date</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">End Date</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Start Time</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">End Time</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Ref ID</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">UID</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10 text-center">LOI</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10 text-center">Status</TableHead>
                    <TableHead className="font-semibold text-zinc-600 h-10">Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataset.map((row, idx) => {
                    const rowNum = (page - 1) * limit + idx + 1;
                    return (
                      <TableRow key={row.id} className="border-b border-zinc-150 hover:bg-zinc-50/50 transition-colors">
                        <TableCell className="text-center font-medium text-zinc-400 py-3">{rowNum}</TableCell>
                        <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">{row.projectName}</TableCell>
                        <TableCell className="text-zinc-600 dark:text-zinc-300 font-medium">{row.clientName || "NA"}</TableCell>
                        <TableCell className="text-zinc-500 font-mono">{row.startIpAddress}</TableCell>
                        <TableCell className="text-zinc-500 font-mono">{row.endIpAddress}</TableCell>
                        <TableCell className="text-zinc-600 font-mono">{row.startDate}</TableCell>
                        <TableCell className="text-zinc-600 font-mono">{row.endDate}</TableCell>
                        <TableCell className="text-zinc-600 font-mono">{row.startTime}</TableCell>
                        <TableCell className="text-zinc-600 font-mono">{row.endTime}</TableCell>
                        <TableCell className="text-zinc-500 font-mono max-w-[120px] truncate" title={row.refId}>{row.refId}</TableCell>
                        <TableCell className="text-zinc-500 font-mono max-w-[100px] truncate" title={row.userId}>{row.userId}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-zinc-700 dark:text-zinc-300">{row.loi}</TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.status === "Complete"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400"
                              : row.status === "Disqualify"
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400"
                              : row.status === "quotaFull"
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400"
                              : row.status === "securityTerm"
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400"
                              : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400"
                          }`}>
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-zinc-600 font-medium">{row.countryName}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && dataset.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium">Show</span>
            <NativeSelect
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value));
                setPage(1);
              }}
              className="h-8 w-18 text-xs py-0"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </NativeSelect>
            <span className="text-xs text-zinc-500 font-medium">entries</span>
          </div>

          <div className="text-xs font-semibold text-zinc-500 text-center">
            Showing {Math.min(total, (page - 1) * limit + 1)} to {Math.min(total, page * limit)} of {total} entries
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="h-8 w-8 border-zinc-200"
            >
              <ChevronLeft size={15} />
            </Button>
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 px-3 bg-white dark:bg-zinc-950 border border-zinc-200 h-8 flex items-center justify-center rounded-md">
              {page}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page * limit >= total}
              onClick={() => setPage(page + 1)}
              className="h-8 w-8 border-zinc-200"
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
